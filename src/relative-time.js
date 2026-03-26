const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

/**
 * Normalize a timestamp input into epoch milliseconds.
 *
 * @param {number | string | Date | null | undefined} value - Timestamp candidate.
 * @returns {number} Epoch milliseconds, or NaN when the input cannot be parsed.
 */
function normalizeTimestamp(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/**
 * Format a timestamp into a compact relative label for thread metadata.
 *
 * @param {number | string | Date | null | undefined} value - Source timestamp.
 * @param {{
 *   now?: number,
 *   labels?: {
 *     now?: string,
 *     minuteSuffix?: string,
 *     hourSuffix?: string,
 *     daySuffix?: string
 *   }
 * }} [options] - Formatting options.
 * @returns {string} Compact relative label such as "now", "41min", "2h", or "3d".
 */
function formatCompactRelativeTime(value, options = {}) {
  const timestamp = normalizeTimestamp(value);
  if (!Number.isFinite(timestamp)) return "";

  const now = typeof options.now === "number" && Number.isFinite(options.now)
    ? options.now
    : Date.now();
  const labels = options.labels || {};
  const age = Math.max(0, now - timestamp);

  if (age < MINUTE_IN_MS) return labels.now || "now";
  if (age < HOUR_IN_MS) {
    return `${Math.floor(age / MINUTE_IN_MS)}${labels.minuteSuffix || "min"}`;
  }
  if (age < DAY_IN_MS) {
    return `${Math.floor(age / HOUR_IN_MS)}${labels.hourSuffix || "h"}`;
  }
  return `${Math.floor(age / DAY_IN_MS)}${labels.daySuffix || "d"}`;
}

module.exports = {
  formatCompactRelativeTime,
  normalizeTimestamp,
};
