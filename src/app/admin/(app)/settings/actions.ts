"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db, getSettings } from "@/lib/db";
import { parseHHMM, zonedToUtc } from "@/lib/time";

const done = () => revalidatePath("/admin/settings");

const businessSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  ownerEmail: z.union([z.email(), z.literal("")]),
  phone: z.string().trim().max(40),
  timezone: z.string().refine((tz) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown timezone"),
  slotIntervalMin: z.coerce.number().int().min(5).max(240),
  bufferMin: z.coerce.number().int().min(0).max(480),
  minNoticeHours: z.coerce.number().int().min(0).max(24 * 14),
  maxDaysAhead: z.coerce.number().int().min(1).max(180),
  taxRatePercent: z.coerce.number().min(0).max(30),
  zelleInfo: z.string().trim().max(200),
  defaultMarkupPercent: z.coerce.number().min(0).max(500),
  laborRate: z.string().trim().transform((s) => Math.round(Number(s.replace(/[$,]/g, "") || "0") * 100)).pipe(z.number().int().min(0)),
  invoiceDueDays: z.coerce.number().int().min(0).max(120),
  documentFooter: z.string().max(1000),
});

export async function saveBusiness(form: FormData) {
  await requireAdmin();
  const { laborRate, ...rest } = businessSchema.parse(Object.fromEntries(form));
  const data = { ...rest, laborRateCents: laborRate };
  await db.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  done();
}

/** Replaces all weekly hours. Each day has an optional "open" checkbox and start/end times. */
export async function saveHours(form: FormData) {
  await requireAdmin();
  const rules: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (let d = 0; d < 7; d++) {
    if (form.get(`open-${d}`) !== "on") continue;
    const start = parseHHMM(String(form.get(`start-${d}`) ?? ""));
    const end = parseHHMM(String(form.get(`end-${d}`) ?? ""));
    if (start == null || end == null || end <= start) throw new Error(`Check the hours for day ${d}`);
    rules.push({ weekday: d, startMinute: start, endMinute: end });
  }
  await db.$transaction([db.availabilityRule.deleteMany(), db.availabilityRule.createMany({ data: rules })]);
  done();
}

const serviceSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  durationMin: z.coerce.number().int().min(15).max(24 * 60),
  price: z.string().trim().default(""),
  sortOrder: z.coerce.number().int().default(0),
  active: z.string().optional(),
});

export async function saveService(form: FormData) {
  await requireAdmin();
  const { id, price, active, ...rest } = serviceSchema.parse(Object.fromEntries(form));
  const priceCents = price ? Math.round(Number(price.replace(/[$,]/g, "")) * 100) : null;
  if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) throw new Error("Invalid price");
  const data = { ...rest, priceCents, active: active === "on" };
  if (id) await db.serviceType.update({ where: { id }, data });
  else await db.serviceType.create({ data });
  done();
}

const blockSchema = z.object({
  startDate: z.string(),
  startTime: z.string().default(""),
  endDate: z.string(),
  endTime: z.string().default(""),
  reason: z.string().trim().max(200).default(""),
});

export async function addBlock(form: FormData) {
  await requireAdmin();
  const b = blockSchema.parse(Object.fromEntries(form));
  const { timezone } = await getSettings();
  // Blank times mean the whole day.
  const startMin = b.startTime ? parseHHMM(b.startTime) : 0;
  const endMin = b.endTime ? parseHHMM(b.endTime) : 24 * 60;
  if (startMin == null || endMin == null) throw new Error("Invalid time");
  const startAt = zonedToUtc(b.startDate, startMin, timezone);
  const endAt = zonedToUtc(b.endDate, endMin, timezone);
  if (endAt <= startAt) throw new Error("End must be after start");
  await db.blockedTime.create({ data: { startAt, endAt, reason: b.reason } });
  done();
}

export async function deleteBlock(form: FormData) {
  await requireAdmin();
  await db.blockedTime.delete({ where: { id: Number(form.get("id")) } });
  done();
}
