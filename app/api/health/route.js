import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";

export async function GET() {
  try {
    const connection = await dbConnect();

    return NextResponse.json({
      ok: true,
      mongoReadyState: connection.connection.readyState,
      storage: "mongodb"
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      mongoReadyState: 0,
      storage: "memory-fallback",
      message: error.message
    });
  }
}
