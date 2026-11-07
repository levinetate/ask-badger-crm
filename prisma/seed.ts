// Starter data for a new install. The same thing is available from Settings in the app.
import { db } from "../src/lib/db";
import { loadStarterSetup } from "../src/lib/starter";

loadStarterSetup()
  .then(() => console.log("Seed complete"))
  .finally(() => db.$disconnect());
