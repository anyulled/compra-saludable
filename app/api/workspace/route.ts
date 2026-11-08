import { NextResponse } from "next/server";
import { isWorkspace } from "../../../lib/storage/validate.mjs";
import { createSupabaseWorkspaceStore } from "../../../lib/storage/supabase";
import { requireAuthorizedUser } from "../../../lib/supabase/server";
import { getHouseholdIdForUser } from "../../../lib/supabase/household";
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

function envelopeError(request: Request) {
  if (!sameOrigin(request)) return { status: 403, error: "Solicitud de otro origen rechazada." };
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "Formato no válido." };
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return { status: 413, error: "La solicitud supera el límite de 4 MiB." };
  }
  return null;
}

function isValidWriteInput(input: any) {
  return Boolean(input && Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0 && isWorkspace(input.state));
}

async function parseWriteInput(request: Request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) {
    return { error: "La solicitud supera el límite de 4 MiB.", status: 413 } as const;
  }
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return { error: "Datos o revisión no válidos.", status: 400 } as const;
  }
  if (!isValidWriteInput(input)) return { error: "Datos o revisión no válidos.", status: 400 } as const;
  if (new TextEncoder().encode(JSON.stringify(input.state)).byteLength > MAX_WORKSPACE_BYTES) {
    return { error: "El workspace supera el límite de 3 MiB.", status: 413 } as const;
  }
  return { input } as const;
}

async function saveWorkspace(session: NonNullable<Awaited<ReturnType<typeof requireAuthorizedUser>>>, input: any) {
  try {
    const householdId = await getHouseholdIdForUser(session.supabase, session.user.id);
    if (!householdId) {
      return NextResponse.json(
        { error: "El hogar compartido aún no está configurado." },
        { status: 409, headers },
      );
    }
    const store = createSupabaseWorkspaceStore(session.supabase, householdId);
    const current = await store.read();
    if (!current.state) {
      return NextResponse.json(
        { error: "El espacio está pendiente de importación administrativa." },
        { status: 409, headers },
      );
    }
    const result = await store.write(input.state, input.expectedRevision);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Los datos han cambiado en otra pestaña.", revision: result.revision },
        { status: 409, headers },
      );
    }
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el espacio compartido." },
      { status: 500, headers },
    );
  }
}

export async function GET() {
  const session = await requireAuthorizedUser();
  if (!session)
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401, headers });
  try {
    const householdId = await getHouseholdIdForUser(session.supabase, session.user.id);
    if (!householdId) {
      return NextResponse.json(
        { error: "El hogar compartido aún no está configurado." },
        { status: 409, headers },
      );
    }
    const store = createSupabaseWorkspaceStore(session.supabase, householdId);
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
  const invalidEnvelope = envelopeError(request);
  if (invalidEnvelope) return NextResponse.json({ error: invalidEnvelope.error }, { status: invalidEnvelope.status, headers });
  try {
    const parsed = await parseWriteInput(request);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers });
    return await saveWorkspace(session, parsed.input);
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el espacio compartido." },
      { status: 500, headers },
    );
  }
}
