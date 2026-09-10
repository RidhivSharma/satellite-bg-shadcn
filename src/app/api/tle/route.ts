import { NextResponse } from "next/server";
import { getTleData } from "@/lib/server/tle";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[TLE API] Starting TLE data fetch...");
  const body = await getTleData();

  console.log(
    `[TLE API] Returning ${body.visual.length} visual satellites and ${body.stations.length} stations (source: ${body.source})`,
  );

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
