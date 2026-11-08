import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  } finally {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
}
