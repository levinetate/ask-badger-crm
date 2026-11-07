import Link from "next/link";
import { db, getSettings } from "@/lib/db";
import { DOC_STATUS_CLASS, ESTIMATE_STATUS_LABEL, estimateNumber } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

type Props = { searchParams: Promise<{ status?: string }> };
const FILTERS = ["DRAFT", "SENT", "APPROVED", "DECLINED", "INVOICED"] as const;

export default async function EstimatesPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const s = await getSettings();
  const filter = FILTERS.find((f) => f === status);
  const list = await db.estimate.findMany({ where: filter ? { status: filter } : {}, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Estimates</h1>
        <Link href="/admin/estimates/new" className="btn-primary">New estimate</Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/estimates" className={!filter ? "font-semibold" : "link"}>All</Link>
        {FILTERS.map((f) => <Link key={f} href={`/admin/estimates?status=${f}`} className={filter === f ? "font-semibold" : "link"}>{ESTIMATE_STATUS_LABEL[f]}</Link>)}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr><th className="p-3">#</th><th className="p-3">Customer</th><th className="p-3">Job</th><th className="p-3">Created</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="p-3"><Link className="link" href={`/admin/estimates/${e.id}`}>{estimateNumber(e.id)}</Link></td>
                <td className="p-3">{e.customer.name}</td>
                <td className="p-3">{e.title}</td>
                <td className="p-3">{formatDateTime(e.createdAt, s.timezone)}</td>
                <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs ${DOC_STATUS_CLASS[e.status]}`}>{ESTIMATE_STATUS_LABEL[e.status]}</span></td>
                <td className="p-3 text-right">{formatMoney(e.totalCents)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="p-3 text-stone-500">No estimates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
