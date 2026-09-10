# TLE API Network Timeout Fix

## Problem
The `/api/tle` endpoint was failing with connection timeout errors when trying to fetch TLE (Two-Line Element) data from celestrak.org:

```
ConnectTimeoutError: Connect Timeout Error 
(attempted address: celestrak.org:443, timeout: 10000ms)
```

## Root Cause

The observed 2024 responses were not caused by a cache that ignored its expiry. `.env.local` enabled `NEXT_PUBLIC_USE_MOCK_TLE=true`, and the route returned the bundled fallback records before attempting CelesTrak. That branch also put the static records into the in-memory cache and the route stamped the response with the current time, making old data look newly fetched.

The live request URL is valid and is now the default path. Network, HTTP, timeout, and parsing failures can still occur because of:
- Network/firewall restrictions
- Geographic blocking
- Corporate proxy requirements
- DNS resolution issues
- Temporary CelesTrak outage
- Malformed or unexpected upstream content

## Solution Implemented

### 1. **Increased Timeout** (10s → 30s)
Extended the fetch timeout from 10 seconds to 30 seconds to handle slower connections.

### 2. **Browser User-Agent and Classified Retries**
CelesTrak requests include a descriptive browser-style User-Agent. The route retries only transient failures:
- Network and timeout errors retry up to 3 attempts with 2, 4, and 6 second backoff
- HTTP 5xx responses retry with the same backoff
- HTTP 401, 403, and other non-5xx responses fail fast after one attempt

### 3. **Fallback Data**
Created `src/data/fallback-tle.json` with sample TLE data for:
- ISS (Zarya)
- Hubble Space Telescope
- Starlink satellite
- Tiangong space station

Fallback data is served only after a live CelesTrak request or response validation fails and no stale live cache is available. It is labeled `source: "fallback"` (or per-group `source`) and is not inserted into the fresh live cache.

### 4. **Enhanced Logging**
Added detailed logging to help diagnose issues:
- Cache hits with age information
- Successful fetch notifications
- Detailed error messages with fallback indicators

### 5. **Improved Error Handling**
- Graceful degradation after a real live-fetch failure: stale live cache → bundled fallback
- Partial success handling (visual and stations resolve independently)
- Explicit `source` and `groups.*.source` metadata distinguish live, stale, fallback, mock, and mixed results
- `fetchedAt` reflects the data acquisition time rather than the HTTP response time
- Fallback records are never cached as fresh live data

## Testing

### Test Network Connection
Run the diagnostic script to check connectivity to celestrak.org:

```bash
node test-celestrak-connection.mjs
```

### Test the API Endpoint
Start the dev server and test:

```bash
npm run dev
```

Then visit: `http://localhost:3000/api/tle`

## Network Troubleshooting

If you're behind a corporate firewall or proxy:

1. **Check if celestrak.org is accessible:**
   ```bash
   curl https://celestrak.org
   ```

2. **Configure proxy (if needed):**
   ```bash
   # Windows
   set HTTP_PROXY=http://proxy.company.com:8080
   set HTTPS_PROXY=http://proxy.company.com:8080
   
   # Linux/Mac
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

3. **Alternative: Update Fallback Data**
   If you can access celestrak.org from another machine:
   - Download TLE data manually
   - Update `src/data/fallback-tle.json`
   - Commit the updated data

## API Response

The API preserves the `visual` and `stations` arrays and adds truthful source metadata:

```json
{
  "visual": [
    {
      "name": "ISS (ZARYA)",
      "line1": "1 25544U ...",
      "line2": "2 25544 ..."
    }
  ],
  "stations": [...],
  "fetchedAt": "<latest data acquisition time>",
  "source": "live",
  "groups": {
    "visual": { "source": "live", "fetchedAt": "<acquisition time>" },
    "stations": { "source": "live", "fetchedAt": "<acquisition time>" }
  }
}
```

## Monitoring

Check server logs for these messages:
- `Successfully fetched fresh {group} TLE data` - Fresh live data retrieved
- `Using cached {group} TLE data` - Serving from the valid live/mock cache
- `Using stale live cache` - A live refresh failed, serving older live data
- `Using bundled fallback data` - A live fetch/parse failed with no live cache, serving bundled fallback

## Future Improvements

Consider these enhancements:
1. Add alternative TLE data sources (space-track.org, n2yo.com)
2. Implement scheduled background data fetching
3. Add data persistence (database storage)
4. Create admin UI to update fallback data
5. Add health check endpoint
