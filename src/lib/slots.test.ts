import { describe, expect, it } from "vitest";
import { availableSlots } from "./slots";
import { zonedToUtc, formatTime } from "./time";

const tz = "America/New_York";
const base = {
  timeZone: tz,
  rules: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }], // Monday 8am-12pm
  durationMin: 60,
  slotIntervalMin: 60,
  bufferMin: 0,
  minNoticeHours: 0,
  busy: [],
  now: new Date("2026-01-01T00:00:00Z"),
};

const labels = (d: Date[]) => d.map((x) => formatTime(x, tz));

describe("availableSlots", () => {
  it("lists slots that fit inside working hours", () => {
    expect(labels(availableSlots({ ...base, date: "2026-11-09" }))).toEqual(["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"]);
  });

  it("returns nothing on a day with no hours", () => {
    expect(availableSlots({ ...base, date: "2026-11-10" })).toEqual([]);
  });

  it("skips slots that overlap a job, including the buffer", () => {
    const busy = [{ start: zonedToUtc("2026-11-09", 9 * 60, tz), end: zonedToUtc("2026-11-09", 10 * 60, tz) }];
    expect(labels(availableSlots({ ...base, date: "2026-11-09", busy }))).toEqual(["8:00 AM", "10:00 AM", "11:00 AM"]);
    expect(labels(availableSlots({ ...base, date: "2026-11-09", busy, bufferMin: 30 }))).toEqual(["11:00 AM"]);
  });

  it("respects minimum notice", () => {
    const now = zonedToUtc("2026-11-09", 7 * 60, tz);
    expect(labels(availableSlots({ ...base, date: "2026-11-09", now, minNoticeHours: 3 }))).toEqual(["10:00 AM", "11:00 AM"]);
  });

  it("uses local time across daylight saving changes", () => {
    // Nov 2, 2026 is the Monday after DST ends in the US.
    const slots = availableSlots({ ...base, date: "2026-11-02" });
    expect(slots[0].toISOString()).toBe("2026-11-02T13:00:00.000Z");
    const summer = availableSlots({ ...base, date: "2026-06-01" });
    expect(summer[0].toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });
});
