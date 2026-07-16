import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/imports/import.service", () => ({ reapStaleImportJobs: vi.fn() }));
vi.mock("../modules/sites/generation.service", () => ({ reapStaleGenerationJobs: vi.fn() }));

import { reapStaleImportJobs } from "../modules/imports/import.service";
import { reapStaleGenerationJobs } from "../modules/sites/generation.service";
import { reapStaleJobs, startJobReaper } from "./job-reaper";

const mockReapImports = vi.mocked(reapStaleImportJobs);
const mockReapGenerations = vi.mocked(reapStaleGenerationJobs);

const originalEnabled = process.env.JOB_REAPER_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.JOB_REAPER_ENABLED;
  else process.env.JOB_REAPER_ENABLED = originalEnabled;
});

describe("reapStaleJobs", () => {
  it("sums the requeued/failed counts across both job types", async () => {
    mockReapImports.mockResolvedValue({ requeued: 2, failed: 1 });
    mockReapGenerations.mockResolvedValue({ requeued: 0, failed: 3 });

    await expect(reapStaleJobs()).resolves.toEqual({ requeued: 2, failed: 4 });
    expect(mockReapImports).toHaveBeenCalledTimes(1);
    expect(mockReapGenerations).toHaveBeenCalledTimes(1);
  });
});

describe("startJobReaper", () => {
  it("returns null (does not schedule) when disabled via JOB_REAPER_ENABLED=false", () => {
    process.env.JOB_REAPER_ENABLED = "false";
    expect(startJobReaper()).toBeNull();
  });

  it("returns a live timer when enabled", () => {
    delete process.env.JOB_REAPER_ENABLED;
    const timer = startJobReaper();
    expect(timer).not.toBeNull();
    if (timer) clearInterval(timer);
  });
});
