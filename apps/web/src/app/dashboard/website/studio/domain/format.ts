import type { BadgeTone } from "@/components/ui";
import type { DomainTlsStatus, DomainVerificationStatus } from "@/lib/api";

export const VERIFICATION_LABEL: Record<DomainVerificationStatus, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  FAILED: "Failed",
};

export const VERIFICATION_TONE: Record<DomainVerificationStatus, BadgeTone> = {
  PENDING: "warning",
  VERIFIED: "success",
  FAILED: "danger",
};

export const TLS_LABEL: Record<DomainTlsStatus, string> = {
  PENDING: "Pending",
  GENERATING: "Generating",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  FAILED: "Failed",
};

export const TLS_TONE: Record<DomainTlsStatus, BadgeTone> = {
  PENDING: "neutral",
  GENERATING: "info",
  ACTIVE: "success",
  EXPIRED: "warning",
  FAILED: "danger",
};

export function formatLastChecked(iso: string | null): string {
  if (!iso) return "Never checked";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
