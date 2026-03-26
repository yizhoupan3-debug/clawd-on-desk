const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SESSIONS_HTML_PATH = path.join(__dirname, "..", "src", "sessions.html");
const sessionsHtml = fs.readFileSync(SESSIONS_HTML_PATH, "utf8");

describe("sessions workspace row UI contract", () => {
  it("exposes delete workspace and create process actions", () => {
    assert.match(sessionsHtml, /Delete Workspace/);
    assert.match(sessionsHtml, /Create Process/);
    assert.match(sessionsHtml, /DELETE_WORKSPACE_ICON/);
    assert.match(sessionsHtml, /CREATE_PROCESS_ICON/);
  });

  it("keeps the row itself as the wide toggle target with path tooltip", () => {
    assert.match(sessionsHtml, /row\.setAttribute\('role', 'button'\);/);
    assert.match(sessionsHtml, /row\.title = cwd \|\| 'Workspace path unavailable';/);
    assert.match(sessionsHtml, /toggleWorkspaceExpansion\(workspaceKey\);/);
  });

  it("shows the down arrow on hover or expanded state", () => {
    assert.match(sessionsHtml, /\.workspace-row:hover \.folder-icon \.arrow-path,/);
    assert.match(sessionsHtml, /\.workspace-row\.expanded \.folder-icon \.arrow-path/);
  });
});
