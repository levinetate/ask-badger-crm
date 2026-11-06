import { weekdayOf, zonedToUtc } from "./time";

export type Interval = { start: Date; end: Date };
export type Rule = { weekday: number; startMinute: number; endMinute: number };

export type SlotInput = {
  date: string; // "YYYY-MM-DD" in the business timezone
  timeZone: string;
  rules: Rule[];
  durationMin: number;
  slotIntervalMin: number;
  bufferMin: number; // travel / cleanup gap kept around existing jobs
  minNoticeHours: number;
  busy: Interval[]; // existing appointments and blocked time
  now: Date;
};

/** Open start times for one day. Pure, so it is easy to test. */
export function availableSlots(input: SlotInput): Date[] {
  const { date, timeZone, rules, durationMin, slotIntervalMin, bufferMin, minNoticeHours, busy, now } = input;
  const earliest = now.getTime() + minNoticeHours * 3600_000;
  const day = weekdayOf(date);
  const out: Date[] = [];
  const seen = new Set<number>();

  for (const rule of rules.filter((r) => r.weekday === day)) {
    for (let m = rule.startMinute; m + durationMin <= rule.endMinute; m += slotIntervalMin) {
      const start = zonedToUtc(date, m, timeZone);
      const end = new Date(start.getTime() + durationMin * 60_000);
      if (start.getTime() < earliest) continue;
      const clashes = busy.some(
        (b) =>
          start.getTime() < b.end.getTime() + bufferMin * 60_000 &&
          end.getTime() + bufferMin * 60_000 > b.start.getTime(),
      );
      if (clashes || seen.has(start.getTime())) continue;
      seen.add(start.getTime());
      out.push(start);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
