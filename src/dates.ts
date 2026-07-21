const ISO_DATE_RE =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?<fraction>\.\d{1,3})?)?(?<zone>Z|[+-]\d{2}:\d{2})?)?$/;

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  zone?: string;
  hasTime: boolean;
}

function partsFromIso(value: string): Parts | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match?.groups) return null;

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hasTime = match.groups.hour !== undefined;
  const hour = Number(match.groups.hour ?? "0");
  const minute = Number(match.groups.minute ?? "0");
  const second = Number(match.groups.second ?? "0");
  const ms = Number((match.groups.fraction ?? "").slice(1).padEnd(3, "0") || "0");
  return { year, month, day, hour, minute, second, ms, zone: match.groups.zone, hasTime };
}

function hasValidRanges(parts: Parts): boolean {
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.hour < 0 || parts.hour > 23) return false;
  if (parts.minute < 0 || parts.minute > 59) return false;
  if (parts.second < 0 || parts.second > 59) return false;
  if (parts.zone && parts.zone !== "Z") {
    const offsetHour = Number(parts.zone.slice(1, 3));
    const offsetMinute = Number(parts.zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

function localDateFromParts(parts: Parts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.ms);
}

function isSameLocalParts(date: Date, parts: Parts): boolean {
  return (
    date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day &&
    date.getHours() === parts.hour &&
    date.getMinutes() === parts.minute &&
    date.getSeconds() === parts.second &&
    date.getMilliseconds() === parts.ms
  );
}

function isSameUtcParts(date: Date, parts: Parts): boolean {
  let offsetMs = 0;
  if (parts.zone && parts.zone !== "Z") {
    const sign = parts.zone[0] === "-" ? -1 : 1;
    const offsetHour = Number(parts.zone.slice(1, 3));
    const offsetMinute = Number(parts.zone.slice(4, 6));
    offsetMs = sign * ((offsetHour * 60) + offsetMinute) * 60_000;
  }
  const zoned = new Date(date.getTime() + offsetMs);
  return (
    zoned.getUTCFullYear() === parts.year &&
    zoned.getUTCMonth() === parts.month - 1 &&
    zoned.getUTCDate() === parts.day &&
    zoned.getUTCHours() === parts.hour &&
    zoned.getUTCMinutes() === parts.minute &&
    zoned.getUTCSeconds() === parts.second &&
    zoned.getUTCMilliseconds() === parts.ms
  );
}

export function isIsoDateString(value: string): boolean {
  const parts = partsFromIso(value);
  if (!parts || !hasValidRanges(parts)) return false;

  if (!parts.hasTime || !parts.zone) {
    return isSameLocalParts(localDateFromParts(parts), parts);
  }

  const date = new Date(value);
  return !isNaN(date.getTime()) && isSameUtcParts(date, parts);
}

export function isoToDate(value: string): Date {
  const parts = partsFromIso(value);
  if (!parts || !isIsoDateString(value)) throw new Error(`Invalid date: ${value}`);
  if (!parts.hasTime || !parts.zone) return localDateFromParts(parts);
  return new Date(value);
}

export function isoToEpochMs(value: string): number {
  return isoToDate(value).getTime();
}
