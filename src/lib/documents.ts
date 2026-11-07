export type LineInput = {
  kind: "LABOR" | "MATERIAL" | "OTHER";
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  materialId: number | null;
};

export function lineTotalCents(l: { quantity: number; unitPriceCents: number }): number {
  return Math.round(l.quantity * l.unitPriceCents);
}

/** Subtotal, tax (only on taxable lines), and total, all in cents. */
export function computeTotals(lines: { quantity: number; unitPriceCents: number; taxable: boolean }[], taxRatePercent: number) {
  let subtotal = 0;
  let taxable = 0;
  for (const l of lines) {
    const t = lineTotalCents(l);
    subtotal += t;
    if (l.taxable) taxable += t;
  }
  const tax = Math.max(0, Math.round((taxable * taxRatePercent) / 100));
  return { subtotalCents: subtotal, taxableCents: taxable, taxCents: tax, totalCents: subtotal + tax };
}

export const estimateNumber = (id: number) => `E-${1000 + id}`;
export const invoiceNumber = (id: number) => `INV-${1000 + id}`;

export function amountDueCents(inv: { totalCents: number; amountPaidCents: number }): number {
  return Math.max(0, inv.totalCents - inv.amountPaidCents);
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  SQUARE_CARD: "Card",
  SQUARE_APPLE_PAY: "Apple Pay",
  SQUARE_GOOGLE_PAY: "Google Pay",
  SQUARE_CASH_APP: "Cash App Pay",
  SQUARE_ACH: "Bank transfer (ACH)",
  ZELLE: "Zelle",
  CASH: "Cash",
  CHECK: "Check",
  OTHER: "Other",
};

export const ESTIMATE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  DECLINED: "Declined",
  INVOICED: "Invoiced",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Unpaid",
  PAID: "Paid",
  VOID: "Void",
};

export const DOC_STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-stone-200 text-stone-700",
  SENT: "bg-amber-100 text-amber-900",
  APPROVED: "bg-green-100 text-green-900",
  DECLINED: "bg-red-100 text-red-800",
  INVOICED: "bg-sky-100 text-sky-900",
  PAID: "bg-green-100 text-green-900",
  VOID: "bg-stone-200 text-stone-500 line-through",
};
