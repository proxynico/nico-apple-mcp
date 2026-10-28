const ISO_DATE_RE =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?<fraction>\.\d{1,3})?)?(?<zone>Z|[+-]\d{2}:\d{2})?)?$/;

function parseIsoDate(value: string): Date | null {
  const g = ISO_DATE_RE.exec(value)?.groups;
  if (!g) return null;
  const n = (field: string | undefined) => Number(field ?? 0);
  const parts = [
    n(g.year), n(g.month) - 1, n(g.day), n(g.hour), n(g.minute), n(g.second),
    Number((g.fraction ?? "").slice(1).padEnd(3, "0")),
  ] as const;

  if (!g.zone) {
    const local = new Date(...parts);
    const roundTrip = [local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds(), local.getMilliseconds()];
    return roundTrip.every((v, i) => v === parts[i]) ? local : null;
  }

  const utc = new Date(Date.UTC(...parts));
  const roundTrip = [utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), utc.getUTCMilliseconds()];
  if (!roundTrip.every((v, i) => v === parts[i])) return null;
  if (g.zone === "Z") return utc;

  const offsetHour = Number(g.zone.slice(1, 3));
  const offsetMinute = Number(g.zone.slice(4, 6));
  if (offsetHour > 23 || offsetMinute > 59) return null;
  const sign = g.zone[0] === "-" ? -1 : 1;
  return new Date(utc.getTime() - sign * (offsetHour * 60 + offsetMinute) * 60_000);
}

export function isIsoDateString(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function isoToEpochMs(value: string): number {
  const date = parseIsoDate(value);
  if (!date) throw new Error(`Invalid date: ${value}`);
  return date.getTime();
}
