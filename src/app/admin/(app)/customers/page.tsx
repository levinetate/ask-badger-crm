import Link from "next/link";
import { db } from "@/lib/db";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const customers = await db.customer.findMany({
    where: term
      ? { OR: ["name", "email", "phone", "address"].map((f) => ({ [f]: { contains: term, mode: "insensitive" as const } })) }
      : {},
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { appointments: true } } },
  });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Customers</h1>
        <form className="flex gap-2">
          <input className="input w-64" name="q" defaultValue={term} placeholder="Search name, email, phone, address" />
          <button className="btn-secondary">Search</button>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th><th className="p-3">Address</th><th className="p-3 text-right">Jobs</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="p-3"><Link className="link" href={`/admin/customers/${c.id}`}>{c.name}</Link></td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">{c.address}</td>
                <td className="p-3 text-right">{c._count.appointments}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td className="p-3 text-stone-500" colSpan={5}>No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
