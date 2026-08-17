const FALLBACK_TIMEZONE = 'America/New_York';

export function getClientTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && timezone.length > 0 ? timezone : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function clientTimezoneHeaders(): Record<string, string> {
  return { 'X-Client-Timezone': getClientTimezone() };
}
