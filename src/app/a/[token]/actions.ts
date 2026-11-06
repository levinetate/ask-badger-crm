"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, getSettings } from "@/lib/db";
import { fullInclude, isSlotOpen } from "@/lib/booking";
import { notifyCustomer, notifyOwner } from "@/lib/notifications";
import { withBookingLock } from "@/lib/withBookingLock";

async function loadActive(token: string) {
  const appt = await db.appointment.findUnique({ where: { token }, include: fullInclude });
  if (!appt) redirect("/");
  if (appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED") redirect(`/a/${token}`);
  if (appt.startAt <= new Date()) redirect(`/a/${token}?error=past`);
  return appt;
}

const tokenOnly = z.object({ token: z.string().min(10).max(100) });

export async function confirmAppointment(form: FormData) {
  const { token } = tokenOnly.parse(Object.fromEntries(form));
  const appt = await loadActive(token);
  if (appt.status === "SCHEDULED") {
    const updated = await db.appointment.update({
      where: { id: appt.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: fullInclude,
    });
    await notifyOwner(updated, await getSettings(), "confirmed");
  }
  redirect(`/a/${token}?confirmed=1`);
}

export async function cancelAppointment(form: FormData) {
  const { token } = tokenOnly.parse(Object.fromEntries(form));
  const appt = await loadActive(token);
  const updated = await db.appointment.update({
    where: { id: appt.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: fullInclude,
  });
  const settings = await getSettings();
  await Promise.all([notifyCustomer(updated, settings, "cancelled"), notifyOwner(updated, settings, "cancelled")]);
  redirect(`/a/${token}?cancelled=1`);
}

const rescheduleSchema = tokenOnly.extend({ start: z.iso.datetime() });

export async function rescheduleAppointment(form: FormData) {
  const { token, start: startStr } = rescheduleSchema.parse(Object.fromEntries(form));
  const appt = await loadActive(token);
  const start = new Date(startStr);

  const updated = await withBookingLock(async (tx) => {
    if (!(await isSlotOpen(appt.serviceTypeId, start, appt.id))) return null;
    return tx.appointment.update({
      where: { id: appt.id },
      data: {
        startAt: start,
        endAt: new Date(start.getTime() + (appt.endAt.getTime() - appt.startAt.getTime())),
        // Picking a new time counts as confirming it.
        status: "CONFIRMED",
        confirmedAt: new Date(),
        reminderSentAt: null,
      },
      include: fullInclude,
    });
  });
  if (!updated) redirect(`/a/${token}/reschedule?error=taken`);

  const settings = await getSettings();
  await Promise.all([notifyCustomer(updated, settings, "rescheduled"), notifyOwner(updated, settings, "rescheduled")]);
  redirect(`/a/${token}?moved=1`);
}
