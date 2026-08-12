// Weekly check periods run Monday-to-Sunday in Australia/Brisbane time.
// Queensland never observes daylight saving, so a fixed UTC+10 offset is
// always correct here — no timezone database needed.
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

// Returns a Date object whose UTC getters (getUTCDay, getUTCDate, etc.)
// report the current Brisbane wall-clock time. Only use getUTC*/setUTC*
// methods on the result — never toLocaleString or non-UTC getters.
export function brisbaneNow() {
  return new Date(Date.now() + AEST_OFFSET_MS);
}

// Given a "Brisbane-shifted" Date (e.g. from brisbaneNow()), returns the
// Monday of that week as "YYYY-MM-DD".
export function weekStartDate(brisbaneShiftedDate) {
  const d = new Date(brisbaneShiftedDate.getTime());
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStartDate() {
  return weekStartDate(brisbaneNow());
}

export function weekLabel(weekStart) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startPart = `${start.getUTCDate()}${sameMonth ? "" : ` ${months[start.getUTCMonth()]}`}`;
  const endPart = `${end.getUTCDate()} ${months[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  return `${startPart}–${endPart}`;
}
