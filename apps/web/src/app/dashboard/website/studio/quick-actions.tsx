import Link from "next/link";
import { BarChart3, Eye, Globe2, Palette, Search } from "lucide-react";
import { Card } from "@/components/ui";
import { PublishFlowButton } from "./publish-flow";

interface QuickAction {
  label: string;
  href: string;
  icon: typeof Eye;
}

function buildActions(domain: string): QuickAction[] {
  return [
    { label: "Preview Website", href: domain, icon: Eye },
    { label: "Customize Website", href: "/dashboard/website/editor", icon: Palette },
    { label: "Connect Domain", href: "/dashboard/website/publish", icon: Globe2 },
    { label: "Analytics", href: "#website-analytics", icon: BarChart3 },
    { label: "SEO", href: "/dashboard/website/score", icon: Search },
  ];
}

const TILE_CLASS =
  "flex flex-col items-start gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#B97824] hover:bg-white";

interface QuickActionsProps {
  domain: string;
  siteId: string | null;
  alreadyPublished: boolean;
}

export function QuickActions({ domain, siteId, alreadyPublished }: QuickActionsProps) {
  const actions = buildActions(domain);

  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">QUICK ACTIONS</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PublishFlowButton siteId={siteId} alreadyPublished={alreadyPublished} variant="tile" />
        {actions.map(({ label, href, icon: ActionIcon }) => {
          const external = href.startsWith("http");
          return (
            <Link
              key={label}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className={TILE_CLASS}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#A9681F] shadow-sm">
                <ActionIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-bold text-[#171512]">{label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
