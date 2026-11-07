import { NextResponse } from "next/server";
import { workspaceStore } from "../../../lib/storage";
import { isWorkspace } from "../../../lib/storage/validate.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function localRequest(request: Request) {
  const host = request.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host))
    return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.host.toLowerCase() !== host.toLowerCase() || u.protocol !== "http:")
        return false;
    } catch {
      return false;
    }
  }
  return true;
}
export async function GET(request: Request) {
  if (!localRequest(request))
    return NextResponse.json(
      { error: "Acceso solo desde este equipo." },
      { status: 403, headers },
    );
  try {
    return NextResponse.json(await workspaceStore().read(), { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la base de datos local." },
      { status: 500, headers },
    );
  }
}
export async function PUT(request: Request) {
  if (!localRequest(request))
    return NextResponse.json(
      { error: "Acceso solo desde este equipo." },
      { status: 403, headers },
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return NextResponse.json(
      { error: "Formato no válido." },
      { status: 415, headers },
    );
  try {
    const text = await request.text();
    if (text.length > 32 * 1024 * 1024)
      return NextResponse.json(
        { error: "Los datos superan el límite permitido." },
        { status: 413, headers },
      );
    const input = JSON.parse(text);
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !isWorkspace(input.state)
    )
      return NextResponse.json(
        { error: "Datos o revisión no válidos." },
        { status: 400, headers },
      );
    const result = await workspaceStore().write(
      input.state,
      input.expectedRevision,
    );
    if (!result.ok)
      return NextResponse.json(
        {
          error: "Los datos han cambiado en otra pestaña.",
          revision: result.revision,
        },
        { status: 409, headers },
      );
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar la base de datos local." },
      { status: 500, headers },
    );
  }
}
