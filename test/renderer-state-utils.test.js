const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createCursorPollingController } = require("../src/renderer-state-utils");

describe("renderer-state-utils", () => {
  it("should pause once for nested pauses and resume once at depth zero", () => {
    const calls = [];
    const controller = createCursorPollingController({
      pauseCursorPolling: () => calls.push("pause"),
      resumeFromReaction: () => calls.push("resume"),
    });

    controller.pause();
    controller.pause();
    assert.strictEqual(controller.getDepth(), 2);
    assert.deepStrictEqual(calls, ["pause"]);

    controller.resume();
    assert.strictEqual(controller.getDepth(), 1);
    assert.deepStrictEqual(calls, ["pause"]);

    controller.resume();
    assert.strictEqual(controller.getDepth(), 0);
    assert.deepStrictEqual(calls, ["pause", "resume"]);
  });

  it("should force resume interrupted reactions", () => {
    const calls = [];
    const controller = createCursorPollingController({
      pauseCursorPolling: () => calls.push("pause"),
      resumeFromReaction: () => calls.push("resume"),
    });

    controller.pause();
    controller.pause();
    controller.forceResume();

    assert.strictEqual(controller.getDepth(), 0);
    assert.deepStrictEqual(calls, ["pause", "resume"]);

    controller.forceResume();
    controller.resume();
    assert.deepStrictEqual(calls, ["pause", "resume"]);
  });
});
