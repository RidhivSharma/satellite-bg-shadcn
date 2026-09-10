# Ambient Satellite Background — Build Plan

A theme-aware, always-on ambient background for the portfolio site showing 3–5
real satellites currently overhead, rendered in Three.js, distributed as an
installable shadcn registry component.

---

## 0. Core decisions locked in

- **No plane-tracking API, no 30km ground radius.** Satellites use az/el
  (angle above horizon), not ground distance — that's the fix for the
  "empty sky" problem you ran into with planes.
- **Primary data path is self-computed, not a live third-party API call per
  visitor.** Fetch CelesTrak TLE data on a schedule, cache it, compute
  positions with `satellite.js` on your own infra/client. No per-visitor
  rate-limit dependency.
- **N2YO is optional, not load-bearing.** Fine for prototyping/sanity-checking
  your own SGP4 output against theirs. Don't ship the component depending on
  it staying up.
- **Always have a synthetic fallback.** If TLE fetch fails, or nothing is
  above your elevation cutoff (rare but possible), fall back to a
  procedurally generated path so the background never looks broken.
- **Visual model: dashed curved path + live marker, strictly monochrome.**
  Each satellite is a curved, dotted/dashed line (its path across the sky)
  with a marker traveling live along it — not a static glowing dot with a
  fading trail. Dark mode: black background, white line/marker. Light
  mode: white background, black line/marker. No other colors anywhere in
  this component.
- **Selective front/behind layering by element ID.** The component accepts
  a list of DOM element IDs. The line/marker renders in front of only
  those elements; everything else on the page occludes it as normal. The
  solid black/white background fill itself always stays at the very back
  regardless of this list — only the thin line/marker graphic is ever
  eligible to render in front of something.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (already your portfolio stack) | App Router + Route Handlers double as your TLE-fetch/cache layer |
| 3D | Three.js via `@react-three/fiber` + `@react-three/drei` | Standard R3F/Next combo |
| Orbital math | `satellite.js` | Maintained SGP4/SDP4 propagation, TLE parsing, ECI→look-angle conversion |
| Data source | CelesTrak TLE sets (free, no key) | Reliable, updated every few hours, no auth |
| Geolocation | IP geolocation (server-side, cached), with a fixed fallback location | Silent, no permission prompt — fits a "background just works" component |
| Theming | `next-themes` (or whatever your shadcn setup already uses) | Swaps black/white |
| Selective layering | CSS/SVG `clip-path`, driven by `getBoundingClientRect` + `ResizeObserver` on referenced element IDs | Standard browser technique for "in front of some elements, behind others" |
| Distribution | Custom shadcn registry (`registry.json` + component files) | Matches how shadcn components are actually installed (`npx shadcn add <url>`) |

---

## 2. Phase-by-phase plan

### Phase 0 — Repo scaffolding
- New package/folder for the component, developed independently, later
  installed into the portfolio repo via shadcn.
- Init TypeScript, Tailwind, and the R3F deps (`three`, `@react-three/fiber`,
  `@react-three/drei`, `satellite.js`).

### Phase 1 — Visual reference pass (Stitch)
Stitch generates UI screens, not WebGL — its only job here is a visual
reference for the dashed-line/marker look, plus a mockup demonstrating the
in-front/behind behavior with two demo elements (one referenced, one not),
in both light and dark mode.

### Phase 2 — Data layer: TLE ingestion
- Server route that fetches a curated CelesTrak category — not all ~20k
  tracked objects. Start with "active satellites," "space stations," and
  "visual" (brightest/most recognizable), a few hundred objects total.
- Cache the fetched TLE text with a revalidation window of several hours.

### Phase 3 — Data layer: observer position + visibility filter
- Resolve visitor lat/lon via IP geolocation, cached per session, with a
  hard fallback if it fails — must never block the background.
- For each cached TLE, propagate current position with `satellite.js` to
  get azimuth, elevation, range relative to the observer.
- Filter to elevation above a threshold (e.g. 10–20°), sort by elevation,
  take the top 3–5.
- Recompute on an interval (e.g. every 10–30s) — satellites move fast
  enough that a single snapshot per page load looks static and wrong.

### Phase 4 — Path sampling + az/el → screen-space projection
- For each selected satellite, don't just compute its current position —
  sample several time points around "now" (e.g. a few minutes before and
  after) with `satellite.js` to build a short polyline of az/el points.
  This polyline is what gets rendered as the dashed curved path; the
  "now" sample is where the live marker sits.
- Map azimuth (0–360°) to horizontal screen position (wraparound), and
  elevation (0–90°) to vertical position + a scale/parallax factor.
- Interpolate (lerp) the marker's position each animation frame between
  position updates so its motion along the path reads as smooth travel,
  not a snapping dot.

### Phase 5 — Rendering: dashed path + live marker
- Render each satellite's sampled path as a dotted/dashed curved line, and
  the live marker as a small point traveling along it in real time —
  colored via the current theme (white on black in dark mode, black on
  white in light mode), no other colors.
- The component paints its own solid full-viewport background fill (black
  in dark mode, white in light mode) — it functions as the actual page
  background, not a transparent overlay compositing onto an existing one.

### Phase 5.5 — Selective front/behind layering by element ID
- Component accepts a config (e.g. an `overlayIds: string[]` prop) listing
  DOM element IDs the line/marker should render in front of.
- Implementation: run two synchronized copies of the same
  line/marker render. One at the lowest stacking order (always behind all
  page content — this is the default for anything not in `overlayIds`).
  A second copy at the highest stacking order, clipped via a CSS/SVG
  `clip-path` built from the current bounding boxes (`getBoundingClientRect`)
  of only the referenced element IDs, recomputed via `ResizeObserver` and
  on scroll — so that copy is only visible where those specific elements
  are, creating the appearance of passing in front of just them.
- The solid black/white background fill is never part of this — it stays
  in the bottom layer only, always.

### Phase 6 — Fallback logic
- Wire in a synthetic random-path generator (same dashed-line/marker visual
  and same selective-layering behavior) for when TLE fetch fails,
  geolocation fails and the fallback also yields nothing above the
  elevation cutoff, or before the first real data resolves on page load.

### Phase 7 — Package as a shadcn registry component
- Author a `registry.json` following shadcn's registry schema: name,
  `registry:component` type, file list, and `dependencies` (`three`,
  `@react-three/fiber`, `@react-three/drei`, `satellite.js`).
- Host it somewhere reachable so it's installable via
  `npx shadcn add <your-url>/satellite-bg.json`.

### Phase 8 — Testing & hardening
- Test with geolocation disabled/blocked to confirm the fallback triggers.
- Test both themes.
- Test the ID-referencing behavior specifically: two placeholder elements,
  one ID referenced, one not — confirm the line visibly passes in front of
  one and behind the other.
- Test scroll/resize — confirm the clip mask for referenced elements
  tracks their position instead of drifting.
- Check frame budget on a low-end/throttled device.

---

## 3. Skills/knowledge checklist

- **Three.js + React Three Fiber basics** — scenes, materials, `useFrame`
  for per-frame updates, drawing curved lines (`@react-three/drei`'s Line
  helper or a custom curve).
- **Orbital mechanics vocabulary, not the math itself** — TLE, azimuth,
  elevation, range, and what `satellite.js`'s functions expect/return.
- **Next.js Route Handlers + caching/revalidation** — TLE fetch endpoint
  and IP-geolocation lookup.
- **shadcn registry authoring** — the `registry.json` schema and the
  `shadcn build`/`shadcn add` flow.
- **next-themes** — reading current theme to drive black/white swap.
- **CSS/SVG `clip-path` basics** — needed specifically for Phase 5.5's
  selective front/behind layering; this is the one genuinely new technique
  in this build.

---

## 4. Working with Command Code effectively

Feed this plan in as a spec file in the repo, then work phase by phase
rather than asking for the whole thing at once:

1. Point Command Code at this file and ask it to implement one phase at a time.
2. Use Plan mode first on each phase so you can review the intended
   approach before it touches files, then switch to Build mode.
3. Test after each phase before moving to the next — Phase 5.5 especially
   is much easier to debug in isolation than after everything else is
   already in the mix.
4. Implement Phase 6 (fallback) early — gives you a visually working
   component to test rendering/theming/layering against without waiting
   on live data.

---

## 5. Key risks & how the plan already covers them

| Risk | Mitigation already in the plan |
|---|---|
| CelesTrak/N2YO unreachable | TLEs cached for hours; N2YO isn't load-bearing at all |
| No satellites above elevation cutoff | Synthetic fallback path (Phase 6) |
| Geolocation blocked/fails | Fixed fallback coordinate, non-blocking |
| Choppy motion from infrequent position updates | Client-side interpolation between updates (Phase 4) |
| Clip mask drifting from its element on scroll/resize | Recomputed via `ResizeObserver` + scroll listener (Phase 5.5) |
| Rendering cost | Thin lines + one marker per satellite, not full meshes; capped at 3–5 objects |
