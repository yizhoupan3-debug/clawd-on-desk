const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  TASK_ARTIFACT_FILES,
  buildWorkspaceTaskView,
  buildWorkspaceTaskViews,
  collectWorkspaceRoots,
  parseWalkthroughMarkdown,
} = require("../src/workspace-task-artifacts");

const tempDirs = [];

/**
 * Create a temporary workspace root for artifact tests.
 *
 * @returns {string} Absolute temp directory.
 */
function createTempWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("workspace-task-artifacts", () => {
  it("should watch context checkpoint artifacts for silent compaction updates", () => {
    assert.ok(TASK_ARTIFACT_FILES.includes("CONTEXT_CHECKPOINT.md"));
  });

  it("should collect workspace roots from sessions and global state", () => {
    const roots = collectWorkspaceRoots({
      sessionEntries: [
        ["s1", { cwd: "/repo/a" }],
        ["s2", { cwd: "/repo/b" }],
      ],
      activeWorkspaceRoots: ["/repo/c"],
      savedWorkspaceRoots: ["/repo/b", "/repo/d"],
    });

    assert.deepStrictEqual(roots, ["/repo/a", "/repo/b", "/repo/c", "/repo/d"]);
  });

  it("should parse legacy walkthrough metadata without losing compatibility", () => {
    const summary = parseWalkthroughMarkdown([
      "# Session Summary",
      "",
      "Goal: Ship the task",
      "Outcome: Completed",
      "Verification: tests passed",
      "Summary notes: final walkthrough only",
      "Evidence: node --test",
      "",
    ].join("\n"));

    assert.strictEqual(summary.goal, "Ship the task");
    assert.strictEqual(summary.outcome, "Completed");
    assert.strictEqual(summary.verification, "tests passed");
    assert.strictEqual(summary.summaryNotes, "final walkthrough only");
    assert.strictEqual(summary.evidence, "node --test");
    assert.deepStrictEqual(summary.summaryChecklist, []);
    assert.deepStrictEqual(summary.preSectionBlocks, []);
    assert.deepStrictEqual(summary.sections, []);
  });

  it("should parse structured walkthrough markdown blocks for rich rendering", () => {
    const summary = parseWalkthroughMarkdown([
      "已完成。",
      "",
      "- [x] **Primary goal**: Ship the task",
      "- [x] **Current status**: UI fixed",
      "",
      "> [!IMPORTANT]",
      "> Keep the markdown structure intact.",
      "",
      "## Verification Results",
      "",
      "### Automatic Verification",
      "- render walkthrough callout",
      "- render ordered list marker",
      "",
      "## Next Step",
      "1. Reopen the sessions window",
      "2. Verify the callout style",
      "",
    ].join("\n"));

    assert.strictEqual(summary.goal, "Ship the task");
    assert.strictEqual(summary.outcome, "UI fixed");
    assert.strictEqual(summary.summaryChecklist.length, 2);
    assert.strictEqual(summary.preSectionBlocks[0].type, "alert");
    assert.strictEqual(summary.preSectionBlocks[0].level, "important");
    assert.strictEqual(summary.sections[0].title, "Verification Results");
    assert.strictEqual(summary.sections[1].blocks[0].style, "ordered");
  });

  it("should build a progress task view from workspace artifacts", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Implement UI",
      status_line: "Rendering in progress",
      process_lane: "Goal → Status → Verify → Next",
      walkthrough_status: "pending",
      progress_updates: ["Inspect renderer", "Patch UI", "Run tests", "Finalize"],
    }), "utf8");
    fs.writeFileSync(path.join(root, "PROGRESS_UPDATES.json"), JSON.stringify({
      task: "Implement UI",
      preview_count: 3,
      expandable: true,
      items: ["Inspect renderer", "Patch UI", "Run tests", "Finalize"],
      overflow_count: 1,
    }), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.strictEqual(view.mode, "progress");
    assert.strictEqual(view.goal, "Implement UI");
    assert.deepStrictEqual(view.progress.items, ["Inspect renderer", "Patch UI", "Run tests", "Finalize"]);
    assert.deepStrictEqual(view.progress.previewItems, ["Patch UI", "Run tests", "Finalize"]);
    assert.deepStrictEqual(view.progress.previewEntries.map((entry) => entry.index), [2, 3, 4]);
    assert.deepStrictEqual(view.progress.entries.map((entry) => entry.text), [
      "Inspect renderer",
      "Patch UI",
      "Run tests",
      "Finalize",
    ]);
    assert.strictEqual(view.progress.previewCount, 3);
    assert.strictEqual(view.progress.overflowCount, 1);
  });

  it("should normalize structured progress items into a compact compatible view", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Implement UI",
      status_line: "Rendering in progress",
      walkthrough_status: "pending",
      progress_updates: [
        { text: "Inspect renderer", file: "installer.py", line_range: "L1-L177" },
        { summary: "Patch UI" },
        { message: "Run tests" },
        { title: "Finalize" },
      ],
    }), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.deepStrictEqual(view.progress.items, ["Inspect renderer", "Patch UI", "Run tests", "Finalize"]);
    assert.deepStrictEqual(view.progress.previewItems, ["Patch UI", "Run tests", "Finalize"]);
    assert.deepStrictEqual(view.progress.previewEntries, [
      { index: 2, text: "Patch UI" },
      { index: 3, text: "Run tests" },
      { index: 4, text: "Finalize" },
    ]);
  });

  it("should build a walkthrough task view when the final summary exists", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Implement UI",
      status_line: "Completed",
      process_lane: "Goal → Status → Verify → Next",
      walkthrough_status: "ready",
    }), "utf8");
    fs.writeFileSync(path.join(root, "SESSION_SUMMARY.md"), [
      "# Session Summary",
      "",
      "Goal: Implement UI",
      "Outcome: Completed",
      "Verification: node --test",
      "Summary notes: walkthrough only at completion",
      "Evidence: artifacts rendered",
      "",
    ].join("\n"), "utf8");

    const views = buildWorkspaceTaskViews([root]);
    assert.strictEqual(views[root].mode, "walkthrough");
    assert.strictEqual(views[root].walkthrough.summaryNotes, "walkthrough only at completion");
    assert.ok(typeof views[root].renderKey === "string" && views[root].renderKey.length > 0);
  });

  it("should prefer walkthrough.md over SESSION_SUMMARY.md for UI rendering", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Implement UI",
      status_line: "Completed",
      walkthrough_status: "ready",
    }), "utf8");
    fs.writeFileSync(path.join(root, "SESSION_SUMMARY.md"), [
      "# Session Summary",
      "",
      "Goal: stale summary",
      "Outcome: stale",
      "Verification: stale",
      "Summary notes: stale",
      "Evidence: stale",
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(root, "walkthrough.md"), [
      "已完成。",
      "",
      "- [x] **Primary goal**: Implement UI",
      "- [x] **Current status**: fresh alias",
      "",
      "> [!IMPORTANT]",
      "> Use the richer alias file.",
      "",
      "## Verification Results",
      "- node --test",
      "",
      "Goal: Implement UI",
      "Outcome: Completed",
      "Verification: node --test",
      "Summary notes: fresh alias",
      "Evidence: artifacts rendered",
      "",
    ].join("\n"), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.strictEqual(view.walkthrough.summaryNotes, "fresh alias");
    assert.strictEqual(view.walkthrough.preSectionBlocks[0].level, "important");
  });

  it("should ignore stray summary markdown while walkthrough state is still pending", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Keep compaction silent",
      status_line: "Checkpoint stored internally",
      walkthrough_status: "pending",
      final_walkthrough: false,
    }), "utf8");
    fs.writeFileSync(path.join(root, "SESSION_SUMMARY.md"), [
      "Here is a summary of the conversation to date:",
      "",
      "Conversation context is extremely limited because the provided history was already truncated.",
      "",
      "Key preserved context:",
      "- leaked summary text",
      "",
    ].join("\n"), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.strictEqual(view.mode, "progress");
    assert.strictEqual(view.statusLine, "Checkpoint stored internally");
    assert.strictEqual(view.walkthrough, null);
  });

  it("should reject leaked conversation-summary boilerplate even when walkthrough is marked ready", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Keep compaction silent",
      status_line: "Completed",
      walkthrough_status: "ready",
      final_walkthrough: true,
    }), "utf8");
    fs.writeFileSync(path.join(root, "walkthrough.md"), [
      "Here is a summary of the conversation to date:",
      "",
      "Conversation context is extremely limited because the provided history was already truncated.",
      "",
      "The assistant previously attempted:",
      "1. Something stale",
      "",
    ].join("\n"), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.strictEqual(view.mode, "progress");
    assert.strictEqual(view.walkthrough, null);
  });

  it("should reject Chinese internal-summary boilerplate in walkthrough artifacts", () => {
    const root = createTempWorkspace();
    fs.writeFileSync(path.join(root, ".app_supervisor_state.json"), JSON.stringify({
      task_summary: "Keep compaction silent",
      status_line: "Completed",
      walkthrough_status: "ready",
      final_walkthrough: true,
    }), "utf8");
    fs.writeFileSync(path.join(root, "walkthrough.md"), [
      "对话总结：",
      "",
      "上下文总结仅供内部恢复使用。",
      "",
      "之前助手尝试：",
      "1. Something stale",
      "",
    ].join("\n"), "utf8");

    const view = buildWorkspaceTaskView(root);
    assert.strictEqual(view.mode, "progress");
    assert.strictEqual(view.walkthrough, null);
  });

  it("should reuse cached task views until artifact signatures change", () => {
    const root = createTempWorkspace();
    const appStatePath = path.join(root, ".app_supervisor_state.json");
    const progressPath = path.join(root, "PROGRESS_UPDATES.json");

    fs.writeFileSync(appStatePath, JSON.stringify({
      task_summary: "Implement UI",
      status_line: "Rendering in progress",
      process_lane: "Goal → Status → Verify → Next",
      walkthrough_status: "pending",
    }), "utf8");
    fs.writeFileSync(progressPath, JSON.stringify({
      task: "Implement UI",
      items: ["Inspect renderer", "Patch UI", "Run tests"],
      preview_items: ["Inspect renderer", "Patch UI", "Run tests"],
      overflow_count: 0,
    }), "utf8");

    const first = buildWorkspaceTaskView(root);
    const second = buildWorkspaceTaskView(root);
    assert.strictEqual(first, second);

    fs.writeFileSync(progressPath, JSON.stringify({
      task: "Implement UI",
      items: ["Inspect renderer", "Patch UI", "Run tests", "Finalize"],
      preview_items: ["Inspect renderer", "Patch UI", "Run tests"],
      overflow_count: 1,
    }), "utf8");
    const nextTime = new Date(Date.now() + 2000);
    fs.utimesSync(progressPath, nextTime, nextTime);

    const third = buildWorkspaceTaskView(root);
    assert.notStrictEqual(third, second);
    assert.notStrictEqual(third.renderKey, second.renderKey);
    assert.strictEqual(third.progress.overflowCount, 1);
  });

  it("should invalidate the cached task view when the checkpoint artifact changes", () => {
    const root = createTempWorkspace();
    const appStatePath = path.join(root, ".app_supervisor_state.json");
    const checkpointPath = path.join(root, "CONTEXT_CHECKPOINT.md");

    fs.writeFileSync(appStatePath, JSON.stringify({
      task_summary: "Keep compaction silent",
      status_line: "Checkpoint stored internally",
      walkthrough_status: "pending",
    }), "utf8");
    fs.writeFileSync(checkpointPath, "# Context Checkpoint\n\nGoal: Keep compaction silent\n", "utf8");

    const first = buildWorkspaceTaskView(root);
    const second = buildWorkspaceTaskView(root);
    assert.strictEqual(first, second);

    fs.writeFileSync(checkpointPath, "# Context Checkpoint\n\nGoal: A different checkpoint\n", "utf8");
    const nextTime = new Date(Date.now() + 2000);
    fs.utimesSync(checkpointPath, nextTime, nextTime);

    const third = buildWorkspaceTaskView(root);
    assert.notStrictEqual(third, second);
    assert.notStrictEqual(third.renderKey, second.renderKey);
  });
});
