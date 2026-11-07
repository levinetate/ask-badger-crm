import type { BusinessSettings, Customer, LineItem } from "@prisma/client";
import { formatMoney } from "@/lib/format";
import { lineTotalCents } from "@/lib/documents";
import { formatQty } from "@/lib/materials";

type Doc = {
  title: string;
  notes: string;
  jobAddress: string;
  taxRatePercent: unknown;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lineItems: LineItem[];
  customer: Customer;
};

/** Printable estimate / invoice body, used by both the owner and customer pages. */
export default function DocView({ doc, label, number, dateLine, settings, extra }: {
  doc: Doc;
  label: string;
  number: string;
  dateLine?: string;
  settings: BusinessSettings;
  extra?: React.ReactNode;
}) {
  const lines = [...doc.lineItems].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{settings.businessName}</div>
          {settings.phone && <div className="text-sm text-stone-600">{settings.phone}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
          <div className="text-lg font-semibold">{number}</div>
          {dateLine && <div className="text-sm text-stone-600">{dateLine}</div>}
        </div>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-stone-500">For</div>
          <div className="font-medium">{doc.customer.name}</div>
          <div>{doc.jobAddress || doc.customer.address}</div>
        </div>
        {doc.title && (
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Job</div>
            <div>{doc.title}</div>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-stone-100">
                <td className="py-2">{l.description}{l.taxable && <span className="ml-1 text-xs text-stone-400">T</span>}</td>
                <td className="py-2 text-right">{formatQty(l.quantity)}</td>
                <td className="py-2 text-right">{formatMoney(l.unitPriceCents)}</td>
                <td className="py-2 text-right">{formatMoney(lineTotalCents({ quantity: Number(l.quantity), unitPriceCents: l.unitPriceCents }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(doc.subtotalCents)}</dd></div>
        <div className="flex justify-between text-stone-600"><dt>Sales tax ({String(Number(doc.taxRatePercent))}%, on items marked T)</dt><dd>{formatMoney(doc.taxCents)}</dd></div>
        <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(doc.totalCents)}</dd></div>
        {extra}
      </dl>
      {doc.notes && <p className="whitespace-pre-line text-sm text-stone-700">{doc.notes}</p>}
      {settings.documentFooter && <p className="whitespace-pre-line border-t border-stone-100 pt-3 text-xs text-stone-500">{settings.documentFooter}</p>}
    </div>
  );
}
