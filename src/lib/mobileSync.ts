// Sync API for the Ask Badger iPhone app.
// The app keeps a copy of the data on the phone. It sends what changed (push), then downloads
// everything again (snapshot). Records made on the phone are identified by a client key until
// the website gives them an id. Rules from the admin pages (locked paid invoices, customer
// approvals, stock math) are applied here too, so the phone can't break them.

import { Prisma, type AppointmentStatus, type EstimateStatus, type InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { fullInclude, newToken } from "./booking";
import { db, getSettings } from "./db";
import { amountDueCents, computeTotals, estimateNumber, invoiceNumber } from "./documents";
import { normalizeBarcode } from "./materials";
import { emailEstimate, emailInvoice, notifyCustomer } from "./notifications";
import { refreshInvoicePaid } from "./payments";

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dec = (n: number, places = 2) => new Prisma.Decimal(n.toFixed(places));

// MARK: - Snapshot

export async function buildSnapshot() {
  const [s, rules, services, customers, appointments, materials, movements, estimates, invoices] = await Promise.all([
    getSettings(),
    db.availabilityRule.findMany(),
    db.serviceType.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.customer.findMany({ orderBy: { id: "asc" } }),
    db.appointment.findMany({ orderBy: { id: "asc" } }),
    db.material.findMany({ orderBy: { id: "asc" } }),
    db.stockMovement.findMany({ orderBy: { id: "asc" } }),
    db.estimate.findMany({ orderBy: { id: "asc" }, include: { lineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, invoice: { select: { id: true } } } }),
    db.invoice.findMany({ orderBy: { id: "asc" }, include: { lineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: { id: "asc" } } } }),
  ]);

  const line = (l: (typeof estimates)[number]["lineItems"][number]) => ({
    kind: l.kind,
    description: l.description,
    quantity: Number(l.quantity),
    unitPriceCents: l.unitPriceCents,
    taxable: l.taxable,
    materialId: l.materialId,
  });

  return {
    serverTime: new Date().toISOString(),
    settings: {
      businessName: s.businessName,
      ownerEmail: s.ownerEmail,
      phone: s.phone,
      timezone: s.timezone,
      slotIntervalMin: s.slotIntervalMin,
      bufferMin: s.bufferMin,
      minNoticeHours: s.minNoticeHours,
      maxDaysAhead: s.maxDaysAhead,
      taxRatePercent: Number(s.taxRatePercent),
      zelleInfo: s.zelleInfo,
      defaultMarkupPercent: Number(s.defaultMarkupPercent),
      laborRateCents: s.laborRateCents,
      documentFooter: s.documentFooter,
      invoiceDueDays: s.invoiceDueDays,
      notifyOnOpen: s.notifyOnOpen,
      // Weekly hours live in their own table on the website; the app shows the overall span.
      workStartMinute: rules.length ? Math.min(...rules.map((r) => r.startMinute)) : 8 * 60,
      workEndMinute: rules.length ? Math.max(...rules.map((r) => r.endMinute)) : 17 * 60,
    },
    services: services.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      durationMin: v.durationMin,
      priceCents: v.priceCents,
      active: v.active,
      sortOrder: v.sortOrder,
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      notes: c.notes,
      createdAt: iso(c.createdAt),
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      customerId: a.customerId,
      serviceTypeId: a.serviceTypeId,
      startAt: iso(a.startAt),
      endAt: iso(a.endAt),
      status: a.status,
      jobAddress: a.jobAddress,
      customerNotes: a.customerNotes,
      internalNotes: a.internalNotes,
      bookedBy: a.bookedBy,
      confirmedAt: iso(a.confirmedAt),
      cancelledAt: iso(a.cancelledAt),
      createdAt: iso(a.createdAt),
    })),
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      barcode: m.barcode,
      sku: m.sku,
      store: m.store,
      category: m.category,
      unit: m.unit,
      costCents: m.costCents,
      markupPercent: num(m.markupPercent),
      quantityOnHand: Number(m.quantityOnHand),
      reorderAt: num(m.reorderAt),
      location: m.location,
      notes: m.notes,
      active: m.active,
      costUpdatedAt: iso(m.costUpdatedAt),
      createdAt: iso(m.createdAt),
    })),
    movements: movements.map((mv) => ({
      id: mv.id,
      materialId: mv.materialId,
      change: Number(mv.change),
      reason: mv.reason,
      unitCostCents: mv.unitCostCents,
      appointmentId: mv.appointmentId,
      note: mv.note,
      createdAt: iso(mv.createdAt),
    })),
    estimates: estimates.map((e) => ({
      id: e.id,
      customerId: e.customerId,
      appointmentId: e.appointmentId,
      invoiceId: e.invoice?.id ?? null,
      status: e.status,
      title: e.title,
      notes: e.notes,
      jobAddress: e.jobAddress,
      validUntil: iso(e.validUntil),
      taxRatePercent: Number(e.taxRatePercent),
      sentAt: iso(e.sentAt),
      approvedAt: iso(e.approvedAt),
      approvedName: e.approvedName,
      declinedAt: iso(e.declinedAt),
      declineReason: e.declineReason,
      openedAt: iso(e.openedAt),
      viewedAt: iso(e.viewedAt),
      createdAt: iso(e.createdAt),
      lines: e.lineItems.map(line),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      customerId: i.customerId,
      estimateId: i.estimateId,
      appointmentId: i.appointmentId,
      status: i.status,
      title: i.title,
      notes: i.notes,
      jobAddress: i.jobAddress,
      dueDate: iso(i.dueDate),
      taxRatePercent: Number(i.taxRatePercent),
      sentAt: iso(i.sentAt),
      paidAt: iso(i.paidAt),
      openedAt: iso(i.openedAt),
      viewedAt: iso(i.viewedAt),
      createdAt: iso(i.createdAt),
      lines: i.lineItems.map(line),
      payments: i.payments.map((p) => ({
        id: p.id,
        method: p.method,
        status: p.status,
        amountCents: p.amountCents,
        note: p.note,
        createdAt: iso(p.createdAt),
      })),
    })),
  };
}

// MARK: - Push

const ref = z.object({ id: z.number().int().positive().optional(), key: z.string().max(64).optional() }).nullish();
type Ref = z.infer<typeof ref>;
const ms = z.number().finite().nullish(); // milliseconds since 1970
const toDate = (v: number | null | undefined) => (v == null ? null : new Date(v));
const text = (max: number) => z.string().max(max).default("");
const money = z.number().int().min(-100_000_000).max(100_000_000);

const lineSchema = z.object({
  kind: z.enum(["LABOR", "MATERIAL", "OTHER"]),
  description: z.string().max(500),
  quantity: z.number().finite().min(-100_000).max(100_000),
  unitPriceCents: money,
  taxable: z.boolean(),
  material: ref,
});

export const pushSchema = z.object({
  notifyCustomers: z.boolean().default(false),
  settings: z
    .object({
      businessName: z.string().trim().min(1).max(120),
      ownerEmail: text(200),
      phone: text(40),
      bufferMin: z.number().int().min(0).max(24 * 60),
      minNoticeHours: z.number().int().min(0).max(24 * 30),
      maxDaysAhead: z.number().int().min(1).max(365),
      taxRatePercent: z.number().finite().min(0).max(100),
      zelleInfo: text(500),
      defaultMarkupPercent: z.number().finite().min(0).max(1000),
      laborRateCents: z.number().int().min(0).max(10_000_000),
      documentFooter: text(2000),
      invoiceDueDays: z.number().int().min(0).max(365),
      notifyOnOpen: z.boolean().optional(),
    })
    .nullish(),
  services: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        name: z.string().trim().min(1).max(120),
        description: text(1000),
        durationMin: z.number().int().min(15).max(24 * 60),
        priceCents: z.number().int().min(0).nullish(),
        active: z.boolean(),
        sortOrder: z.number().int(),
      }),
    )
    .max(200)
    .default([]),
  customers: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().max(200),
        phone: text(40),
        address: text(300),
        notes: text(5000),
      }),
    )
    .max(2000)
    .default([]),
  materials: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        name: z.string().trim().min(1).max(200),
        barcode: z.string().max(40).nullish(),
        sku: text(60),
        store: text(60),
        category: text(60),
        unit: z.string().max(20).default("each"),
        costCents: z.number().int().min(0).max(100_000_000),
        markupPercent: z.number().finite().min(0).max(1000).nullish(),
        quantityOnHand: z.number().finite(),
        reorderAt: z.number().finite().nullish(),
        location: text(60),
        notes: text(2000),
        active: z.boolean(),
      }),
    )
    .max(5000)
    .default([]),
  appointments: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        customer: ref,
        service: ref,
        startAt: z.number().finite(),
        endAt: z.number().finite(),
        status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED"]),
        jobAddress: text(300),
        customerNotes: text(5000),
        internalNotes: text(5000),
      }),
    )
    .max(2000)
    .default([]),
  movements: z
    .array(
      z.object({
        key: z.string().max(64),
        material: ref,
        appointment: ref,
        change: z.number().finite().min(-1_000_000).max(1_000_000),
        reason: z.enum(["PURCHASE", "USED", "COUNT", "ADJUST"]),
        unitCostCents: z.number().int().min(0).nullish(),
        note: text(500),
        createdAt: ms,
      }),
    )
    .max(5000)
    .default([]),
  deletedMovementIds: z.array(z.number().int().positive()).max(1000).default([]),
  estimates: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        customer: ref,
        appointment: ref,
        status: z.enum(["DRAFT", "SENT", "APPROVED", "DECLINED", "INVOICED"]),
        title: text(200),
        notes: text(5000),
        jobAddress: text(300),
        validUntil: ms,
        taxRatePercent: z.number().finite().min(0).max(100),
        approvedName: text(120),
        declineReason: text(1000),
        lines: z.array(lineSchema).max(200),
      }),
    )
    .max(2000)
    .default([]),
  invoices: z
    .array(
      z.object({
        id: z.number().int().positive().nullish(),
        key: z.string().max(64),
        customer: ref,
        estimate: ref,
        appointment: ref,
        status: z.enum(["DRAFT", "SENT", "PAID", "VOID"]),
        title: text(200),
        notes: text(5000),
        jobAddress: text(300),
        dueDate: ms,
        taxRatePercent: z.number().finite().min(0).max(100),
        lines: z.array(lineSchema).max(200),
        newPayments: z
          .array(
            z.object({
              key: z.string().max(64),
              method: z.enum(["ZELLE", "CASH", "CHECK", "OTHER"]),
              amountCents: z.number().int().positive().max(100_000_000),
              note: text(300),
              createdAt: ms,
            }),
          )
          .max(50)
          .default([]),
      }),
    )
    .max(2000)
    .default([]),
});

export type PushBody = z.infer<typeof pushSchema>;

/**
 * Applies the phone's changes one record at a time. A record that can't be saved is skipped with
 * a warning instead of failing the whole sync; the phone then downloads the website's version.
 */
export async function applyPush(body: PushBody) {
  const ids: Record<string, number> = {};
  const warnings: string[] = [];
  const after: (() => Promise<unknown>)[] = [];
  const notify = body.notifyCustomers;

  const resolve = (r: Ref): number | null => {
    if (!r) return null;
    if (r.id) return r.id;
    if (r.key && ids[r.key]) return ids[r.key];
    return null;
  };
  const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[mobile sync] ${label}`, err);
      warnings.push(`${label} couldn't be saved.`);
    }
  };

  // Settings
  if (body.settings) {
    const s = body.settings;
    await attempt("Settings", async () => {
      await getSettings();
      await db.businessSettings.update({
        where: { id: 1 },
        data: {
          businessName: s.businessName,
          ownerEmail: s.ownerEmail,
          phone: s.phone,
          bufferMin: s.bufferMin,
          minNoticeHours: s.minNoticeHours,
          maxDaysAhead: s.maxDaysAhead,
          taxRatePercent: dec(s.taxRatePercent, 3),
          zelleInfo: s.zelleInfo,
          defaultMarkupPercent: dec(s.defaultMarkupPercent),
          laborRateCents: s.laborRateCents,
          documentFooter: s.documentFooter,
          invoiceDueDays: s.invoiceDueDays,
          ...(s.notifyOnOpen === undefined ? {} : { notifyOnOpen: s.notifyOnOpen }),
        },
      });
    });
  }
  const settings = await getSettings();

  // Services
  for (const v of body.services) {
    await attempt(`Service "${v.name}"`, async () => {
      const data = { name: v.name, description: v.description, durationMin: v.durationMin, priceCents: v.priceCents ?? null, active: v.active, sortOrder: v.sortOrder };
      if (v.id && (await db.serviceType.findUnique({ where: { id: v.id } }))) {
        await db.serviceType.update({ where: { id: v.id }, data });
        ids[v.key] = v.id;
      } else {
        ids[v.key] = (await db.serviceType.create({ data })).id;
      }
    });
  }

  // Customers (matched by email, like the booking page)
  for (const c of body.customers) {
    await attempt(`Customer ${c.name}`, async () => {
      const email = c.email.trim().toLowerCase();
      if (!z.email().safeParse(email).success) throw new Error("bad email");
      const existing = c.id ? await db.customer.findUnique({ where: { id: c.id } }) : null;
      const sameEmail = await db.customer.findUnique({ where: { email } });
      if (existing) {
        const emailFree = !sameEmail || sameEmail.id === existing.id;
        if (!emailFree) warnings.push(`${c.name}: ${email} already belongs to ${sameEmail!.name}, so the email wasn't changed.`);
        await db.customer.update({
          where: { id: existing.id },
          data: { name: c.name, phone: c.phone, address: c.address, notes: c.notes, ...(emailFree ? { email } : {}) },
        });
        ids[c.key] = existing.id;
      } else if (sameEmail) {
        await db.customer.update({
          where: { id: sameEmail.id },
          data: {
            name: c.name,
            ...(c.phone ? { phone: c.phone } : {}),
            ...(c.address ? { address: c.address } : {}),
            ...(c.notes ? { notes: c.notes } : {}),
          },
        });
        ids[c.key] = sameEmail.id;
      } else {
        ids[c.key] = (await db.customer.create({ data: { name: c.name, email, phone: c.phone, address: c.address, notes: c.notes } })).id;
      }
    });
  }

  // Materials. On-hand amounts only change through stock movements, so they stay explainable.
  for (const m of body.materials) {
    await attempt(`Material "${m.name}"`, async () => {
      let barcode = m.barcode ? normalizeBarcode(m.barcode) || null : null;
      if (barcode) {
        const clash = await db.material.findUnique({ where: { barcode } });
        if (clash && clash.id !== m.id) {
          warnings.push(`Barcode ${barcode} is already on "${clash.name}", so it wasn't added to "${m.name}".`);
          barcode = null;
        }
      }
      const existing = m.id ? await db.material.findUnique({ where: { id: m.id } }) : null;
      const data = {
        name: m.name,
        barcode,
        sku: m.sku,
        store: m.store,
        category: m.category,
        unit: m.unit || "each",
        costCents: m.costCents,
        markupPercent: m.markupPercent == null ? null : dec(m.markupPercent),
        reorderAt: m.reorderAt == null ? null : dec(m.reorderAt),
        location: m.location,
        notes: m.notes,
        active: m.active,
      };
      if (existing) {
        await db.material.update({
          where: { id: existing.id },
          data: { ...data, ...(existing.costCents !== m.costCents ? { costUpdatedAt: new Date() } : {}) },
        });
        ids[m.key] = existing.id;
      } else {
        // Movements sent in this push are applied below, so start from the amount before them.
        const pending = body.movements.filter((mv) => !mv.material?.id && mv.material?.key === m.key).reduce((a, mv) => a + mv.change, 0);
        const created = await db.material.create({
          data: { ...data, quantityOnHand: dec(m.quantityOnHand - pending), costUpdatedAt: m.costCents ? new Date() : null },
        });
        ids[m.key] = created.id;
      }
    });
  }

  // Appointments
  for (const a of body.appointments) {
    await attempt("An appointment", async () => {
      const customerId = resolve(a.customer);
      const serviceTypeId = resolve(a.service);
      if (!customerId || !serviceTypeId) throw new Error("missing customer or service");
      const startAt = new Date(a.startAt);
      const endAt = new Date(Math.max(a.endAt, a.startAt + 15 * 60_000));
      const existing = a.id ? await db.appointment.findUnique({ where: { id: a.id } }) : null;

      if (!existing) {
        const appt = await db.appointment.create({
          data: {
            customerId,
            serviceTypeId,
            startAt,
            endAt,
            status: a.status,
            token: newToken(),
            jobAddress: a.jobAddress,
            customerNotes: a.customerNotes,
            internalNotes: a.internalNotes,
            bookedBy: "owner",
            confirmedAt: a.status === "CONFIRMED" ? new Date() : null,
            cancelledAt: a.status === "CANCELLED" ? new Date() : null,
          },
          include: fullInclude,
        });
        ids[a.key] = appt.id;
        if (notify && (appt.status === "SCHEDULED" || appt.status === "CONFIRMED")) after.push(() => notifyCustomer(appt, settings, "booked"));
        return;
      }

      const moved = startAt.getTime() !== existing.startAt.getTime();
      let status: AppointmentStatus = a.status;
      // The customer may have confirmed or cancelled from their link since the phone last synced.
      if (!moved && status === "SCHEDULED" && existing.status !== "SCHEDULED") status = existing.status;
      if (moved && existing.status === "CONFIRMED" && status === "CONFIRMED") status = "SCHEDULED";

      const appt = await db.appointment.update({
        where: { id: existing.id },
        data: {
          customerId,
          serviceTypeId,
          startAt,
          endAt,
          status,
          jobAddress: a.jobAddress,
          internalNotes: a.internalNotes,
          ...(moved ? { reminderSentAt: null } : {}),
          ...(status === "CONFIRMED" && existing.status !== "CONFIRMED" ? { confirmedAt: new Date() } : {}),
          ...(status === "CANCELLED" && existing.status !== "CANCELLED" ? { cancelledAt: new Date() } : {}),
        },
        include: fullInclude,
      });
      ids[a.key] = appt.id;
      if (notify && status === "CANCELLED" && existing.status !== "CANCELLED") after.push(() => notifyCustomer(appt, settings, "cancelled"));
      else if (notify && moved && status !== "CANCELLED" && status !== "COMPLETED") after.push(() => notifyCustomer(appt, settings, "rescheduled"));
    });
  }

  // Stock movements made on the phone (new ones only; they're never edited).
  for (const mv of body.movements) {
    await attempt("A stock change", async () => {
      const materialId = resolve(mv.material);
      if (!materialId) throw new Error("missing material");
      const appointmentId = resolve(mv.appointment);
      const cost = mv.reason === "PURCHASE" && mv.unitCostCents != null ? mv.unitCostCents : null;
      const created = await db.$transaction(async (tx) => {
        const row = await tx.stockMovement.create({
          data: {
            materialId,
            change: dec(mv.change),
            reason: mv.reason,
            unitCostCents: cost,
            appointmentId,
            note: mv.note,
            ...(mv.createdAt ? { createdAt: new Date(mv.createdAt) } : {}),
          },
        });
        await tx.material.update({
          where: { id: materialId },
          data: { quantityOnHand: { increment: dec(mv.change) }, ...(cost != null ? { costCents: cost, costUpdatedAt: new Date() } : {}) },
        });
        return row;
      });
      ids[mv.key] = created.id;
    });
  }

  // "Used on job" entries removed on the phone
  for (const id of body.deletedMovementIds) {
    await attempt("Removing a job material", async () => {
      const mv = await db.stockMovement.findUnique({ where: { id } });
      if (!mv) return; // already gone
      if (mv.reason !== "USED") throw new Error("only job usage can be removed");
      await db.$transaction([
        db.stockMovement.delete({ where: { id } }),
        db.material.update({ where: { id: mv.materialId }, data: { quantityOnHand: { decrement: mv.change } } }),
      ]);
    });
  }

  const materialIds = new Set((await db.material.findMany({ select: { id: true } })).map((m) => m.id));
  const lineData = (lines: z.infer<typeof lineSchema>[]) =>
    lines.map((l, i) => {
      const materialId = resolve(l.material);
      return {
        kind: l.kind,
        description: l.description.trim() || "Item",
        quantity: dec(l.quantity),
        unitPriceCents: l.unitPriceCents,
        taxable: l.taxable,
        materialId: materialId && materialIds.has(materialId) ? materialId : null,
        sortOrder: i,
      };
    });

  // Estimates
  for (const e of body.estimates) {
    await attempt("An estimate", async () => {
      const customerId = resolve(e.customer);
      if (!customerId) throw new Error("missing customer");
      const existing = e.id ? await db.estimate.findUnique({ where: { id: e.id } }) : null;
      // Keep a customer's approval or decline made on the website.
      const decided: EstimateStatus[] = ["APPROVED", "DECLINED", "INVOICED"];
      const keepServer = !!existing && decided.includes(existing.status) && (e.status === "DRAFT" || e.status === "SENT");
      const status: EstimateStatus = keepServer ? existing!.status : e.status;
      const lockLines = existing?.status === "INVOICED";
      const rate = e.taxRatePercent;
      const totals = computeTotals(
        e.lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, taxable: l.taxable })),
        rate,
      );
      const base = {
        customerId,
        appointmentId: resolve(e.appointment),
        status,
        title: e.title,
        notes: e.notes,
        jobAddress: e.jobAddress,
        validUntil: toDate(e.validUntil),
        ...(keepServer
          ? {}
          : {
              approvedName: e.approvedName,
              declineReason: e.declineReason,
              ...(status === "APPROVED" && existing?.status !== "APPROVED" ? { approvedAt: new Date() } : {}),
              ...(status === "DECLINED" && existing?.status !== "DECLINED" ? { declinedAt: new Date() } : {}),
            }),
        ...(status === "SENT" && existing?.status !== "SENT" ? { sentAt: new Date() } : {}),
      };
      const priced = { taxRatePercent: dec(rate, 3), subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents };

      const saved = existing
        ? await db.estimate.update({
            where: { id: existing.id },
            data: { ...base, ...(lockLines ? {} : { ...priced, lineItems: { deleteMany: {}, create: lineData(e.lines) } }) },
            include: { customer: true },
          })
        : await db.estimate.create({
            data: { ...base, ...priced, token: newToken(), lineItems: { create: lineData(e.lines) } },
            include: { customer: true },
          });
      ids[e.key] = saved.id;
      const nowSent = saved.status === "SENT" && (!existing || existing.status === "DRAFT");
      if (notify && nowSent && saved.totalCents > 0) {
        after.push(() => emailEstimate(settings, { ...saved, number: estimateNumber(saved.id) }));
      }
    });
  }

  // Invoices
  for (const inv of body.invoices) {
    await attempt("An invoice", async () => {
      const customerId = resolve(inv.customer);
      if (!customerId) throw new Error("missing customer");
      const existing = inv.id ? await db.invoice.findUnique({ where: { id: inv.id }, include: { payments: true } }) : null;
      const activePayments = existing?.payments.some((p) => p.status !== "FAILED") ?? false;
      // Same rule as the admin page: paid, void, or partly paid invoices can't be re-priced.
      const locked = !!existing && (existing.status === "PAID" || existing.status === "VOID" || activePayments);

      let status: InvoiceStatus = inv.status === "PAID" ? "SENT" : inv.status;
      if (existing?.status === "PAID" && status !== "VOID") status = "PAID";
      if (status === "VOID" && (activePayments || inv.newPayments.length > 0)) {
        warnings.push(`${existing ? invoiceNumber(existing.id) : "A new invoice"} has payments, so it wasn't voided.`);
        status = existing?.status ?? "SENT";
      }
      if (existing?.status === "VOID") status = "VOID";

      let estimateId = resolve(inv.estimate);
      if (estimateId) {
        const taken = await db.invoice.findUnique({ where: { estimateId } });
        if (taken && taken.id !== existing?.id) estimateId = null;
      }

      const totals = computeTotals(
        inv.lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, taxable: l.taxable })),
        inv.taxRatePercent,
      );
      const base = {
        appointmentId: resolve(inv.appointment),
        status,
        title: inv.title,
        notes: inv.notes,
        jobAddress: inv.jobAddress,
        dueDate: toDate(inv.dueDate),
        ...(status === "SENT" && (!existing || existing.status === "DRAFT") ? { sentAt: new Date() } : {}),
      };
      const priced = {
        customerId,
        estimateId,
        taxRatePercent: dec(inv.taxRatePercent, 3),
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
      };

      const saved = existing
        ? await db.invoice.update({
            where: { id: existing.id },
            data: { ...base, ...(locked ? {} : { ...priced, lineItems: { deleteMany: {}, create: lineData(inv.lines) } }) },
          })
        : await db.invoice.create({ data: { ...base, ...priced, token: newToken(), lineItems: { create: lineData(inv.lines) } } });
      ids[inv.key] = saved.id;

      if (estimateId) await db.estimate.update({ where: { id: estimateId }, data: { status: "INVOICED" } });

      if (saved.status !== "VOID") {
        for (const p of inv.newPayments) {
          await db.$transaction(async (tx) => {
            const row = await tx.payment.create({
              data: {
                invoiceId: saved.id,
                method: p.method,
                status: "COMPLETED",
                amountCents: p.amountCents,
                note: p.note,
                ...(p.createdAt ? { createdAt: new Date(p.createdAt) } : {}),
              },
            });
            ids[p.key] = row.id;
          });
        }
        await refreshInvoicePaid(saved.id);
      }

      const nowSent = status === "SENT" && (!existing || existing.status === "DRAFT");
      if (notify && nowSent) {
        const fresh = await db.invoice.findUniqueOrThrow({ where: { id: saved.id }, include: { customer: true } });
        if (fresh.status === "SENT" && fresh.totalCents > 0) {
          after.push(() => emailInvoice(settings, { ...fresh, number: invoiceNumber(fresh.id), dueCents: amountDueCents(fresh) }));
        }
      }
    });
  }

  for (const job of after) {
    try {
      await job();
    } catch (err) {
      console.error("[mobile sync] email failed", err);
    }
  }

  return { ids, warnings };
}
