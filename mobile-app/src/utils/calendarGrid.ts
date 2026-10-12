/** Pure month-grid helpers for the Calendar tab; local time throughout. */

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "2026-10-11" in local time. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type GridDay = { date: Date; key: string; inMonth: boolean };

/** Six Monday-first weeks covering the month, padded with neighbouring days. */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, key: dayKey(date), inMonth: date.getMonth() === month };
  });
}

/** Range the grid shows, for fetching events: [first cell, day after last cell). */
export function gridRange(year: number, month: number): { from: Date; to: Date } {
  const days = monthGrid(year, month);
  const last = days[days.length - 1]!.date;
  return {
    from: days[0]!.date,
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
  };
}

/** Groups items by the local day they start on, each day sorted by start time. */
export function groupByStartDay<T extends { start: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const key = dayKey(new Date(item.start));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Monday of the week containing `date`, at local midnight. */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
}

/** The seven days (Monday first) of the week containing `date`. */
export function weekDays(date: Date): GridDay[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date: day, key: dayKey(day), inMonth: day.getMonth() === date.getMonth() };
  });
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** "2026-10-11" → local midnight Date. */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}
