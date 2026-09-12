# Satellite Background

A reusable shadcn registry component that renders an animated, theme-aware satellite background with procedural SVG paths and optional overlay clipping.

## Installation

Phase 1 prepares the registry source. The eventual installation command is conceptually:

```bash
npx shadcn@latest add RidhivSharma/satellite-bg-shadcn/satellite-bg
```

This command has not been validated against a fresh consumer project yet; that is Phase 2.

## Requirements

- Next.js 14 or newer with the App Router
- TypeScript
- A Node-compatible runtime for the visibility API route
- React and ReactDOM supplied by the consumer application
- `next-themes`
- `satellite.js`

Installing `satellite-bg` declares the backend registry item automatically. The backend installs the `/api/visibility` route and its server-side TLE and geolocation utilities.

## Usage

```tsx
import { SatelliteBackground } from "@/components/satellite-bg/satellite-background";

export default function Page() {
  return <SatelliteBackground />;
}
```

To render a synchronized clipped layer over selected elements, pass their DOM IDs:

```tsx
<SatelliteBackground overlayIds={["hero-card", "primary-panel"]} />
```

The component uses the fixed `/api/visibility` endpoint. The backend also supports optional `lat` and `lon` query parameters for explicit observer coordinates.

## Theme

The component uses `useTheme()` from `next-themes`. Mount a `next-themes` `ThemeProvider` in the consumer application for actual light/dark switching. The component still renders without a provider, using its existing dark styling until a resolved theme is available.

## Environment variables

No environment variables are required for basic use.

- `TLE_MOCK_MODE=true` forces the bundled fallback TLE data and avoids live CelesTrak requests.
- `IP_GEOLOCATION_URL` overrides the default provider, `https://ipwho.is/{ip}`. Keep `{ip}` in the URL where the client IP should be inserted.

## Limitations

- App Router is required.
- `output: "export"` is not supported because the feature requires an API route.
- The visibility route requires a Node-compatible server deployment.
- Localhost development falls back to San Francisco because localhost and loopback addresses are not publicly geolocatable.
- Production IP geolocation depends on correctly forwarded proxy headers.
- CelesTrak and ipwho.is are external services.
- Bundled TLE data is a fallback and can become stale.
