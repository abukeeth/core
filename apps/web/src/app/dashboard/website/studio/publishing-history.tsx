import { History } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { SiteVersion } from "@/lib/api";

export function PublishingHistory({ releases, currentVersionId }: { releases: SiteVersion[]; currentVersionId: string | null }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[#9A6A2F]" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">PUBLISHING HISTORY</p>
      </div>

      {releases.length === 0 ? (
        <p className="mt-3 text-sm text-[#756B5D]">No releases yet — publish your website to start building a version history.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {releases.map((release) => {
            const isCurrent = release.id === currentVersionId;
            return (
              <li
                key={release.id}
                className={`flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  isCurrent ? "border-[#B97824] bg-[#FFF8ED]" : "border-[#E7DDCF] bg-[#FBF7F1]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[#171512]">Version {release.versionNo}</span>
                  {isCurrent && <Badge tone="success">Current version</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#756B5D]">
                  <span>Published by {release.publishedBy?.name ?? "—"}</span>
                  <span>{release.publishedAt ? new Date(release.publishedAt).toLocaleString() : "—"}</span>
                  <Badge tone="neutral">{release.status}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
