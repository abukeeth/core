import { Check } from "lucide-react";
import { Card } from "@/components/ui";
import { BUILDER_STAGES, BUILDER_STAGE_LABELS, type BuilderStage } from "./builder-stage";

export function BuilderStageStepper({ stage }: { stage: BuilderStage }) {
  const currentIndex = BUILDER_STAGES.indexOf(stage);

  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE BUILDER PROGRESS</p>
      <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-3">
        {BUILDER_STAGES.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={step} className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  isComplete
                    ? "bg-[#171512] text-white"
                    : isCurrent
                      ? "border-2 border-[#B97824] text-[#B97824]"
                      : "border border-[#E7DDCF] text-[#B7AA96]"
                }`}
                aria-hidden="true"
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`text-xs font-semibold ${isCurrent ? "text-[#171512]" : isComplete ? "text-[#756B5D]" : "text-[#B7AA96]"}`}>
                {BUILDER_STAGE_LABELS[step]}
              </span>
              {index < BUILDER_STAGES.length - 1 && <span className="mx-1 h-px w-4 shrink-0 bg-[#E7DDCF]" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
