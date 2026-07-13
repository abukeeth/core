import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUploadCategoryImage = vi.fn();
const mockUploadMenuItemImage = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/lib/api", () => ({
  uploadCategoryImage: (...args: unknown[]) => mockUploadCategoryImage(...args),
  uploadMenuItemImage: (...args: unknown[]) => mockUploadMenuItemImage(...args),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { MenuImageUpload } from "./image-upload";

function file(): File {
  return new File(["x"], "photo.png", { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadCategoryImage.mockResolvedValue({ category: {} });
  mockUploadMenuItemImage.mockResolvedValue({ item: {} });
});

describe("MenuImageUpload — §Website Builder menu image upload UI", () => {
  it("shows 'Add photo' with no existing image, and uploads a category photo on file selection", async () => {
    render(<MenuImageUpload entity="category" entityId="cat-1" imageUrl={null} />);

    expect(screen.getByText("No photo")).toBeInTheDocument();
    expect(screen.getByText("Add photo")).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });

    await waitFor(() => expect(mockUploadCategoryImage).toHaveBeenCalledWith("cat-1", expect.any(File)));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows the current photo and 'Change photo' when one exists, and uploads an item photo on file selection", async () => {
    render(<MenuImageUpload entity="item" entityId="item-1" imageUrl="/assets/spaghetti.png" />);

    expect(document.querySelector("img")).toHaveAttribute("src", "/assets/spaghetti.png");
    expect(screen.getByText("Change photo")).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });

    await waitFor(() => expect(mockUploadMenuItemImage).toHaveBeenCalledWith("item-1", expect.any(File)));
  });

  it("shows an error message when the upload fails", async () => {
    mockUploadCategoryImage.mockRejectedValue(new Error("Upload failed"));
    render(<MenuImageUpload entity="category" entityId="cat-1" imageUrl={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });

    await waitFor(() => expect(screen.getByText("Upload failed")).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
