"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { fullInclude, newToken, upsertCustomer } from "@/lib/booking";
import { db, getSettings } from "@/lib/db";
import { notifyCustomer } from "@/lib/notifications";
import { zonedToUtc } from "@/lib/time";

/** "YYYY-MM-DDTHH:MM" from a datetime-local input, read as business-local time. */
function parseLocal(value: string, timeZone: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error("Invalid date and time");
  return zonedToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), timeZone);
}

const createSchema = z.object({
  customerId: z.string().optional().default(""),
  name: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  serviceTypeId: z.coerce.number().int().positive(),
  startLocal: z.string(),
  durationMin: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(15).max(24 * 60).optional()),
  jobAddress: z.string().trim().max(300).optional().default(""),
  internalNotes: z.string().trim().max(5000).optional().default(""),
  confirmed: z.string().optional(),
  sendEmail: z.string().optional(),
});

export async function createAppointment(form: FormData) {
  await requireAdmin();
  const data = createSchema.parse(Object.fromEntries(form));
  const settings = await getSettings();
  const service = await db.serviceType.findUniqueOrThrow({ where: { id: data.serviceTypeId } });

  let customerId = Number(data.customerId) || 0;
  if (!customerId) {
    const email = z.email().parse(data.email);
    if (!data.name) throw new Error("Customer name is required");
    customerId = (await upsertCustomer({ name: data.name, email, phone: data.phone, address: data.jobAddress })).id;
  }
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const start = parseLocal(data.startLocal, settings.timezone);
  const duration = data.durationMin ?? service.durationMin;
  const confirmed = data.confirmed === "on";

  const appt = await db.appointment.create({
    data: {
      customerId,
      serviceTypeId: service.id,
      startAt: start,
      endAt: new Date(start.getTime() + duration * 60_000),
      token: newToken(),
      jobAddress: data.jobAddress || customer.address,
      internalNotes: data.internalNotes,
      bookedBy: "owner",
      status: confirmed ? "CONFIRMED" : "SCHEDULED",
      confirmedAt: confirmed ? new Date() : null,
    },
    include: fullInclude,
  });
  if (data.sendEmail === "on") await notifyCustomer(appt, settings, "booked");
  redirect(`/admin/appointments/${appt.id}`);
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });

export async function setStatus(form: FormData) {
  await requireAdmin();
  const { id, status } = idSchema.extend({ status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED"]) }).parse(Object.fromEntries(form));
  const appt = await db.appointment.update({
    where: { id },
    data: {
      status,
      ...(status === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
    include: fullInclude,
  });
  if (status === "CANCELLED" && form.get("notify") === "on") await notifyCustomer(appt, await getSettings(), "cancelled");
  revalidatePath(`/admin/appointments/${id}`);
}

export async function saveNotes(form: FormData) {
  await requireAdmin();
  const { id, internalNotes, jobAddress } = idSchema
    .extend({ internalNotes: z.string().max(5000), jobAddress: z.string().trim().max(300) })
    .parse(Object.fromEntries(form));
  await db.appointment.update({ where: { id }, data: { internalNotes, jobAddress } });
  revalidatePath(`/admin/appointments/${id}`);
}

export async function moveAppointment(form: FormData) {
  await requireAdmin();
  const { id, startLocal, notify } = idSchema
    .extend({ startLocal: z.string(), notify: z.string().optional() })
    .parse(Object.fromEntries(form));
  const settings = await getSettings();
  const current = await db.appointment.findUniqueOrThrow({ where: { id } });
  const start = parseLocal(startLocal, settings.timezone);
  const appt = await db.appointment.update({
    where: { id },
    data: {
      startAt: start,
      endAt: new Date(start.getTime() + (current.endAt.getTime() - current.startAt.getTime())),
      reminderSentAt: null,
      // The customer should confirm the new time.
      status: current.status === "CONFIRMED" ? "SCHEDULED" : current.status,
    },
    include: fullInclude,
  });
  if (notify === "on") await notifyCustomer(appt, settings, "rescheduled");
  revalidatePath(`/admin/appointments/${id}`);
}

export async function resendConfirmation(form: FormData) {
  await requireAdmin();
  const { id } = idSchema.parse(Object.fromEntries(form));
  const appt = await db.appointment.findUniqueOrThrow({ where: { id }, include: fullInclude });
  await notifyCustomer(appt, await getSettings(), "booked");
  redirect(`/admin/appointments/${id}?sent=1`);
}
