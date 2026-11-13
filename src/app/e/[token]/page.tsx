import { notFound } from "next/navigation";
import DocView from "@/components/DocView";
import PublicShell from "@/components/PublicShell";
import { db, getSettings } from "@/lib/db";
import { estimateNumber } from "@/lib/documents";
import { formatDate } from "@/lib/time";
import { approveEstimate, declineEstimate } from "./actions";
import { recordOpen, viewerIsOwner } from "@/lib/openTracking";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ approved?: string; declined?: string; expired?: string; need?: string }> };

export default async function CustomerEstimatePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const est = await db.estimate.findUnique({ where: { token }, include: { customer: true, lineItems: true } });
  if (!est || est.status === "DRAFT") notFound();
  if (!(await viewerIsOwner())) await recordOpen("e", token, "link");
  const s = await getSettings();
  const expired = est.validUntil != null && est.validUntil < new Date();
  const open = est.status === "SENT" && !expired;

  return (
    <PublicShell>
      {sp.approved && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">Thanks! Your estimate is approved. We&apos;ll be in touch to schedule the work.</p>}
      {sp.declined && <p className="mb-4 rounded-md bg-stone-100 p-3 text-sm">You declined this estimate. Thanks for letting us know.</p>}
      {(sp.expired || (expired && est.status === "SENT")) && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">This estimate has expired. Please call us for an updated one.</p>}
      {(est.status === "APPROVED" || est.status === "INVOICED") && !sp.approved && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">Approved by {est.approvedName}.</p>}

      <DocView doc={est} label="Estimate" number={estimateNumber(est.id)} settings={s} dateLine={est.validUntil ? `Valid until ${formatDate(est.validUntil, s.timezone)}` : undefined} />

      {open && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form action={approveEstimate} className="card space-y-3">
            <h2 className="font-medium">Approve</h2>
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="label" htmlFor="name">Type your full name</label>
              <input className="input" id="name" name="name" required minLength={2} defaultValue={est.customer.name} />
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" /> I approve this estimate and the work described.</label>
            {sp.need === "agree" && <p className="text-sm text-red-700">Please tick the box to approve.</p>}
            <button className="btn-primary w-full">Approve estimate</button>
          </form>
          <form action={declineEstimate} className="card space-y-3">
            <h2 className="font-medium">Decline</h2>
            <input type="hidden" name="token" value={token} />
            <textarea className="input" name="reason" rows={3} placeholder="Optional: tell us why" />
            <button className="btn-danger w-full">Decline estimate</button>
          </form>
        </div>
      )}
    </PublicShell>
  );
}
