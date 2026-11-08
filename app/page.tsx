import { redirect } from "next/navigation";
import { requireAuthorizedUser } from "../lib/supabase/server";
import { getHouseholdIdForUser } from "../lib/supabase/household";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireAuthorizedUser();
  if (!session) redirect("/login");
  const householdId = await getHouseholdIdForUser(session.supabase, session.user.id);
  if (!householdId) {
    return (
      <main className="storage-screen">
        <h1>El hogar compartido aún no está preparado.</h1>
        <p>La cuenta está autorizada, pero aún no se ha vinculado a un hogar en Supabase.</p>
      </main>
    );
  }
  return (
    <Dashboard
      email={session.user.email ?? ""}
      householdId={householdId}
    />
  );
}
