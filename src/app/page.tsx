import Link from "next/link";
import PublicShell from "@/components/PublicShell";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <PublicShell>
      <div className="card text-center">
        <h1 className="mb-2 text-2xl font-semibold">Book electrical service</h1>
        <p className="mb-6 text-stone-600">Pick a service and a time that works for you. You&apos;ll get an email to confirm.</p>
        <Link href="/book" className="btn-primary">Book an appointment</Link>
      </div>
    </PublicShell>
  );
}
