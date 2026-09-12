import { NextResponse } from "next/server";
import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  propagate,
  radiansToDegrees,
  twoline2satrec,
} from "satellite.js";
import { resolveObserverLocation, type ObserverLocation } from "@/lib/server/geolocation";
import { getTleData, type TleRecord } from "@/lib/server/tle";

export const dynamic = "force-dynamic";

const MIN_ELEVATION_DEGREES = 15;
const MAX_SATELLITES = 3;

export interface SatellitePathPoint {
  timestamp: string;
  offsetSeconds: number;
  azimuth: number;
  elevation: number;
  range: number;
}

interface CurrentSatellite {
  name: string;
  azimuth: number;
  elevation: number;
  range: number;
}

export interface ComputedSatellite extends CurrentSatellite {
  current: SatellitePathPoint;
  path: SatellitePathPoint[];
}

const PATH_OFFSETS_SECONDS = Array.from({ length: 11 }, (_, index) => index * 60);

function getSatelliteKey(record: TleRecord): string {
  return record.line1.slice(2, 7).trim() || record.name;
}

function parseOverride(request: Request): ObserverLocation | null {
  const searchParams = new URL(request.url).searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (lat === null && lon === null) return null;
  if (lat === null || lon === null) {
    throw new Error("lat and lon must be provided together");
  }

  const latitude = Number(lat);
  const longitude = Number(lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("lat and lon must be valid coordinates");
  }

  return { latitude, longitude, source: "override" };
}

function calculateSatellite(
  record: TleRecord,
  observer: { latitude: number; longitude: number },
  now: Date,
): CurrentSatellite | null {
  try {
    const satrec = twoline2satrec(record.line1, record.line2);
    const propagated = propagate(satrec, now);
    if (!propagated) return null;

    const satelliteEcf = eciToEcf(propagated.position, gstime(now));
    const lookAngles = ecfToLookAngles(
      {
        latitude: degreesToRadians(observer.latitude),
        longitude: degreesToRadians(observer.longitude),
        height: 0,
      },
      satelliteEcf,
    );
    const azimuth = radiansToDegrees(lookAngles.azimuth);
    const elevation = radiansToDegrees(lookAngles.elevation);
    const range = lookAngles.rangeSat;

    if (!Number.isFinite(azimuth) || !Number.isFinite(elevation) || !Number.isFinite(range)) {
      return null;
    }

    return { name: record.name, azimuth, elevation, range };
  } catch {
    return null;
  }
}

function sampleSyntheticSatellitePath(now: Date, name: string): ComputedSatellite {
  const path = PATH_OFFSETS_SECONDS.map((offsetSeconds) => {
    const timestamp = new Date(now.getTime() + offsetSeconds * 1000);
    const azimuth = (90 + offsetSeconds * 0.18) % 360;
    const elevation = 42 - Math.abs(offsetSeconds - 300) * 0.045;
    return {
      timestamp: timestamp.toISOString(),
      offsetSeconds,
      azimuth,
      elevation,
      range: 900,
    };
  });
  const current = path[0];

  return {
    name,
    azimuth: current.azimuth,
    elevation: current.elevation,
    range: current.range,
    current,
    path,
  };
}

function sampleSyntheticSatellitePaths(now: Date): ComputedSatellite[] {
  return Array.from({ length: MAX_SATELLITES }, (_, index) =>
    sampleSyntheticSatellitePath(now, `DEMO ORBIT ${index + 1}`),
  );
}

function sampleSatellitePath(
  record: TleRecord,
  observer: { latitude: number; longitude: number },
  now: Date,
): ComputedSatellite | null {
  const current = calculateSatellite(record, observer, now);
  if (!current) return null;

  const path = PATH_OFFSETS_SECONDS.flatMap((offsetSeconds) => {
    const timestamp = new Date(now.getTime() + offsetSeconds * 1000);
    const sample = calculateSatellite(record, observer, timestamp);
    if (!sample) return [];
    return [{
      timestamp: timestamp.toISOString(),
      offsetSeconds,
      azimuth: sample.azimuth,
      elevation: sample.elevation,
      range: sample.range,
    }];
  });
  const currentPoint = path.find((point) => point.offsetSeconds === 0);
  if (!currentPoint) return null;

  return {
    name: current.name,
    azimuth: current.azimuth,
    elevation: current.elevation,
    range: current.range,
    current: currentPoint,
    path,
  };
}

export async function GET(request: Request) {
  let observer: ObserverLocation;
  try {
    observer = parseOverride(request) ?? (await resolveObserverLocation(request));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid coordinates" }, { status: 400 });
  }

  const [tleData] = await Promise.all([getTleData()]);
  const now = new Date();
  const records = new Map<string, TleRecord>();

  for (const record of [...tleData.visual, ...tleData.stations]) {
    records.set(getSatelliteKey(record), record);
  }

  const computedSatellites = Array.from(records.values())
    .map((record) => ({ record, satellite: calculateSatellite(record, observer, now) }))
    .filter((entry): entry is { record: TleRecord; satellite: CurrentSatellite } => entry.satellite !== null);
  let satellites = computedSatellites
    .filter(({ satellite }) => satellite.elevation > MIN_ELEVATION_DEGREES)
    .sort((left, right) => right.satellite.elevation - left.satellite.elevation)
    .slice(0, MAX_SATELLITES)
    .map(({ record }) => sampleSatellitePath(record, observer, now))
    .filter((satellite): satellite is ComputedSatellite => satellite !== null);
  const syntheticFallback = satellites.length === 0;
  if (syntheticFallback) {
    satellites = sampleSyntheticSatellitePaths(now);
  }

  const body = {
    observer,
    satellites,
    calculatedAt: now.toISOString(),
    tleSource: tleData.source,
    tleFetchedAt: tleData.fetchedAt,
    syntheticFallback,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
