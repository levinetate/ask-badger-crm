import { NextResponse } from "next/server";
import { fullInclude } from "@/lib/booking";
import { db, getSettings } from "@/lib/db";
import { notifyCustomer } from "@/lib/notifications";
import { addDaysStr, zonedDateStr, zonedToUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Sends one reminder for each appointment today or tomorrow (business time).
 * Works run hourly or once a day; Vercel's free plan allows daily only, so vercel.json runs it each evening.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const settings = await getSettings();
  const endOfTomorrow = zonedToUtc(addDaysStr(zonedDateStr(now, settings.timezone), 2), 0, settings.timezone);
  const due = await db.appointment.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      reminderSentAt: null,
      startAt: { gt: now, lt: endOfTomorrow },
      // Skip jobs booked in the last few hours; they just got a booking email.
      createdAt: { lt: new Date(now.getTime() - 3 * 3600_000) },
    },
    include: fullInclude,
  });
  for (const appt of due) {
    // Claim it first so two overlapping runs don't both send.
    const claimed = await db.appointment.updateMany({ where: { id: appt.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count) await notifyCustomer(appt, settings, "reminder");
  }
  return NextResponse.json({ sent: due.length });
}
