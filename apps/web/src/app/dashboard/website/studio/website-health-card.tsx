import { Card } from "@/components/ui";

interface HealthMetric {
  label: string;
  score: number;
}

const METRICS: HealthMetric[] = [
  { label: "Overall Health", score: 82 },
  { label: "SEO", score: 74 },
  { label: "Performance", score: 88 },
  { label: "Mobile", score: 91 },
  { label: "Accessibility", score: 79 },
  { label: "Conversion", score: 68 },
];

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#EDE3D6" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="#B97824"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-sm font-bold text-[#171512]">{score}</span>
    </div>
  );
}

export function WebsiteHealthCard() {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE HEALTH</p>
          <h2 className="mt-1 text-lg font-bold text-[#171512]">How your site is performing</h2>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {METRICS.map((metric) => (
          <div
            key={metric.label}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4 text-center"
          >
            <ScoreRing score={metric.score} />
            <p className="text-xs font-semibold leading-4 text-[#756B5D]">{metric.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
