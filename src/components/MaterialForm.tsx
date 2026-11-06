import type { Material } from "@prisma/client";
import { saveMaterial } from "@/app/admin/(app)/materials/actions";

type Prefill = Partial<{ name: string; barcode: string; sku: string; store: string; category: string; cost: string }>;

export default function MaterialForm({ material, prefill = {}, defaultMarkup }: { material?: Material; prefill?: Prefill; defaultMarkup: number }) {
  const v = (k: keyof Prefill, fallback = "") => prefill[k] ?? fallback;
  const field = (name: string, label: string, defaultValue: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} defaultValue={defaultValue} {...extra} />
    </div>
  );
  return (
    <form action={saveMaterial} className="card grid gap-4 sm:grid-cols-2">
      {material && <input type="hidden" name="id" value={material.id} />}
      <div className="sm:col-span-2">{field("name", "Name", material?.name ?? v("name"), { required: true, placeholder: "e.g. 20A single pole breaker" })}</div>
      {field("store", "Store or supplier", material?.store ?? v("store"), { list: "stores" })}
      <datalist id="stores"><option value="Home Depot" /><option value="Lowe's" /></datalist>
      {field("sku", "Store SKU / item #", material?.sku ?? v("sku"))}
      {field("barcode", "Barcode (UPC)", material?.barcode ?? v("barcode"), { inputMode: "numeric" })}
      {field("category", "Category", material?.category ?? v("category"), { placeholder: "Wire, Breakers, Boxes..." })}
      {field("cost", "Your cost per unit ($)", material ? (material.costCents / 100).toFixed(2) : v("cost"), { inputMode: "decimal" })}
      {field("unit", "Unit", material?.unit ?? "each", { placeholder: "each, ft, box, roll" })}
      {field("markupPercent", `Markup % (blank = default ${defaultMarkup}%)`, material?.markupPercent != null ? String(material.markupPercent) : "", { type: "number", step: "any", min: 0 })}
      {field("reorderAt", "Warn when stock is at or below", material?.reorderAt != null ? String(material.reorderAt) : "", { type: "number", step: "any", min: 0 })}
      {field("location", "Kept in", material?.location ?? "", { placeholder: "Truck, Shop..." })}
      {!material && field("startingQty", "How many you have now", "", { type: "number", step: "any", min: 0 })}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea className="input" id="notes" name="notes" rows={2} defaultValue={material?.notes ?? ""} />
      </div>
      {material && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={material.active} /> Active (uncheck to hide from lists)</label>
      )}
      <div className="sm:col-span-2"><button className="btn-primary">{material ? "Save changes" : "Add material"}</button></div>
    </form>
  );
}
