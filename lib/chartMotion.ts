import { useEffect, useMemo, useRef, useState } from 'react';

export type XYPoint = { x: number; y: number };
export type TimedValue = { t: number; v: number };

const DEFAULT_DURATION_MS = 700;

function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 16) as unknown as number;
}

function cancelFrame(handle: number) {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function seriesKey(values: number[]) {
  return values.join(',');
}

function sampleKey(values: TimedValue[]) {
  return values.map((sample) => `${sample.t}:${sample.v}`).join('|');
}

function nullableSeriesKey(values: (number | null)[]) {
  return values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : 'null')).join(',');
}

/** Samples a series at `length` evenly spaced positions, interpolating between them. */
export function resampleSeries(values: number[], length: number): number[] {
  if (length <= 0) return [];
  if (values.length === 0) return Array.from({ length }, () => 0);
  if (values.length === length) return values;
  return Array.from({ length }, (_, index) => {
    const at = (index / Math.max(1, length - 1)) * (values.length - 1);
    const low = Math.floor(at);
    const high = Math.min(values.length - 1, low + 1);
    return values[low] + (values[high] - values[low]) * (at - low);
  });
}

function resampleTimedValues<T extends TimedValue>(from: T[], target: T[]): T[] {
  const values = resampleSeries(
    from.map((sample) => sample.v),
    target.length,
  );
  return target.map((sample, index) => ({ ...sample, v: values[index] }));
}

/**
 * Eases numeric chart series toward their incoming target instead of snapping
 * from packet to packet.
 */
export function useSmoothSeries(target: number[], duration = DEFAULT_DURATION_MS): number[] {
  const [shown, setShown] = useState<number[]>(target);
  const fromRef = useRef<number[]>(target);
  const frameRef = useRef<number | null>(null);
  const key = useMemo(() => seriesKey(target), [target]);

  useEffect(() => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    if (target.length === 0 || duration <= 0 || fromRef.current.length === 0) {
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    const to = target;
    const from = resampleSeries(fromRef.current, to.length);
    const start = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = easeOutCubic(t);
      const next = to.map((value, index) => from[index] + (value - from[index]) * eased);
      setShown(next);
      fromRef.current = next;
      if (t < 1) frameRef.current = scheduleFrame(tick);
    };

    frameRef.current = scheduleFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      frameRef.current = null;
    };
    // `key` stands in for the array identity so a re-render with the same
    // numbers does not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return shown;
}

/** Smooths several series together without calling hooks inside a render loop. */
export function useSmoothSeriesGroup(target: number[][], duration = DEFAULT_DURATION_MS): number[][] {
  const [shown, setShown] = useState<number[][]>(target);
  const fromRef = useRef<number[][]>(target);
  const frameRef = useRef<number | null>(null);
  const key = useMemo(() => target.map(seriesKey).join('|'), [target]);

  useEffect(() => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    if (target.length === 0 || duration <= 0 || fromRef.current.length === 0) {
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    const from = target.map((series, index) => resampleSeries(fromRef.current[index] ?? [], series.length));
    const start = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = easeOutCubic(t);
      const next = target.map((series, seriesIndex) =>
        series.map((value, index) => (from[seriesIndex]?.[index] ?? value) + (value - (from[seriesIndex]?.[index] ?? value)) * eased),
      );
      setShown(next);
      fromRef.current = next;
      if (t < 1) frameRef.current = scheduleFrame(tick);
    };

    frameRef.current = scheduleFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      frameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return shown;
}

/** Eases finite samples while preserving null gaps as gaps. */
export function useSmoothNullableSeries(target: (number | null)[], duration = DEFAULT_DURATION_MS): (number | null)[] {
  const [shown, setShown] = useState<(number | null)[]>(target);
  const fromRef = useRef<(number | null)[]>(target);
  const frameRef = useRef<number | null>(null);
  const key = useMemo(() => nullableSeriesKey(target), [target]);

  useEffect(() => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    if (target.length === 0 || duration <= 0 || fromRef.current.length === 0) {
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    const from = resampleSeries(
      fromRef.current.map((value, index) => (typeof value === 'number' && Number.isFinite(value) ? value : (target[index] ?? 0))),
      target.length,
    );
    const start = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = easeOutCubic(t);
      const next = target.map((value, index) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return from[index] + (value - from[index]) * eased;
      });
      setShown(next);
      fromRef.current = next;
      if (t < 1) frameRef.current = scheduleFrame(tick);
    };

    frameRef.current = scheduleFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      frameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return shown;
}

/** Smooths timed samples for rendering while preserving target timestamps. */
export function useSmoothTimedValues<T extends TimedValue>(target: T[], duration = DEFAULT_DURATION_MS): T[] {
  const [shown, setShown] = useState<T[]>(target);
  const fromRef = useRef<T[]>(target);
  const frameRef = useRef<number | null>(null);
  const key = useMemo(() => sampleKey(target), [target]);

  useEffect(() => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    if (target.length === 0 || duration <= 0 || fromRef.current.length === 0) {
      fromRef.current = target;
      setShown(target);
      return undefined;
    }

    const from = resampleTimedValues(fromRef.current, target);
    const start = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = easeOutCubic(t);
      const next = target.map((sample, index) => ({
        ...sample,
        v: from[index].v + (sample.v - from[index].v) * eased,
      }));
      setShown(next);
      fromRef.current = next;
      if (t < 1) frameRef.current = scheduleFrame(tick);
    };

    frameRef.current = scheduleFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      frameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return shown;
}

export function linePath(points: XYPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

/** Catmull-Rom through the samples, emitted as cubic beziers. */
export function splinePath(points: XYPoint[], tension = 0.5): string {
  if (points.length === 0) return '';
  if (points.length < 3) return linePath(points);
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}
