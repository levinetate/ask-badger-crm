"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeBarcode, recordMovement } from "@/lib/materials";
import { parseReceiptCsv, type ReceiptLine } from "@/lib/receiptImport";
import { lookupUpc, type UpcResult } from "@/lib/upcLookup";

const blankToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);
const money = z.preprocess(blankToUndef, z.string().optional()).transform((s) => {
  if (s == null) return 0;
  const n = Number(s.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid cost");
  return Math.round(n * 100);
});
const optNum = z.preprocess(blankToUndef, z.coerce.number().optional());

const materialSchema = z.object({
  id: z.preprocess(blankToUndef, z.coerce.number().int().optional()),
  name: z.string().trim().min(1).max(200),
  barcode: z.string().trim().max(40).default(""),
  sku: z.string().trim().max(60).default(""),
  store: z.string().trim().max(60).default(""),
  category: z.string().trim().max(60).default(""),
  unit: z.string().trim().max(20).default("each"),
  cost: money,
  markupPercent: optNum,
  reorderAt: optNum,
  startingQty: optNum,
  location: z.string().trim().max(60).default(""),
  notes: z.string().max(2000).default(""),
  active: z.string().optional(),
});

export async function saveMaterial(form: FormData) {
  await requireAdmin();
  const d = materialSchema.parse(Object.fromEntries(form));
  const barcode = d.barcode ? normalizeBarcode(d.barcode) : null;
  const data = {
    name: d.name,
    barcode: barcode || null,
    sku: d.sku,
    store: d.store,
    category: d.category,
    unit: d.unit || "each",
    costCents: d.cost,
    markupPercent: d.markupPercent == null ? null : new Prisma.Decimal(d.markupPercent),
    reorderAt: d.reorderAt == null ? null : new Prisma.Decimal(d.reorderAt),
    location: d.location,
    notes: d.notes,
  };
  if (barcode) {
    const clash = await db.material.findUnique({ where: { barcode } });
    if (clash && clash.id !== d.id) redirect(`/admin/materials/${clash.id}?dupe=1`);
  }
  if (d.id) {
    const before = await db.material.findUniqueOrThrow({ where: { id: d.id } });
    await db.material.update({
      where: { id: d.id },
      data: { ...data, active: d.active === "on", ...(before.costCents !== d.cost ? { costUpdatedAt: new Date() } : {}) },
    });
    revalidatePath(`/admin/materials/${d.id}`);
    redirect(`/admin/materials/${d.id}?saved=1`);
  }
  const m = await db.material.create({ data: { ...data, costUpdatedAt: d.cost ? new Date() : null } });
  if (d.startingQty) await recordMovement({ materialId: m.id, reason: "COUNT", quantity: d.startingQty, note: "Starting count" });
  redirect(`/admin/materials/${m.id}`);
}

const moveSchema = z.object({
  materialId: z.coerce.number().int().positive(),
  reason: z.enum(["PURCHASE", "USED", "COUNT", "ADJUST"]),
  quantity: z.coerce.number().finite(),
  unitCost: z.preprocess(blankToUndef, z.string().optional()),
  appointmentId: z.preprocess(blankToUndef, z.coerce.number().int().optional()),
  note: z.string().max(500).default(""),
  back: z.string().optional(),
});

export async function adjustStock(form: FormData) {
  await requireAdmin();
  const d = moveSchema.parse(Object.fromEntries(form));
  if (d.reason !== "COUNT" && d.quantity === 0) throw new Error("Enter an amount");
  if (d.reason === "COUNT" && d.quantity < 0) throw new Error("A count can't be negative");
  const unitCostCents = d.unitCost ? Math.round(Number(d.unitCost.replace(/[$,]/g, "")) * 100) : null;
  await recordMovement({
    materialId: d.materialId,
    reason: d.reason,
    quantity: d.quantity,
    unitCostCents: Number.isFinite(unitCostCents) ? unitCostCents : null,
    appointmentId: d.appointmentId,
    note: d.note,
  });
  revalidatePath(`/admin/materials/${d.materialId}`);
  if (d.appointmentId) revalidatePath(`/admin/appointments/${d.appointmentId}`);
  // Only follow same-site relative paths.
  if (d.back && d.back.startsWith("/admin/")) redirect(d.back);
}

/** Undo a "used on job" entry from an appointment. */
export async function removeJobMaterial(form: FormData) {
  await requireAdmin();
  const id = z.coerce.number().int().positive().parse(form.get("movementId"));
  const mv = await db.stockMovement.findUniqueOrThrow({ where: { id } });
  if (mv.reason !== "USED") throw new Error("Only job usage can be removed here");
  await db.$transaction([
    db.stockMovement.delete({ where: { id } }),
    db.material.update({ where: { id: mv.materialId }, data: { quantityOnHand: { decrement: mv.change } } }),
  ]);
  if (mv.appointmentId) revalidatePath(`/admin/appointments/${mv.appointmentId}`);
}

export type ScanResult =
  | { kind: "known"; barcode: string; material: { id: number; name: string; onHand: string; unit: string } }
  | { kind: "found"; barcode: string; product: UpcResult }
  | { kind: "unknown"; barcode: string };

/** Called by the scanner page after a barcode is read. */
export async function lookupBarcode(raw: string): Promise<ScanResult> {
  await requireAdmin();
  const barcode = normalizeBarcode(raw);
  if (!barcode) return { kind: "unknown", barcode: raw };
  // Match with or without the leading zero EAN-13 adds to UPC-A.
  const candidates = [barcode, barcode.replace(/^0(\d{12})$/, "$1"), barcode.length === 12 ? `0${barcode}` : barcode];
  const m = await db.material.findFirst({ where: { barcode: { in: candidates } } });
  if (m) return { kind: "known", barcode, material: { id: m.id, name: m.name, onHand: String(Number(m.quantityOnHand)), unit: m.unit } };
  const product = await lookupUpc(barcode);
  return product ? { kind: "found", barcode, product } : { kind: "unknown", barcode };
}

export async function quickMove(materialId: number, reason: "PURCHASE" | "USED", quantity: number) {
  await requireAdmin();
  const m = await recordMovement({ materialId, reason, quantity, note: "From scanner" });
  return String(Number(m.quantityOnHand));
}

// --- Receipt import ---

export type ImportRow = ReceiptLine & { matchId: number | null; matchName: string | null };

export async function previewImport(_prev: unknown, form: FormData): Promise<{ rows: ImportRow[]; error?: string }> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { rows: [], error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { rows: [], error: "File is too big (2 MB max)." };
  const { lines } = parseReceiptCsv(await file.text(), String(form.get("store") ?? ""));
  if (lines.length === 0) return { rows: [], error: "No item rows found. Check that the file has description and quantity columns." };
  const all = await db.material.findMany({ select: { id: true, name: true, barcode: true, sku: true, store: true } });
  const rows = lines.map((l) => {
    const bc = l.barcode ? normalizeBarcode(l.barcode) : "";
    const match =
      (bc && all.find((m) => m.barcode === bc)) ||
      (l.sku && all.find((m) => m.sku === l.sku && (!l.store || !m.store || m.store === l.store))) ||
      all.find((m) => m.name.toLowerCase() === l.name.toLowerCase());
    return { ...l, barcode: bc, matchId: match ? match.id : null, matchName: match ? match.name : null };
  });
  return { rows };
}

const importRow = z.object({
  include: z.boolean(),
  addStock: z.boolean(),
  name: z.string().min(1).max(200),
  sku: z.string().max(60),
  barcode: z.string().max(40),
  store: z.string().max(60),
  quantity: z.number().positive(),
  unitCostCents: z.number().int().min(0),
  matchId: z.number().int().nullable(),
});

export async function applyImport(form: FormData) {
  await requireAdmin();
  const rows = z.array(importRow).max(2000).parse(JSON.parse(String(form.get("rows") ?? "[]")));
  let created = 0;
  let updated = 0;
  for (const r of rows.filter((x) => x.include)) {
    await db.$transaction(async (tx) => {
      let id = r.matchId;
      if (id) {
        await tx.material.update({ where: { id }, data: { costCents: r.unitCostCents, costUpdatedAt: new Date(), ...(r.store ? { store: r.store } : {}) } });
        updated++;
      } else {
        const barcode = r.barcode && !(await tx.material.findUnique({ where: { barcode: r.barcode } })) ? r.barcode : null;
        id = (await tx.material.create({
          data: { name: r.name, sku: r.sku, barcode, store: r.store, costCents: r.unitCostCents, costUpdatedAt: new Date() },
        })).id;
        created++;
      }
      if (r.addStock) {
        await recordMovement({ materialId: id, reason: "PURCHASE", quantity: r.quantity, unitCostCents: r.unitCostCents, note: `Receipt import${r.store ? ` (${r.store})` : ""}` }, tx);
      }
    });
  }
  redirect(`/admin/materials?imported=${created}-${updated}`);
}
