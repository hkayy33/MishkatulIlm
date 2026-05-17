/** Build ISO UTC string from local date + HH:mm (24h). */
export function localDateTimeToUtcIso(date: Date, timeHm: string): string {
  const [h, m] = timeHm.split(':').map((x) => Number.parseInt(x, 10));
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0, 0, 0);
  return local.toISOString();
}

export function addMinutesToIso(isoUtc: string, minutes: number): string {
  const d = new Date(isoUtc);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function formatSlotRange(startsAtUtc: string, endsAtUtc: string): string {
  const start = new Date(startsAtUtc);
  const end = new Date(endsAtUtc);
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t0 = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const t1 = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t0} – ${t1}`;
}

export function monthUtcRange(viewMonth: Date): { fromUtc: string; toUtc: string } {
  const from = new Date(Date.UTC(viewMonth.getFullYear(), viewMonth.getMonth(), 1));
  const to = new Date(Date.UTC(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  return { fromUtc: from.toISOString(), toUtc: to.toISOString() };
}
