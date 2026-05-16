/** Primary IANA zone per country name (from onboarding country picker). */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  'united kingdom': 'Europe/London',
  'united states': 'America/New_York',
  'united states of america': 'America/New_York',
  canada: 'America/Toronto',
  australia: 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland',
  ireland: 'Europe/Dublin',
  france: 'Europe/Paris',
  germany: 'Europe/Berlin',
  spain: 'Europe/Madrid',
  italy: 'Europe/Rome',
  netherlands: 'Europe/Amsterdam',
  belgium: 'Europe/Brussels',
  sweden: 'Europe/Stockholm',
  norway: 'Europe/Oslo',
  denmark: 'Europe/Copenhagen',
  finland: 'Europe/Helsinki',
  poland: 'Europe/Warsaw',
  portugal: 'Europe/Lisbon',
  switzerland: 'Europe/Zurich',
  austria: 'Europe/Vienna',
  'saudi arabia': 'Asia/Riyadh',
  'united arab emirates': 'Asia/Dubai',
  qatar: 'Asia/Qatar',
  kuwait: 'Asia/Kuwait',
  bahrain: 'Asia/Bahrain',
  oman: 'Asia/Muscat',
  egypt: 'Africa/Cairo',
  morocco: 'Africa/Casablanca',
  algeria: 'Africa/Algiers',
  tunisia: 'Africa/Tunis',
  turkey: 'Europe/Istanbul',
  pakistan: 'Asia/Karachi',
  india: 'Asia/Kolkata',
  bangladesh: 'Asia/Dhaka',
  malaysia: 'Asia/Kuala_Lumpur',
  singapore: 'Asia/Singapore',
  indonesia: 'Asia/Jakarta',
  nigeria: 'Africa/Lagos',
  'south africa': 'Africa/Johannesburg',
  kenya: 'Africa/Nairobi',
  japan: 'Asia/Tokyo',
  'south korea': 'Asia/Seoul',
  china: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  brazil: 'America/Sao_Paulo',
  mexico: 'America/Mexico_City',
  argentina: 'America/Argentina/Buenos_Aires',
};

/** City name (lowercase) → IANA when it differs from the country default. */
const CITY_TIME_ZONES: Record<string, string> = {
  london: 'Europe/London',
  manchester: 'Europe/London',
  birmingham: 'Europe/London',
  leeds: 'Europe/London',
  glasgow: 'Europe/London',
  edinburgh: 'Europe/London',
  'new york': 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  chicago: 'America/Chicago',
  houston: 'America/Chicago',
  phoenix: 'America/Phoenix',
  denver: 'America/Denver',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane',
  perth: 'Australia/Perth',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid',
  rome: 'Europe/Rome',
  amsterdam: 'Europe/Amsterdam',
  brussels: 'Europe/Brussels',
  dubai: 'Asia/Dubai',
  'abu dhabi': 'Asia/Dubai',
  riyadh: 'Asia/Riyadh',
  jeddah: 'Asia/Riyadh',
  doha: 'Asia/Qatar',
  cairo: 'Africa/Cairo',
  istanbul: 'Europe/Istanbul',
  karachi: 'Asia/Karachi',
  lahore: 'Asia/Karachi',
  islamabad: 'Asia/Karachi',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  kuala: 'Asia/Kuala_Lumpur',
  'kuala lumpur': 'Asia/Kuala_Lumpur',
  singapore: 'Asia/Singapore',
  jakarta: 'Asia/Jakarta',
  lagos: 'Africa/Lagos',
  johannesburg: 'Africa/Johannesburg',
  tokyo: 'Asia/Tokyo',
  'hong kong': 'Asia/Hong_Kong',
  shanghai: 'Asia/Shanghai',
  'sao paulo': 'America/Sao_Paulo',
  'mexico city': 'America/Mexico_City',
};

export function resolveTimeZoneId(country: string, city: string): string {
  const cityKey = city.trim().toLowerCase();
  if (cityKey && CITY_TIME_ZONES[cityKey]) {
    return CITY_TIME_ZONES[cityKey];
  }

  const countryKey = country.trim().toLowerCase();
  if (countryKey && COUNTRY_TIME_ZONES[countryKey]) {
    return COUNTRY_TIME_ZONES[countryKey];
  }

  return 'UTC';
}

export function formatTimeInZone(isoUtc: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(isoUtc));
  } catch {
    return new Date(isoUtc).toISOString();
  }
}

export function formatSlotRangeInZone(
  startsAtUtc: string,
  endsAtUtc: string,
  timeZone: string,
): string {
  return `${formatTimeInZone(startsAtUtc, timeZone)} – ${formatTimeInZone(endsAtUtc, timeZone)}`;
}

export function timeZoneOffsetLabel(fromZone: string, toZone: string, atUtc = new Date()): string {
  if (fromZone === toZone) return 'Same time zone as you';

  const fromOffset = getOffsetMinutes(fromZone, atUtc);
  const toOffset = getOffsetMinutes(toZone, atUtc);
  const diffHours = (toOffset - fromOffset) / 60;

  if (diffHours === 0) return 'Same offset as you';

  const abs = Math.abs(diffHours);
  const unit = abs === 1 ? 'hour' : 'hours';
  if (diffHours > 0) {
    return `Student is ${formatOffset(abs)} ${unit} ahead of you`;
  }
  return `Student is ${formatOffset(abs)} ${unit} behind you`;
}

function formatOffset(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function getOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(at);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    const h = Number.parseInt(m[2], 10);
    const min = m[3] ? Number.parseInt(m[3], 10) : 0;
    return sign * (h * 60 + min);
  } catch {
    return 0;
  }
}

export function locationLabel(country: string, city: string): string {
  const c = city.trim();
  const co = country.trim();
  if (c && co) return `${c}, ${co}`;
  return co || c || 'Unknown location';
}

export function timeZoneShortName(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
