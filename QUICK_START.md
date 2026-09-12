# Quick Start - Satellite Visibility API Fixed

## Visibility API behavior

The API fetches live TLE data from CelesTrak by default. It keeps successful live data in a four-hour process-local cache and only uses stale or bundled data after a real fetch or parsing failure.

## What Changed

### 1. **Live Mode Enabled by Default**
`.env.local` contains:
```
TLE_MOCK_MODE=false
```

This makes each expired cache entry perform a real CelesTrak request.

### 2. **Fallback Data Added**
Created `src/lib/server/fallback-tle.json` with sample satellite data including:
- ISS (International Space Station)
- Hubble Space Telescope
- Starlink satellite
- Tiangong space station

### 3. **Enhanced Error Handling**
- ✅ Increased timeout: 10s → 30s
- ✅ Added browser-style User-Agent and classified retries: 5xx/network/timeout failures retry; 4xx failures fail fast
- ✅ Automatic fallback: Fetch failure → stale live cache → bundled fallback
- ✅ Truthful metadata: `tleSource` identifies live, stale, fallback, or mock TLE data
- ✅ Fallback data is never cached as fresh live data
- ✅ The response `tleFetchedAt` reflects data acquisition time, not response time

## Running the Application

Just start the dev server as usual:

```bash
npm run dev
```

The `/api/visibility` endpoint will calculate visible satellites after the server starts. If CelesTrak is unavailable, the response identifies stale or bundled fallback data in its `tleSource` fields.

## Intentional mock mode

For deterministic offline testing, set this in `.env.local` and restart the server:

```
TLE_MOCK_MODE=true
```

To return to live fetching, set it back to `false` or remove the variable, then restart the server.

## Verify connectivity (optional)

```bash
node test-celestrak-connection.mjs
```

## Testing

### Test the API:
```bash
curl http://localhost:3000/api/visibility
```

Expected response shape (live mode):
```json
{
  "observer": { "latitude": 40.7, "longitude": -74.0, "source": "geolocation" },
  "satellites": [
    {
      "name": "ISS (ZARYA)",
      "current": { "timestamp": "<sample time>", "offsetSeconds": 0 },
      "path": [{ "timestamp": "<sample time>", "offsetSeconds": 0 }]
    }
  ],
  "calculatedAt": "<calculation time>",
  "tleSource": "live",
  "tleFetchedAt": "<latest data acquisition time>",
  "syntheticFallback": false
}
```

### Check logs:
Look for:
- `Successfully fetched fresh ... TLE data` when live data is retrieved
- `Using cached ... TLE data` when the four-hour live cache is valid
- `Using stale live cache` or `Using bundled fallback data` only after a live fetch failure

## Files Modified

1. ✅ `src/app/api/visibility/route.ts` - Visibility calculation, fallback, and explicit TLE source metadata
2. ✅ `src/lib/server/fallback-tle.json` - Sample TLE data
3. ✅ `.env.local` - Live mode configuration
4. ✅ `.env.local.example` - Template for configuration
5. ✅ `test-celestrak-connection.mjs` - Network diagnostic tool
6. ✅ `TLE_API_FIX.md` - Detailed documentation
7. ✅ `QUICK_START.md` - This file!

## Need Help?

- **Still seeing errors?** Check the server console logs
- **Want deterministic offline data?** Set `TLE_MOCK_MODE=true` in `.env.local`, then restart the server
- **Behind a firewall?** See troubleshooting in `TLE_API_FIX.md`
- **Need fresh mock data?** Edit `src/lib/server/fallback-tle.json`

The fallback records intentionally contain old sample epochs; they are labeled `fallback` or `mock` and are never reported as live data.
