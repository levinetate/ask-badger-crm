import Link from "next/link";
import { notFound } from "next/navigation";
import MaterialForm from "@/components/MaterialForm";
import { db, getSettings } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { STOCK_REASON_LABEL, effectiveMarkup, formatQty, isLowStock, sellPriceCents } from "@/lib/materials";
import { formatDateTime } from "@/lib/time";
import { adjustStock } from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; dupe?: string }> };

export default async function MaterialDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const m = await db.material.findUnique({
    where: { id: Number(id) || 0 },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 50, include: { appointment: { include: { customer: true } } } } },
  });
  if (!m) notFound();
  const s = await getSettings();
  const markup = effectiveMarkup(m, s.defaultMarkupPercent);
  const back = `/admin/materials/${m.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Link href="/admin/materials" className="link text-sm">← Materials</Link>
        {sp.saved && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Saved.</p>}
        {sp.dupe && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">That barcode already belongs to this item.</p>}
        <MaterialForm material={m} defaultMarkup={Number(s.defaultMarkupPercent)} />
      </div>
      <aside className="space-y-4">
        <div className="card">
          <div className="text-sm text-stone-500">On hand</div>
          <div className={`text-3xl font-semibold ${isLowStock(m) ? "text-red-700" : ""}`}>{formatQty(m.quantityOnHand)} <span className="text-base font-normal">{m.unit}</span></div>
          <div className="mt-2 text-sm text-stone-600">
            Cost {formatMoney(m.costCents)} · charge {formatMoney(sellPriceCents(m.costCents, markup))} ({markup}% markup)
          </div>
          {m.costUpdatedAt && <div className="text-xs text-stone-500">Cost updated {formatDateTime(m.costUpdatedAt, s.timezone)}</div>}
        </div>
        <form action={adjustStock} className="card space-y-3">
          <h2 className="font-medium">Update stock</h2>
          <input type="hidden" name="materialId" value={m.id} />
          <input type="hidden" name="back" value={back} />
          <select className="input" name="reason" defaultValue="PURCHASE">
            <option value="PURCHASE">Bought more (+)</option>
            <option value="USED">Used (−)</option>
            <option value="COUNT">Counted: set total to</option>
            <option value="ADJUST">Adjust by (+/−)</option>
          </select>
          <input className="input" name="quantity" type="number" step="any" required placeholder="Amount" />
          <input className="input" name="unitCost" inputMode="decimal" placeholder="New unit cost $ (optional, for purchases)" />
          <input className="input" name="note" placeholder="Note (optional)" />
          <button className="btn-primary w-full">Save</button>
        </form>
        <div className="card">
          <h2 className="mb-2 font-medium">History</h2>
          <ul className="space-y-2 text-sm">
            {m.movements.map((mv) => (
              <li key={mv.id} className="flex justify-between gap-2">
                <span>
                  {STOCK_REASON_LABEL[mv.reason]}
                  {mv.appointment && <> · <Link className="link" href={`/admin/appointments/${mv.appointment.id}`}>{mv.appointment.customer.name}</Link></>}
                  {mv.note && <span className="text-stone-500"> · {mv.note}</span>}
                  <div className="text-xs text-stone-500">{formatDateTime(mv.createdAt, s.timezone)}</div>
                </span>
                <span className={Number(mv.change) < 0 ? "text-red-700" : "text-green-800"}>{Number(mv.change) > 0 ? "+" : ""}{formatQty(mv.change)}</span>
              </li>
            ))}
            {m.movements.length === 0 && <li className="text-stone-500">No changes yet.</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}
