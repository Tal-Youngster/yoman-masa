import { useMemo } from 'react';

export interface DateScrubberProps {
  /** All path dates (duplicates allowed; deduped internally). */
  dates: readonly string[];
  /** Currently selected upper-bound date (must be one of `dates`, or '' for "all"). */
  value: string;
  onChange: (date: string) => void;
}

/**
 * Slider over the unique sorted dates in the path. Filtering happens in
 * `<PathMapRoute>` from the slider's output — `computePath` stays
 * deterministic (ADR-0015).
 */
export function DateScrubber({ dates, value, onChange }: DateScrubberProps): React.JSX.Element | null {
  const uniqueDates = useMemo(() => {
    const set = new Set(dates);
    return [...set].sort();
  }, [dates]);

  if (uniqueDates.length <= 1) return null;

  const max = uniqueDates.length - 1;
  // `indexOf` returns -1 when `value` isn't in the list (e.g., between renders
  // while accommodations are still loading); fall back to the last index.
  const lookup = uniqueDates.indexOf(value);
  const currentIndex = lookup === -1 ? max : lookup;

  return (
    <div className="flex flex-col gap-1 px-2">
      <input
        type="range"
        min={0}
        max={max}
        value={currentIndex}
        onChange={(e) => {
          const idx = Number(e.target.value);
          const d = uniqueDates[idx];
          if (d) onChange(d);
        }}
        className="w-full accent-blue-500"
        aria-label="Filter path by date"
      />
      <div className="flex justify-between text-xs text-on-surface-variant">
        <span>{uniqueDates[0]}</span>
        <span className="font-medium text-on-surface">{uniqueDates[currentIndex]}</span>
        <span>{uniqueDates[max]}</span>
      </div>
    </div>
  );
}
