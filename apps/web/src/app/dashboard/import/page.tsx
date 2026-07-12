import Link from "next/link";
import { PageShell } from "@/components/ui";
import type { ImportJob } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { ImportAutoRefresh } from "./import-auto-refresh";
import { ImportHub } from "./import-hub";
import { RerunButton } from "./rerun-button";

function statusTone(status: ImportJob["status"]) {
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "PROCESSING" || status === "PENDING") return "bg-amber-50 text-amber-700";
  if (status === "AWAITING_REVIEW") return "bg-blue-50 text-blue-700";
  return "bg-emerald-50 text-emerald-700";
}

export default async function ImportPage() {
  const result = await serverFetch<{ jobs: ImportJob[] }>("/api/imports");
  const jobs = result.ok ? result.data.jobs : [];
  const activeJobs = jobs.filter((job) => job.status === "PENDING" || job.status === "PROCESSING" || job.status === "AWAITING_REVIEW");
  const activeJob = activeJobs[0] ?? null;
  // History is history only — the job currently live in the ImportHub card above is never duplicated here.
  const historyJobs = jobs.filter((job) => job.id !== activeJob?.id);
  const pollingNeeded = jobs.some((job) => job.status === "PENDING" || job.status === "PROCESSING");

  return (
    <PageShell maxWidth="3xl">
        <ImportAutoRefresh active={pollingNeeded} />
        <header className="pt-2 lg:pt-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">AI IMPORT HUB</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Bring your business from anywhere.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B5D]">Every source, in one place. Pick one and OrderVora builds your menu automatically.</p>
        </header>

        <ImportHub activeJob={activeJob} otherActiveCount={Math.max(0, activeJobs.length - 1)} />

        {historyJobs.length > 0 && (
          <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#756B5D]">Import history</h2>
              <span className="rounded-full bg-[#F7F0E5] px-3 py-1 text-xs font-semibold text-[#756B5D]">{historyJobs.length}</span>
            </div>

            <ul className="mt-4 divide-y divide-[#EEE5D9]">
              {historyJobs.map((job) => (
                <li key={job.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{job.sourceType}</p>
                    <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusTone(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {job.status === "AWAITING_REVIEW" && <Link href={`/dashboard/import/${job.id}`} className="rounded-xl bg-[#171512] px-4 py-2 font-semibold text-white">Review</Link>}
                    {job.status === "FAILED" && job.errorMessage && <span className="max-w-sm text-xs text-red-600">{job.errorMessage}</span>}
                    {(job.status === "FAILED" || job.status === "APPROVED" || job.status === "REJECTED") && <RerunButton jobId={job.id} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
    </PageShell>
  );
}
