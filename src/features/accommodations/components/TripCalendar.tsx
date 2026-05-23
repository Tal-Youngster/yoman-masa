import { useMemo } from 'react';
import { Card } from '@/ui/components';
import { computeMissingNights, groupMissingGaps } from '@/features/missing-nights/compute';
import { dateRangeArray } from '@/domain/dates';
import type { Trip } from '@/domain/trip';
import type { Accommodation } from '@/domain/accommodation';

export interface TripCalendarProps {
  trip: Trip;
  accommodations: Accommodation[];
  onAccommodationClick?: (acc: Accommodation) => void;
  onMissingClick?: (date: string) => void;
}

type Segment = {
  id: string;
  isMissing: boolean;
  start: string;
  end: string;
  acc?: Accommodation;
};

export function TripCalendar({ trip, accommodations, onAccommodationClick, onMissingClick }: TripCalendarProps): React.JSX.Element {
  const { allDates, segments, dateToIndex } = useMemo(() => {
    // allDates is the actual days from start to end (inclusive)
    const dates = dateRangeArray(trip.start_date, trip.end_date);
    
    const relevant = accommodations.filter(a => a.trip_id === trip.id && a.status === 'booked');
    
    const { missing } = computeMissingNights(trip, accommodations);
    const gaps = groupMissingGaps(missing);
    
    const segs: Segment[] = [];
    
    for (const acc of relevant) {
      segs.push({ id: acc.id, isMissing: false, start: acc.checkin, end: acc.checkout, acc });
    }
    
    for (const gap of gaps) {
      segs.push({ id: `gap-${gap.start}`, isMissing: true, start: gap.start, end: gap.end_exclusive });
    }
    
    const map = new Map<string, number>();
    dates.forEach((d, i) => map.set(d, i));

    return { allDates: dates, segments: segs, dateToIndex: map };
  }, [trip, accommodations]);

  return (
    <Card 
      title="Trip Calendar" 
      description="A visual overview of your booked vs. missing nights."
      className="w-full min-w-0"
    >
      <div className="flex overflow-x-auto mt-4 snap-x min-w-0 w-full rounded-lg border border-outline-variant bg-surface">
        <div className="relative flex">
          {allDates.map((date) => {
            const d = new Date(date);
            const dayNum = d.getUTCDate();
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
            const monthName = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

            return (
              <div
                key={date}
                className="flex-none flex flex-col items-center w-16 pt-3 h-[5.5rem] snap-start border-r border-outline-variant last:border-r-0"
              >
                <div className="flex flex-col items-center px-1 text-on-surface">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                    {monthName}
                  </span>
                  <span className="text-lg font-bold leading-none mt-1">
                    {dayNum}
                  </span>
                  <span className="text-[10px] font-medium opacity-60 mt-1">
                    {dayName}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="absolute left-0 bottom-1 right-0 h-2 pointer-events-none">
            {segments.map((seg) => {
              let startIdx = dateToIndex.get(seg.start);
              let endIdx = dateToIndex.get(seg.end);
              
              if (startIdx === undefined) startIdx = seg.start < trip.start_date ? 0 : allDates.length - 1;
              if (endIdx === undefined) endIdx = seg.end > trip.end_date ? allDates.length - 1 : 0;
              
              const clampedStart = Math.max(0, startIdx);
              const clampedEnd = Math.min(allDates.length - 1, endIdx);
              if (clampedStart >= clampedEnd) return null;
              
              const left = clampedStart * 64 + 32;
              const width = (clampedEnd - clampedStart) * 64;

              return (
                <button
                  key={seg.id}
                  type="button"
                  title={seg.isMissing ? 'Missing night' : seg.acc?.name}
                  onClick={() => {
                    if (seg.isMissing) {
                      onMissingClick?.(seg.start);
                    } else if (seg.acc) {
                      onAccommodationClick?.(seg.acc);
                    }
                  }}
                  className={`absolute top-1/2 -translate-y-1/2 h-2 pointer-events-auto rounded-full hover:h-3 transition-all cursor-pointer ${
                    seg.isMissing ? 'bg-red-300 hover:bg-red-400 z-10' : 'bg-emerald-300 hover:bg-emerald-400 z-20'
                  }`}
                  style={{ left: `${left + 4}px`, width: `${Math.max(width - 8, 4)}px` }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
