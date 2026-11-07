import type { LineItem } from "@prisma/client";
import { db, getSettings } from "./db";
import type { LineInput } from "./documents";
import { effectiveMarkup, sellPriceCents } from "./materials";

export async function editorMaterials() {
  const s = await getSettings();
  const ms = await db.material.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return ms.map((m) => ({ id: m.id, name: m.name, unit: m.unit, sellPriceCents: sellPriceCents(m.costCents, effectiveMarkup(m, s.defaultMarkupPercent)) }));
}

export function toLineInputs(items: LineItem[]): LineInput[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((l) => ({ kind: l.kind, description: l.description, quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents, taxable: l.taxable, materialId: l.materialId }));
}

/** Starting lines for a job: labor for the booked time plus the materials logged on it. */
export async function linesFromAppointment(appointmentId: number): Promise<LineInput[]> {
  const s = await getSettings();
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { serviceType: true, stockMovements: { where: { reason: "USED" }, include: { material: true } } },
  });
  if (!appt) return [];
  const hours = Math.round(((appt.endAt.getTime() - appt.startAt.getTime()) / 3_600_000) * 100) / 100;
  const lines: LineInput[] = [
    { kind: "LABOR", description: `Labor: ${appt.serviceType.name}`, quantity: hours, unitPriceCents: s.laborRateCents, taxable: false, materialId: null },
  ];
  // Combine repeated uses of the same material.
  const byMaterial = new Map<number, LineInput>();
  for (const mv of appt.stockMovements) {
    const qty = -Number(mv.change);
    const existing = byMaterial.get(mv.materialId);
    if (existing) existing.quantity += qty;
    else
      byMaterial.set(mv.materialId, {
        kind: "MATERIAL",
        description: mv.material.name,
        quantity: qty,
        unitPriceCents: sellPriceCents(mv.material.costCents, effectiveMarkup(mv.material, s.defaultMarkupPercent)),
        taxable: true,
        materialId: mv.materialId,
      });
  }
  return [...lines, ...byMaterial.values()];
}

export function lineCreateData(lines: LineInput[]) {
  return lines.map((l, i) => ({
    kind: l.kind,
    description: l.description,
    quantity: l.quantity.toFixed(2),
    unitPriceCents: l.unitPriceCents,
    taxable: l.taxable,
    materialId: l.materialId,
    sortOrder: i,
  }));
}
