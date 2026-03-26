const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  resolveSessionTerminalAction,
  resolveTerminalAction,
} = require("../src/terminal-launch-utils");

describe("terminal-launch-utils", () => {
  it("should focus the highest-priority live session first", () => {
    const action = resolveTerminalAction({
      sessionEntries: [
        ["s1", { state: "idle", updatedAt: 10, sourcePid: 111, cwd: "/repo/a" }],
        ["s2", { state: "working", updatedAt: 20, sourcePid: 222, cwd: "/repo/b", editor: "cursor", pidChain: [1, 2, 3] }],
      ],
      focusedSessionId: "s1",
      activeWorkspaceRoots: ["/repo/c"],
      savedWorkspaceRoots: ["/repo/d"],
      statePriority: { idle: 0, working: 3 },
      isProcessAlive: (pid) => pid === 111 || pid === 222,
    });

    assert.deepStrictEqual(action, {
      type: "focus-session",
      sessionId: "s2",
      sourcePid: 222,
      cwd: "/repo/b",
      editor: "cursor",
      pidChain: [1, 2, 3],
    });
  });

  it("should fall back to opening the focused workspace when no live session exists", () => {
    const action = resolveTerminalAction({
      sessionEntries: [
        ["s1", { state: "idle", updatedAt: 20, sourcePid: 999, cwd: "/repo/focused" }],
      ],
      focusedSessionId: "s1",
      activeWorkspaceRoots: ["/repo/active"],
      savedWorkspaceRoots: ["/repo/saved"],
      statePriority: { idle: 0, working: 3 },
      isProcessAlive: () => false,
    });

    assert.deepStrictEqual(action, {
      type: "open-workspace",
      cwd: "/repo/focused",
    });
  });

  it("should fall back to an active workspace root when there is no session cwd", () => {
    const action = resolveTerminalAction({
      sessionEntries: [],
      focusedSessionId: null,
      activeWorkspaceRoots: ["/repo/active"],
      savedWorkspaceRoots: ["/repo/saved"],
      statePriority: { idle: 0, working: 3 },
      isProcessAlive: () => false,
    });

    assert.deepStrictEqual(action, {
      type: "open-workspace",
      cwd: "/repo/active",
    });
  });

  it("should downgrade a dead session entry to workspace launch when cwd exists", () => {
    const action = resolveSessionTerminalAction({
      id: "s1",
      state: "working",
      updatedAt: 20,
      sourcePid: 999,
      cwd: "/repo/a",
    }, () => false);

    assert.deepStrictEqual(action, {
      type: "open-workspace",
      cwd: "/repo/a",
    });
  });
});
