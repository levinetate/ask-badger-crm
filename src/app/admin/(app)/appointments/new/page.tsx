import { db, getSettings } from "@/lib/db";
import { minutesToHHMM, zonedDateStr, addDaysStr } from "@/lib/time";
import { createAppointment } from "../actions";

type Props = { searchParams: Promise<{ customer?: string }> };

export default async function NewAppointmentPage({ searchParams }: Props) {
  const { customer: customerParam } = await searchParams;
  const s = await getSettings();
  const [services, customers] = await Promise.all([
    db.serviceType.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.customer.findMany({ orderBy: { name: "asc" }, take: 500 }),
  ]);
  const tomorrow = `${addDaysStr(zonedDateStr(new Date(), s.timezone), 1)}T${minutesToHHMM(9 * 60)}`;

  if (services.length === 0) {
    return <p className="card">Add a service type in <a className="link" href="/admin/settings">Settings</a> first.</p>;
  }

  return (
    <form action={createAppointment} className="card max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold">New appointment</h1>
      <fieldset className="space-y-3">
        <legend className="label">Customer</legend>
        <select className="input" name="customerId" defaultValue={customerParam ?? ""}>
          <option value="">New customer (fill in below)</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
        </select>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" name="name" placeholder="Name" />
          <input className="input" name="email" type="email" placeholder="Email" />
          <input className="input" name="phone" type="tel" placeholder="Phone" />
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="serviceTypeId">Service</label>
          <select className="input" id="serviceTypeId" name="serviceTypeId">
            {services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name} ({sv.durationMin} min)</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="durationMin">Length in minutes (optional)</label>
          <input className="input" id="durationMin" name="durationMin" type="number" min={15} step={15} placeholder="Service default" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="startLocal">Date and time</label>
        <input className="input max-w-xs" id="startLocal" name="startLocal" type="datetime-local" defaultValue={tomorrow} required />
        <p className="mt-1 text-xs text-stone-500">You can book outside your normal hours here. Customers can&apos;t.</p>
      </div>
      <div>
        <label className="label" htmlFor="jobAddress">Job address</label>
        <input className="input" id="jobAddress" name="jobAddress" placeholder="Defaults to the customer's address" />
      </div>
      <div>
        <label className="label" htmlFor="internalNotes">Private notes</label>
        <textarea className="input" id="internalNotes" name="internalNotes" rows={3} />
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="sendEmail" defaultChecked /> Email the customer a confirm link</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="confirmed" /> Already confirmed (e.g. by phone)</label>
      </div>
      <button className="btn-primary">Create appointment</button>
    </form>
  );
}
