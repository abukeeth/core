import type { AICompletionRequest, AIProvider } from "../types";

/**
 * A user-facing, vendor-neutral message for an AI failure. Restaurant owners
 * must never see a raw provider error like "429 You exceeded your current
 * quota … https://platform.openai.com/…": it's confusing, it leaks the vendor,
 * and it points them at a billing page that isn't theirs. Every failure below
 * maps to plain language plus the one action that always works — skip and add
 * the menu by hand.
 */
export type AIFailureKind = "quota" | "auth" | "unavailable" | "unknown";

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** Classifies a provider error so we can pick the right friendly message. */
export function classifyAIError(err: unknown): AIFailureKind {
  const status = statusOf(err);
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();

  if (status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("insufficient_quota")) {
    return "quota";
  }
  if (status === 401 || status === 403 || message.includes("api key") || message.includes("unauthorized") || message.includes("authentication")) {
    return "auth";
  }
  if (
    (typeof status === "number" && status >= 500) ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("network") ||
    message.includes("overloaded")
  ) {
    return "unavailable";
  }
  return "unknown";
}

const FRIENDLY_MESSAGE: Record<AIFailureKind, string> = {
  quota:
    "Our menu-reading service is temporarily over its usage limit. Please wait a few minutes and try again — or skip this step and add your menu items manually. You can import them later.",
  auth:
    "Our menu-reading service is temporarily unavailable. Please skip this step and add your menu items manually for now — you can import them later.",
  unavailable:
    "Our menu-reading service is busy right now and didn't respond in time. Please try again in a moment, or skip this step and add your menu items manually.",
  unknown:
    "We couldn't read your menu automatically. Please try again, or skip this step and add your menu items manually.",
};

/** The plain-language message shown to owners for a given underlying error. */
export function friendlyAIErrorMessage(err: unknown): string {
  return FRIENDLY_MESSAGE[classifyAIError(err)];
}

/**
 * Wraps one or more real providers (in priority order) so a single vendor
 * outage no longer takes down every AI feature. `complete()` tries each
 * provider in turn and returns the first success; if the primary is failing
 * (e.g. OpenAI is out of quota) and another key is configured, the request
 * transparently falls back to it. Only when EVERY configured provider fails
 * does it throw — and then with a friendly, vendor-neutral message (the raw
 * provider error is logged server-side for operators, never surfaced to the
 * owner). With a single provider configured this is a thin pass-through that
 * still upgrades the error message.
 */
export class FallbackAIProvider implements AIProvider {
  constructor(private readonly providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackAIProvider requires at least one provider");
    }
  }

  /** Reports the primary provider's name so telemetry/tests see the real vendor. */
  get name(): string {
    return this.providers[0]!.name;
  }

  async complete(request: AICompletionRequest): Promise<string> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.complete(request);
      } catch (err) {
        lastError = err;
        const detail = err instanceof Error ? err.message : String(err);
        // Raw detail is for operators (logs), not the owner. Continue to the
        // next configured provider if there is one.
        console.error(`[ai] provider "${provider.name}" failed: ${detail}`);
      }
    }
    throw new Error(friendlyAIErrorMessage(lastError));
  }
}
