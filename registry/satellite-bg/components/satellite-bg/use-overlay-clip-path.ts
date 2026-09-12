"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function buildClipPath(elements: HTMLElement[]): string | null {
  const segments: string[] = [];
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const left = rect.left;
    const top = rect.top;
    const right = rect.right;
    const bottom = rect.bottom;
    segments.push(`M ${left} ${top} H ${right} V ${bottom} H ${left} Z`);
  }
  if (segments.length === 0) return null;
  return `path(evenodd, "${segments.join(" ")}")`;
}

export function useOverlayClipPath(overlayIds?: string[]): {
  clipPath: string | null;
} {
  const [clipPath, setClipPath] = useState<string | null>(null);
  const elementsRef = useRef<HTMLElement[]>([]);
  const frameRef = useRef<number | null>(null);

  const scheduleRecompute = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setClipPath(buildClipPath(elementsRef.current));
    });
  }, []);

  const cancelPending = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!overlayIds || overlayIds.length === 0) {
      cancelPending();
      elementsRef.current = [];
      setClipPath(null);
      return;
    }

    let resizeObserver: ResizeObserver | null = null;

    const resolveElements = () => {
      const elements = overlayIds
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null);
      const changed =
        elements.length !== elementsRef.current.length ||
        elements.some((element, index) => element !== elementsRef.current[index]);
      if (!changed) return;

      elementsRef.current = elements;
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => scheduleRecompute());
      for (const element of elements) resizeObserver.observe(element);
      scheduleRecompute();
    };

    resolveElements();

    const mutationObserver = new MutationObserver(() => resolveElements());
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const handleScroll = () => scheduleRecompute();
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("resize", handleScroll);
      cancelPending();
      elementsRef.current = [];
      setClipPath(null);
    };
  }, [overlayIds, scheduleRecompute, cancelPending]);

  return { clipPath };
}
