/** Pure layout for the Calendar day timeline: positions and overlap columns. */

export type TimelineInput = { id: string; start: string; end: string };

export type TimelineBlock<T extends TimelineInput> = {
  item: T;
  /** Minutes from the top of the rail. */
  top: number;
  /** Height in minutes (at least `minMinutes`). */
  height: number;
  column: number;
  columns: number;
};

export type TimelineOptions = { day: Date; startHour: number; endHour: number; minMinutes?: number };

function minutesInto(day: Date, iso: string, startHour: number): number {
  const time = new Date(iso);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour);
  return (time.getTime() - dayStart.getTime()) / 60_000;
}

/**
 * Places events on an hour rail for one day. Events are clamped to the rail,
 * and overlapping events share the width in side-by-side columns (each
 * cluster of overlaps is laid out greedily, earliest first).
 */
export function layoutTimeline<T extends TimelineInput>(items: T[], options: TimelineOptions): TimelineBlock<T>[] {
  const { day, startHour, endHour, minMinutes = 30 } = options;
  const railMinutes = (endHour - startHour) * 60;
  const placed = items
    .map((item) => {
      const rawStart = minutesInto(day, item.start, startHour);
      const rawEnd = minutesInto(day, item.end, startHour);
      const top = Math.min(Math.max(rawStart, 0), railMinutes - minMinutes);
      const bottom = Math.min(Math.max(rawEnd, top + minMinutes), railMinutes);
      return { item, top, height: Math.max(bottom - top, minMinutes), rawEnd };
    })
    .filter((entry) => entry.rawEnd > 0 && entry.top < railMinutes)
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const blocks: TimelineBlock<T>[] = [];
  let cluster: TimelineBlock<T>[] = [];
  let clusterEnd = -Infinity;
  const columnEnds: number[] = [];

  const flush = () => {
    const columns = Math.max(1, columnEnds.length);
    for (const block of cluster) block.columns = columns;
    blocks.push(...cluster);
    cluster = [];
    columnEnds.length = 0;
  };

  for (const entry of placed) {
    if (entry.top >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= entry.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = entry.top + entry.height;
    clusterEnd = Math.max(clusterEnd === -Infinity ? 0 : clusterEnd, entry.top + entry.height);
    cluster.push({ item: entry.item, top: entry.top, height: entry.height, column, columns: 1 });
  }
  flush();
  return blocks;
}

/** First hour worth scrolling to: now on today, else the first event, else 8am. */
export function initialScrollHour(items: Array<Pick<TimelineInput, "start">>, day: Date, now: Date, startHour: number): number {
  const sameDay = day.toDateString() === now.toDateString();
  if (sameDay) return Math.max(startHour, now.getHours() - 1);
  const first = items.map((item) => new Date(item.start)).sort((a, b) => a.getTime() - b.getTime())[0];
  if (first && first.toDateString() === day.toDateString()) return Math.max(startHour, first.getHours() - 1);
  return Math.max(startHour, 8);
}
