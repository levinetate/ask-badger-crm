import Link from "next/link";
import { db, getSettings } from "@/lib/db";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";
import { addDaysStr, formatDateLong, formatTime, isDateStr, weekdayOf, zonedDateStr, zonedToUtc } from "@/lib/time";

type Props = { searchParams: Promise<{ week?: string; view?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSettings();
  const today = zonedDateStr(new Date(), s.timezone);
  const anchor = isDateStr(sp.week) ? sp.week : today;
  const monday = addDaysStr(anchor, -((weekdayOf(anchor) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));
  const from = zonedToUtc(days[0], 0, s.timezone);
  const to = zonedToUtc(addDaysStr(days[6], 1), 0, s.timezone);
  const showCancelled = sp.view === "all";

  const [appts, blocks, awaiting] = await Promise.all([
    db.appointment.findMany({
      where: { startAt: { gte: from, lt: to }, ...(showCancelled ? {} : { status: { not: "CANCELLED" } }) },
      include: { customer: true, serviceType: true },
      orderBy: { startAt: "asc" },
    }),
    db.blockedTime.findMany({ where: { startAt: { lt: to }, endAt: { gt: from } }, orderBy: { startAt: "asc" } }),
    db.appointment.count({ where: { status: "SCHEDULED", startAt: { gt: new Date() } } }),
  ]);

  const byDay = new Map(days.map((d) => [d, [] as typeof appts]));
  for (const a of appts) byDay.get(zonedDateStr(a.startAt, s.timezone))?.push(a);

  const weekHref = (d: string) => `/admin?week=${d}${showCancelled ? "&view=all" : ""}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Week of {formatDateLong(monday)}</h1>
        <Link className="btn-secondary" href={weekHref(addDaysStr(monday, -7))}>← Prev</Link>
        <Link className="btn-secondary" href={weekHref(today)}>Today</Link>
        <Link className="btn-secondary" href={weekHref(addDaysStr(monday, 7))}>Next →</Link>
        <Link className="btn-secondary" href={`/admin?week=${monday}${showCancelled ? "" : "&view=all"}`}>
          {showCancelled ? "Hide cancelled" : "Show cancelled"}
        </Link>
      </div>
      {awaiting > 0 && (
        <p className="mb-4 text-sm text-amber-900">{awaiting} upcoming appointment{awaiting === 1 ? " is" : "s are"} still waiting for the customer to confirm.</p>
      )}
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const dayBlocks = blocks.filter((b) => b.startAt < zonedToUtc(addDaysStr(d, 1), 0, s.timezone) && b.endAt > zonedToUtc(d, 0, s.timezone));
          return (
            <div key={d} className={`rounded-lg border bg-white p-2 ${d === today ? "border-amber-600" : "border-stone-200"}`}>
              <div className="mb-2 text-xs font-medium text-stone-500">{formatDateLong(d)}</div>
              {dayBlocks.map((b) => (
                <div key={b.id} className="mb-2 rounded bg-stone-100 p-2 text-xs text-stone-600">Blocked{b.reason ? `: ${b.reason}` : ""}</div>
              ))}
              {list.length === 0 && dayBlocks.length === 0 && <div className="text-xs text-stone-400">Nothing booked</div>}
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/appointments/${a.id}`} className="block rounded border border-stone-200 p-2 text-xs hover:border-amber-600">
                      <div className="font-medium">{formatTime(a.startAt, s.timezone)} · {a.customer.name}</div>
                      <div className="text-stone-600">{a.serviceType.name}</div>
                      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
