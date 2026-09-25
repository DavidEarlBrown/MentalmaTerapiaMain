const cityMap: Record<string, string> = {
  'frankfurt, germany': 'Europe/Berlin',
  'frankfurt': 'Europe/Berlin',
  'berlin': 'Europe/Berlin',
  'bogota, colombia': 'America/Bogota',
  'bogota': 'America/Bogota',
  'new york, usa': 'America/New_York',
  'new york': 'America/New_York',
  'los angeles, usa': 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  'london, uk': 'Europe/London',
  'london': 'Europe/London',
  'paris, france': 'Europe/Paris',
  'paris': 'Europe/Paris',
  'madrid, spain': 'Europe/Madrid',
  'madrid': 'Europe/Madrid',
  'barcelona, spain': 'Europe/Madrid',
  'barcelona': 'Europe/Madrid',
  'rome, italy': 'Europe/Rome',
  'rome': 'Europe/Rome',
  'tokyo, japan': 'Asia/Tokyo',
  'tokyo': 'Asia/Tokyo',
  'sydney, australia': 'Australia/Sydney',
  'sydney': 'Australia/Sydney',
  'dubai, uae': 'Asia/Dubai',
  'dubai': 'Asia/Dubai',
  'singapore': 'Asia/Singapore',
  'hong kong': 'Asia/Hong_Kong',
  'mexico city': 'America/Mexico_City',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'lima': 'America/Lima',
  'santiago': 'America/Santiago',
  'sao paulo': 'America/Sao_Paulo',
};

const abbreviationMap: Record<string, string> = {
  'cet': 'Europe/Berlin',
  'cest': 'Europe/Berlin',
  'central european': 'Europe/Berlin',
  'gmt': 'Europe/London',
  'utc': 'Etc/UTC',
  'est': 'America/New_York',
  'edt': 'America/New_York',
  'eastern': 'America/New_York',
  'cst': 'America/Chicago',
  'cdt': 'America/Chicago',
  'central standard': 'America/Chicago',
  'mst': 'America/Denver',
  'mdt': 'America/Denver',
  'mountain': 'America/Denver',
  'pst': 'America/Los_Angeles',
  'pdt': 'America/Los_Angeles',
  'pacific': 'America/Los_Angeles',
  'jst': 'Asia/Tokyo',
  'aest': 'Australia/Sydney',
  'cot': 'America/Bogota',
};

export function normalizeTimezone(tz: string | undefined): string {
  if (!tz || !tz.trim()) return 'America/Bogota';

  const trimmed = tz.trim();

  if (trimmed.includes('/')) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (cityMap[lower]) {
    return cityMap[lower];
  }

  for (const [key, value] of Object.entries(abbreviationMap)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return 'America/Bogota';
}

export function convertTime(
  timeStr: string,
  fromTz: string,
  toTz: string,
  referenceDate?: string
): string {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const refDate = referenceDate || new Date().toISOString().split('T')[0];
    const [year, month, day] = refDate.split('-').map(Number);

    const fakeUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    const fromFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const fromParts = fromFormatter.formatToParts(fakeUtc);
    let fromHour = parseInt(fromParts.find(p => p.type === 'hour')?.value || '0');
    const fromMinute = parseInt(fromParts.find(p => p.type === 'minute')?.value || '0');
    if (fromHour === 24) fromHour = 0;

    let offsetMinutes = (fromHour * 60 + fromMinute) - (hours * 60 + minutes);
    if (offsetMinutes > 720) offsetMinutes -= 1440;
    if (offsetMinutes < -720) offsetMinutes += 1440;

    const realUtc = new Date(fakeUtc.getTime() - offsetMinutes * 60 * 1000);

    const toFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const toParts = toFormatter.formatToParts(realUtc);
    let toHour = toParts.find(p => p.type === 'hour')?.value || '00';
    const toMinute = toParts.find(p => p.type === 'minute')?.value || '00';
    if (toHour === '24') toHour = '00';

    return `${toHour.padStart(2, '0')}:${toMinute.padStart(2, '0')}`;
  } catch (error) {
    console.error('Error converting time:', error);
    return timeStr;
  }
}
