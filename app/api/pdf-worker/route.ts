import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAuthorizedUser()))
    return NextResponse.json(
      { error: "Se requiere una sesión autorizada." },
      { status: 401 },
    );
  const file = await readFile(
    join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  );
  return new Response(file, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
