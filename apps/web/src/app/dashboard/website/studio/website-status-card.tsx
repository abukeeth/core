import { Sparkles } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import type { SiteStatus } from "@/lib/api";

const STATUS_COPY: Record<SiteStatus, { label: string; tone: BadgeTone; message: (name: string) => string }> = {
  DRAFT: {
    label: "Setting up",
    tone: "warning",
    message: (name) => `${name}'s AI-designed website foundation is ready. Choose a brand concept and publish when you're ready.`,
  },
  PUBLISHING: {
    label: "Publishing…",
    tone: "info",
    message: (name) => `${name}'s website is being published now — this usually takes a few seconds.`,
  },
  REPUBLISHING: {
    label: "Republishing…",
    tone: "info",
    message: (name) => `${name}'s latest changes are going live now — this usually takes a few seconds.`,
  },
  PUBLISHED: {
    label: "Live",
    tone: "success",
    message: (name) => `${name}'s website is live and available to customers.`,
  },
  FAILED: {
    label: "Publish failed",
    tone: "danger",
    message: (name) => `The last attempt to publish ${name}'s website didn't finish — try publishing again.`,
  },
  UNPUBLISHED: {
    label: "Unpublished",
    tone: "neutral",
    message: (name) => `${name}'s website is currently unpublished and not visible to customers.`,
  },
};

const NO_SITE = {
  label: "Setting up",
  tone: "warning" as BadgeTone,
  message: (name: string) => `${name}'s AI-designed website foundation is ready. Brand concepts and live generation launch soon.`,
};

export function WebsiteStatusCard({ restaurantName, status }: { restaurantName: string; status: SiteStatus | null }) {
  const copy = status ? STATUS_COPY[status] : NO_SITE;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F7EBDD]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#171512] text-[#E1B56F] shadow-lg shadow-black/10">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-[#171512] sm:text-xl">AI Website Studio</h2>
              <Badge tone={copy.tone}>{copy.label}</Badge>
            </div>
            <p className="mt-1 max-w-md text-sm leading-6 text-[#756B5D]">{copy.message(restaurantName)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
