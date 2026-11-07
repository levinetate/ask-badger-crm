import { describe, expect, it } from "vitest";
import { amountDueCents, computeTotals, lineTotalCents } from "./documents";

describe("computeTotals", () => {
  it("taxes only taxable lines", () => {
    const t = computeTotals(
      [
        { quantity: 2, unitPriceCents: 9500, taxable: false }, // labor
        { quantity: 3, unitPriceCents: 1101, taxable: true }, // breakers
        { quantity: 1, unitPriceCents: 16770, taxable: true }, // wire
      ],
      8,
    );
    expect(t).toEqual({ subtotalCents: 19000 + 3303 + 16770, taxableCents: 20073, taxCents: 1606, totalCents: 39073 + 1606 });
  });

  it("handles fractional quantities and discounts", () => {
    expect(lineTotalCents({ quantity: 1.5, unitPriceCents: 9500 })).toBe(14250);
    const t = computeTotals([{ quantity: 1, unitPriceCents: 10000, taxable: false }, { quantity: 1, unitPriceCents: -1000, taxable: false }], 8);
    expect(t.totalCents).toBe(9000);
    expect(t.taxCents).toBe(0);
  });
});

describe("amountDueCents", () => {
  it("never goes below zero", () => {
    expect(amountDueCents({ totalCents: 5000, amountPaidCents: 2000 })).toBe(3000);
    expect(amountDueCents({ totalCents: 5000, amountPaidCents: 6000 })).toBe(0);
  });
});
