import Link from "next/link";
import { getSettings } from "@/lib/db";

export default async function PublicShell({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">{s.businessName}</Link>
        {s.phone && <a href={`tel:${s.phone}`} className="text-sm text-stone-600">{s.phone}</a>}
      </header>
      {children}
    </div>
  );
}
