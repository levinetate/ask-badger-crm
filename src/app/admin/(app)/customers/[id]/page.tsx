import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getSettings } from "@/lib/db";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { updateCustomer } from "../actions";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id: Number(id) || 0 },
    include: { appointments: { include: { serviceType: true }, orderBy: { startAt: "desc" } } },
  });
  if (!c) notFound();
  const s = await getSettings();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form action={updateCustomer} className="card h-fit space-y-3">
        <h1 className="text-xl font-semibold">{c.name}</h1>
        <input type="hidden" name="id" value={c.id} />
        {(["name", "email", "phone", "address"] as const).map((f) => (
          <div key={f}>
            <label className="label capitalize" htmlFor={f}>{f}</label>
            <input className="input" id={f} name={f} defaultValue={c[f]} type={f === "email" ? "email" : "text"} required={f === "name" || f === "email"} />
          </div>
        ))}
        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <textarea className="input" id="notes" name="notes" rows={4} defaultValue={c.notes} />
        </div>
        <button className="btn-secondary">Save</button>
      </form>
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Job history</h2>
          <Link className="btn-primary" href={`/admin/appointments/new?customer=${c.id}`}>New appointment</Link>
        </div>
        <ul className="space-y-2">
          {c.appointments.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/appointments/${a.id}`} className="card flex items-center justify-between gap-3 py-3 hover:border-amber-600">
                <span><span className="font-medium">{a.serviceType.name}</span> · {formatDateTime(a.startAt, s.timezone)}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
              </Link>
            </li>
          ))}
          {c.appointments.length === 0 && <li className="text-sm text-stone-500">No appointments yet.</li>}
        </ul>
      </div>
    </div>
  );
}
