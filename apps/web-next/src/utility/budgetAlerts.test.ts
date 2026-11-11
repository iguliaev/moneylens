import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBudgetCompleted } from "./budgetAlerts";

describe("isBudgetCompleted", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false without an end date", () => {
    expect(isBudgetCompleted(null)).toBe(false);
    expect(isBudgetCompleted(undefined)).toBe(false);
  });

  it("is true once the end date is before today", () => {
    expect(isBudgetCompleted("2026-11-10")).toBe(true);
    expect(isBudgetCompleted("2025-12-31")).toBe(true);
  });

  it("is false on the end date itself and before it", () => {
    expect(isBudgetCompleted("2026-11-11")).toBe(false);
    expect(isBudgetCompleted("2026-12-31")).toBe(false);
  });
});
