const FALLBACK_LOCATION = {
  latitude: 37.7749,
  longitude: -122.4194,
  source: "fallback" as const,
};

const LOOKUP_TIMEOUT_MS = 4_000;
const LOCATION_CACHE_TTL_MS = 60 * 60 * 1000;
const locationCache = new Map<string, { latitude: number; longitude: number; cachedAt: number }>();

// ipapi.co sits behind a Cloudflare bot challenge that rejects most
// server-side (non-browser) requests with an HTML "Just a moment..."
// challenge page instead of JSON, which silently failed here and always
// fell through to FALLBACK_LOCATION. ipwho.is returns the same
// `latitude`/`longitude` field names and hasn't shown that behavior.
const DEFAULT_GEOLOCATION_URL = "https://ipwho.is/{ip}";
const GEOLOCATION_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 SatelliteBackground/1.0";

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  source: "ip" | "fallback" | "override";
}

function isValidIp(ip: string): boolean {
  if (ip === "localhost" || ip === "::1" || ip === "0.0.0.0") return false;
  if (ip.includes(":") && !/^[0-9a-f:]+$/i.test(ip)) return false;
  if (!ip.includes(":") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;

  const octets = ip.split(".");
  if (octets.length === 4) {
    const values = octets.map(Number);
    if (values.some((octet) => octet > 255)) return false;
    if (
      values[0] === 10 ||
      values[0] === 127 ||
      (values[0] === 169 && values[1] === 254) ||
      (values[0] === 172 && values[1] >= 16 && values[1] <= 31) ||
      (values[0] === 192 && values[1] === 168)
    ) {
      return false;
    }
  }

  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(ip)) return false;
  return true;
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp;
  if (!ip) return null;
  if (!isValidIp(ip)) {
    console.warn(`[geolocation] Ignoring non-public client IP "${ip}" (no x-forwarded-for/x-real-ip from a proxy); using fallback location.`);
    return null;
  }
  return ip;
}

function isValidCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export async function resolveObserverLocation(request: Request): Promise<ObserverLocation> {
  const ip = getClientIp(request);
  if (!ip) return FALLBACK_LOCATION;

  const cached = locationCache.get(ip);
  if (cached && Date.now() - cached.cachedAt < LOCATION_CACHE_TTL_MS) {
    return { latitude: cached.latitude, longitude: cached.longitude, source: "ip" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const providerUrl = process.env.IP_GEOLOCATION_URL ?? DEFAULT_GEOLOCATION_URL;
    const url = providerUrl.replace("{ip}", encodeURIComponent(ip));
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": GEOLOCATION_USER_AGENT },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[geolocation] Lookup for ${ip} failed with HTTP ${response.status} from ${url}; using fallback location.`);
      return FALLBACK_LOCATION;
    }

    const data = (await response.json()) as { latitude?: unknown; longitude?: unknown; success?: unknown };
    if (data.success === false) {
      console.warn(`[geolocation] Provider reported failure for ${ip}; using fallback location.`);
      return FALLBACK_LOCATION;
    }
    if (!isValidCoordinate(data.latitude, -90, 90) || !isValidCoordinate(data.longitude, -180, 180)) {
      console.warn(`[geolocation] Lookup for ${ip} returned no usable coordinates; using fallback location.`);
      return FALLBACK_LOCATION;
    }

    locationCache.set(ip, { latitude: data.latitude, longitude: data.longitude, cachedAt: Date.now() });
    return { latitude: data.latitude, longitude: data.longitude, source: "ip" };
  } catch (error) {
    console.warn(`[geolocation] Lookup for ${ip} threw an error; using fallback location.`, error);
    return FALLBACK_LOCATION;
  } finally {
    clearTimeout(timeout);
  }
}
