"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Rocket, X } from "lucide-react";
import { checkPublishReadiness, publishSite, type PublishIssue } from "@/lib/api";

type FlowState = "idle" | "checking" | "blocked" | "publishing" | "completed" | "failed";

interface PublishFlowButtonProps {
  siteId: string | null;
  alreadyPublished: boolean;
  variant?: "solid" | "tile";
}

/**
 * §1/§9 — every stage shown here must reflect real backend state, never a
 * client-side timer. publishSite itself is a single request/response (no
 * incremental backend stages to poll), so the honest representation of "in
 * progress" is an indeterminate state tied to that request's actual
 * lifetime — not a staged checklist ticking off items nothing has verified.
 */
export function PublishFlowButton({ siteId, alreadyPublished, variant = "solid" }: PublishFlowButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<FlowState>("idle");
  const [issues, setIssues] = useState<PublishIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function openFlow() {
    if (!siteId) return;
    setState("checking");
    setIssues([]);
    setError(null);
    try {
      const readiness = await checkPublishReadiness(siteId);
      if (!readiness.ready) {
        setIssues(readiness.issues);
        setState("blocked");
        return;
      }
      setState("publishing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check publish readiness.");
      setState("blocked");
    }
  }

  useEffect(() => {
    if (state !== "publishing" || !siteId) return;
    let cancelled = false;
    publishSite(siteId)
      .then(() => {
        if (cancelled) return;
        setState("completed");
        router.refresh();
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Publishing failed. Please try again.");
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [state, siteId, router]);

  function close() {
    setState("idle");
    setIssues([]);
    setError(null);
  }

  const label = alreadyPublished ? "Republish Website" : "Publish Website";
  const busy = state === "checking" || state === "publishing";
  const open = state !== "idle";

  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          disabled={!siteId || busy}
          onClick={openFlow}
          className="flex flex-col items-start gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#B97824] hover:bg-white disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#A9681F] shadow-sm">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold text-[#171512]">{state === "checking" ? "Checking…" : label}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!siteId || busy}
          onClick={openFlow}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171512] px-4 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" aria-hidden="true" />
          {state === "checking" ? "Checking…" : label}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alreadyPublished ? "Republishing website" : "Publishing website"}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(48,39,27,0.3)]">
            {state === "blocked" && (
              <>
                <div className="flex justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-center text-sm font-bold text-[#171512]">Not quite ready to publish</p>
                <div className="mt-4 flex flex-col gap-2">
                  {error ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                  ) : (
                    issues.map((issue) => (
                      <p key={issue.code} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-800">
                        {issue.message}
                      </p>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#171512] px-4 text-sm font-bold text-white"
                >
                  Got it
                </button>
              </>
            )}

            {state === "failed" && (
              <>
                <div className="flex justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                    <X className="h-7 w-7" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-center text-sm font-bold text-[#171512]">Publishing failed</p>
                {error && <p className="mt-2 text-center text-sm text-[#756B5D]">{error}</p>}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={openFlow}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#171512] px-4 text-sm font-bold text-white"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}

            {state === "publishing" && (
              <>
                <div className="flex justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171512] text-[#E1B56F]">
                    <Rocket className="h-7 w-7 animate-pulse" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-center text-sm font-bold text-[#171512]">
                  {alreadyPublished ? "Republishing your website" : "Publishing your website"}
                </p>
                <p className="mt-2 text-center text-sm text-[#756B5D]">This usually takes a few seconds.</p>
              </>
            )}

            {state === "completed" && (
              <>
                <div className="flex justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                    <Check className="h-7 w-7" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-center text-sm font-bold text-[#171512]">Your website is live</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#171512] px-4 text-sm font-bold text-white"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
