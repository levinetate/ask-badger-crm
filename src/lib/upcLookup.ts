// Looks up a barcode's product name (and any store prices) from UPCitemdb.
// The free trial endpoint allows about 100 lookups a day; set UPCITEMDB_KEY for the paid plan.

export type UpcResult = {
  barcode: string;
  name: string;
  brand: string;
  category: string;
  // Prices seen at Home Depot or Lowe's, if the lookup service has them. Treat as a hint, not your cost.
  storePrices: { store: string; priceCents: number; link: string }[];
};

type UpcItemDbResponse = {
  code?: string;
  items?: {
    title?: string;
    brand?: string;
    category?: string;
    offers?: { merchant?: string; price?: number; link?: string }[];
  }[];
};

const STORES: [RegExp, string][] = [
  [/home\s*depot/i, "Home Depot"],
  [/lowe'?s/i, "Lowe's"],
];

export function parseUpcItemDb(barcode: string, json: UpcItemDbResponse): UpcResult | null {
  const item = json.items?.[0];
  if (!item?.title) return null;
  const storePrices = (item.offers ?? []).flatMap((o) => {
    const store = STORES.find(([re]) => re.test(o.merchant ?? ""))?.[1];
    if (!store || typeof o.price !== "number" || o.price <= 0) return [];
    return [{ store, priceCents: Math.round(o.price * 100), link: o.link ?? "" }];
  });
  return {
    barcode,
    name: item.title.trim(),
    brand: item.brand?.trim() ?? "",
    category: item.category?.split(">").pop()?.trim() ?? "",
    storePrices,
  };
}

export async function lookupUpc(barcode: string): Promise<UpcResult | null> {
  const key = process.env.UPCITEMDB_KEY;
  const url = key
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(barcode)}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
  try {
    const res = await fetch(url, {
      headers: key ? { user_key: key, key_type: "3scale", Accept: "application/json" } : { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseUpcItemDb(barcode, (await res.json()) as UpcItemDbResponse);
  } catch {
    return null;
  }
}
