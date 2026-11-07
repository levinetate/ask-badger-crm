import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { db } from "@/lib/db";
import { formatDuration, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await db.serviceType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return (
    <PublicShell>
      <h1 className="mb-4 text-2xl font-semibold">What do you need?</h1>
      {services.length === 0 && <p className="text-stone-600">Online booking isn&apos;t set up yet. Please call us.</p>}
      <ul className="space-y-3">
        {services.map((s) => (
          <li key={s.id}>
            <Link href={`/book/${s.id}`} className="card block hover:border-amber-600">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{s.name}</span>
                <span className="shrink-0 text-sm text-stone-500">
                  {formatDuration(s.durationMin)}
                  {s.priceCents != null && ` · from ${formatMoney(s.priceCents)}`}
                </span>
              </div>
              {s.description && <p className="mt-1 text-sm text-stone-600">{s.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </PublicShell>
  );
}
