/** Pure sorting helpers, deliberately independent of TidaLuna and the DOM. */
export type DurationDirection = "shortest" | "longest";

export interface DurationRow {
  id: string;
  originalIndex: number;
  duration?: number;
}

/**
 * Sort known durations numerically. Missing/invalid durations go last, regardless
 * of direction; ties retain the original display order.
 */
export function sortDurationRows<T extends DurationRow>(
  rows: readonly T[],
  direction: DurationDirection,
): T[] {
  return [...rows].sort((a, b) => {
    const da = typeof a.duration === "number" && Number.isFinite(a.duration) && a.duration >= 0 ? a.duration : undefined;
    const db = typeof b.duration === "number" && Number.isFinite(b.duration) && b.duration >= 0 ? b.duration : undefined;
    if (da === undefined && db === undefined) return a.originalIndex - b.originalIndex;
    if (da === undefined) return 1;
    if (db === undefined) return -1;
    const diff = direction === "shortest" ? da - db : db - da;
    return diff || a.originalIndex - b.originalIndex;
  });
}

/** Human-readable hours/minutes for optional diagnostics. */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const hours = Math.floor(mins / 60);
  return hours ? `${hours}h ${mins % 60}m` : `${mins}m`;
}
