// Recent synthetic dates keep workflow checks independent of the calendar day.
export function fixtureDate(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}
