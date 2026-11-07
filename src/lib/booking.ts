import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db, getSettings } from "./db";
import { availableSlots } from "./slots";
import { addDaysStr, isDateStr, zonedDateStr, zonedToUtc } from "./time";

export const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Open start times per date for a service, loading the data once for the whole range. */
async function slotsForDates(serviceTypeId: number, dates: string[], ignoreAppointmentId?: number): Promise<Map<string, Date[]>> {
  const out = new Map<string, Date[]>();
  const settings = await getSettings();
  const service = await db.serviceType.findUnique({ where: { id: serviceTypeId } });
  const window = bookableDates(settings.timezone, settings.maxDaysAhead);
  const valid = dates.filter((d) => isDateStr(d) && window.includes(d)).sort();
  if (!service || valid.length === 0) return out;

  const pad = 24 * 3600_000;
  const from = new Date(zonedToUtc(valid[0], 0, settings.timezone).getTime() - pad);
  const to = new Date(zonedToUtc(addDaysStr(valid[valid.length - 1], 1), 0, settings.timezone).getTime() + pad);
  const [rules, appts, blocks] = await Promise.all([
    db.availabilityRule.findMany(),
    db.appointment.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
      },
      select: { startAt: true, endAt: true },
    }),
    db.blockedTime.findMany({ where: { startAt: { lt: to }, endAt: { gt: from } } }),
  ]);
  const busy = [
    ...appts.map((a) => ({ start: a.startAt, end: a.endAt })),
    ...blocks.map((b) => ({ start: b.startAt, end: b.endAt })),
  ];
  const now = new Date();
  for (const date of valid) {
    out.set(
      date,
      availableSlots({
        date,
        timeZone: settings.timezone,
        rules,
        durationMin: service.durationMin,
        slotIntervalMin: settings.slotIntervalMin,
        bufferMin: settings.bufferMin,
        minNoticeHours: settings.minNoticeHours,
        busy,
        now,
      }),
    );
  }
  return out;
}

export async function getSlots(serviceTypeId: number, date: string, ignoreAppointmentId?: number): Promise<Date[]> {
  return (await slotsForDates(serviceTypeId, [date], ignoreAppointmentId)).get(date) ?? [];
}

export function bookableDates(timeZone: string, maxDaysAhead: number): string[] {
  const today = zonedDateStr(new Date(), timeZone);
  return Array.from({ length: maxDaysAhead + 1 }, (_, i) => addDaysStr(today, i));
}

/** True if the exact start time is still open. Customers can only book offered slots. */
export async function isSlotOpen(serviceTypeId: number, start: Date, ignoreAppointmentId?: number) {
  const settings = await getSettings();
  const date = zonedDateStr(start, settings.timezone);
  const slots = await getSlots(serviceTypeId, date, ignoreAppointmentId);
  return slots.some((s) => s.getTime() === start.getTime());
}

export const fullInclude = { customer: true, serviceType: true } satisfies Prisma.AppointmentInclude;

/** Find or create a customer by email, filling in any new details. */
export async function upsertCustomer(
  input: { name: string; email: string; phone?: string; address?: string },
  client: Prisma.TransactionClient = db,
) {
  const email = input.email.trim().toLowerCase();
  return client.customer.upsert({
    where: { email },
    create: { name: input.name.trim(), email, phone: input.phone?.trim() ?? "", address: input.address?.trim() ?? "" },
    update: {
      name: input.name.trim(),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
    },
  });
}

/** Dates in the booking window that have at least one open slot, and slots for the chosen date. */
export async function pickerData(serviceTypeId: number, requestedDate: string | undefined, ignoreAppointmentId?: number) {
  const settings = await getSettings();
  const dates = bookableDates(settings.timezone, settings.maxDaysAhead);
  const byDate = await slotsForDates(serviceTypeId, dates, ignoreAppointmentId);
  const openDates = new Set(dates.filter((d) => (byDate.get(d)?.length ?? 0) > 0));
  const selectedDate = requestedDate && dates.includes(requestedDate) ? requestedDate : (dates.find((d) => openDates.has(d)) ?? null);
  const slots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  return { settings, dates, openDates, selectedDate, slots };
}
