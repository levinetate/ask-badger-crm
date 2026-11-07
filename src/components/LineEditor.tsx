"use client";

import { useMemo, useState } from "react";
import { computeTotals, lineTotalCents, type LineInput } from "@/lib/documents";

export type EditorMaterial = { id: number; name: string; unit: string; sellPriceCents: number };

type Row = Omit<LineInput, "quantity" | "unitPriceCents"> & { key: number; quantity: string; price: string };

const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const toRow = (l: LineInput, key: number): Row => ({ ...l, key, quantity: String(l.quantity), price: (l.unitPriceCents / 100).toFixed(2) });
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100) || 0;

/** Editable line items. Submits as JSON in a hidden "lines" field. */
export default function LineEditor({
  initial,
  materials,
  laborRateCents,
  taxRatePercent,
}: {
  initial: LineInput[];
  materials: EditorMaterial[];
  laborRateCents: number;
  taxRatePercent: number;
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow));
  const [nextKey, setNextKey] = useState(initial.length + 1);
  const [pick, setPick] = useState("");

  const lines: LineInput[] = rows.map((r) => ({
    kind: r.kind,
    description: r.description,
    taxable: r.taxable,
    materialId: r.materialId,
    quantity: Number(r.quantity) || 0,
    unitPriceCents: cents(r.price),
  }));
  const totals = useMemo(() => computeTotals(lines, taxRatePercent), [lines, taxRatePercent]);

  const add = (l: LineInput) => {
    setRows((rs) => [...rs, toRow(l, nextKey)]);
    setNextKey((k) => k + 1);
  };
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const move = (key: number, dir: -1 | 1) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="p-1">Description</th><th className="w-20 p-1 text-right">Qty</th><th className="w-28 p-1 text-right">Price</th><th className="w-14 p-1 text-center">Tax</th><th className="w-24 p-1 text-right">Amount</th><th className="w-20" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-stone-100 align-top">
                <td className="p-1">
                  <input className="input" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} aria-label="Description" required />
                  <span className="text-[11px] text-stone-400">{r.kind === "LABOR" ? "Labor" : r.kind === "MATERIAL" ? "Material" : "Other"}</span>
                </td>
                <td className="p-1"><input className="input text-right" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} aria-label="Quantity" /></td>
                <td className="p-1"><input className="input text-right" inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} aria-label="Unit price" /></td>
                <td className="p-1 text-center"><input type="checkbox" className="mt-3" checked={r.taxable} onChange={(e) => update(r.key, { taxable: e.target.checked })} aria-label="Taxable" /></td>
                <td className="p-1 pt-3 text-right">{money(lineTotalCents({ quantity: Number(r.quantity) || 0, unitPriceCents: cents(r.price) }))}</td>
                <td className="whitespace-nowrap p-1 pt-2 text-right text-xs">
                  <button type="button" className="px-1 text-stone-500" onClick={() => move(r.key, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="px-1 text-stone-500" onClick={() => move(r.key, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="px-1 text-red-700" onClick={() => remove(r.key)} aria-label="Remove line">✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-2 text-stone-500">No lines yet. Add labor or materials below.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => add({ kind: "LABOR", description: "Labor", quantity: 1, unitPriceCents: laborRateCents, taxable: false, materialId: null })}>
          + Labor{laborRateCents ? ` (${money(laborRateCents)}/hr)` : ""}
        </button>
        <button type="button" className="btn-secondary" onClick={() => add({ kind: "OTHER", description: "", quantity: 1, unitPriceCents: 0, taxable: false, materialId: null })}>+ Other line</button>
        {materials.length > 0 && (
          <span className="flex gap-2">
            <select className="input w-64" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Material to add">
              <option value="">Add a material…</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {money(m.sellPriceCents)}/{m.unit}</option>)}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!pick}
              onClick={() => {
                const m = materials.find((x) => String(x.id) === pick);
                if (m) add({ kind: "MATERIAL", description: m.name, quantity: 1, unitPriceCents: m.sellPriceCents, taxable: true, materialId: m.id });
                setPick("");
              }}
            >
              Add
            </button>
          </span>
        )}
      </div>

      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(totals.subtotalCents)}</dd></div>
        <div className="flex justify-between text-stone-600"><dt>Tax {taxRatePercent}% on {money(totals.taxableCents)}</dt><dd>{money(totals.taxCents)}</dd></div>
        <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-semibold"><dt>Total</dt><dd>{money(totals.totalCents)}</dd></div>
      </dl>
    </div>
  );
}
