"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Draw a chart at its real on-screen width, so text and strokes keep their size on a phone
 * instead of being squashed by a stretched viewBox. Falls back to `fallback` before measuring.
 */
export function useSvgWidth(fallback: number): [(el: SVGSVGElement | null) => void, number] {
  const [el, setEl] = useState<SVGSVGElement | null>(null);
  const [w, setW] = useState(fallback);
  const ref = useCallback((node: SVGSVGElement | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(Math.max(280, Math.round(cw)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, w];
}
