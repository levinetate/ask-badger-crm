import { Prisma, type StockReason } from "@prisma/client";
import { db } from "./db";

/** Price you charge per unit: cost plus markup, rounded to the cent. */
export function sellPriceCents(costCents: number, markupPercent: number): number {
  return Math.round(costCents * (1 + markupPercent / 100));
}

export function effectiveMarkup(m: { markupPercent: Prisma.Decimal | null }, defaultMarkup: Prisma.Decimal | number): number {
  return Number(m.markupPercent ?? defaultMarkup);
}

/** Normalizes a scanned or typed barcode: digits only, UPC-A padded to 12. */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return digits.padStart(12, "0");
  return digits;
}

export function isLowStock(m: { quantityOnHand: Prisma.Decimal; reorderAt: Prisma.Decimal | null }): boolean {
  return m.reorderAt != null && Number(m.quantityOnHand) <= Number(m.reorderAt);
}

type MovementInput = {
  materialId: number;
  reason: StockReason;
  /** For COUNT this is the counted total; otherwise the amount added (PURCHASE) or removed (USED) or +/- (ADJUST). */
  quantity: number;
  unitCostCents?: number | null;
  appointmentId?: number | null;
  note?: string;
};

/** Records a stock change and updates the on-hand amount in one transaction. */
export async function recordMovement(input: MovementInput, client?: Prisma.TransactionClient) {
  const run = async (tx: Prisma.TransactionClient) => {
    const m = await tx.material.findUniqueOrThrow({ where: { id: input.materialId } });
    const current = Number(m.quantityOnHand);
    const change =
      input.reason === "COUNT" ? input.quantity - current :
      input.reason === "USED" ? -Math.abs(input.quantity) :
      input.reason === "PURCHASE" ? Math.abs(input.quantity) :
      input.quantity;
    const cost = input.reason === "PURCHASE" && input.unitCostCents != null ? input.unitCostCents : null;
    await tx.stockMovement.create({
      data: {
        materialId: m.id,
        change: new Prisma.Decimal(change.toFixed(2)),
        reason: input.reason,
        unitCostCents: cost,
        appointmentId: input.appointmentId ?? null,
        note: input.note ?? "",
      },
    });
    return tx.material.update({
      where: { id: m.id },
      data: {
        quantityOnHand: { increment: new Prisma.Decimal(change.toFixed(2)) },
        ...(cost != null ? { costCents: cost, costUpdatedAt: new Date() } : {}),
      },
    });
  };
  return client ? run(client) : db.$transaction(run);
}

export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  PURCHASE: "Bought",
  USED: "Used on job",
  COUNT: "Counted",
  ADJUST: "Adjusted",
};

export function formatQty(q: Prisma.Decimal | number): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}
