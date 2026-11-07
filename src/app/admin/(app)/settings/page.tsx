import { db, getSettings } from "@/lib/db";
import { formatDateTime, minutesToHHMM } from "@/lib/time";
import { addBlock, deleteBlock, saveBusiness, saveHours, saveService } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage() {
  const s = await getSettings();
  const [rules, services, blocks] = await Promise.all([
    db.availabilityRule.findMany(),
    db.serviceType.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.blockedTime.findMany({ where: { endAt: { gt: new Date() } }, orderBy: { startAt: "asc" } }),
  ]);

  const num = (name: keyof typeof s, label: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} type="number" step="any" defaultValue={String(s[name])} />
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <form action={saveBusiness} className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Business</h2>
        <div><label className="label" htmlFor="businessName">Business name</label><input className="input" id="businessName" name="businessName" defaultValue={s.businessName} required /></div>
        <div><label className="label" htmlFor="phone">Phone shown to customers</label><input className="input" id="phone" name="phone" defaultValue={s.phone} /></div>
        <div><label className="label" htmlFor="ownerEmail">Your email (booking alerts)</label><input className="input" id="ownerEmail" name="ownerEmail" type="email" defaultValue={s.ownerEmail} /></div>
        <div><label className="label" htmlFor="timezone">Timezone</label><input className="input" id="timezone" name="timezone" defaultValue={s.timezone} /></div>
        {num("slotIntervalMin", "Offer start times every (minutes)")}
        {num("bufferMin", "Gap between jobs (minutes)", "Travel and cleanup time kept free around each job.")}
        {num("minNoticeHours", "Minimum notice (hours)")}
        {num("maxDaysAhead", "How far ahead customers can book (days)")}
        {num("taxRatePercent", "Sales tax rate (%)", "Columbia County, GA defaults to 8%. Confirm with your accountant. Used by invoices later.")}
        {num("defaultMarkupPercent", "Default markup on materials (%)", "Added to your cost when pricing materials. Each item can override it.")}
        <div><label className="label" htmlFor="zelleInfo">Zelle details for invoices</label><input className="input" id="zelleInfo" name="zelleInfo" defaultValue={s.zelleInfo} placeholder="Phone or email registered with Zelle" /></div>
        <div className="sm:col-span-2"><button className="btn-primary">Save business settings</button></div>
      </form>

      <form action={saveHours} className="card">
        <h2 className="mb-3 font-medium">Working hours</h2>
        <div className="space-y-2">
          {DAYS.map((day, d) => {
            const r = rules.find((x) => x.weekday === d);
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex w-32 items-center gap-2"><input type="checkbox" name={`open-${d}`} defaultChecked={!!r} /> {day}</label>
                <input className="input w-32" type="time" name={`start-${d}`} defaultValue={minutesToHHMM(r?.startMinute ?? 8 * 60)} />
                <span>to</span>
                <input className="input w-32" type="time" name={`end-${d}`} defaultValue={minutesToHHMM(r?.endMinute ?? 17 * 60)} />
              </div>
            );
          })}
        </div>
        <button className="btn-primary mt-4">Save hours</button>
      </form>

      <div className="card">
        <h2 className="mb-3 font-medium">Services customers can book</h2>
        <div className="space-y-3">
          {[...services, null].map((sv) => (
            <form key={sv?.id ?? "new"} action={saveService} className="grid items-end gap-2 rounded border border-stone-200 p-3 sm:grid-cols-12">
              {sv && <input type="hidden" name="id" value={sv.id} />}
              <div className="sm:col-span-3"><label className="label">{sv ? "Name" : "New service"}</label><input className="input" name="name" defaultValue={sv?.name} required placeholder="e.g. Outlet repair" /></div>
              <div className="sm:col-span-4"><label className="label">Description</label><input className="input" name="description" defaultValue={sv?.description} /></div>
              <div className="sm:col-span-1"><label className="label">Minutes</label><input className="input" name="durationMin" type="number" min={15} step={15} defaultValue={sv?.durationMin ?? 60} /></div>
              <div className="sm:col-span-1"><label className="label">From $</label><input className="input" name="price" defaultValue={sv?.priceCents != null ? (sv.priceCents / 100).toFixed(2) : ""} /></div>
              <div className="sm:col-span-1"><label className="label">Order</label><input className="input" name="sortOrder" type="number" defaultValue={sv?.sortOrder ?? 0} /></div>
              <label className="flex items-center gap-1 text-sm sm:col-span-1"><input type="checkbox" name="active" defaultChecked={sv?.active ?? true} /> On</label>
              <button className="btn-secondary sm:col-span-1">{sv ? "Save" : "Add"}</button>
            </form>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Time off and blocked time</h2>
        <ul className="mb-4 space-y-2 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3">
              <span>{formatDateTime(b.startAt, s.timezone)} to {formatDateTime(b.endAt, s.timezone)}{b.reason && ` · ${b.reason}`}</span>
              <form action={deleteBlock}><input type="hidden" name="id" value={b.id} /><button className="link text-xs">Remove</button></form>
            </li>
          ))}
          {blocks.length === 0 && <li className="text-stone-500">None coming up.</li>}
        </ul>
        <form action={addBlock} className="grid items-end gap-2 sm:grid-cols-6">
          <div><label className="label">From date</label><input className="input" type="date" name="startDate" required /></div>
          <div><label className="label">Time (optional)</label><input className="input" type="time" name="startTime" /></div>
          <div><label className="label">To date</label><input className="input" type="date" name="endDate" required /></div>
          <div><label className="label">Time (optional)</label><input className="input" type="time" name="endTime" /></div>
          <div><label className="label">Reason</label><input className="input" name="reason" /></div>
          <button className="btn-secondary">Block time</button>
        </form>
      </div>
    </div>
  );
}
