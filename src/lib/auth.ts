import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSession } from "./session";

/** Call at the top of every admin server action. Middleware guards pages, not actions. */
export async function requireAdmin() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(SESSION_COOKIE)?.value))) redirect("/admin/login");
}
