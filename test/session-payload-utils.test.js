const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  STATIC_ACTIVE_UPDATED_AT,
  STATIC_RECENT_UPDATED_AT,
  UNASSIGNED_WORKSPACE_KEY,
  buildSessionsWindowPayload,
  serializeSessionsWindowPayload,
} = require("../src/session-payload-utils");

describe("session-payload-utils", () => {
  it("should mark the focused session workspace as active and dedupe static roots", () => {
    const payload = buildSessionsWindowPayload({
      sessionEntries: [
        ["s1", { state: "idle", updatedAt: 10, cwd: "/repo/a", agentId: "codex" }],
        ["s2", { state: "working", updatedAt: 20, cwd: "/repo/b", lastEvent: "tool" }],
      ],
      activeWorkspaceRoots: ["/repo/c"],
      savedWorkspaceRoots: ["/repo/a", "/repo/d"],
      focusedSessionId: "s1",
      workspaceTaskViews: {
        "/repo/a": { goal: "Task A", mode: "progress" },
      },
    });

    assert.strictEqual(payload.focusedSessionId, "s1");
    assert.strictEqual(payload.entries.length, 4);
    assert.deepStrictEqual(payload.workspaceTaskViews, {
      "/repo/a": { goal: "Task A", mode: "progress" },
    });

    const focusedEntry = payload.entries.find((entry) => entry.id === "s1");
    assert.strictEqual(focusedEntry.isFocused, true);
    assert.strictEqual(focusedEntry.isActive, true);
    assert.strictEqual(focusedEntry.agentId, "codex");
    assert.strictEqual(focusedEntry.workspaceKey, "/repo/a");

    const sameWorkspaceEntry = payload.entries.find((entry) => entry.id === "s2");
    assert.strictEqual(sameWorkspaceEntry.isActive, false);
    assert.strictEqual(sameWorkspaceEntry.agentId, "claude");

    const activeStatic = payload.entries.find((entry) => entry.id === "static:active:/repo/c");
    assert.deepStrictEqual(activeStatic, {
      id: "static:active:/repo/c",
      state: "idle",
      updatedAt: STATIC_ACTIVE_UPDATED_AT,
      cwd: "/repo/c",
      workspaceKey: "/repo/c",
      isStatic: true,
      isActive: true,
    });

    const recentStatic = payload.entries.find((entry) => entry.id === "static:recent:/repo/d");
    assert.deepStrictEqual(recentStatic, {
      id: "static:recent:/repo/d",
      state: "idle",
      updatedAt: STATIC_RECENT_UPDATED_AT,
      cwd: "/repo/d",
      workspaceKey: "/repo/d",
      isStatic: true,
    });
  });

  it("should group sessions without cwd under the unassigned workspace bucket", () => {
    const payload = buildSessionsWindowPayload({
      sessionEntries: [
        ["s1", { state: "thinking", updatedAt: 10, cwd: "" }],
      ],
      activeWorkspaceRoots: [],
      savedWorkspaceRoots: [],
      focusedSessionId: null,
      workspaceTaskViews: {},
    });

    assert.deepStrictEqual(payload.entries[0], {
      id: "s1",
      state: "thinking",
      updatedAt: 10,
      sourcePid: undefined,
      cwd: null,
      workspaceKey: UNASSIGNED_WORKSPACE_KEY,
      editor: undefined,
      pidChain: undefined,
      agentId: "claude",
      lastEvent: undefined,
      isFocused: false,
      isActive: false,
    });
  });

  it("should serialize payloads deterministically", () => {
    const payload = {
      focusedSessionId: "s1",
      workspaceTaskViews: {
        "/repo/a": {
          renderKey: "task-view-signature",
          goal: "Task A",
          mode: "progress",
          progress: { previewItems: ["one"], overflowCount: 0 },
        },
      },
      entries: [
        {
          id: "s1",
          state: "idle",
          updatedAt: 100,
          cwd: "/repo/a",
          workspaceKey: "/repo/a",
          agentId: "codex",
          lastEvent: "ready",
          isStatic: false,
          isActive: true,
          isFocused: true,
        },
      ],
    };

    const a = serializeSessionsWindowPayload(payload);
    const b = serializeSessionsWindowPayload(JSON.parse(JSON.stringify(payload)));
    assert.strictEqual(a, b);
    assert.match(a, /^s1\|\|s1~idle~100~\/repo\/a~\/repo\/a~codex~ready~0~1~1\|\|\[\["\/repo\/a","task-view-signature"\]\]$/);
  });
});
