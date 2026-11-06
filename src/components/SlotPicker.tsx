import Link from "next/link";
import { formatTime, weekdayOf } from "@/lib/time";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Props = {
  dates: string[];
  openDates: Set<string>;
  selectedDate: string | null;
  slots: Date[];
  selectedStart?: string | null;
  timeZone: string;
  hrefFor: (params: { date: string; start?: string }) => string;
};

/** Date strip plus time buttons. Plain links, so it works without JavaScript. */
export default function SlotPicker({ dates, openDates, selectedDate, slots, selectedStart, timeZone, hrefFor }: Props) {
  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto pb-2">
        {dates.map((d) => {
          const [, m, day] = d.split("-").map(Number);
          const open = openDates.has(d);
          const active = d === selectedDate;
          const cls = active
            ? "border-amber-700 bg-amber-700 text-white"
            : open
              ? "border-stone-300 bg-white hover:border-amber-600"
              : "border-stone-200 bg-stone-100 text-stone-400";
          const body = (
            <>
              <span className="text-xs">{DAY[weekdayOf(d)]}</span>
              <span className="text-lg font-semibold">{day}</span>
              <span className="text-xs">{MONTH[m - 1]}</span>
            </>
          );
          return open ? (
            <Link key={d} href={hrefFor({ date: d })} className={`flex w-16 shrink-0 flex-col items-center rounded-md border py-2 ${cls}`}>
              {body}
            </Link>
          ) : (
            <span key={d} className={`flex w-16 shrink-0 flex-col items-center rounded-md border py-2 ${cls}`} aria-disabled>
              {body}
            </span>
          );
        })}
      </div>
      {selectedDate &&
        (slots.length === 0 ? (
          <p className="text-sm text-stone-600">No open times this day. Try another date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const iso = s.toISOString();
              const active = iso === selectedStart;
              return (
                <Link
                  key={iso}
                  href={hrefFor({ date: selectedDate, start: iso })}
                  className={`rounded-md border px-2 py-2 text-center text-sm ${
                    active ? "border-amber-700 bg-amber-700 text-white" : "border-stone-300 bg-white hover:border-amber-600"
                  }`}
                >
                  {formatTime(s, timeZone)}
                </Link>
              );
            })}
          </div>
        ))}
    </div>
  );
}
