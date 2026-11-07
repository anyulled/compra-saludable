import { NextResponse } from "next/server";
import { optimize } from "../../../lib/optimizer.cjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const result = await optimize(data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar el menú.",
      },
      { status: 400 },
    );
  }
}
