import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/api", () => ({
  approveImportJob: (...args: unknown[]) => mockApprove(...args),
  rejectImportJob: (...args: unknown[]) => mockReject(...args),
  updateImportJobData: (...args: unknown[]) => mockUpdate(...args),
}));

import { ReviewEditor } from "./review-editor";

function job() {
  return {
    id: "job-1",
    sourceType: "CSV" as const,
    status: "AWAITING_REVIEW" as const,
    extractedData: {
      categories: [
        {
          name: "Appetizers",
          items: [
            { name: "Spring Rolls", priceCents: 599, description: "Crispy", confidence: 1 },
            { name: "Nachos", priceCents: 800, confidence: 1 },
          ],
        },
        {
          name: "Mains",
          items: [{ name: "Mystery Combo", priceCents: 0, confidence: 0.4 }],
        },
      ],
    },
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApprove.mockResolvedValue({ job: job() });
  mockReject.mockResolvedValue({ job: job() });
  mockUpdate.mockResolvedValue({ job: job() });
});

describe("ReviewEditor (Sprint 10)", () => {
  it("renders each category's items with a confidence badge", () => {
    render(<ReviewEditor job={job()} />);

    expect(screen.getByDisplayValue("Spring Rolls")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mystery Combo")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2);
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("edits an item's name and price inline", () => {
    render(<ReviewEditor job={job()} />);

    const nameInput = screen.getByDisplayValue("Nachos");
    fireEvent.change(nameInput, { target: { value: "Loaded Nachos" } });

    expect(screen.getByDisplayValue("Loaded Nachos")).toBeInTheDocument();
  });

  it("saves edited data via PATCH without approving", async () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("job-1", expect.any(Object)));
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("persists edits before approving, then hands off into the AI Restaurant Builder experience (Sprint 11)", async () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByText("Approve & continue"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("job-1", expect.any(Object)));
    expect(mockApprove).toHaveBeenCalledWith("job-1");
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/builder"));
  });

  it("rejects without persisting edits first", async () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByText("Reject import"));

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith("job-1"));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("ReviewEditor — bulk selection (Sprint 18 Part 5)", () => {
  it("shows a bulk action bar only once an item is selected", () => {
    render(<ReviewEditor job={job()} />);

    expect(screen.queryByText("Delete selected")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select Mystery Combo"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("Delete selected")).toBeInTheDocument();
  });

  it("bulk-deletes selected items", async () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByLabelText("Select Mystery Combo"));
    fireEvent.click(screen.getByText("Delete selected"));

    await waitFor(() => expect(screen.queryByDisplayValue("Mystery Combo")).not.toBeInTheDocument());
  });

  it("bulk-moves selected items to a different category", async () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByLabelText("Select Mystery Combo"));
    fireEvent.change(screen.getByPlaceholderText("Move to category…"), { target: { value: "Appetizers" } });
    fireEvent.click(screen.getByText("Move"));

    await waitFor(() => expect(screen.queryByText("Mystery Combo")).not.toBeInTheDocument());
    expect(screen.getAllByText("3 items")).toHaveLength(1);
  });

  it("selects every item in a category via the category checkbox", () => {
    render(<ReviewEditor job={job()} />);

    fireEvent.click(screen.getByLabelText("Select all in Appetizers"));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });
});
