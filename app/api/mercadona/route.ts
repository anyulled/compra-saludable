import { NextResponse } from "next/server";
import { lookup } from "../../../lib/mercadona.cjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.product !== "string" || body.product.length > 500)
      return NextResponse.json(
        { error: "Introduce un identificador o enlace válido." },
        { status: 400 },
      );
    return NextResponse.json(await lookup(body.product));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar Mercadona.",
      },
      { status: 400 },
    );
  }
}
