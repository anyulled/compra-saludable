import { NextResponse } from "next/server";
import { getSupabaseServerClient, isAuthorizedGoogleUser } from "../../../lib/supabase/server";
import { safeNextUrl } from "../../../lib/supabase/redirect.mjs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=auth", url));

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const { data } = await supabase.auth.getUser();
    if (!isAuthorizedGoogleUser(data.user)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=unauthorized", url));
    }
    return NextResponse.redirect(
      safeNextUrl(url.searchParams.get("next"), url).toString(),
    );
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth", url));
  }
}
