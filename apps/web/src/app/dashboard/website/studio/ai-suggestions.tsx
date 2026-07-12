import { Image as ImageIcon, LayoutTemplate, Search, Sparkles, UtensilsCrossed } from "lucide-react";
import { Card } from "@/components/ui";

interface Suggestion {
  title: string;
  description: string;
  icon: typeof Sparkles;
}

const SUGGESTIONS: Suggestion[] = [
  { title: "Improve Hero", description: "Your homepage hero could use a stronger headline and a clearer call to action.", icon: LayoutTemplate },
  { title: "Improve SEO", description: "Add meta descriptions and alt text so more customers find you through search.", icon: Search },
  { title: "Enable Loyalty", description: "Turn on a loyalty program badge to encourage repeat orders from your site.", icon: Sparkles },
  { title: "Optimize Menu", description: "Reorder your menu sections to highlight your best-selling items first.", icon: UtensilsCrossed },
  { title: "Improve Images", description: "A few product photos are lower resolution than recommended for the hero layout.", icon: ImageIcon },
];

export function AiSuggestions() {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">AI SUGGESTIONS</p>
      <div className="mt-4 flex flex-col divide-y divide-[#EEE5D9]">
        {SUGGESTIONS.map(({ title, description, icon: SuggestionIcon }) => (
          <div key={title} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7EBDD] text-[#A9681F]">
              <SuggestionIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#171512]">{title}</p>
              <p className="mt-0.5 text-xs leading-5 text-[#756B5D]">{description}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full border border-[#E7DDCF] bg-white px-4 py-2 text-xs font-bold text-[#171512] transition active:scale-[0.99]"
            >
              Fix Now
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
