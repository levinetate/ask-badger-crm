import { describe, expect, it } from "vitest";
import { normalizeBarcode, sellPriceCents } from "./materials";
import { parseReceiptCsv } from "./receiptImport";
import { parseUpcItemDb } from "./upcLookup";

describe("pricing", () => {
  it("adds markup and rounds to the cent", () => {
    expect(sellPriceCents(1000, 30)).toBe(1300);
    expect(sellPriceCents(333, 25)).toBe(416);
    expect(sellPriceCents(500, 0)).toBe(500);
  });
});

describe("normalizeBarcode", () => {
  it("strips non-digits and pads 11-digit UPCs", () => {
    expect(normalizeBarcode(" 0-78477-13512-2 ")).toBe("078477135122");
    expect(normalizeBarcode("78477135122")).toBe("078477135122");
  });
});

describe("parseReceiptCsv", () => {
  it("reads a Home Depot style export with a title block", () => {
    const csv = [
      "The Home Depot Pro Purchase History",
      "Account,12345",
      "",
      "Date,Store #,SKU,Item Description,UPC,Qty,Unit Price,Extended Price",
      '11/01/2026,0123,1001234567,"Romex 12/2 NM-B 250 ft",078477135122,2,$129.00,$258.00',
      "11/01/2026,0123,202020,Single Pole Breaker 20A,,10,8.47,84.70",
    ].join("\n");
    const { lines } = parseReceiptCsv(csv);
    expect(lines).toEqual([
      { name: "Romex 12/2 NM-B 250 ft", sku: "1001234567", barcode: "078477135122", quantity: 2, unitCostCents: 12900, store: "Home Depot" },
      { name: "Single Pole Breaker 20A", sku: "202020", barcode: "", quantity: 10, unitCostCents: 847, store: "Home Depot" },
    ]);
  });

  it("reads a Lowe's style export using the store hint", () => {
    const csv = "Item #,Description,Quantity,Price Each\n12345,Wire nuts 100pk,3,\"$1,004.50\"\n";
    const { lines } = parseReceiptCsv(csv, "Lowe's");
    expect(lines[0]).toMatchObject({ sku: "12345", name: "Wire nuts 100pk", quantity: 3, unitCostCents: 100450, store: "Lowe's" });
  });
});

describe("parseUpcItemDb", () => {
  it("picks the title and Home Depot / Lowe's prices", () => {
    const r = parseUpcItemDb("078477135122", {
      code: "OK",
      items: [{
        title: "Southwire 250 ft. 12/2 Romex",
        brand: "Southwire",
        category: "Hardware > Electrical > Wire",
        offers: [
          { merchant: "The Home Depot", price: 129, link: "https://hd" },
          { merchant: "Lowe's", price: 131.5, link: "https://lw" },
          { merchant: "Some Shop", price: 99 },
        ],
      }],
    });
    expect(r).toEqual({
      barcode: "078477135122",
      name: "Southwire 250 ft. 12/2 Romex",
      brand: "Southwire",
      category: "Wire",
      storePrices: [
        { store: "Home Depot", priceCents: 12900, link: "https://hd" },
        { store: "Lowe's", priceCents: 13150, link: "https://lw" },
      ],
    });
  });

  it("returns null when nothing is found", () => {
    expect(parseUpcItemDb("1", { code: "OK", items: [] })).toBeNull();
  });
});
