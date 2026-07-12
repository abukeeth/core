export type ElapsedSeverity = "normal" | "warning" | "critical";

const WARNING_THRESHOLD_MS = 10 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 20 * 60 * 1000;

export function getElapsedMs(placedAt: string, now: number): number {
  return Math.max(0, now - new Date(placedAt).getTime());
}

export function formatElapsed(placedAt: string, now: number): string {
  const totalSeconds = Math.floor(getElapsedMs(placedAt, now) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getElapsedSeverity(placedAt: string, now: number): ElapsedSeverity {
  const elapsed = getElapsedMs(placedAt, now);
  if (elapsed >= CRITICAL_THRESHOLD_MS) return "critical";
  if (elapsed >= WARNING_THRESHOLD_MS) return "warning";
  return "normal";
}

/**
 * Orders present now but absent from the previously-seen set. Returns
 * an empty array on the very first call (empty previousIds) so a page
 * load never alerts for every order already in the queue — only orders
 * that arrive after the queue has been observed at least once.
 */
export function detectNewOrderIds(previousIds: ReadonlySet<string>, currentIds: readonly string[]): string[] {
  if (previousIds.size === 0) {
    return [];
  }
  return currentIds.filter((id) => !previousIds.has(id));
}
