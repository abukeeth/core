import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DynamicFieldEditor } from "./dynamic-field-editor";
import type { FieldDef } from "./section-fields";

describe("DynamicFieldEditor", () => {
  it("renders and updates a text field", () => {
    const onChange = vi.fn();
    const fields: FieldDef[] = [{ key: "headline", label: "Headline", kind: "text" }];
    render(<DynamicFieldEditor fields={fields} values={{ headline: "Hi" }} onChange={onChange} />);

    const input = screen.getByLabelText("Headline") as HTMLInputElement;
    expect(input.value).toBe("Hi");
    fireEvent.change(input, { target: { value: "New headline" } });
    expect(onChange).toHaveBeenCalledWith("headline", "New headline");
  });

  it("toggles a boolean field", () => {
    const onChange = vi.fn();
    const fields: FieldDef[] = [{ key: "showPrice", label: "Show price", kind: "boolean" }];
    render(<DynamicFieldEditor fields={fields} values={{ showPrice: false }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith("showPrice", true);
  });

  it("changes a select field", () => {
    const onChange = vi.fn();
    const fields: FieldDef[] = [
      { key: "alignment", label: "Alignment", kind: "select", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
    ];
    render(<DynamicFieldEditor fields={fields} values={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Alignment"), { target: { value: "right" } });
    expect(onChange).toHaveBeenCalledWith("alignment", "right");
  });

  it("coerces a number field to a number, and to undefined when cleared", () => {
    const onChange = vi.fn();
    const fields: FieldDef[] = [{ key: "limit", label: "Limit", kind: "number" }];
    render(<DynamicFieldEditor fields={fields} values={{ limit: 6 }} onChange={onChange} />);

    const input = screen.getByLabelText("Limit");
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenCalledWith("limit", 9);

    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("limit", undefined);
  });

  it("adds and removes items in a list field", () => {
    const onChange = vi.fn();
    const fields: FieldDef[] = [
      {
        key: "reviews",
        label: "Reviews",
        kind: "list",
        itemFields: [{ key: "author", label: "Name", kind: "text" }],
      },
    ];
    const { rerender } = render(<DynamicFieldEditor fields={fields} values={{ reviews: [] }} onChange={onChange} />);

    fireEvent.click(screen.getByText("Add"));
    expect(onChange).toHaveBeenCalledWith("reviews", [{}]);

    rerender(<DynamicFieldEditor fields={fields} values={{ reviews: [{ author: "Jane" }] }} onChange={onChange} />);
    expect(screen.getByDisplayValue("Jane")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove"));
    expect(onChange).toHaveBeenCalledWith("reviews", []);
  });
});
