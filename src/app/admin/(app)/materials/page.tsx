import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db, getSettings } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { effectiveMarkup, formatQty, isLowStock, sellPriceCents } from "@/lib/materials";

type Props = { searchParams: Promise<{ q?: string; low?: string; imported?: string }> };

export default async function MaterialsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const s = await getSettings();
  const where: Prisma.MaterialWhereInput = q
    ? { OR: ["name", "sku", "barcode", "category", "store", "location"].map((f) => ({ [f]: { contains: q, mode: "insensitive" as const } })) }
    : { active: true };
  let items = await db.material.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], take: 500 });
  if (sp.low) items = items.filter(isLowStock);
  const lowCount = (await db.material.findMany({ where: { active: true, reorderAt: { not: null } }, select: { quantityOnHand: true, reorderAt: true } })).filter(isLowStock).length;
  const [created, updated] = (sp.imported ?? "").split("-").map(Number);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Materials</h1>
        <Link href="/admin/materials/scan" className="btn-primary">Scan barcode</Link>
        <Link href="/admin/materials/new" className="btn-secondary">Add material</Link>
        <Link href="/admin/materials/import" className="btn-secondary">Import receipt</Link>
      </div>
      {sp.imported && (
        <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-900">Import done: {created} new, {updated} updated.</p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="flex gap-2">
          <input className="input w-72" name="q" defaultValue={q} placeholder="Search name, SKU, barcode, category" />
          <button className="btn-secondary">Search</button>
        </form>
        <Link href={sp.low ? "/admin/materials" : "/admin/materials?low=1"} className={`text-sm ${lowCount ? "text-red-700" : "text-stone-500"}`}>
          {sp.low ? "Show all" : `${lowCount} low on stock`}
        </Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr>
              <th className="p-3">Item</th><th className="p-3">Store / SKU</th><th className="p-3">Where</th>
              <th className="p-3 text-right">On hand</th><th className="p-3 text-right">Your cost</th><th className="p-3 text-right">You charge</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="p-3">
                  <Link className="link" href={`/admin/materials/${m.id}`}>{m.name}</Link>
                  {m.category && <div className="text-xs text-stone-500">{m.category}</div>}
                </td>
                <td className="p-3">{m.store}{m.sku && <div className="text-xs text-stone-500">{m.sku}</div>}</td>
                <td className="p-3">{m.location}</td>
                <td className={`p-3 text-right ${isLowStock(m) ? "font-medium text-red-700" : ""}`}>{formatQty(m.quantityOnHand)} {m.unit}</td>
                <td className="p-3 text-right">{formatMoney(m.costCents)}</td>
                <td className="p-3 text-right">{formatMoney(sellPriceCents(m.costCents, effectiveMarkup(m, s.defaultMarkupPercent)))}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="p-3 text-stone-500">No materials yet. Scan a barcode, add one by hand, or import a receipt.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
