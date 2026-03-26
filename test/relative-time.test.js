const { describe, it } = require("node:test");
const assert = require("node:assert");
const { formatCompactRelativeTime } = require("../src/relative-time");

describe("relative-time", () => {
  it("should show now for timestamps newer than one minute", () => {
    const now = Date.UTC(2026, 2, 26, 12, 0, 0);
    assert.strictEqual(formatCompactRelativeTime(now - 30_000, { now }), "now");
  });

  it("should compact minutes, hours, and days", () => {
    const now = Date.UTC(2026, 2, 26, 12, 0, 0);
    assert.strictEqual(formatCompactRelativeTime(now - 41 * 60_000, { now }), "41min");
    assert.strictEqual(formatCompactRelativeTime(now - 2 * 60 * 60_000, { now }), "2h");
    assert.strictEqual(formatCompactRelativeTime(now - 3 * 24 * 60 * 60_000, { now }), "3d");
  });

  it("should clamp future timestamps to now", () => {
    const now = Date.UTC(2026, 2, 26, 12, 0, 0);
    assert.strictEqual(formatCompactRelativeTime(now + 10_000, { now }), "now");
  });
});
