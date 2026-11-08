import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedGoogleUser } from "./lib/supabase/authorization";

function unavailable(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "El servicio de autenticación no está configurado." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/login?error=setup", request.url));
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !process.env.AUTHORIZED_EMAILS) return unavailable(request);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (updates) => {
        updates.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        updates.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (isAuthorizedGoogleUser(data.user)) return response;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const denied = NextResponse.json(
      { error: "Se requiere una sesión autorizada." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return denied;
  }

  const loginUrl = new URL("/login", request.url);
  const redirected = NextResponse.redirect(loginUrl);
  response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
  return redirected;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|images/mesa-saludable.jpg|login|auth).*)",
  ],
};
