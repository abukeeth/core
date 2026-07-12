import { ArrowUpRight, Repeat, ShoppingBag, Users } from "lucide-react";
import { Card } from "@/components/ui";

interface StatTile {
  label: string;
  value: string;
  delta: string;
  icon: typeof Users;
}

const STATS: StatTile[] = [
  { label: "Visitors", value: "2,481", delta: "+12.4%", icon: Users },
  { label: "Orders", value: "312", delta: "+6.8%", icon: ShoppingBag },
  { label: "Conversion", value: "12.6%", delta: "+1.2%", icon: ArrowUpRight },
  { label: "Returning Customers", value: "38%", delta: "+3.1%", icon: Repeat },
];

const VISITOR_TREND = [42, 58, 51, 70, 64, 82, 76];
const TREND_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TOP_PRODUCTS = [
  { name: "Signature Burger", visits: 412 },
  { name: "Loaded Fries", visits: 318 },
  { name: "House Salad", visits: 201 },
];

export function WebsiteAnalytics() {
  const maxTrend = Math.max(...VISITOR_TREND);
  const maxVisits = Math.max(...TOP_PRODUCTS.map((p) => p.visits));

  return (
    <Card>
      <div id="website-analytics" className="scroll-mt-24">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE ANALYTICS</p>
        <h2 className="mt-1 text-lg font-bold text-[#171512]">Last 7 days</h2>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(({ label, value, delta, icon: StatIcon }) => (
          <div key={label} className="rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#A9681F]">
                <StatIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-bold text-emerald-700">{delta}</span>
            </div>
            <p className="mt-3 text-xl font-bold text-[#171512]">{value}</p>
            <p className="text-xs font-medium text-[#756B5D]">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4">
          <p className="text-sm font-bold text-[#171512]">Visitors trend</p>
          <div className="mt-4 flex h-32 items-end gap-2">
            {VISITOR_TREND.map((value, index) => (
              <div key={TREND_LABELS[index]} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div
                  className="w-full rounded-t-lg bg-[#C98A37]"
                  style={{ height: `${Math.max(8, (value / maxTrend) * 96)}px` }}
                />
                <span className="text-[10px] font-medium text-[#8A7D6C]">{TREND_LABELS[index]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4">
          <p className="text-sm font-bold text-[#171512]">Top products</p>
          <div className="mt-4 flex flex-col gap-3">
            {TOP_PRODUCTS.map((product, index) => (
              <div key={product.name} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F4E6D1] text-xs font-bold text-[#9A5F17]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#171512]">{product.name}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#EDE3D6]">
                    <div className="h-full rounded-full bg-[#B97824]" style={{ width: `${(product.visits / maxVisits) * 100}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#756B5D]">{product.visits}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
