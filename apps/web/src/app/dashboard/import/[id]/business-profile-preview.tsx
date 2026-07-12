import type { BusinessProfile } from "@/lib/api";

/**
 * Read-only preview of the business-profile fields a source (Website,
 * Google Maps) surfaced — shown above the menu categories so the
 * reviewer sees everything a single Approve click will apply, not just
 * the menu items. A plain <img> is used for the logo since its host is
 * whatever the import's storage backend serves from, not known ahead of
 * time for next/image's remote-pattern allowlist.
 */
export function BusinessProfilePreview({ profile }: { profile: BusinessProfile }) {
  const hasAnyField =
    profile.name ?? profile.address ?? profile.phone ?? profile.website ?? profile.hours?.length ?? profile.logoUrl ?? profile.socialLinks?.length;
  if (!hasAnyField) return null;

  return (
    <div className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">APPLIED ON APPROVE</p>
      <h2 className="mt-1 text-lg font-bold">Restaurant profile update</h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        {profile.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.logoUrl} alt="Restaurant logo" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        )}
        <div className="flex min-w-0 flex-col gap-1 text-sm text-[#2A251F]">
          {profile.name && <p><span className="text-[#8A7D6C]">Name:</span> {profile.name}</p>}
          {profile.address && <p><span className="text-[#8A7D6C]">Address:</span> {profile.address}</p>}
          {profile.phone && <p><span className="text-[#8A7D6C]">Phone:</span> {profile.phone}</p>}
          {profile.website && (
            <p>
              <span className="text-[#8A7D6C]">Website:</span>{" "}
              <a href={profile.website} target="_blank" rel="noreferrer" className="break-all font-semibold text-[#A9681F] underline">
                {profile.website}
              </a>
            </p>
          )}
        </div>
      </div>
      {profile.hours && profile.hours.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-[#EEE5D9] pt-3 text-xs text-[#756B5D]">
          {profile.hours.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {profile.socialLinks && profile.socialLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.socialLinks.map((link) => (
            <a
              key={link.platform}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#E7DDCF] bg-[#FFFDF9] px-3 py-1 text-xs font-semibold capitalize text-[#756B5D]"
            >
              {link.platform}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
