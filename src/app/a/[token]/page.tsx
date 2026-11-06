import Link from "next/link";
import { notFound } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { db, getSettings } from "@/lib/db";
import { fullInclude } from "@/lib/booking";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { cancelAppointment, confirmAppointment } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ booked?: string; confirmed?: string; moved?: string; cancelled?: string; error?: string }>;
};

export default async function CustomerAppointmentPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const appt = await db.appointment.findUnique({ where: { token }, include: fullInclude });
  if (!appt) notFound();
  const settings = await getSettings();
  const upcoming = appt.startAt > new Date();
  const active = appt.status === "SCHEDULED" || appt.status === "CONFIRMED";

  const notice =
    sp.booked ? "You're booked. Please confirm below so we know you're coming." :
    sp.confirmed ? "Thanks, your appointment is confirmed." :
    sp.moved ? "Your appointment has been moved." :
    sp.cancelled ? "Your appointment has been cancelled." :
    sp.error === "past" ? "This appointment has already started, so it can't be changed online. Please call us." : null;

  return (
    <PublicShell>
      {notice && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
      <div className="card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-stone-500">Hi {appt.customer.name}, your appointment</p>
            <h1 className="text-xl font-semibold">{appt.serviceType.name}</h1>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[appt.status]}`}>
            {STATUS_LABEL[appt.status]}
          </span>
        </div>
        <dl className="mb-6 space-y-2 text-sm">
          <div><dt className="inline font-medium">When: </dt><dd className="inline">{formatDateTime(appt.startAt, settings.timezone)}</dd></div>
          {appt.jobAddress && <div><dt className="inline font-medium">Where: </dt><dd className="inline">{appt.jobAddress}</dd></div>}
          {appt.customerNotes && <div><dt className="inline font-medium">Notes: </dt><dd className="inline">{appt.customerNotes}</dd></div>}
        </dl>

        {active && upcoming && (
          <div className="flex flex-wrap gap-3">
            {appt.status === "SCHEDULED" && (
              <form action={confirmAppointment}>
                <input type="hidden" name="token" value={appt.token} />
                <button className="btn-primary">Confirm appointment</button>
              </form>
            )}
            <Link href={`/a/${appt.token}/reschedule`} className="btn-secondary">Reschedule</Link>
            <form action={cancelAppointment}>
              <input type="hidden" name="token" value={appt.token} />
              <button className="btn-danger">Cancel</button>
            </form>
          </div>
        )}
        {appt.status === "CANCELLED" && (
          <Link href="/book" className="btn-secondary">Book a new time</Link>
        )}
      </div>
      {settings.phone && <p className="mt-4 text-sm text-stone-600">Questions? Call <a className="link" href={`tel:${settings.phone}`}>{settings.phone}</a>.</p>}
    </PublicShell>
  );
}
