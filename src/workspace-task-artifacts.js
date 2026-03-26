const fs = require("fs");
const path = require("path");

const TASK_ARTIFACT_FILES = [
  ".app_supervisor_state.json",
  "PROGRESS_UPDATES.json",
  "SESSION_PROGRESS.md",
  "CONTEXT_CHECKPOINT.md",
  "SESSION_SUMMARY.md",
  "walkthrough.md",
];

const WALKTHROUGH_METADATA_LABELS = [
  "Goal",
  "Outcome",
  "Verification",
  "Summary notes",
  "Evidence",
];

const DEFAULT_PROGRESS_PREVIEW_COUNT = 3;
const VISIBLE_SUMMARY_LEAK_PATTERNS = [
  "here is a summary of the conversation to date",
  "previous conversation was too long to summarize",
  "conversation context is extremely limited",
  "key preserved context",
  "the assistant previously attempted",
];
const WALKTHROUGH_RECOGNITION_PATTERNS = [
  /^Goal:\s+/m,
  /^Outcome:\s+/m,
  /^Verification:\s+/m,
  /^Summary notes:\s+/m,
  /^- \[(?:x|X| )\]\s+\*\*Primary goal\*\*:/m,
  /^- \[(?:x|X| )\]\s+\*\*Current status\*\*:/m,
  /^## Verification Results$/m,
];

const WORKSPACE_TASK_VIEW_CACHE = new Map();

/**
 * Read a JSON file when it exists and is valid.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {object | null} Parsed JSON object, or null when unavailable.
 */
function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Read a text file when it exists.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {string} File content, or an empty string when unavailable.
 */
function readTextIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Build a stable file signature from stat metadata.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {string} Compact signature, or "missing" when unavailable.
 */
function getFileSignature(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

/**
 * Build the cache signature for one workspace task view.
 *
 * @param {string} cwd - Absolute workspace root.
 * @returns {string} Signature derived from relevant artifact files.
 */
function buildWorkspaceTaskViewSignature(cwd) {
  const appStatePath = path.join(cwd, ".app_supervisor_state.json");
  const progressPath = path.join(cwd, "PROGRESS_UPDATES.json");
  const walkthroughPath = path.join(cwd, "walkthrough.md");
  const summaryPath = path.join(cwd, "SESSION_SUMMARY.md");
  const walkthroughSignature = getFileSignature(walkthroughPath);
  const effectiveSummarySignature = walkthroughSignature !== "missing"
    ? `walkthrough:${walkthroughSignature}`
    : `summary:${getFileSignature(summaryPath)}`;

  return [
    getFileSignature(appStatePath),
    getFileSignature(progressPath),
    effectiveSummarySignature,
  ].join("|");
}

/**
 * Parse one labeled line from a markdown summary.
 *
 * @param {string} text - Markdown source.
 * @param {string} label - Label prefix such as Goal or Outcome.
 * @returns {string} Parsed value, or an empty string when not found.
 */
function parseSummaryField(text, label) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "mi");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * Remove the legacy key-value footer that may trail a walkthrough file.
 *
 * @param {string} text - Raw walkthrough markdown.
 * @returns {string} Walkthrough markdown without the compatibility footer.
 */
function stripLegacyWalkthroughMetadata(text) {
  const lines = text.split(/\r?\n/);
  let end = lines.length;

  while (end > 0 && !lines[end - 1].trim()) end -= 1;

  let index = end;
  let metadataCount = 0;
  while (index > 0) {
    const line = lines[index - 1].trim();
    if (!line) {
      index -= 1;
      continue;
    }

    if (WALKTHROUGH_METADATA_LABELS.some((label) => line.startsWith(`${label}:`))) {
      metadataCount += 1;
      index -= 1;
      continue;
    }

    break;
  }

  if (metadataCount === 0) return text.trim();
  return lines.slice(0, index).join("\n").trim();
}

/**
 * Check whether text contains leaked conversation-compaction boilerplate.
 *
 * @param {string} text - Candidate markdown content.
 * @returns {boolean} True when the text looks like an internal summary leak.
 */
function containsVisibleSummaryLeak(text) {
  const normalized = String(text || "").toLowerCase();
  return VISIBLE_SUMMARY_LEAK_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Check whether markdown matches a supported walkthrough shape.
 *
 * @param {string} text - Candidate walkthrough markdown.
 * @returns {boolean} True when explicit walkthrough markers are present.
 */
function isRecognizedWalkthroughMarkdown(text) {
  return WALKTHROUGH_RECOGNITION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Build one normalized checklist item.
 *
 * @param {string} rawText - Raw checklist text without the checkbox marker.
 * @param {boolean} checked - Whether the checklist item is checked.
 * @returns {{ checked: boolean, text: string, label: string, value: string }} Structured checklist item.
 */
function buildChecklistItem(rawText, checked) {
  const text = rawText.trim();
  const labelMatch = text.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);
  return {
    checked,
    text,
    label: labelMatch ? labelMatch[1].trim() : "",
    value: labelMatch ? labelMatch[2].trim() : text,
  };
}

/**
 * Extract display text from one progress item.
 *
 * @param {unknown} item - Progress item from JSON artifacts.
 * @returns {string} Normalized display text.
 */
function extractProgressItemText(item) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "";
  }

  const candidateKeys = [
    "text",
    "summary",
    "message",
    "title",
    "label",
    "name",
    "content",
    "change",
    "description",
    "value",
  ];

  for (const key of candidateKeys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

/**
 * Normalize progress items into a stable view model.
 *
 * @param {unknown} items - Candidate progress items from JSON artifacts.
 * @returns {{ index: number, text: string }[]} Structured progress entries.
 */
function normalizeProgressEntries(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      const text = extractProgressItemText(item);
      if (!text) return null;
      return {
        index: index + 1,
        text,
      };
    })
    .filter(Boolean);
}

/**
 * Check whether a line starts a structured markdown block.
 *
 * @param {string} line - Markdown line.
 * @returns {boolean} True when the line starts a supported block.
 */
function isStructuredMarkdownLine(line) {
  const trimmed = line.trim();
  return /^> \[\![A-Z]+\]/.test(trimmed)
    || /^###\s+/.test(trimmed)
    || /^- \[(?:x|X| )\]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || /^- (?!\[(?:x|X| )\])/.test(trimmed)
    || /^```/.test(trimmed);
}

/**
 * Parse a run of supported markdown blocks.
 *
 * @param {string[]} lines - Markdown lines without top-level section headings.
 * @returns {Array<object>} Structured blocks for renderer consumption.
 */
function parseMarkdownBlocks(lines) {
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;

    const trimmed = lines[index].trim();

    if (/^> \[\![A-Z]+\]/.test(trimmed)) {
      const typeMatch = trimmed.match(/^> \[\!([A-Z]+)\]\s*(.*)$/);
      const title = typeMatch ? typeMatch[1].trim() : "NOTE";
      const content = [];
      const firstLine = typeMatch ? typeMatch[2].trim() : "";
      if (firstLine) content.push(firstLine);
      index += 1;

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        content.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({
        type: "alert",
        level: title.toLowerCase(),
        title,
        text: content.join(" ").trim(),
      });
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      blocks.push({
        type: "subheading",
        text: trimmed.replace(/^###\s+/, "").trim(),
      });
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.replace(/^```/, "").trim();
      const content = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        content.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "code",
        language,
        text: content.join("\n").trim(),
      });
      continue;
    }

    if (/^- \[(?:x|X| )\]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^- \[(?:x|X| )\]\s+/.test(lines[index].trim())) {
        const itemLine = lines[index].trim();
        const checked = /^- \[(?:x|X)\]\s+/.test(itemLine);
        items.push(buildChecklistItem(itemLine.replace(/^- \[(?:x|X| )\]\s+/, ""), checked));
        index += 1;
      }
      blocks.push({ type: "list", style: "checklist", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push({
          text: lines[index].trim().replace(/^\d+\.\s+/, "").trim(),
        });
        index += 1;
      }
      blocks.push({ type: "list", style: "ordered", items });
      continue;
    }

    if (/^- (?!\[(?:x|X| )\])/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^- (?!\[(?:x|X| )\])/.test(lines[index].trim())) {
        items.push({
          text: lines[index].trim().replace(/^- /, "").trim(),
        });
        index += 1;
      }
      blocks.push({ type: "list", style: "unordered", items });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !isStructuredMarkdownLine(lines[index])
      && !/^##\s+/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    if (paragraph.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraph.join(" ").trim(),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}

/**
 * Parse the visible walkthrough structure used by the sessions UI.
 *
 * @param {string} text - Raw walkthrough markdown.
 * @returns {{ rawText: string, openingLine: string, summaryChecklist: Array<object>, preSectionBlocks: Array<object>, sections: Array<object> }} Parsed structure.
 */
function parseWalkthroughStructure(text) {
  const visibleText = stripLegacyWalkthroughMetadata(text);
  const lines = visibleText.split(/\r?\n/);
  let index = 0;

  while (index < lines.length && !lines[index].trim()) index += 1;

  let openingLine = "";
  if (
    index < lines.length
    && lines[index].trim()
    && !isStructuredMarkdownLine(lines[index])
    && !/^##\s+/.test(lines[index].trim())
  ) {
    openingLine = lines[index].trim();
    index += 1;
  }

  while (index < lines.length && !lines[index].trim()) index += 1;

  const summaryChecklist = [];
  while (index < lines.length && /^- \[(?:x|X| )\]\s+/.test(lines[index].trim())) {
    const itemLine = lines[index].trim();
    const checked = /^- \[(?:x|X)\]\s+/.test(itemLine);
    summaryChecklist.push(buildChecklistItem(itemLine.replace(/^- \[(?:x|X| )\]\s+/, ""), checked));
    index += 1;
  }

  const preSectionLines = [];
  while (index < lines.length && !/^##\s+/.test(lines[index].trim())) {
    preSectionLines.push(lines[index]);
    index += 1;
  }

  const sections = [];
  while (index < lines.length) {
    if (!/^##\s+/.test(lines[index].trim())) {
      index += 1;
      continue;
    }

    const title = lines[index].trim().replace(/^##\s+/, "").trim();
    index += 1;

    const sectionLines = [];
    while (index < lines.length && !/^##\s+/.test(lines[index].trim())) {
      sectionLines.push(lines[index]);
      index += 1;
    }

    sections.push({
      title,
      blocks: parseMarkdownBlocks(sectionLines),
    });
  }

  return {
    rawText: visibleText,
    openingLine,
    summaryChecklist,
    preSectionBlocks: parseMarkdownBlocks(preSectionLines),
    sections,
  };
}

/**
 * Parse the compact final walkthrough markdown.
 *
 * @param {string} text - Markdown content from SESSION_SUMMARY.md.
 * @returns {object | null} Parsed walkthrough data.
 */
function parseWalkthroughMarkdown(text) {
  if (!text.trim()) return null;
  if (containsVisibleSummaryLeak(text)) return null;
  if (!isRecognizedWalkthroughMarkdown(text)) return null;

  const structure = parseWalkthroughStructure(text);
  const goal = parseSummaryField(text, "Goal");
  const outcome = parseSummaryField(text, "Outcome");
  const verification = parseSummaryField(text, "Verification");
  const summaryNotes = parseSummaryField(text, "Summary notes");
  const evidence = parseSummaryField(text, "Evidence");

  const primaryGoalItem = structure.summaryChecklist.find((item) => item.label.toLowerCase() === "primary goal");
  const statusItem = structure.summaryChecklist.find((item) => item.label.toLowerCase() === "current status");
  const verificationItem = structure.summaryChecklist.find((item) => item.label.toLowerCase() === "verification status");
  const firstAlert = structure.preSectionBlocks.find((block) => block.type === "alert");
  const verificationSection = structure.sections.find((section) => section.title === "Verification Results");
  const evidenceList = verificationSection?.blocks.find((block) => block.type === "list");

  const normalizedGoal = goal || primaryGoalItem?.value || "";
  const normalizedOutcome = outcome || statusItem?.value || structure.openingLine || "";
  const normalizedVerification = verification || verificationItem?.value || "";
  const normalizedSummaryNotes = summaryNotes || firstAlert?.text || structure.openingLine || "";
  const normalizedEvidence = evidence
    || evidenceList?.items?.map((item) => item.text || item.value || "").filter(Boolean).join("; ")
    || "";

  if (
    !normalizedGoal
    && !normalizedOutcome
    && !normalizedVerification
    && !normalizedSummaryNotes
    && !normalizedEvidence
    && structure.summaryChecklist.length === 0
    && structure.sections.length === 0
  ) {
    return null;
  }

  return {
    goal: normalizedGoal,
    outcome: normalizedOutcome,
    verification: normalizedVerification,
    summaryNotes: normalizedSummaryNotes,
    evidence: normalizedEvidence,
    openingLine: structure.openingLine,
    summaryChecklist: structure.summaryChecklist,
    preSectionBlocks: structure.preSectionBlocks,
    sections: structure.sections,
    rawText: structure.rawText,
  };
}

/**
 * Build a deduplicated workspace-root list from session and global state.
 *
 * @param {{
 *   sessionEntries: Iterable<[string, { cwd?: string | null }]> | Iterable<{ cwd?: string | null }>,
 *   activeWorkspaceRoots?: string[],
 *   savedWorkspaceRoots?: string[]
 * }} input - Workspace source collections.
 * @returns {string[]} Unique absolute workspace roots.
 */
function collectWorkspaceRoots(input) {
  const {
    sessionEntries,
    activeWorkspaceRoots = [],
    savedWorkspaceRoots = [],
  } = input;
  const roots = new Set();

  for (const root of [...activeWorkspaceRoots, ...savedWorkspaceRoots]) {
    if (typeof root === "string" && root) roots.add(root);
  }

  for (const entry of sessionEntries) {
    if (Array.isArray(entry)) {
      const [, session] = entry;
      if (session && typeof session.cwd === "string" && session.cwd) roots.add(session.cwd);
      continue;
    }
    if (entry && typeof entry.cwd === "string" && entry.cwd) roots.add(entry.cwd);
  }

  return [...roots].sort();
}

/**
 * Build one workspace task view for the sessions UI.
 *
 * @param {string} cwd - Absolute workspace root.
 * @returns {object | null} Normalized workspace task view, or null when no task artifact is present.
 */
function buildWorkspaceTaskView(cwd) {
  if (!cwd) return null;

  const signature = buildWorkspaceTaskViewSignature(cwd);
  const cached = WORKSPACE_TASK_VIEW_CACHE.get(cwd);
  if (cached && cached.signature === signature) {
    return cached.view;
  }

  const appState = readJsonIfExists(path.join(cwd, ".app_supervisor_state.json"));
  const progress = readJsonIfExists(path.join(cwd, "PROGRESS_UPDATES.json"));
  const summaryText = readTextIfExists(path.join(cwd, "walkthrough.md")) || readTextIfExists(path.join(cwd, "SESSION_SUMMARY.md"));
  const summary = parseWalkthroughMarkdown(summaryText);

  if (!appState && !progress && !summary) {
    WORKSPACE_TASK_VIEW_CACHE.delete(cwd);
    return null;
  }

  const progressEntries = normalizeProgressEntries(progress?.items || appState?.progress_updates);
  const previewCount = Number.isInteger(progress?.preview_count)
    ? progress.preview_count
    : DEFAULT_PROGRESS_PREVIEW_COUNT;
  const explicitPreviewEntries = normalizeProgressEntries(progress?.preview_items);
  const previewEntries = explicitPreviewEntries.length > 0
    ? explicitPreviewEntries
    : progressEntries.slice(Math.max(0, progressEntries.length - previewCount));
  const progressItems = progressEntries.map((entry) => entry.text);
  const previewItems = previewEntries.map((entry) => entry.text);
  const overflowCount = Number.isInteger(progress?.overflow_count)
    ? progress.overflow_count
    : Math.max(0, progressEntries.length - previewEntries.length);
  const walkthroughReady = appState
    ? appState?.walkthrough_status === "ready" || appState?.final_walkthrough === true
    : !!summary;
  const goal = progress?.task || appState?.task_summary || summary?.goal || path.basename(cwd);
  const statusLine = appState?.status_line
    || (walkthroughReady ? summary?.outcome || summary?.openingLine || "" : "");

  const view = {
    cwd,
    goal,
    mode: walkthroughReady && summary ? "walkthrough" : "progress",
    renderKey: signature,
    processLane: appState?.process_lane || "",
    statusLine,
    walkthroughStatus: walkthroughReady ? "ready" : "pending",
    progress: {
      entries: progressEntries,
      previewEntries,
      items: progressItems,
      previewItems,
      previewCount,
      overflowCount,
      expandable: progress?.expandable !== false && progressEntries.length > previewEntries.length,
    },
    walkthrough: summary,
    updatedAt: progress?.updated_at || appState?.updated_at || null,
  };

  WORKSPACE_TASK_VIEW_CACHE.set(cwd, {
    signature,
    view,
  });

  return view;
}

/**
 * Build task views for a workspace-root list.
 *
 * @param {string[]} roots - Absolute workspace roots.
 * @returns {Record<string, object>} Workspace view map keyed by cwd.
 */
function buildWorkspaceTaskViews(roots) {
  const views = {};
  for (const root of roots) {
    const view = buildWorkspaceTaskView(root);
    if (view) views[root] = view;
  }
  return views;
}

module.exports = {
  TASK_ARTIFACT_FILES,
  buildWorkspaceTaskView,
  buildWorkspaceTaskViews,
  containsVisibleSummaryLeak,
  collectWorkspaceRoots,
  isRecognizedWalkthroughMarkdown,
  parseWalkthroughMarkdown,
  parseWalkthroughStructure,
  stripLegacyWalkthroughMetadata,
};
