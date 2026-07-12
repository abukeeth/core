import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockRerunImportJob = vi.fn();
vi.mock("@/lib/api", () => ({
  rerunImportJob: (...args: unknown[]) => mockRerunImportJob(...args),
}));

import { RerunButton } from "./rerun-button";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RerunButton (Sprint 10)", () => {
  it("reruns the job and refreshes the page", async () => {
    mockRerunImportJob.mockResolvedValue({ job: { id: "job-1", status: "PENDING" } });
    render(<RerunButton jobId="job-1" />);

    fireEvent.click(screen.getByText("Rerun"));

    await waitFor(() => expect(mockRerunImportJob).toHaveBeenCalledWith("job-1"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows an error message when the rerun fails", async () => {
    mockRerunImportJob.mockRejectedValue(new Error("This import job has no stored file or URL to rerun"));
    render(<RerunButton jobId="job-1" />);

    fireEvent.click(screen.getByText("Rerun"));

    await waitFor(() => expect(screen.getByText("This import job has no stored file or URL to rerun")).toBeInTheDocument());
  });
});
