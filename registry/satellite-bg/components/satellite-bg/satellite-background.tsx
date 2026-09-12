"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { generateProceduralPath, type ProceduralPath } from "./procedural-path";
import { useSatellitePaths } from "./use-satellite-paths";
import { useOverlayClipPath } from "./use-overlay-clip-path";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const BASE_STROKE_WIDTH = 1.5;
const BASE_DASH = 8;
const BASE_GAP = 8;
const BASE_MARKER_RADIUS = 5;
const GLOW_RADIUS_MULTIPLIER = 2.1;
const GLOW_OPACITY = 0.22;
const GLOW_BLUR_STD_DEVIATION = 4;
const LABEL_FONT_SIZE = 10;
const LABEL_OPACITY = 0.45;
const LABEL_OFFSET_X = 8;
const LABEL_OFFSET_Y = 3;
const LABEL_FADE_DURATION_MS = 600;
const INITIAL_LABEL_DISPLAY_MS = 5000;

/** Desktop = precise pointer with real hover support; mobile/tablet otherwise. */
function useIsFineHoverPointer(): boolean {
  const [isFineHoverPointer, setIsFineHoverPointer] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setIsFineHoverPointer(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isFineHoverPointer;
}

interface Viewport {
  width: number;
  height: number;
}

interface SatelliteVisual {
  name: string;
  path: ProceduralPath;
  dashArray: string;
  radius: number;
}

interface PathAssignment {
  index: number;
  count: number;
}

function buildProceduralPaths(
  assignments: Map<string, PathAssignment>,
  viewport: Viewport,
): Map<string, ProceduralPath> {
  const next = new Map<string, ProceduralPath>();
  assignments.forEach((assignment, name) => {
    // Same seed + assignment -> same relative shape; re-deriving on every
    // viewport change (not just first sighting) keeps both endpoints
    // pinned to the current border instead of drifting off it after a
    // resize, while the (index, count) pairing stays fixed per satellite
    // so an already-animating path never reshapes just because the API's
    // ordering shifted between refreshes.
    next.set(
      name,
      generateProceduralPath({
        seed: name,
        index: assignment.index,
        count: assignment.count,
        width: viewport.width,
        height: viewport.height,
      }),
    );
  });
  return next;
}

function proceduralPathsEqual(a: Map<string, ProceduralPath>, b: Map<string, ProceduralPath>): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((path, name) => {
    if (b.get(name)?.d !== path.d) equal = false;
  });
  return equal;
}

function buildVisuals(paths: Map<string, ProceduralPath>): SatelliteVisual[] {
  const visuals: SatelliteVisual[] = [];
  let cursor = 0;
  paths.forEach((path, name) => {
    const variant = cursor % 3;
    visuals.push({
      name,
      path,
      dashArray: `${BASE_DASH + variant * 2} ${BASE_GAP + variant * 2}`,
      radius: BASE_MARKER_RADIUS + variant,
    });
    cursor += 1;
  });
  return visuals;
}

function SatelliteLayer({
  visuals,
  viewport,
  color,
  backgroundColor,
  clipPath,
  zIndex,
  layerId,
  registerPath,
  registerMarker,
  registerGlow,
  registerLabel,
  isLabelVisible,
  onMarkerEnter,
  onMarkerLeave,
  onMarkerClick,
}: {
  visuals: SatelliteVisual[];
  viewport: Viewport;
  color: string;
  backgroundColor?: string;
  clipPath?: string | null;
  zIndex: number;
  layerId: string;
  registerPath?: (name: string, node: SVGPathElement | null) => void;
  registerMarker: (name: string, node: SVGCircleElement | null) => void;
  registerGlow?: (name: string, node: SVGCircleElement | null) => void;
  registerLabel?: (name: string, node: SVGTextElement | null) => void;
  isLabelVisible: (name: string) => boolean;
  onMarkerEnter: (name: string) => void;
  onMarkerLeave: (name: string) => void;
  onMarkerClick: (name: string) => void;
}) {
  const glowFilterId = `satellite-glow-${layerId}`;
  return (
    <svg
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        pointerEvents: "none",
        backgroundColor,
        clipPath: clipPath ?? undefined,
      }}
    >
      <defs>
        <filter id={glowFilterId} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation={GLOW_BLUR_STD_DEVIATION} />
        </filter>
      </defs>
      {visuals.map((visual) => (
        <g key={visual.name} pointerEvents="none">
          <path
            ref={(node) => registerPath?.(visual.name, node)}
            d={visual.path.d}
            fill="none"
            stroke={color}
            strokeWidth={BASE_STROKE_WIDTH}
            strokeDasharray={visual.dashArray}
          />
          <circle
            ref={(node) => registerGlow?.(visual.name, node)}
            r={visual.radius * GLOW_RADIUS_MULTIPLIER}
            fill={color}
            opacity={GLOW_OPACITY}
            filter={`url(#${glowFilterId})`}
            style={{ pointerEvents: "auto", cursor: "pointer" }}
            onMouseEnter={() => onMarkerEnter(visual.name)}
            onMouseLeave={() => onMarkerLeave(visual.name)}
            onClick={() => onMarkerClick(visual.name)}
          />
          <circle
            ref={(node) => registerMarker(visual.name, node)}
            r={visual.radius}
            fill={color}
            style={{ pointerEvents: "auto", cursor: "pointer" }}
            onMouseEnter={() => onMarkerEnter(visual.name)}
            onMouseLeave={() => onMarkerLeave(visual.name)}
            onClick={() => onMarkerClick(visual.name)}
          />
          <text
            ref={(node) => registerLabel?.(visual.name, node)}
            fontSize={LABEL_FONT_SIZE}
            fill={color}
            opacity={isLabelVisible(visual.name) ? LABEL_OPACITY : 0}
            dominantBaseline="middle"
            style={{ transition: `opacity ${LABEL_FADE_DURATION_MS}ms ease` }}
          >
            {visual.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function SatelliteBackground({
  overlayIds,
}: {
  overlayIds?: string[];
} = {}) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const { resolvedTheme } = useTheme();
  const backgroundColor = resolvedTheme === "light" ? WHITE : BLACK;
  const foregroundColor = resolvedTheme === "light" ? BLACK : WHITE;

  const { satellites, getProgress } = useSatellitePaths();
  const { clipPath } = useOverlayClipPath(overlayIds);
  const showOverlay = Boolean(overlayIds?.length) && clipPath !== null;

  const isFineHoverPointer = useIsFineHoverPointer();
  const [initialLabelPhase, setInitialLabelPhase] = useState(true);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const initialLabelTimerStartedRef = useRef(false);
  const initialLabelTimerIdRef = useRef<number | null>(null);
  const pathname = usePathname();

  // Clear any pinned/hovered label whenever the user navigates elsewhere.
  useEffect(() => {
    setHoveredName(null);
    setSelectedName(null);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (initialLabelTimerIdRef.current !== null) window.clearTimeout(initialLabelTimerIdRef.current);
    };
  }, []);

  const handleMarkerEnter = useCallback(
    (name: string) => {
      if (isFineHoverPointer) setHoveredName(name);
    },
    [isFineHoverPointer],
  );
  const handleMarkerLeave = useCallback(
    (name: string) => {
      if (!isFineHoverPointer) return;
      setHoveredName((current) => (current === name ? null : current));
    },
    [isFineHoverPointer],
  );
  const handleMarkerClick = useCallback(
    (name: string) => {
      if (isFineHoverPointer) return;
      setSelectedName((current) => (current === name ? null : name));
    },
    [isFineHoverPointer],
  );
  const isLabelVisible = useCallback(
    (name: string) => {
      if (initialLabelPhase) return true;
      return isFineHoverPointer ? hoveredName === name : selectedName === name;
    },
    [initialLabelPhase, isFineHoverPointer, hoveredName, selectedName],
  );

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const assignmentsRef = useRef(new Map<string, PathAssignment>());
  const [proceduralPaths, setProceduralPaths] = useState<Map<string, ProceduralPath>>(new Map());
  useEffect(() => {
    // Keep each satellite's (index, count) pairing stable once assigned, so
    // its path never reshapes mid-lap just because the visible set's
    // ordering shifted between refreshes.
    const names = new Set(satellites.map((satellite) => satellite.name));
    assignmentsRef.current.forEach((_assignment, name) => {
      if (!names.has(name)) assignmentsRef.current.delete(name);
    });
    const count = satellites.length;
    satellites.forEach((satellite, index) => {
      if (!assignmentsRef.current.has(satellite.name)) {
        assignmentsRef.current.set(satellite.name, { index, count });
      }
    });

    if (!viewport) return;
    setProceduralPaths((previous) => {
      const next = buildProceduralPaths(assignmentsRef.current, viewport);
      return proceduralPathsEqual(previous, next) ? previous : next;
    });
  }, [satellites, viewport]);

  const visuals = useMemo(() => buildVisuals(proceduralPaths), [proceduralPaths]);

  // Show every satellite's name for a fixed window the first time paths
  // actually appear on screen, then hand control over to hover/tap.
  useEffect(() => {
    if (initialLabelTimerStartedRef.current) return;
    if (visuals.length === 0) return;
    initialLabelTimerStartedRef.current = true;
    initialLabelTimerIdRef.current = window.setTimeout(() => {
      setInitialLabelPhase(false);
    }, INITIAL_LABEL_DISPLAY_MS);
  }, [visuals]);

  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const backMarkerRefs = useRef(new Map<string, SVGCircleElement>());
  const frontMarkerRefs = useRef(new Map<string, SVGCircleElement>());
  const backGlowRefs = useRef(new Map<string, SVGCircleElement>());
  const frontGlowRefs = useRef(new Map<string, SVGCircleElement>());
  const backLabelRefs = useRef(new Map<string, SVGTextElement>());
  const frontLabelRefs = useRef(new Map<string, SVGTextElement>());
  const lengthCacheRef = useRef(new Map<string, number>());
  const visualsRef = useRef(new Map<string, SatelliteVisual>());

  useEffect(() => {
    lengthCacheRef.current.clear();
  }, [proceduralPaths]);

  useEffect(() => {
    const next = new Map<string, SatelliteVisual>();
    visuals.forEach((visual) => next.set(visual.name, visual));
    visualsRef.current = next;
  }, [visuals]);

  // A single rAF loop drives both layers' markers from the same computed
  // point each frame, so the front (clipped) copy never drifts out of sync
  // with the back copy. Position comes from live time interpolation via
  // SVGGeometryElement.getPointAtLength, not a declarative animateMotion
  // loop, since progress must reflect each satellite's own real-pass-
  // derived duration rather than a fixed animation length.
  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const now = Date.now();
      pathRefs.current.forEach((pathElement, name) => {
        let length = lengthCacheRef.current.get(name);
        if (length === undefined) {
          length = pathElement.getTotalLength();
          lengthCacheRef.current.set(name, length);
        }

        const progress = getProgress(name, now);
        const point = pathElement.getPointAtLength(progress * length);

        const backMarker = backMarkerRefs.current.get(name);
        if (backMarker) {
          backMarker.setAttribute("cx", String(point.x));
          backMarker.setAttribute("cy", String(point.y));
        }
        const frontMarker = frontMarkerRefs.current.get(name);
        if (frontMarker) {
          frontMarker.setAttribute("cx", String(point.x));
          frontMarker.setAttribute("cy", String(point.y));
        }

        const backGlow = backGlowRefs.current.get(name);
        if (backGlow) {
          backGlow.setAttribute("cx", String(point.x));
          backGlow.setAttribute("cy", String(point.y));
        }
        const frontGlow = frontGlowRefs.current.get(name);
        if (frontGlow) {
          frontGlow.setAttribute("cx", String(point.x));
          frontGlow.setAttribute("cy", String(point.y));
        }

        const radius = visualsRef.current.get(name)?.radius ?? BASE_MARKER_RADIUS;
        const labelX = point.x + radius + LABEL_OFFSET_X;
        const labelY = point.y + LABEL_OFFSET_Y;
        // Position via `transform` rather than the `x`/`y` attributes:
        // browsers snap text `x`/`y` to whole pixels for crisper glyph
        // rendering, which makes the label stutter one pixel at a time
        // even while the marker (positioned via cx/cy) glides smoothly.
        // Transforms aren't snapped the same way, so this keeps the label
        // moving in lockstep with the dot.
        const labelTransform = `translate(${labelX}, ${labelY})`;
        const backLabel = backLabelRefs.current.get(name);
        if (backLabel) {
          backLabel.setAttribute("transform", labelTransform);
        }
        const frontLabel = frontLabelRefs.current.get(name);
        if (frontLabel) {
          frontLabel.setAttribute("transform", labelTransform);
        }
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getProgress]);

  if (!viewport) return null;

  return (
    <>
      <SatelliteLayer
        visuals={visuals}
        viewport={viewport}
        color={foregroundColor}
        backgroundColor={backgroundColor}
        zIndex={0}
        layerId="back"
        registerPath={(name, node) => {
          if (node) pathRefs.current.set(name, node);
          else pathRefs.current.delete(name);
        }}
        registerMarker={(name, node) => {
          if (node) backMarkerRefs.current.set(name, node);
          else backMarkerRefs.current.delete(name);
        }}
        registerGlow={(name, node) => {
          if (node) backGlowRefs.current.set(name, node);
          else backGlowRefs.current.delete(name);
        }}
        registerLabel={(name, node) => {
          if (node) backLabelRefs.current.set(name, node);
          else backLabelRefs.current.delete(name);
        }}
        isLabelVisible={isLabelVisible}
        onMarkerEnter={handleMarkerEnter}
        onMarkerLeave={handleMarkerLeave}
        onMarkerClick={handleMarkerClick}
      />
      {showOverlay && (
        <SatelliteLayer
          visuals={visuals}
          viewport={viewport}
          color={foregroundColor}
          clipPath={clipPath}
          zIndex={9999}
          layerId="front"
          registerMarker={(name, node) => {
            if (node) frontMarkerRefs.current.set(name, node);
            else frontMarkerRefs.current.delete(name);
          }}
          registerGlow={(name, node) => {
            if (node) frontGlowRefs.current.set(name, node);
            else frontGlowRefs.current.delete(name);
          }}
          registerLabel={(name, node) => {
            if (node) frontLabelRefs.current.set(name, node);
            else frontLabelRefs.current.delete(name);
          }}
          isLabelVisible={isLabelVisible}
          onMarkerEnter={handleMarkerEnter}
          onMarkerLeave={handleMarkerLeave}
          onMarkerClick={handleMarkerClick}
        />
      )}
    </>
  );
}
