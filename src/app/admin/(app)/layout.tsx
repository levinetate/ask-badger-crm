import Link from "next/link";
import { getSettings } from "@/lib/db";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="min-h-screen">
      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/admin" className="font-semibold">{s.businessName}</Link>
          <Link href="/admin" className="hover:text-amber-800">Calendar</Link>
          <Link href="/admin/appointments/new" className="hover:text-amber-800">New appointment</Link>
          <Link href="/admin/customers" className="hover:text-amber-800">Customers</Link>
          <Link href="/admin/estimates" className="hover:text-amber-800">Estimates</Link>
          <Link href="/admin/invoices" className="hover:text-amber-800">Invoices</Link>
          <Link href="/admin/materials" className="hover:text-amber-800">Materials</Link>
          <Link href="/admin/settings" className="hover:text-amber-800">Settings</Link>
          <span className="flex-1" />
          <Link href="/book" className="text-stone-500 hover:text-amber-800" target="_blank">Booking page ↗</Link>
          <form action={logout}><button className="text-stone-500 hover:text-amber-800">Sign out</button></form>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
