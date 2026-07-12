import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsiteSiteDefinition } from "@/lib/api";

const mockPatchDraft = vi.fn();
const mockRenderDraftPreview = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    patchDraft: (...args: unknown[]) => mockPatchDraft(...args),
    renderDraftPreview: (...args: unknown[]) => mockRenderDraftPreview(...args),
  };
});

vi.mock("../../studio/publish-flow", () => ({
  PublishFlowButton: () => <button type="button">Publish Website</button>,
}));

import { CustomizationStudio } from "./customization-studio";

function baseDefinition(): WebsiteSiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: "modern-bistro",
    themeVersion: 1,
    colorSeed: "#e8590c",
    typography: { display: "Sora", body: "Inter" },
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home",
        metaDescription: "x",
        sections: [
          { type: "hero", props: { headline: "Welcome" } },
          { type: "footer", props: {} },
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockPatchDraft.mockResolvedValue({ version: {} });
  mockRenderDraftPreview.mockResolvedValue({ html: "<html></html>" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CustomizationStudio — autosave", () => {
  it("does not save immediately on a single edit — waits out the debounce window", async () => {
    render(<CustomizationStudio siteId="site-1" siteStatus="DRAFT" liveUrl="https://example.com" lastPublishedAt={null} initialDefinition={baseDefinition()} initialAssets={[]} />);

    fireEvent.click(screen.getByText("Sections"));
    fireEvent.click(screen.getByText("Hero"));
    const headlineInput = screen.getByLabelText("Headline");
    fireEvent.change(headlineInput, { target: { value: "New headline" } });

    expect(mockPatchDraft).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockPatchDraft).toHaveBeenCalledTimes(1);
    const [, savedDefinition] = mockPatchDraft.mock.calls[0];
    expect(savedDefinition.pages[0].sections[0].props.headline).toBe("New headline");
  });

  it("coalesces rapid edits into a single save after the debounce settles", async () => {
    render(<CustomizationStudio siteId="site-1" siteStatus="DRAFT" liveUrl="https://example.com" lastPublishedAt={null} initialDefinition={baseDefinition()} initialAssets={[]} />);

    fireEvent.click(screen.getByText("Sections"));
    fireEvent.click(screen.getByText("Hero"));
    const headlineInput = screen.getByLabelText("Headline");

    fireEvent.change(headlineInput, { target: { value: "A" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.change(headlineInput, { target: { value: "AB" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.change(headlineInput, { target: { value: "ABC" } });

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockPatchDraft).toHaveBeenCalledTimes(1);
    const [, savedDefinition] = mockPatchDraft.mock.calls[0];
    expect(savedDefinition.pages[0].sections[0].props.headline).toBe("ABC");
  });

  it("shows a saving/saved indicator around the persisted save", async () => {
    render(<CustomizationStudio siteId="site-1" siteStatus="DRAFT" liveUrl="https://example.com" lastPublishedAt={null} initialDefinition={baseDefinition()} initialAssets={[]} />);

    fireEvent.click(screen.getByText("Sections"));
    fireEvent.click(screen.getByText("Hero"));
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "New headline" } });

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});

describe("CustomizationStudio — undo/redo", () => {
  it("undo reverts the most recent change; redo re-applies it", async () => {
    render(<CustomizationStudio siteId="site-1" siteStatus="DRAFT" liveUrl="https://example.com" lastPublishedAt={null} initialDefinition={baseDefinition()} initialAssets={[]} />);

    fireEvent.click(screen.getByText("Sections"));
    fireEvent.click(screen.getByText("Hero"));
    const headlineInput = screen.getByLabelText("Headline") as HTMLInputElement;

    fireEvent.change(headlineInput, { target: { value: "Changed" } });
    expect(headlineInput.value).toBe("Changed");

    fireEvent.click(screen.getByLabelText("Undo"));
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Welcome");

    fireEvent.click(screen.getByLabelText("Redo"));
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Changed");
  });

  it("disables Undo when there's no history behind the current state", () => {
    render(<CustomizationStudio siteId="site-1" siteStatus="DRAFT" liveUrl="https://example.com" lastPublishedAt={null} initialDefinition={baseDefinition()} initialAssets={[]} />);
    expect(screen.getByLabelText("Undo")).toBeDisabled();
  });
});
