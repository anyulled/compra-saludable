import { redirect } from "next/navigation";
import { requireAuthorizedUser } from "../lib/supabase/server";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireAuthorizedUser();
  if (!session) redirect("/login");
  return (
    <Dashboard
      email={session.user.email ?? ""}
      householdId={process.env.MESA_HOUSEHOLD_ID ?? ""}
    />
  );
}
