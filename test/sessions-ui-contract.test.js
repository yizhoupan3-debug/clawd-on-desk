const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SESSIONS_HTML_PATH = path.join(__dirname, "..", "src", "sessions.html");
const sessionsHtml = fs.readFileSync(SESSIONS_HTML_PATH, "utf8");

/**
 * Assert that every regex pattern is present in the provided source.
 *
 * @param {string} source - Text to inspect.
 * @param {Array<{ pattern: RegExp, message: string }>} checks - Required snippets.
 * @returns {void}
 */
function assertAllMatch(source, checks) {
  for (const { pattern, message } of checks) {
    assert.match(source, pattern, message);
  }
}

describe("sessions workspace UI contract", () => {
  it("keeps the expanded workspace shell and row-level workspace actions intact", () => {
    assertAllMatch(sessionsHtml, [
      { pattern: /\.workspace-expanded-shell/, message: "workspace shell should remain a split view" },
      { pattern: /Delete Workspace/, message: "workspace delete action should stay visible" },
      { pattern: /Create Process/, message: "workspace process action should stay visible" },
      { pattern: /row\.setAttribute\('role', 'button'\);/, message: "workspace row should remain clickable" },
      { pattern: /row\.title = cwd \|\| 'Workspace path unavailable';/, message: "workspace row should keep the path tooltip" },
      { pattern: /toggleWorkspaceExpansion\(workspaceKey\);/, message: "workspace row should keep expand/collapse behavior" },
    ]);
  });

  it("exposes the workspace tree toolbar, context menu actions, and Mac shortcuts", () => {
    assertAllMatch(sessionsHtml, [
      { pattern: /treeNewFileBtn\.textContent = 'New File';/, message: "tree toolbar should expose new file" },
      { pattern: /treeNewFolderBtn\.textContent = 'New Folder';/, message: "tree toolbar should expose new folder" },
      { pattern: /treeRefreshBtn\.textContent = 'Refresh';/, message: "tree toolbar should expose refresh" },
      { pattern: /treeToolbar\.append\(treeNewFileBtn, treeNewFolderBtn, treeRefreshBtn\);/, message: "tree toolbar should keep the three-button layout" },
      { pattern: /await openWorkspaceDocument\(nodeEntry, documentState, normalizedPath, \{ force: true \}\);/, message: "tree files should open in the embedded workbench" },
      { pattern: /const documentState = ensureWorkspaceDocumentState\(state\.workspaceKey, state\.cwd\);/, message: "tree file open should bind to the workspace document state" },
      { pattern: /void runWorkspaceTreeOpenEntry\(nodeEntry, state, entry\.relativePath\);/, message: "double-clicking a file should open it" },
      { pattern: /createWorkspaceTreeMenuItem\('Cut', '⌘X'/, message: "tree context menu should keep cut" },
      { pattern: /createWorkspaceTreeMenuItem\('Copy', '⌘C'/, message: "tree context menu should keep copy" },
      { pattern: /createWorkspaceTreeMenuItem\('Paste', '⌘V'/, message: "tree context menu should keep paste" },
      { pattern: /createWorkspaceTreeMenuItem\('Copy relative path', '⌥⌘C'/, message: "tree context menu should keep relative path copy" },
      { pattern: /createWorkspaceTreeMenuItem\('Copy absolute path', '⌥⇧⌘C'/, message: "tree context menu should keep absolute path copy" },
      { pattern: /createWorkspaceTreeMenuItem\('Delete', '⌘⌫'/, message: "tree context menu should keep delete" },
      { pattern: /createWorkspaceTreeMenuItem\('Rename', '↩'/, message: "tree context menu should keep rename" },
      { pattern: /if \(isMeta && !isAlt && key === 'x' && hasSelection\)/, message: "⌘X shortcut should stay wired" },
      { pattern: /if \(isMeta && !isAlt && key === 'c' && !event\.shiftKey && hasSelection\)/, message: "⌘C shortcut should stay wired" },
      { pattern: /if \(isMeta && !isAlt && key === 'v'\)/, message: "⌘V shortcut should stay wired" },
      { pattern: /if \(isMeta && isAlt && !event\.shiftKey && key === 'c' && hasSelection\)/, message: "⌥⌘C shortcut should stay wired" },
      { pattern: /if \(isMeta && isAlt && event\.shiftKey && key === 'c' && hasSelection\)/, message: "⌥⇧⌘C shortcut should stay wired" },
      { pattern: /if \(isMeta && key === 'backspace' && hasSelection\)/, message: "⌘⌫ shortcut should stay wired" },
      { pattern: /if \(key === 'enter' && hasSelection\)/, message: "Enter rename shortcut should stay wired" },
      { pattern: /target\.tagName === 'INPUT'/, message: "keyboard handling should keep input fields exempt" },
    ]);
  });

  it("keeps the thread time text compact", () => {
    assertAllMatch(sessionsHtml, [
      { pattern: /function formatThreadRelativeTime\(updatedAt\) \{/, message: "thread time helper should exist" },
      { pattern: /if \(deltaMs < 60_000\) return 'now';/, message: "sub-minute thread times should say now" },
      { pattern: /if \(minutes < 60\) return `\$\{minutes\} min`;/, message: "minute thread times should stay compact" },
      { pattern: /if \(hours < 24\) return `\$\{hours\} h`;/, message: "hour thread times should stay compact" },
      { pattern: /return `\$\{days\} d`;/, message: "day thread times should stay compact" },
      { pattern: /timeEl\.textContent = formatThreadRelativeTime\(thread\.updatedAt\);/, message: "thread rows should use the compact helper" },
    ]);
  });
});
