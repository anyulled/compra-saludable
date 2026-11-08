import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "../../../../lib/supabase/server";
export const runtime = "nodejs";
const files: Record<string, [string, string]> = {
  "worker.min.js": [
    "tesseract.js/dist/worker.min.js",
    "text/javascript; charset=utf-8",
  ],
  "spa.traineddata.gz": [
    "@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
    "application/gzip",
  ],
  ...Object.fromEntries(
    [
      "tesseract-core.wasm.js",
      "tesseract-core-simd.wasm.js",
      "tesseract-core-relaxedsimd.wasm.js",
      "tesseract-core-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-relaxedsimd-lstm.wasm.js",
    ].map((name) => [
      name,
      [`tesseract.js-core/${name}`, "text/javascript; charset=utf-8"],
    ]),
  ),
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  if (!(await requireAuthorizedUser()))
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401 });
  const { asset } = await params;
  const entry = files[asset];
  if (!entry || !Object.hasOwn(files, asset))
    return new Response(null, { status: 404 });
  try {
    const data = await readFile(join(process.cwd(), "node_modules", entry[0]));
    return new Response(data, {
      headers: {
        "Content-Type": entry[1],
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
