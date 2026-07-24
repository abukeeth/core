import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetImportJob = vi.fn();
const mockRerunImportJob = vi.fn();

vi.mock("@/lib/api", () => ({
  getImportJob: (...args: unknown[]) => mockGetImportJob(...args),
  rerunImportJob: (...args: unknown[]) => mockRerunImportJob(...args),
}));

// Reused dashboard components — stubbed so this test targets the screen's own
// polling/branching logic (and the real components' import graphs stay out).
vi.mock("../../dashboard/import/import-hub", () => ({
  ProgressCard: () => <div>Progress Card</div>,
}));
vi.mock("../../dashboard/import/[id]/review-editor", () => ({
  ReviewEditor: ({ onApproved, onRejected }: { onApproved: () => void; onRejected: () => void }) => (
    <div>
      <span>Review Editor</span>
      <button type="button" onClick={onApproved}>
        approve
      </button>
      <button type="button" onClick={onRejected}>
        reject
      </button>
    </div>
  ),
}));

import { AnalysisReviewScreen } from "./analysis-review-screen";
import type { ImportJob } from "@/lib/api";

function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    sourceType: "MULTI",
    status: "PENDING",
    extractedData: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AnalysisReviewScreen", () => {
  it("shows live progress while pending, then reveals the review editor when analysis finishes", async () => {
    vi.useFakeTimers();
    mockGetImportJob.mockResolvedValue({ job: job({ status: "AWAITING_REVIEW" }) });

    render(<AnalysisReviewScreen initialJob={job({ status: "PENDING" })} onApproved={vi.fn()} onReset={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Reading your menu…")).toBeInTheDocument();
    expect(screen.getByText("Progress Card")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(4000);

    expect(screen.getByText("Review Editor")).toBeInTheDocument();
    expect(screen.queryByText("Progress Card")).not.toBeInTheDocument();
  });

  it("calls onApproved when the review editor approves", () => {
    const onApproved = vi.fn();
    render(<AnalysisReviewScreen initialJob={job({ status: "AWAITING_REVIEW" })} onApproved={onApproved} onReset={vi.fn()} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "approve" }));
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when the review editor is rejected", () => {
    const onReset = vi.fn();
    render(<AnalysisReviewScreen initialJob={job({ status: "AWAITING_REVIEW" })} onApproved={vi.fn()} onReset={onReset} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "reject" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a failed analysis and re-runs the job", async () => {
    mockRerunImportJob.mockResolvedValue({ job: job({ status: "PENDING" }) });
    render(
      <AnalysisReviewScreen
        initialJob={job({ status: "FAILED", errorMessage: "No AI provider configured" })}
        onApproved={vi.fn()}
        onReset={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText("No AI provider configured")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));

    await waitFor(() => expect(mockRerunImportJob).toHaveBeenCalledWith("job-1"));
    // Back to the analyzing state after the rerun resolves.
    await waitFor(() => expect(screen.getByText("Reading your menu…")).toBeInTheDocument());
  });

  it("lets the owner skip a failed import and continue to build (no AI required)", () => {
    const onSkip = vi.fn();
    render(
      <AnalysisReviewScreen
        initialJob={job({ status: "FAILED", errorMessage: "No AI provider configured" })}
        onApproved={vi.fn()}
        onReset={vi.fn()}
        onSkip={onSkip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue without it — add my menu manually" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
