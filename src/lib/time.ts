import type { Settings } from "./types";
export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function localDate(now = new Date(), timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  return addDays(date, -(weekday(date) + 6) % 7);
}
export function classStart(date: string, period: number, settings: Settings) {
  // Convert a wall-clock time using the configured IANA timezone, including DST offsets.
  const time = settings.periods.find((p) => p.id === period)?.start;
  if (!time) throw new Error("Unknown period");
  const desired = new Date(`${date}T${time}:00Z`).getTime();
  let instant = desired;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    const wall = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    instant += desired - wall;
  }
  return new Date(instant);
}
export function occupied(period: number, duration: number) {
  return Array.from({ length: duration }, (_, i) => period + i);
}
