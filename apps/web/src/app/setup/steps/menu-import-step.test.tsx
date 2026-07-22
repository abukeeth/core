import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateImportJob = vi.fn();
const mockGetImportJob = vi.fn();
const mockListImportJobs = vi.fn();
const mockRerunImportJob = vi.fn();
const mockApproveImportJob = vi.fn();
const mockRejectImportJob = vi.fn();
const mockUpdateImportJobData = vi.fn();
const mockSetSetupStep = vi.fn();

vi.mock("@/lib/api", () => ({
  createImportJob: (...args: unknown[]) => mockCreateImportJob(...args),
  getImportJob: (...args: unknown[]) => mockGetImportJob(...args),
  listImportJobs: (...args: unknown[]) => mockListImportJobs(...args),
  rerunImportJob: (...args: unknown[]) => mockRerunImportJob(...args),
  approveImportJob: (...args: unknown[]) => mockApproveImportJob(...args),
  rejectImportJob: (...args: unknown[]) => mockRejectImportJob(...args),
  updateImportJobData: (...args: unknown[]) => mockUpdateImportJobData(...args),
  setSetupStep: (...args: unknown[]) => mockSetSetupStep(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { MenuImportStep } from "./menu-import-step";
import type { ImportJob } from "@/lib/api";

function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    sourceType: "IMAGE",
    status: "PENDING",
    extractedData: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListImportJobs.mockResolvedValue({ jobs: [] });
  mockSetSetupStep.mockResolvedValue({ restaurant: { setupStep: "WEBSITE_THEME" } });
});

describe("MenuImportStep — §5/§15: never advances before the image is uploaded, OCR'd, validated, saved, and approved", () => {
  it("does not advance the wizard the instant the upload request is merely accepted", async () => {
    const onDone = vi.fn();
    mockCreateImportJob.mockResolvedValue({ job: job({ status: "PENDING" }) });
    render(<MenuImportStep onDone={onDone} />);
    await waitFor(() => expect(screen.getByText("Import your business")).toBeInTheDocument());

    const file = new File(["img"], "menu.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Import menu"));

    await waitFor(() => expect(mockCreateImportJob).toHaveBeenCalled());
    // The upload "succeeded" (202 Accepted) but the job is only PENDING —
    // the wizard must stay here, not call onDone/advance to WEBSITE_THEME.
    expect(screen.getByText("Building your menu…")).toBeInTheDocument();
    expect(mockSetSetupStep).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the live progress card immediately while uploading — no dead 'Uploading…' button gap", async () => {
    // createImportJob never resolves here, so we stay in the upload phase.
    mockCreateImportJob.mockReturnValue(new Promise(() => {}));
    render(<MenuImportStep onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Import your business")).toBeInTheDocument());

    const file = new File(["img"], "menu.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Import menu"));

    // The picker is replaced by a real progress card straight away, before
    // the upload request resolves — not a frozen disabled button.
    await waitFor(() => expect(screen.getByText("Building your menu…")).toBeInTheDocument());
    expect(screen.getByText(/Uploading your menu/)).toBeInTheDocument();
    expect(screen.queryByText("Import menu")).not.toBeInTheDocument();
  });

  it("keeps showing real progress while PROCESSING, still without advancing", async () => {
    mockCreateImportJob.mockResolvedValue({ job: job({ status: "PROCESSING" }) });
    render(<MenuImportStep onDone={vi.fn()} />);
    await waitFor(() => screen.getByText("Import your business"));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["img"], "menu.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByText("Import menu"));

    await waitFor(() => expect(screen.getByText("Building your menu…")).toBeInTheDocument());
    expect(mockSetSetupStep).not.toHaveBeenCalled();
  });

  it("shows the review screen once AWAITING_REVIEW is reached, and only advances after Approve", async () => {
    const onDone = vi.fn();
    mockCreateImportJob.mockResolvedValue({ job: job({ status: "PENDING" }) });
    render(<MenuImportStep onDone={onDone} />);
    await waitFor(() => screen.getByText("Import your business"));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["img"], "menu.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByText("Import menu"));
    await waitFor(() => screen.getByText("Building your menu…"));

    // Simulate the poll discovering the job reached AWAITING_REVIEW.
    const readyJob = job({
      status: "AWAITING_REVIEW",
      extractedData: { categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 999 }] }] },
    });
    mockGetImportJob.mockResolvedValue({ job: readyJob });
    await vi.waitFor(() => {}, { timeout: 10 }); // let effect subscribe
    await new Promise((resolve) => setTimeout(resolve, 4100));
    await waitFor(() => expect(screen.getByText("Review your imported menu")).toBeInTheDocument(), { timeout: 6000 });

    // Not advanced yet — still on the review screen.
    expect(mockSetSetupStep).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    // Approve — this is the ONLY thing allowed to advance the wizard from here.
    mockApproveImportJob.mockResolvedValue({ job: { ...readyJob, status: "APPROVED" } });
    fireEvent.click(screen.getByText("Approve & continue"));

    await waitFor(() => expect(mockApproveImportJob).toHaveBeenCalledWith("job-1"));
    await waitFor(() => expect(mockSetSetupStep).toHaveBeenCalledWith("WEBSITE_THEME"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  }, 12000);

  it("shows a clear failure state with retry, and never advances, when the job fails", async () => {
    const onDone = vi.fn();
    mockCreateImportJob.mockResolvedValue({ job: job({ status: "PENDING" }) });
    render(<MenuImportStep onDone={onDone} />);
    await waitFor(() => screen.getByText("Import your business"));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["img"], "menu.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByText("Import menu"));
    await waitFor(() => screen.getByText("Building your menu…"));

    mockGetImportJob.mockResolvedValue({ job: job({ status: "FAILED", errorMessage: "Couldn't read the image." }) });
    await waitFor(() => expect(screen.getByText("Import failed")).toBeInTheDocument(), { timeout: 6000 });

    expect(screen.getByText("Couldn't read the image.")).toBeInTheDocument();
    expect(screen.getByText("Retry import")).toBeInTheDocument();
    expect(mockSetSetupStep).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  }, 12000);

  it("resumes an in-progress import after a refresh instead of showing an empty picker", async () => {
    mockListImportJobs.mockResolvedValue({ jobs: [job({ status: "PROCESSING" })] });
    render(<MenuImportStep onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Building your menu…")).toBeInTheDocument());
    expect(screen.queryByText("Import your business")).not.toBeInTheDocument();
  });

  it("§Job Durability: offers a non-destructive retry once an import has been running unusually long", async () => {
    // A job created well beyond the slow ceiling → the escape hatch shows immediately.
    const longRunning = job({ status: "PROCESSING", createdAt: new Date(Date.now() - 100_000).toISOString() });
    mockListImportJobs.mockResolvedValue({ jobs: [longRunning] });
    mockRerunImportJob.mockResolvedValue({ job: job({ status: "PENDING" }) });
    render(<MenuImportStep onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument());
    // Still building — the slow state never fakes a failure or advances.
    expect(screen.getByText("Building your menu…")).toBeInTheDocument();
    expect(mockSetSetupStep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(mockRerunImportJob).toHaveBeenCalledWith("job-1"));
  });

  it("resumes directly into the review screen if the job was already awaiting review before the refresh", async () => {
    mockListImportJobs.mockResolvedValue({
      jobs: [
        job({
          status: "AWAITING_REVIEW",
          extractedData: { categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 999 }] }] },
        }),
      ],
    });
    render(<MenuImportStep onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Review your imported menu")).toBeInTheDocument());
  });

  it("auto-continues to WEBSITE_THEME when a prior import is already APPROVED (Priority 3)", async () => {
    const onDone = vi.fn();
    mockListImportJobs.mockResolvedValue({ jobs: [job({ status: "APPROVED" })] });
    render(<MenuImportStep onDone={onDone} />);

    // The menu is already saved+approved; resuming advances straight to the
    // website step (onDone) instead of forcing a re-import. In the real app
    // onDone unmounts this step; here onDone is a stub, so we assert the
    // advance itself rather than the subsequent unmount.
    await waitFor(() => expect(mockSetSetupStep).toHaveBeenCalledWith("WEBSITE_THEME"));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ setupStep: "WEBSITE_THEME" }));
  });

  it("prefers resuming an in-flight job over auto-advancing on an older approved one", async () => {
    mockListImportJobs.mockResolvedValue({ jobs: [job({ id: "old", status: "APPROVED" }), job({ id: "live", status: "PROCESSING" })] });
    render(<MenuImportStep onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Building your menu…")).toBeInTheDocument());
    expect(mockSetSetupStep).not.toHaveBeenCalled();
  });

  it("still allows an explicit Skip, which is a deliberate choice rather than an automatic advance", async () => {
    const onDone = vi.fn();
    render(<MenuImportStep onDone={onDone} />);
    await waitFor(() => screen.getByText("Import your business"));

    fireEvent.click(screen.getByText("Skip for now"));

    await waitFor(() => expect(mockSetSetupStep).toHaveBeenCalledWith("WEBSITE_THEME"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
