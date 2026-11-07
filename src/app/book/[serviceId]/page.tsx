import Link from "next/link";
import { notFound } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import SlotPicker from "@/components/SlotPicker";
import { db } from "@/lib/db";
import { pickerData } from "@/lib/booking";
import { formatDuration } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { createBooking } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ date?: string; start?: string; error?: string }>;
};

export default async function ServiceBookingPage({ params, searchParams }: Props) {
  const { serviceId } = await params;
  const sp = await searchParams;
  const service = await db.serviceType.findFirst({ where: { id: Number(serviceId) || 0, active: true } });
  if (!service) notFound();

  const { settings, dates, openDates, selectedDate, slots } = await pickerData(service.id, sp.date);
  const start = sp.start && slots.some((s) => s.toISOString() === sp.start) ? sp.start : null;
  const href = ({ date, start }: { date: string; start?: string }) =>
    `/book/${service.id}?date=${date}${start ? `&start=${encodeURIComponent(start)}` : ""}`;

  return (
    <PublicShell>
      <Link href="/book" className="link text-sm">← All services</Link>
      <h1 className="mb-1 mt-3 text-2xl font-semibold">{service.name}</h1>
      <p className="mb-6 text-sm text-stone-600">{formatDuration(service.durationMin)}</p>

      {sp.error === "taken" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Sorry, that time was just taken. Please pick another.</p>
      )}

      <section className="card mb-6">
        <h2 className="mb-3 font-medium">1. Pick a time</h2>
        {openDates.size === 0 ? (
          <p className="text-sm text-stone-600">No open times in the next {settings.maxDaysAhead} days. Please call us.</p>
        ) : (
          <SlotPicker
            dates={dates}
            openDates={openDates}
            selectedDate={selectedDate}
            slots={slots}
            selectedStart={start}
            timeZone={settings.timezone}
            hrefFor={href}
          />
        )}
      </section>

      {start && (
        <section className="card" id="details">
          <h2 className="mb-1 font-medium">2. Your details</h2>
          <p className="mb-4 text-sm text-stone-600">{formatDateTime(new Date(start), settings.timezone)}</p>
          <form action={createBooking} className="space-y-4">
            <input type="hidden" name="serviceTypeId" value={service.id} />
            <input type="hidden" name="start" value={start} />
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required maxLength={120} autoComplete="name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input className="input" id="email" name="email" type="email" required maxLength={200} autoComplete="email" />
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone</label>
                <input className="input" id="phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="address">Job address</label>
              <input className="input" id="address" name="address" required maxLength={300} autoComplete="street-address" />
            </div>
            <div>
              <label className="label" htmlFor="notes">What&apos;s going on? (optional)</label>
              <textarea className="input" id="notes" name="notes" rows={3} maxLength={2000} />
            </div>
            <button className="btn-primary w-full sm:w-auto">Book appointment</button>
          </form>
        </section>
      )}
    </PublicShell>
  );
}
