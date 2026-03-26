#!/usr/bin/env node
// Clawd Desktop Pet — Claude Code Hook Script
// Zero dependencies, fast cold start, 1s timeout
// Usage: node clawd-hook.js <event_name>
// Reads stdin JSON from Claude Code for session_id

const EVENT_TO_STATE = {
  SessionStart: "idle",
  SessionEnd: "sleeping",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PostToolUse: "working",
  PostToolUseFailure: "error",
  Stop: "attention",
  SubagentStart: "juggling",
  SubagentStop: "working",
  PreCompact: "sweeping",
  PostCompact: "attention",
  Notification: "notification",
  // PermissionRequest is handled by HTTP hook (blocking) — not command hook
  Elicitation: "notification",
  WorktreeCreate: "carrying",
};

const event = process.argv[2];
const state = EVENT_TO_STATE[event];
if (!state) process.exit(0);

// Walk the process tree to find the terminal app PID.
// Claude Code spawns hooks through multiple transient layers (workers, shells).
// We walk up until we find a known terminal app, then let focusTerminalWindow
// walk the remaining hops (it has its own parent walk with MainWindowHandle check).
// Runs synchronously during stdin buffering (~100ms per level × 5-6 levels).
// Known terminal/launcher apps — outermost match becomes the focus target.
// focusTerminalWindow() walks further up via MainWindowHandle if needed,
// so including launchers (e.g. antigravity) that host terminals is correct.
const TERMINAL_NAMES_WIN = new Set([
  "windowsterminal.exe", "cmd.exe", "powershell.exe", "pwsh.exe",
  "code.exe", "alacritty.exe", "wezterm-gui.exe", "mintty.exe",
  "conemu64.exe", "conemu.exe", "hyper.exe", "tabby.exe",
  "antigravity.exe", "warp.exe", "iterm.exe", "ghostty.exe",
]);
const TERMINAL_NAMES_MAC = new Set([
  "terminal", "iterm2", "alacritty", "wezterm-gui", "kitty",
  "hyper", "tabby", "warp", "ghostty",
]);

const SYSTEM_BOUNDARY_WIN = new Set(["explorer.exe", "services.exe", "winlogon.exe", "svchost.exe"]);
const SYSTEM_BOUNDARY_MAC = new Set(["launchd", "init", "systemd"]);

// Editor detection — process name → URI scheme name (for VS Code/Cursor tab focus)
const EDITOR_MAP_WIN = { "code.exe": "code", "cursor.exe": "cursor" };
const EDITOR_MAP_MAC = { "code": "code", "cursor": "cursor" };

// Claude Code process detection — for liveness check in main.js
const CLAUDE_NAMES_WIN = new Set(["claude.exe"]);
const CLAUDE_NAMES_MAC = new Set(["claude"]);

let _stablePid = null;
let _detectedEditor = null; // "code" or "cursor" — for URI scheme terminal tab focus
let _claudePid = null;       // Claude Code process PID — for crash/orphan detection
let _pidChain = [];          // all PIDs visited during tree walk

function getStablePid() {
  if (_stablePid) return _stablePid;
  const { execSync } = require("child_process");
  const isWin = process.platform === "win32";
  const terminalNames = isWin ? TERMINAL_NAMES_WIN : TERMINAL_NAMES_MAC;
  const systemBoundary = isWin ? SYSTEM_BOUNDARY_WIN : SYSTEM_BOUNDARY_MAC;
  const editorMap = isWin ? EDITOR_MAP_WIN : EDITOR_MAP_MAC;
  const claudeNames = isWin ? CLAUDE_NAMES_WIN : CLAUDE_NAMES_MAC;

  const processMap = new Map(); // pid -> { ppid, name, comm }
  _pidChain = [];
  _detectedEditor = null;
  _claudePid = null;

  try {
    if (isWin) {
      const out = execSync(
        `wmic process get ProcessId,ParentProcessId,Name /format:csv`,
        { encoding: "utf8", timeout: 2000, windowsHide: true }
      );
      const lines = out.trim().split("\n");
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length < 4) continue;
        const pid = parseInt(parts[parts.length - 2], 10);
        const ppid = parseInt(parts[parts.length - 3], 10);
        const name = (parts[parts.length - 1] || "").trim().toLowerCase();
        if (!isNaN(pid) && !isNaN(ppid)) processMap.set(pid, { ppid, name, comm: name });
      }
    } else {
      const out = execSync(`ps -ax -o pid=,ppid=,comm=`, { encoding: "utf8", timeout: 2000 });
      const lines = out.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const comm = parts.slice(2).join(" "); // handle spaces in command path
        const name = require("path").basename(comm).toLowerCase();
        if (!isNaN(pid) && !isNaN(ppid)) processMap.set(pid, { ppid, name, comm });
      }
    }
  } catch (e) {
    _stablePid = process.ppid;
    return _stablePid;
  }

  let pid = process.ppid;
  let lastGoodPid = pid;
  let terminalPid = null;

  for (let i = 0; i < 10; i++) {
    const info = processMap.get(pid);
    if (!info) break;
    _pidChain.push(pid);
    const { ppid, name, comm } = info;

    // Detected Editor detection
    if (!_detectedEditor) {
      if (editorMap[name]) _detectedEditor = editorMap[name];
      else {
        const fullLower = comm.toLowerCase();
        if (fullLower.includes("visual studio code")) _detectedEditor = "code";
        else if (fullLower.includes("cursor.app")) _detectedEditor = "cursor";
      }
    }

    // Claude Code detection
    if (!_claudePid) {
      if (claudeNames.has(name)) {
        _claudePid = pid;
      } else if (name === "node.exe" || name === "node") {
        if (comm.includes("claude-code") || comm.includes("@anthropic-ai")) _claudePid = pid;
      }
    }

    if (systemBoundary.has(name)) break;
    if (terminalNames.has(name)) terminalPid = pid;
    lastGoodPid = pid;
    if (!ppid || ppid === pid || ppid <= 1) break;
    pid = ppid;
  }

  _stablePid = terminalPid || lastGoodPid;
  return _stablePid;
}

// Pre-resolve on SessionStart (runs during stdin buffering, not after)
if (event === "SessionStart") getStablePid();

// Read stdin for session_id (Claude Code pipes JSON with session metadata)
const chunks = [];
let sent = false;

process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let sessionId = "default";
  let cwd = "";
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    sessionId = payload.session_id || "default";
    cwd = payload.cwd || "";
  } catch {}
  send(sessionId, cwd);
});

// Safety: if stdin doesn't end in 400ms, send with default session
// (200ms was too aggressive on slow machines / AV scanning)
setTimeout(() => send("default", ""), 400);

function send(sessionId, cwd) {
  if (sent) return;
  sent = true;

  const body = { state, session_id: sessionId, event };
  body.agent_id = "claude-code";
  if (cwd) body.cwd = cwd;
  // Always walk to stable terminal PID — process.ppid is an ephemeral shell
  // that dies when the hook exits, so it's useless for later focus calls
  body.source_pid = getStablePid();
  if (_detectedEditor) body.editor = _detectedEditor;
  if (_claudePid) {
    body.agent_pid = _claudePid;
    body.claude_pid = _claudePid; // backward compat with older Clawd versions
  }
  if (_pidChain.length) body.pid_chain = _pidChain;

  const data = JSON.stringify(body);
  const req = require("http").request(
    {
      hostname: "127.0.0.1",
      port: 23333,
      path: "/state",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: 500,  // 400ms stdin + 500ms HTTP = 900ms < 1000ms Claude Code budget
    },
    () => process.exit(0)
  );
  req.on("error", () => process.exit(0));
  req.on("timeout", () => { req.destroy(); process.exit(0); });
  req.end(data);
}
