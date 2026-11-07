"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, getSettings } from "@/lib/db";
import { fullInclude, isSlotOpen, newToken, upsertCustomer } from "@/lib/booking";
import { notifyCustomer, notifyOwner } from "@/lib/notifications";
import { withBookingLock } from "@/lib/withBookingLock";

const schema = z.object({
  serviceTypeId: z.coerce.number().int().positive(),
  start: z.iso.datetime(),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(3).max(300),
  notes: z.string().trim().max(2000).optional().default(""),
});

export async function createBooking(form: FormData) {
  const data = schema.parse(Object.fromEntries(form));
  const service = await db.serviceType.findFirst({ where: { id: data.serviceTypeId, active: true } });
  if (!service) redirect("/book");
  const start = new Date(data.start);

  const appt = await withBookingLock(async (tx) => {
    if (!(await isSlotOpen(service.id, start))) return null;
    const customer = await upsertCustomer(data, tx);
    return tx.appointment.create({
      data: {
        customerId: customer.id,
        serviceTypeId: service.id,
        startAt: start,
        endAt: new Date(start.getTime() + service.durationMin * 60_000),
        token: newToken(),
        jobAddress: data.address,
        customerNotes: data.notes,
        bookedBy: "customer",
      },
      include: fullInclude,
    });
  });
  if (!appt) redirect(`/book/${service.id}?error=taken`);

  const settings = await getSettings();
  await Promise.all([notifyCustomer(appt, settings, "booked"), notifyOwner(appt, settings, "booked online")]);
  redirect(`/a/${appt.token}?booked=1`);
}
