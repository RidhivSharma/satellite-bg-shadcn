/**
 * Procedural, full-viewport orbital path generator.
 *
 * This module is intentionally decoupled from any real satellite telemetry
 * (no azimuth/elevation/range inputs). It only needs a stable identity
 * (`seed`), where that identity sits among its concurrent peers
 * (`index`/`count`), and the current viewport size. That makes it reusable
 * for two callers with very different data sources:
 *
 *  - The live renderer: real TLE-derived visibility data picks *which*
 *    satellites are shown and *how long* each stays on screen, but the
 *    on-screen curve shape itself comes from here.
 *  - The offline/no-data fallback can call this with synthetic seeds (e.g.
 *    "FALLBACK-1") and get the same
 *    visually-equivalent full-screen, non-coinciding curves with zero
 *    dependency on live data.
 *
 * Paths are generated directly in real viewport pixels: both endpoints are
 * anchored exactly on the viewport's border (never beyond it), so the
 * entire curve is always on-screen. That matters because the live marker
 * travels linearly along the curve's full length over real time - if large
 * stretches of the curve sat off-screen (as an overshooting curve would),
 * the marker would spend most of its lap invisible before ever entering
 * the viewport. Passing the current `width`/`height` on resize reflows the
 * same deterministic shape (same edge choices/bow proportions) to the new
 * size rather than reseeding, so it never visibly jumps.
 */

export interface ProceduralPathOptions {
  /** Stable identity for this path, e.g. a satellite name. Determines its shape deterministically. */
  seed: string;
  /** This path's position among its concurrent peers (0-based). Used to spread paths apart. */
  index?: number;
  /** Total number of concurrent paths. Used together with `index` to spread paths apart. */
  count?: number;
  /** Current viewport (or logical canvas) width in the same units the consumer renders in. */
  width: number;
  /** Current viewport (or logical canvas) height in the same units the consumer renders in. */
  height: number;
}

export interface ProceduralPath {
  /** A DOM-id-safe identifier derived from the seed, for callers that want to tag elements. */
  id: string;
  /** SVG `d` attribute: a single cubic-bezier curve with both endpoints exactly on the viewport border. */
  d: string;
}

/** FNV-1a string hash, deterministic across runs/platforms. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small, fast, deterministic PRNG (mulberry32) seeded from a 32-bit int. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sanitizeId(seed: string, index: number): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `sat-path-${slug || "satellite"}-${index}`;
}

/** A point at parameter `u` walking clockwise around the rectangle's perimeter, `u` in [0, 4). */
function perimeterPoint(u: number, width: number, height: number): { x: number; y: number } {
  const wrapped = ((u % 4) + 4) % 4;
  const edge = Math.floor(wrapped);
  const t = wrapped - edge;
  switch (edge) {
    case 0: // top: left -> right
      return { x: t * width, y: 0 };
    case 1: // right: top -> bottom
      return { x: width, y: t * height };
    case 2: // bottom: right -> left
      return { x: (1 - t) * width, y: height };
    default: // left: bottom -> top
      return { x: 0, y: (1 - t) * height };
  }
}

/**
 * Generate a smooth cubic-bezier curve whose two endpoints sit exactly on
 * the viewport's border (never beyond it), so the whole curve - and the
 * marker traveling its full length - stays on-screen. Concurrent paths
 * (same `count`, different `index`) start from evenly-spaced, jittered
 * points around the perimeter so they never coincide, though they may
 * cross.
 */
export function generateProceduralPath(options: ProceduralPathOptions): ProceduralPath {
  const { seed, index = 0, count = 1, width, height } = options;
  const random = createRandom(hashString(`${seed}::${index}::${count}`));

  // Spread starting points evenly around the full perimeter (4 "quarters":
  // top/right/bottom/left), with jitter so no two concurrent paths coincide.
  const spacing = 4 / Math.max(count, 1);
  const startU = spacing * index + random() * spacing * 0.7;
  // Send the end point a substantial distance around the perimeter (never
  // just a nearby point on the same edge) so each path visibly sweeps
  // across the screen rather than clipping a small corner.
  const travel = 1.35 + random() * 1.3; // between ~1.35 and ~2.65 quarters away
  const endU = startU + travel * (random() < 0.5 ? 1 : -1);

  const start = perimeterPoint(startU, width, height);
  const end = perimeterPoint(endU, width, height);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  // Perpendicular unit vector to the start->end chord, for bowing the curve.
  const perpX = -dy / length;
  const perpY = dx / length;

  const sizeReference = Math.min(width, height);
  const bowSign = random() < 0.5 ? -1 : 1;
  const bow1 = sizeReference * (0.1 + random() * 0.16) * bowSign;
  const bow2 = sizeReference * (0.1 + random() * 0.16) * (random() < 0.35 ? -bowSign : bowSign);

  const c1x = start.x + dx * 0.32 + perpX * bow1;
  const c1y = start.y + dy * 0.32 + perpY * bow1;
  const c2x = start.x + dx * 0.68 + perpX * bow2;
  const c2y = start.y + dy * 0.68 + perpY * bow2;

  const round = (value: number) => Math.round(value * 10) / 10;
  const d =
    `M ${round(start.x)} ${round(start.y)} ` +
    `C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(end.x)} ${round(end.y)}`;

  return {
    id: sanitizeId(seed, index),
    d,
  };
}
