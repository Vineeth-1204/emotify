/**
 * Shared Client-Local Date Helper for Emotify
 * 
 * Generates and validates local calendar date strings in YYYY-MM-DD format.
 * Eliminates UTC date shifting where students in positive UTC offsets (e.g., IST UTC+05:30)
 * would have their late-night or early-morning check-ins stamped with the previous day's UTC date.
 */

/**
 * Returns the current or provided Date as a local calendar date string (YYYY-MM-DD).
 * Evaluates using the device's local calendar year, month, and day instead of UTC.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validates whether a date string is a well-formed, real calendar date in YYYY-MM-DD format.
 * Rejects invalid dates like 2026-02-31 or non-matching regex.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

/**
 * Validates check-in date strings on server or client.
 * Enforces valid calendar dates and rejects arbitrary future dates.
 * Allows up to 1 day ahead of UTC to accommodate timezones up to UTC+14 (e.g. Line Islands).
 */
export function isValidCheckinDateStr(dateStr: string, referenceDate: Date = new Date()): boolean {
  if (!isValidCalendarDate(dateStr)) return false;

  const maxAllowedFuture = new Date(referenceDate);
  maxAllowedFuture.setUTCDate(maxAllowedFuture.getUTCDate() + 1);
  const maxDateStr = maxAllowedFuture.toISOString().split("T")[0];

  return dateStr <= maxDateStr;
}

/**
 * Returns the calendar date string (YYYY-MM-DD) for the day before the given dateStr.
 * Evaluates purely by calendar date arithmetic without timezone distortion.
 */
export function getPreviousDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return getLocalDateString(prev);
}

