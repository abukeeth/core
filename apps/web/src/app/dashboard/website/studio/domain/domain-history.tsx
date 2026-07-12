import { CheckCircle2, Globe2, PlugZap, ShieldAlert, ShieldCheck, Star, XCircle } from "lucide-react";
import { Card } from "@/components/ui";
import type { DomainEvent, DomainEventType } from "@/lib/api";

const EVENT_COPY: Record<DomainEventType, { label: string; icon: typeof Globe2 }> = {
  CREATED: { label: "Domain connected", icon: PlugZap },
  VERIFIED: { label: "DNS verified", icon: CheckCircle2 },
  VERIFICATION_FAILED: { label: "DNS verification failed", icon: XCircle },
  SSL_GENERATING: { label: "SSL certificate requested", icon: ShieldCheck },
  SSL_ACTIVE: { label: "SSL certificate issued", icon: ShieldCheck },
  SSL_FAILED: { label: "SSL certificate failed", icon: ShieldAlert },
  PRIMARY_CHANGED: { label: "Primary domain changed", icon: Star },
  DISCONNECTED: { label: "Domain disconnected", icon: XCircle },
};

export function DomainHistory({ events }: { events: DomainEvent[] }) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">DOMAIN HISTORY</p>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-[#756B5D]">No domain activity yet — connecting a custom domain will start building this history.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {events.map((event) => {
            const copy = EVENT_COPY[event.type];
            const EventIcon = copy.icon;
            return (
              <li key={event.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FBF7F1] text-[#A9681F]">
                  <EventIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-bold text-[#171512]">{copy.label}</p>
                    <span className="font-mono text-xs text-[#8A7D6C]">{event.hostname}</span>
                  </div>
                  {event.message && <p className="mt-0.5 text-sm text-[#756B5D]">{event.message}</p>}
                  <p className="mt-0.5 text-xs text-[#8A7D6C]">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
