"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ApiPathPoint {
  timestamp: string;
}

interface ApiSatellite {
  name: string;
  current: ApiPathPoint;
  path: ApiPathPoint[];
}

interface VisibilityResponse {
  satellites: ApiSatellite[];
}

function isApiPathPoint(value: unknown): value is ApiPathPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<ApiPathPoint>;
  return typeof point.timestamp === "string" && Number.isFinite(Date.parse(point.timestamp));
}

function isApiSatellite(value: unknown): value is ApiSatellite {
  if (!value || typeof value !== "object") return false;
  const satellite = value as Partial<ApiSatellite>;
  return (
    typeof satellite.name === "string" &&
    isApiPathPoint(satellite.current) &&
    Array.isArray(satellite.path) &&
    satellite.path.length > 0 &&
    satellite.path.every(isApiPathPoint)
  );
}

export interface TrackedSatellite {
  name: string;
}

const SYNTHETIC_SATELLITES: TrackedSatellite[] = Array.from({ length: 3 }, (_, index) => ({
  name: `DEMO ORBIT ${index + 1}`,
}));

interface SatelliteTiming {
  /** Wall-clock time this satellite was first observed in the visible set. */
  enteredAt: number;
  /** How long one lap across its on-screen path should take, derived from real pass timing. */
  durationMs: number;
}

interface UseSatellitePathsOptions {
  intervalMs?: number;
  observer?: { lat: number; lon: number };
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
// Fallback lap duration if a satellite's sampled timeline is somehow too short to trust.
const DEFAULT_DURATION_MS = 10 * 60 * 1000;
const MIN_TRUSTED_SPAN_MS = 30 * 1000;

function getVisibilityUrl(observer?: { lat: number; lon: number }): string {
  if (!observer) return "/api/visibility";
  const params = new URLSearchParams({ lat: String(observer.lat), lon: String(observer.lon) });
  return `/api/visibility?${params}`;
}

/**
 * Tracks which satellites are currently visible (for path assignment) and,
 * for each, how far through its on-screen "lap" it should currently be.
 *
 * Deliberately does not expose azimuth/elevation/screen-projected geometry
 * any more: the rendered path shape is now a procedural curve (see
 * `procedural-path.ts`), not a literal projection of the sky position. Real
 * data still determines *which* satellites appear and, via each one's
 * sampled timeline span, roughly *how long* it stays on screen per lap.
 */
export function useSatellitePaths(options: UseSatellitePathsOptions = {}) {
  const { intervalMs = DEFAULT_INTERVAL_MS, observer } = options;
  const [satellites, setSatellites] = useState<TrackedSatellite[]>(SYNTHETIC_SATELLITES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timingRef = useRef(new Map<string, SatelliteTiming>());

  const refresh = useCallback(async (signal: AbortSignal) => {
    const response = await fetch(getVisibilityUrl(observer), { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Visibility request failed (${response.status})`);
    const data = (await response.json()) as Partial<VisibilityResponse>;
    if (!Array.isArray(data.satellites) || !data.satellites.every(isApiSatellite)) {
      throw new Error("Visibility response has an invalid sampled-path shape");
    }

    const now = Date.now();
    const seenNames = new Set<string>();

    for (const satellite of data.satellites) {
      seenNames.add(satellite.name);

      const first = Date.parse(satellite.path[0].timestamp);
      const last = Date.parse(satellite.path[satellite.path.length - 1].timestamp);
      const span = last - first;
      const durationMs = Number.isFinite(span) && span > MIN_TRUSTED_SPAN_MS ? span : DEFAULT_DURATION_MS;

      const existing = timingRef.current.get(satellite.name);
      if (existing) {
        // Keep the original entry time so an already-animating satellite's
        // lap progress never jumps; just keep its duration estimate fresh.
        existing.durationMs = durationMs;
      } else {
        timingRef.current.set(satellite.name, { enteredAt: now, durationMs });
      }
    }

    for (const name of Array.from(timingRef.current.keys())) {
      if (!seenNames.has(name)) timingRef.current.delete(name);
    }

    setSatellites(data.satellites.map((satellite) => ({ name: satellite.name })));
    setError(null);
  }, [observer]);

  useEffect(() => {
    let active = true;
    let controller = new AbortController();

    const run = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        await refresh(controller.signal);
        if (active) setLoading(false);
      } catch (cause) {
        if (active && cause instanceof Error && cause.name !== "AbortError") {
          setError(cause.message);
          setLoading(false);
        }
      }
    };

    void run();
    const interval = window.setInterval(() => void run(), intervalMs);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [intervalMs, refresh]);

  /** Normalized, looping [0, 1) progress for a satellite's current lap, driven purely by wall clock. */
  const getProgress = useCallback((name: string, now: number): number => {
    const timing = timingRef.current.get(name);
    if (!timing || timing.durationMs <= 0) return 0;
    const elapsed = now - timing.enteredAt;
    if (elapsed <= 0) return 0;
    return (elapsed % timing.durationMs) / timing.durationMs;
  }, []);

  return {
    satellites,
    getProgress,
    loading,
    error,
  };
}
