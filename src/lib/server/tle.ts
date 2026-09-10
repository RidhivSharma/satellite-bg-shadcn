import fallbackData from "@/data/fallback-tle.json";

const CelesTrakBaseUrl = "https://celestrak.org/NORAD/elements/gp.php";
const CelesTrakUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 SatelliteBackground/1.0";
const TLE_REVALIDATE_SECONDS = 4 * 60 * 60;
const TLE_CACHE_TTL_MS = TLE_REVALIDATE_SECONDS * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
const USE_MOCK_TLE = process.env.TLE_MOCK_MODE === "true";

export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
}

export type TleSource = "live" | "stale" | "fallback" | "mock" | "mixed";
type TleGroupSource = Exclude<TleSource, "mixed">;

interface TleGroupResult {
  data: TleRecord[];
  source: TleGroupSource;
  fetchedAt: string;
}

export interface TleResponse {
  visual: TleRecord[];
  stations: TleRecord[];
  fetchedAt: string;
  source: TleSource;
  groups: {
    visual: Pick<TleGroupResult, "source" | "fetchedAt">;
    stations: Pick<TleGroupResult, "source" | "fetchedAt">;
  };
}

function parseTleText(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.length % 3 !== 0) {
    throw new Error("CelesTrak returned malformed TLE data");
  }

  const records: TleRecord[] = [];

  for (let index = 0; index < lines.length; index += 3) {
    const [name, line1, line2] = lines.slice(index, index + 3);

    if (!name || !line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      throw new Error("CelesTrak returned malformed TLE data");
    }

    records.push({ name, line1, line2 });
  }

  return records;
}

interface TleCacheEntry {
  data: TleRecord[];
  cachedAt: number;
  fetchedAt: string;
  source: TleGroupSource;
}

class CelesTrakHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed with status ${status}`);
    this.name = "CelesTrakHttpError";
  }
}

const tleCache = new Map<"visual" | "stations", TleCacheEntry>();
const inFlightRequests = new Map<"visual" | "stations", Promise<TleGroupResult>>();

function getFallbackResult(group: "visual" | "stations"): TleGroupResult {
  return {
    data: fallbackData[group] as TleRecord[],
    source: "fallback",
    fetchedAt: fallbackData.fetchedAt,
  };
}

function cacheResult(group: "visual" | "stations", result: TleGroupResult): TleGroupResult {
  tleCache.set(group, {
    data: result.data,
    cachedAt: Date.now(),
    fetchedAt: result.fetchedAt,
    source: result.source,
  });
  return result;
}

function getOverallSource(results: TleGroupResult[]): TleSource {
  const sources = new Set(results.map((result) => result.source));
  return sources.size === 1 ? results[0].source : "mixed";
}

async function fetchTleGroup(group: "visual" | "stations"): Promise<TleGroupResult> {
  const cached = tleCache.get(group);
  const now = Date.now();

  if (cached && now - cached.cachedAt < TLE_CACHE_TTL_MS) {
    console.log(
      `Using cached ${group} TLE data (source: ${cached.source}, age: ${Math.round((now - cached.cachedAt) / 1000)}s)`,
    );
    return { data: cached.data, source: cached.source, fetchedAt: cached.fetchedAt };
  }

  const inFlight = inFlightRequests.get(group);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      return await fetchFreshTleGroup(group);
    } catch (error) {
      if (cached && cached.source === "live") {
        const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000 / 60);
        console.error(
          `Failed to refresh ${group} TLE data. Using stale live cache (${cacheAge} minutes old).`,
          error,
        );
        return cacheResult(group, {
          data: cached.data,
          source: "stale",
          fetchedAt: cached.fetchedAt,
        });
      }

      console.warn(
        `Failed to fetch ${group} TLE data. Using bundled fallback data.`,
        error instanceof Error ? error.message : error,
      );
      return cacheResult(group, getFallbackResult(group));
    } finally {
      inFlightRequests.delete(group);
    }
  })();
  inFlightRequests.set(group, request);

  return request;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: { ...options.headers, "User-Agent": CelesTrakUserAgent },
        signal: controller.signal,
      });

      if (!response.ok) throw new CelesTrakHttpError(response.status);
      return response;
    } catch (error) {
      const retryable = !(error instanceof CelesTrakHttpError) || error.status >= 500;
      if (!retryable || attempt === retries) throw error;

      console.warn(
        `Fetch attempt ${attempt}/${retries} failed for ${url}, retrying in ${RETRY_DELAY_MS * attempt}ms...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("All retry attempts failed");
}

async function fetchFreshTleGroup(group: "visual" | "stations"): Promise<TleGroupResult> {
  if (USE_MOCK_TLE) {
    console.log(`[TLE API] Mock mode enabled, using bundled data for ${group}`);
    const mockData = fallbackData[group] as TleRecord[];
    const cachedAt = Date.now();
    tleCache.set(group, {
      data: mockData,
      cachedAt,
      fetchedAt: fallbackData.fetchedAt,
      source: "mock",
    });
    return { data: mockData, source: "mock", fetchedAt: fallbackData.fetchedAt };
  }

  const response = await fetchWithRetry(
    `${CelesTrakBaseUrl}?GROUP=${group}&FORMAT=tle`,
    { cache: "no-store" },
    MAX_RETRIES,
  );
  const data = parseTleText(await response.text());
  const cachedAt = Date.now();
  const fetchedAt = new Date(cachedAt).toISOString();

  tleCache.set(group, { data, cachedAt, fetchedAt, source: "live" });
  return { data, source: "live", fetchedAt };
}

export async function getTleData(): Promise<TleResponse> {
  const results = await Promise.all([fetchTleGroup("visual"), fetchTleGroup("stations")]);
  const [visualResult, stationsResult] = results;

  return {
    visual: visualResult.data,
    stations: stationsResult.data,
    fetchedAt: [visualResult.fetchedAt, stationsResult.fetchedAt].sort().at(-1) as string,
    source: getOverallSource(results),
    groups: {
      visual: { source: visualResult.source, fetchedAt: visualResult.fetchedAt },
      stations: { source: stationsResult.source, fetchedAt: stationsResult.fetchedAt },
    },
  };
}
