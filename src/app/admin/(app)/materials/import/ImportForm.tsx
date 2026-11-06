"use client";

import { useActionState, useEffect, useState } from "react";
import { applyImport, previewImport, type ImportRow } from "../actions";

type Row = ImportRow & { include: boolean; addStock: boolean };

const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

export default function ImportForm() {
  const [state, preview, previewing] = useActionState(previewImport, { rows: [] as ImportRow[] });
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => setRows(state.rows.map((r) => ({ ...r, include: true, addStock: true }))), [state.rows]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include);

  return (
    <div className="space-y-4">
      <form action={preview} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="file">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
        </div>
        <div>
          <label className="label" htmlFor="store">Store</label>
          <select className="input" id="store" name="store" defaultValue="">
            <option value="">Detect from file</option>
            <option>Home Depot</option>
            <option>Lowe&apos;s</option>
          </select>
        </div>
        <button className="btn-primary" disabled={previewing}>{previewing ? "Reading…" : "Preview"}</button>
        {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
      </form>

      {rows.length > 0 && (
        <form action={applyImport} className="space-y-3">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 text-left text-stone-500">
                <tr>
                  <th className="p-2">Import</th><th className="p-2">Item</th><th className="p-2">SKU / UPC</th>
                  <th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit cost</th><th className="p-2">Matches</th><th className="p-2">Add to stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-stone-100 ${r.include ? "" : "opacity-50"}`}>
                    <td className="p-2"><input type="checkbox" checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label={`Import ${r.name}`} /></td>
                    <td className="p-2">{r.name}<div className="text-xs text-stone-500">{r.store}</div></td>
                    <td className="p-2 text-xs">{r.sku}{r.barcode && <div>{r.barcode}</div>}</td>
                    <td className="p-2 text-right">{r.quantity}</td>
                    <td className="p-2 text-right">{money(r.unitCostCents)}</td>
                    <td className="p-2">{r.matchName ? <span className="text-green-800">Updates “{r.matchName}”</span> : <span className="text-stone-500">New item</span>}</td>
                    <td className="p-2"><input type="checkbox" checked={r.addStock} onChange={(e) => set(i, { addStock: e.target.checked })} aria-label={`Add ${r.name} to stock`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary" disabled={chosen.length === 0}>Import {chosen.length} item{chosen.length === 1 ? "" : "s"}</button>
        </form>
      )}
    </div>
  );
}
