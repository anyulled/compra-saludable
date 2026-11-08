import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.searchParams.set("next", "/");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error || !data.url) throw error || new Error("OAuth URL missing");
    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }
}
