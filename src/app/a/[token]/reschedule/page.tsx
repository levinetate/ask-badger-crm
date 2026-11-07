import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import SlotPicker from "@/components/SlotPicker";
import { db } from "@/lib/db";
import { pickerData } from "@/lib/booking";
import { formatDateTime } from "@/lib/time";
import { rescheduleAppointment } from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string; start?: string; error?: string }>;
};

export default async function ReschedulePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const appt = await db.appointment.findUnique({ where: { token }, include: { serviceType: true } });
  if (!appt) notFound();
  if ((appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED") || appt.startAt <= new Date()) redirect(`/a/${token}`);

  const { settings, dates, openDates, selectedDate, slots } = await pickerData(appt.serviceTypeId, sp.date, appt.id);
  const start = sp.start && slots.some((s) => s.toISOString() === sp.start) ? sp.start : null;
  const href = ({ date, start }: { date: string; start?: string }) =>
    `/a/${token}/reschedule?date=${date}${start ? `&start=${encodeURIComponent(start)}` : ""}`;

  return (
    <PublicShell>
      <Link href={`/a/${token}`} className="link text-sm">← Back to appointment</Link>
      <h1 className="mb-1 mt-3 text-2xl font-semibold">Pick a new time</h1>
      <p className="mb-6 text-sm text-stone-600">
        {appt.serviceType.name}, currently {formatDateTime(appt.startAt, settings.timezone)}
      </p>
      {sp.error === "taken" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Sorry, that time was just taken. Please pick another.</p>
      )}
      <section className="card mb-6">
        <SlotPicker dates={dates} openDates={openDates} selectedDate={selectedDate} slots={slots} selectedStart={start} timeZone={settings.timezone} hrefFor={href} />
      </section>
      {start && (
        <form action={rescheduleAppointment} className="card flex flex-wrap items-center justify-between gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="start" value={start} />
          <span className="text-sm">Move to <strong>{formatDateTime(new Date(start), settings.timezone)}</strong>?</span>
          <button className="btn-primary">Move appointment</button>
        </form>
      )}
    </PublicShell>
  );
}
