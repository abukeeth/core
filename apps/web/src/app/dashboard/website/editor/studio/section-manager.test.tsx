import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SiteSectionBlock } from "@/lib/api";
import { SectionManager } from "./section-manager";

function sections(): SiteSectionBlock[] {
  return [
    { type: "hero", props: { headline: "Hi" } },
    { type: "gallery", props: {} },
    { type: "footer", props: {} },
  ];
}

describe("SectionManager", () => {
  it("renders every section with its label", () => {
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Gallery")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("moves a section up", () => {
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Move up")[1]); // Gallery, currently index 1
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next.map((s) => s.type)).toEqual(["gallery", "hero", "footer"]);
  });

  it("moves a section down", () => {
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Move down")[0]); // Hero, index 0
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next.map((s) => s.type)).toEqual(["gallery", "hero", "footer"]);
  });

  it("disables move-up on the first section and move-down on the last", () => {
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getAllByLabelText("Move up")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Move down")[2]).toBeDisabled();
  });

  it("toggles a section's hidden flag without removing it", () => {
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Hide section")[0]);
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next[0].hidden).toBe(true);
    expect(next).toHaveLength(3);
  });

  it("duplicates a section, inserting the copy right after the original", () => {
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Duplicate section")[0]);
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next.map((s) => s.type)).toEqual(["hero", "hero", "gallery", "footer"]);
    expect(next).toHaveLength(4);
  });

  it("removes a section after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Remove section")[1]);
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next.map((s) => s.type)).toEqual(["hero", "footer"]);
  });

  it("does not remove a section when the confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Remove section")[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a new section of the chosen type at the end of the list", () => {
    const onChange = vi.fn();
    render(<SectionManager sections={sections()} selectedIndex={null} onSelect={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add Section"));
    fireEvent.click(screen.getByText("Featured Products"));
    const next = onChange.mock.calls[0][0] as SiteSectionBlock[];
    expect(next.map((s) => s.type)).toEqual(["hero", "gallery", "footer", "featuredProducts"]);
  });
});
