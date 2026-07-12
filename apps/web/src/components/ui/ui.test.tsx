import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { FilterPills } from "./filter-pills";

describe("Button", () => {
  it("defaults to a primary, enabled button", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeEnabled();
    expect(button).toHaveClass("bg-[#171512]");
  });

  it("applies the danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-red-600");
  });

  it("respects an explicit type override", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("type", "submit");
  });

  it("disables and fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Badge", () => {
  it("renders children with a tone class", () => {
    render(<Badge tone="success">Live</Badge>);
    expect(screen.getByText("Live")).toHaveClass("bg-emerald-50");
  });

  it("defaults to neutral tone", () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText("Draft")).toHaveClass("text-[#756B5D]");
  });
});

describe("EmptyState", () => {
  it("renders title, description, and action", () => {
    render(<EmptyState title="No orders yet" description="Orders will show up here." action={<button type="button">Refresh</button>} />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByText("Orders will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});

describe("FilterPills", () => {
  const STATUSES = ["", "PENDING", "DONE"] as const;

  it("highlights the active option and labels an empty value as All", () => {
    render(<FilterPills options={STATUSES} value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("bg-[#171512]");
    expect(screen.getByRole("button", { name: "PENDING" })).not.toHaveClass("bg-[#171512]");
  });

  it("calls onChange with the clicked option", () => {
    const onChange = vi.fn();
    render(<FilterPills options={STATUSES} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    expect(onChange).toHaveBeenCalledWith("DONE");
  });

  it("supports custom labels", () => {
    render(<FilterPills options={STATUSES} value="" onChange={() => {}} labels={{ PENDING: "Pending orders" }} />);
    expect(screen.getByRole("button", { name: "Pending orders" })).toBeInTheDocument();
  });
});
