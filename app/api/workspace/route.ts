import { NextResponse } from "next/server";
import { isWorkspace } from "../../../lib/storage/validate.mjs";
import { createSupabaseWorkspaceStore } from "../../../lib/storage/supabase";
import { requireAuthorizedUser } from "../../../lib/supabase/server";
import {
  MAX_REQUEST_BODY_BYTES,
  MAX_WORKSPACE_BYTES,
} from "../../../lib/workspace-limits.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await requireAuthorizedUser();
  if (!session)
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401, headers });
  try {
    const store = createSupabaseWorkspaceStore(
      session.supabase,
      process.env.MESA_HOUSEHOLD_ID ?? "",
    );
    return NextResponse.json(await store.read(), { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el espacio compartido." },
      { status: 500, headers },
    );
  }
}

export async function PUT(request: Request) {
  const session = await requireAuthorizedUser();
  if (!session)
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401, headers });
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Solicitud de otro origen rechazada." }, { status: 403, headers });
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return NextResponse.json({ error: "Formato no válido." }, { status: 415, headers });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BODY_BYTES)
    return NextResponse.json({ error: "La solicitud supera el límite de 4 MiB." }, { status: 413, headers });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES)
      return NextResponse.json({ error: "La solicitud supera el límite de 4 MiB." }, { status: 413, headers });
    const input = JSON.parse(text);
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !isWorkspace(input.state)
    )
      return NextResponse.json({ error: "Datos o revisión no válidos." }, { status: 400, headers });
    if (new TextEncoder().encode(JSON.stringify(input.state)).byteLength > MAX_WORKSPACE_BYTES)
      return NextResponse.json({ error: "El workspace supera el límite de 3 MiB." }, { status: 413, headers });
    const store = createSupabaseWorkspaceStore(
      session.supabase,
      process.env.MESA_HOUSEHOLD_ID ?? "",
    );
    const current = await store.read();
    if (!current.state)
      return NextResponse.json(
        { error: "El espacio está pendiente de importación administrativa." },
        { status: 409, headers },
      );
    const result = await store.write(input.state, input.expectedRevision);
    if (!result.ok)
      return NextResponse.json(
        { error: "Los datos han cambiado en otra pestaña.", revision: result.revision },
        { status: 409, headers },
      );
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el espacio compartido." },
      { status: 500, headers },
    );
  }
}
