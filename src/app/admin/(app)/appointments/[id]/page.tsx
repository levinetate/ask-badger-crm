import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getSettings } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { formatDuration, STATUS_CLASS, STATUS_LABEL } from "@/lib/format";
import { formatDateTime, minutesToHHMM, zonedDateStr, zonedParts } from "@/lib/time";
import { moveAppointment, resendConfirmation, saveNotes, setStatus } from "../actions";
import { adjustStock, removeJobMaterial } from "../../materials/actions";
import { formatMoney } from "@/lib/format";
import { effectiveMarkup, formatQty, sellPriceCents } from "@/lib/materials";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> };

export default async function AppointmentDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const { sent } = await searchParams;
  const appt = await db.appointment.findUnique({
    where: { id: Number(id) || 0 },
    include: { customer: true, serviceType: true, stockMovements: { where: { reason: "USED" }, include: { material: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!appt) notFound();
  const s = await getSettings();
  const materials = await db.material.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } });
  const used = appt.stockMovements.map((mv) => {
    const qty = -Number(mv.change);
    const each = sellPriceCents(mv.material.costCents, effectiveMarkup(mv.material, s.defaultMarkupPercent));
    return { mv, qty, each, total: Math.round(qty * each) };
  });
  const p = zonedParts(appt.startAt, s.timezone);
  const localValue = `${zonedDateStr(appt.startAt, s.timezone)}T${minutesToHHMM(p.hour * 60 + p.minute)}`;
  const duration = Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000);
  const statusButton = (status: string, label: string, cls = "btn-secondary") => (
    <form action={setStatus}>
      <input type="hidden" name="id" value={appt.id} />
      <input type="hidden" name="status" value={status} />
      {status === "CANCELLED" && <input type="hidden" name="notify" value="on" />}
      <button className={cls}>{label}</button>
    </form>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{appt.serviceType.name}</h1>
              <p className="text-stone-600">{formatDateTime(appt.startAt, s.timezone)} · {formatDuration(duration)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[appt.status]}`}>{STATUS_LABEL[appt.status]}</span>
          </div>
          {sent && <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-900">Confirmation email sent.</p>}
          <div className="flex flex-wrap gap-2">
            {appt.status === "SCHEDULED" && statusButton("CONFIRMED", "Mark confirmed", "btn-primary")}
            {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && statusButton("COMPLETED", "Mark completed")}
            {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && statusButton("CANCELLED", "Cancel and email customer", "btn-danger")}
            {(appt.status === "CANCELLED" || appt.status === "COMPLETED") && statusButton("SCHEDULED", "Reopen")}
            <Link className="btn-secondary" href={`/admin/estimates/new?appointment=${appt.id}`}>Create estimate</Link>
            <Link className="btn-secondary" href={`/admin/invoices/new?appointment=${appt.id}`}>Create invoice</Link>
            {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && (
              <form action={resendConfirmation}>
                <input type="hidden" name="id" value={appt.id} />
                <button className="btn-secondary">Resend confirmation email</button>
              </form>
            )}
          </div>
          {appt.customerNotes && (
            <div className="mt-4 text-sm"><span className="font-medium">Customer notes: </span>{appt.customerNotes}</div>
          )}
        </div>

        <form action={moveAppointment} className="card space-y-3">
          <h2 className="font-medium">Move appointment</h2>
          <input type="hidden" name="id" value={appt.id} />
          <input className="input max-w-xs" type="datetime-local" name="startLocal" defaultValue={localValue} required />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked /> Email the customer to confirm the new time</label>
          <button className="btn-secondary">Move</button>
        </form>

        <div className="card space-y-3">
          <h2 className="font-medium">Materials used</h2>
          {used.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {used.map(({ mv, qty, each, total }) => (
                  <tr key={mv.id} className="border-b border-stone-100">
                    <td className="py-1"><Link className="link" href={`/admin/materials/${mv.material.id}`}>{mv.material.name}</Link></td>
                    <td className="py-1 text-right">{formatQty(qty)} {mv.material.unit}</td>
                    <td className="py-1 text-right">{formatMoney(each)}</td>
                    <td className="py-1 text-right">{formatMoney(total)}</td>
                    <td className="py-1 text-right">
                      <form action={removeJobMaterial}><input type="hidden" name="movementId" value={mv.id} /><button className="link text-xs">Remove</button></form>
                    </td>
                  </tr>
                ))}
                <tr><td className="pt-2 font-medium" colSpan={3}>Materials total (at your markup)</td><td className="pt-2 text-right font-medium">{formatMoney(used.reduce((a, u) => a + u.total, 0))}</td><td /></tr>
              </tbody>
            </table>
          )}
          {materials.length === 0 ? (
            <p className="text-sm text-stone-500">Add items under <Link className="link" href="/admin/materials">Materials</Link> to track what you use on jobs.</p>
          ) : (
            <form action={adjustStock} className="flex flex-wrap gap-2">
              <input type="hidden" name="reason" value="USED" />
              <input type="hidden" name="appointmentId" value={appt.id} />
              <input type="hidden" name="note" value={`Job #${appt.id}`} />
              <select className="input w-auto flex-1" name="materialId" required>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
              <input className="input w-24" name="quantity" type="number" step="any" min="0.01" defaultValue="1" required aria-label="Quantity" />
              <button className="btn-secondary">Add</button>
            </form>
          )}
        </div>

        <form action={saveNotes} className="card space-y-3">
          <h2 className="font-medium">Job details</h2>
          <input type="hidden" name="id" value={appt.id} />
          <div>
            <label className="label" htmlFor="jobAddress">Job address</label>
            <input className="input" id="jobAddress" name="jobAddress" defaultValue={appt.jobAddress} />
          </div>
          <div>
            <label className="label" htmlFor="internalNotes">Private notes (customer can&apos;t see)</label>
            <textarea className="input" id="internalNotes" name="internalNotes" rows={4} defaultValue={appt.internalNotes} />
          </div>
          <button className="btn-secondary">Save</button>
        </form>
      </div>

      <aside className="card h-fit space-y-2 text-sm">
        <h2 className="font-medium">Customer</h2>
        <Link className="link" href={`/admin/customers/${appt.customer.id}`}>{appt.customer.name}</Link>
        <div><a className="link" href={`mailto:${appt.customer.email}`}>{appt.customer.email}</a></div>
        {appt.customer.phone && <div><a className="link" href={`tel:${appt.customer.phone}`}>{appt.customer.phone}</a></div>}
        <div className="pt-2 text-xs text-stone-500">Booked by {appt.bookedBy}{appt.confirmedAt ? ` · confirmed ${formatDateTime(appt.confirmedAt, s.timezone)}` : ""}</div>
        <div className="break-all pt-2 text-xs text-stone-500">Customer link: {appUrl(`/a/${appt.token}`)}</div>
      </aside>
    </div>
  );
}
