import Papa from "papaparse";

// Reads purchase-history CSVs from Home Depot Pro (Purchase Tracking) or Lowe's Pro (MyLowe's purchases).
// Column names vary by export, so columns are matched by keywords rather than exact headers.

export type ReceiptLine = {
  sku: string;
  barcode: string;
  name: string;
  quantity: number;
  unitCostCents: number;
  store: string;
};

const PATTERNS: Record<keyof Omit<ReceiptLine, "store">, RegExp[]> = {
  barcode: [/^upc$/i, /upc/i, /barcode/i, /\bean\b/i],
  sku: [/^sku/i, /item\s*(#|number|no)/i, /internet\s*#/i, /model/i, /sku/i],
  name: [/description/i, /item\s*name/i, /product/i, /^item$/i, /name/i],
  quantity: [/^qty/i, /quantity/i, /qty/i],
  unitCostCents: [/unit\s*(price|cost)/i, /price\s*each/i, /each/i, /^price$/i, /net\s*price/i],
};

function pickColumns(headers: string[]) {
  const used = new Set<string>();
  const out: Partial<Record<keyof typeof PATTERNS, string>> = {};
  // Most specific fields first so "UPC" isn't taken as a SKU column.
  for (const field of ["barcode", "quantity", "unitCostCents", "sku", "name"] as const) {
    for (const re of PATTERNS[field]) {
      const h = headers.find((x) => !used.has(x) && re.test(x));
      if (h) { out[field] = h; used.add(h); break; }
    }
  }
  return out;
}

function money(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function detectStore(text: string): string {
  if (/home\s*depot/i.test(text)) return "Home Depot";
  if (/lowe'?s/i.test(text)) return "Lowe's";
  return "";
}

export function parseReceiptCsv(csv: string, storeHint = ""): { lines: ReceiptLine[]; columns: Record<string, string | undefined> } {
  // Some exports put a title or account block above the real header row; skip to the first row with a description/qty column.
  const rows = csv.split(/\r?\n/);
  const headerIdx = rows.findIndex((r) => /desc|item|product/i.test(r) && /qty|quant/i.test(r));
  const body = headerIdx > 0 ? rows.slice(headerIdx).join("\n") : csv;
  const store = storeHint || detectStore(rows.slice(0, Math.max(headerIdx, 1)).join(" "));

  const parsed = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const cols = pickColumns(parsed.meta.fields ?? []);
  const lines: ReceiptLine[] = [];
  for (const r of parsed.data) {
    const name = (cols.name && r[cols.name]?.trim()) || "";
    if (!name) continue;
    const quantity = Number((cols.quantity && r[cols.quantity]?.replace(/,/g, "")) || "1");
    lines.push({
      name,
      sku: (cols.sku && r[cols.sku]?.trim()) || "",
      barcode: ((cols.barcode && r[cols.barcode]) || "").replace(/\D/g, ""),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitCostCents: money(cols.unitCostCents && r[cols.unitCostCents]),
      store,
    });
  }
  return { lines, columns: cols };
}
