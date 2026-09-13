# Satellite Background

A reusable shadcn registry component for an animated, theme-aware satellite background. It renders monochrome procedural SVG paths, moving markers, and optional clipped overlays while the installed backend computes visibility from satellite TLE data.

This repository contains the registry source and generated registry responses. It is not the consumer application; installing `satellite-bg` adds the frontend component and its backend registry dependency to an existing Next.js app.

## Installation

From a Next.js App Router project configured for shadcn/ui, run:

```bash
npx shadcn@latest add RidhivSharma/satellite-bg-shadcn/satellite-bg
```

The installation adds the frontend component and automatically resolves:

```text
satellite-bg
└── RidhivSharma/satellite-bg-shadcn/satellite-bg-backend
```

The backend item installs:

- `app/api/visibility/route.ts`
- `lib/server/tle.ts`
- `lib/server/geolocation.ts`
- `lib/server/fallback-tle.json`

The frontend item installs:

- `components/satellite-bg/satellite-background.tsx`
- `components/satellite-bg/procedural-path.ts`
- `components/satellite-bg/use-satellite-paths.ts`
- `components/satellite-bg/use-overlay-clip-path.ts`

## Basic usage

```tsx
import { SatelliteBackground } from "@/components/satellite-bg/satellite-background";

export default function Page() {
  return <SatelliteBackground />;
}
```

The component has one optional prop:

```ts
type SatelliteBackgroundProps = {
  overlayIds?: string[];
};
```

`overlayIds` defaults to an empty list. When it contains DOM element IDs, the component renders a synchronized clipped foreground layer over those elements. Without it, the background remains in the lowest fixed layer. The component has no other public props.

## Theme provider

The component calls `useTheme()` from `next-themes`. Configure the consumer application with its own `ThemeProvider`; do not install or copy an application-level provider from this repository.

```tsx
"use client";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

The component renders a black background with white graphics in dark mode and a white background with black graphics in light mode. A provider is required for proper theme-aware rendering and switching.

## Requirements

- Next.js App Router with a server/API route runtime.
- React and TypeScript supplied by the consumer application.
- `next-themes` for the theme provider. It is declared by the frontend registry item.
- A Node-compatible runtime for the backend route and server utilities.
- `satellite.js` for server-side orbit propagation. It is declared by the backend registry item.

Phase 2 was tested with Next.js `16.3.5` and React `19.2.8`. These are tested versions, not universal minimum-version claims.

Static export is not supported: `output: "export"` cannot serve the required `/api/visibility` route.

## Visibility API

The backend exposes:

```text
GET /api/visibility
```

The frontend calls this endpoint automatically. It returns the observer location, up to three visible satellites, sampled paths, calculation metadata, and TLE source metadata.

Optional explicit coordinates can be supplied for testing or an externally resolved observer:

```text
GET /api/visibility?lat=37.7749&lon=-122.4194
```

`lat` and `lon` must be supplied together. Latitude must be between `-90` and `90`; longitude must be between `-180` and `180`. Invalid or incomplete coordinates return HTTP `400`.

The route selects satellites above a 15-degree elevation threshold, limits the response to three satellites, and samples each selected path at eleven one-minute offsets from the current time through ten minutes ahead. If no computed satellite passes the threshold, it returns three synthetic paths and sets `syntheticFallback` to `true`.

## TLE data

The backend requests visual and space-station TLE groups from CelesTrak. Each group is cached in process memory for four hours. When a refresh fails, the backend uses an available stale live cache; if none exists, it uses the bundled fallback TLE file. `tleSource` reports `live`, `stale`, `fallback`, `mock`, or `mixed` so fallback behavior is visible to consumers.

For deterministic offline testing, set this server-side environment variable and restart the application:

```text
TLE_MOCK_MODE=true
```

Mock mode uses the bundled TLE records and reports `tleSource: "mock"`. No `.env` file is required or included by this repository.

## Geolocation

Without coordinate overrides, the backend reads the first address from `x-forwarded-for` or `x-real-ip` when it is a valid public IP. It queries `https://ipwho.is/{ip}` by default and caches successful results in process memory for one hour.

Set `IP_GEOLOCATION_URL` to use another provider URL. Keep `{ip}` in the value where the encoded client IP should be inserted:

```text
IP_GEOLOCATION_URL=https://example.com/lookup/{ip}
```

Invalid, private, loopback, missing, timed-out, failed, or unusable geolocation data falls back to San Francisco coordinates (`37.7749, -122.4194`). This is why localhost development uses the fallback location unless explicit `lat` and `lon` values are provided.

## Limitations

- The backend requires a Node-compatible server runtime; static export is incompatible.
- Production geolocation depends on the deployment proxy forwarding a public client IP.
- CelesTrak and the default ipwho.is provider are external services. Network or provider failures use the documented stale, bundled, or coordinate fallbacks.
- Bundled TLE records are intentionally a fallback and can become stale.
- The registry package does not include demo pages, layout files, theme controls, fonts, screenshots, unrelated UI components, or application configuration.

## Repository development

The public distribution is defined by `registry.json`, the files under `registry/`, and the generated JSON responses under `public/r/`. The `src/` tree is a local test harness used to validate the same component and backend behavior; it is not installed by the registry.
