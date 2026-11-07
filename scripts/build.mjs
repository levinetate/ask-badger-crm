// Vercel build: check the database env vars, then migrate and build.
// Fixes common copy/paste mistakes in the connection string and falls back
// to DATABASE_URL for migrations when DATABASE_URL_UNPOOLED isn't set.
import { execSync } from "node:child_process";
import path from "node:path";

export function cleanDbUrl(raw) {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/^psql\s+/i, "").trim(); // "psql 'postgresql://...'" from Neon's copy button
  s = s.replace(/^DATABASE_URL\s*=\s*/i, "").trim();
  s = s.replace(/^['"]|['"]$/g, "").trim();
  return s;
}

function check(name, value) {
  if (!/^postgres(ql)?:\/\//.test(value)) {
    const start = value ? `starts with "${value.slice(0, 12)}..."` : "is empty or missing";
    console.error(
      `\n${name} ${start}. It must start with postgresql://\n` +
        `Fix it in Vercel: Settings > Environment Variables, then redeploy.\n`,
    );
    process.exit(1);
  }
}

const url = cleanDbUrl(process.env.DATABASE_URL);
check("DATABASE_URL", url);
const direct = cleanDbUrl(process.env.DATABASE_URL_UNPOOLED) || url;
check("DATABASE_URL_UNPOOLED", direct);

const bin = path.join(process.cwd(), "node_modules", ".bin");
const env = {
  ...process.env,
  PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: direct,
};
try {
  execSync("prisma migrate deploy", { stdio: "inherit", env });
  execSync("next build", { stdio: "inherit", env });
} catch {
  process.exit(1);
}
