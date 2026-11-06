import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <form action={login} className="card space-y-4">
        <h1 className="text-xl font-semibold">Owner sign in</h1>
        {error && <p className="text-sm text-red-700">Wrong password.</p>}
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoFocus />
        </div>
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}
