// --- Pointer-based drag + click detection (with Pointer Capture for safety) ---
const container = document.getElementById("pet-container");
let isDragging = false;
let didDrag = false; // true if pointer moved > threshold during this press
let mouseDownScreenX, mouseDownScreenY;
let dragOffsetX = 0, dragOffsetY = 0;
let latestTargetX = 0, latestTargetY = 0;
let dragRAF = null;
const DRAG_THRESHOLD = 3; // px — less than this = click, more = drag

container.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    container.setPointerCapture(e.pointerId);  // Guarantees pointerup even if pointer leaves window
    isDragging = true;
    didDrag = false;
    mouseDownScreenX = e.screenX;
    mouseDownScreenY = e.screenY;
    dragOffsetX = e.clientX;
    dragOffsetY = e.clientY;
    window.electronAPI.dragLock(true);
    container.classList.add("dragging");
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    latestTargetX = e.screenX - dragOffsetX;
    latestTargetY = e.screenY - dragOffsetY;

    // Mark as drag if moved beyond threshold
    if (!didDrag) {
      const totalDx = e.screenX - mouseDownScreenX;
      const totalDy = e.screenY - mouseDownScreenY;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        startDragReaction();
      }
    }

    if (!dragRAF) {
      dragRAF = requestAnimationFrame(() => {
        window.electronAPI.moveWindowTo(latestTargetX, latestTargetY);
        dragRAF = null;
      });
    }
  }
});

function stopDrag() {
  if (!isDragging) return;
  isDragging = false;
  window.electronAPI.dragLock(false);
  container.classList.remove("dragging");
  
  if (dragRAF) {
    cancelAnimationFrame(dragRAF);
    dragRAF = null;
    window.electronAPI.moveWindowTo(latestTargetX, latestTargetY);
  }

  // Only trigger edge snap check on actual drags (not clicks)
  if (didDrag) {
    window.electronAPI.dragEnd();
  }
  endDragReaction();
}

document.addEventListener("pointerup", (e) => {
  if (e.button === 0) {
    const wasDrag = didDrag;
    stopDrag();
    if (!wasDrag) {
      if (e.ctrlKey || e.metaKey) {
        window.electronAPI.showSessionMenu();
      } else {
        handleClick(e.clientX);
      }
    }
  }
});

// Pointer Capture can end via OS interruption (Alt+Tab, system dialog, etc.)
container.addEventListener("pointercancel", stopDrag);
container.addEventListener("lostpointercapture", () => {
  if (isDragging) stopDrag();
});

window.addEventListener("blur", stopDrag);

// --- Do Not Disturb (synced from main process) ---
let dndEnabled = false;
window.electronAPI.onDndChange((enabled) => { dndEnabled = enabled; });

// --- Mini Mode (synced from main process) ---
let miniMode = false;

let currentThemeColor = null;

function applyTheme(objectEl) {
  if (!currentThemeColor) return;
  try {
    const doc = objectEl.contentDocument;
    if (!doc) return;
    let style = doc.getElementById("deer-theme");
    if (!style) {
      style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
      style.id = "deer-theme";
      doc.documentElement.appendChild(style);
    }
    style.textContent = `[fill="#DE886D"], [fill="#de886d"] { fill: ${currentThemeColor} !important; }`;
  } catch(e) {}
}

window.electronAPI.onThemeChange((color) => {
  currentThemeColor = color;
  if (clawdEl) applyTheme(clawdEl);
});
window.electronAPI.onMiniModeChange((enabled) => {
  miniMode = enabled;
  container.style.cursor = enabled ? "default" : "";
  if (!enabled && isDragging) {
    startDragReaction();
  }
});

// --- Click reaction (2-click = poke, 4-click = flail) ---
const CLICK_WINDOW_MS = 400;  // max gap between consecutive clicks
const REACT_LEFT_SVG = "clawd-react-left.svg";
const REACT_RIGHT_SVG = "clawd-react-right.svg";
const REACT_DOUBLE_SVG = "clawd-react-double.svg";
const REACT_DRAG_SVG = "clawd-react-drag.svg";
const REACT_SINGLE_DURATION = 2500;
const REACT_DOUBLE_DURATION = 3500;

let clickCount = 0;
let clickTimer = null;
let firstClickDir = null;     // direction from the first click in a sequence
let isReacting = false;       // click reaction animation is playing
let isDragReacting = false;   // drag reaction is active
let reactTimer = null;        // auto-return timer
let currentIdleSvg = null;    // tracks which SVG is currently showing
let pendingSwapFallbackTimer = null;
const cursorPollingController = window.rendererStateUtils.createCursorPollingController(window.electronAPI);

function getObjectSvgName(objectEl) {
  if (!objectEl) return null;
  const data = objectEl.getAttribute("data") || objectEl.data || "";
  if (!data) return null;
  const clean = data.split(/[?#]/)[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || null;
}

const SVG_IDLE_FOLLOW = "clawd-idle-follow.svg";

function shouldTrackEyes(state, svg) {
  return (state === "idle" && svg === SVG_IDLE_FOLLOW) || state === "mini-idle";
}

/**
 * Pause cursor-driven polling in the main process without double-pausing.
 *
 * @returns {void}
 */
function pauseCursorPolling() {
  cursorPollingController.pause();
}

/**
 * Resume cursor-driven polling when the last local pause reason is cleared.
 *
 * @returns {void}
 */
function resumeCursorPolling() {
  cursorPollingController.resume();
}

/**
 * Force polling to resume after interrupted reactions or state swaps.
 *
 * @returns {void}
 */
function forceResumeCursorPolling() {
  cursorPollingController.forceResume();
}

/**
 * Clear the fallback timer associated with the pending SVG swap.
 *
 * @returns {void}
 */
function clearPendingSwapFallbackTimer() {
  if (!pendingSwapFallbackTimer) return;
  clearTimeout(pendingSwapFallbackTimer);
  pendingSwapFallbackTimer = null;
}

/**
 * Remove the current pending SVG node and its fallback timer.
 *
 * @returns {void}
 */
function clearPendingSwap() {
  if (pendingNext) {
    pendingNext.remove();
    pendingNext = null;
  }
  clearPendingSwapFallbackTimer();
}

/**
 * Queue an SVG object swap with a guarded fallback for slow loads.
 *
 * @param {string} svgFile - SVG asset filename to mount.
 * @param {(objectEl: HTMLObjectElement) => void} [afterSwap] - Optional callback after the swap succeeds.
 * @returns {void}
 */
function queueSvgSwap(svgFile, afterSwap) {
  clearPendingSwap();

  const next = document.createElement("object");
  next.type = "image/svg+xml";
  next.id = "clawd";
  next.style.opacity = "0";

  const swap = () => {
    if (pendingNext !== next) return;
    clearPendingSwapFallbackTimer();
    next.style.transition = "none";
    next.style.opacity = "1";
    for (const child of [...container.querySelectorAll("object")]) {
      if (child !== next) child.remove();
    }
    pendingNext = null;
    clawdEl = next;
    currentDisplayedSvg = svgFile;
    applyTheme(next);
    if (afterSwap) afterSwap(next);
  };

  next.addEventListener("load", swap, { once: true });
  next.data = `../assets/svg/${svgFile}`;
  container.appendChild(next);
  pendingNext = next;
  pendingSwapFallbackTimer = setTimeout(() => {
    if (pendingNext !== next) return;
    try {
      if (!next.contentDocument) {
        next.remove();
        pendingNext = null;
        pendingSwapFallbackTimer = null;
        return;
      }
    } catch {}
    swap();
  }, 3000);
}

function handleClick(clientX) {
  if (miniMode) {
    window.electronAPI.exitMiniMode();
    return;
  }
  if (isReacting || isDragReacting) return;

  // Non-idle states: single click → focus terminal directly, no reaction animation
  if (currentIdleSvg !== "clawd-idle-follow.svg" && currentIdleSvg !== "clawd-idle-living.svg") {
    window.electronAPI.focusTerminal();
    return;
  }

  // Idle states: immediate focus on first click, still track for reactions
  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < container.offsetWidth / 2 ? "left" : "right";
    window.electronAPI.focusTerminal();  // Instant — no 400ms wait
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  if (clickCount >= 2) {
    // 2 clicks → Show Session Menu (Threads)
    clickCount = 0;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    window.electronAPI.showSessionMenu();
  } else {
    // 1st click
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
    }, CLICK_WINDOW_MS);
  }
}

function playReaction(svgFile, durationMs) {
  isReacting = true;
  detachEyeTracking();
  pauseCursorPolling();
  queueSvgSwap(svgFile);

  reactTimer = setTimeout(() => endReaction(), durationMs);
}

function endReaction() {
  if (!isReacting) return;
  isReacting = false;
  reactTimer = null;
  resumeCursorPolling();
}

function cancelReaction() {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  if (isReacting) {
    if (reactTimer) { clearTimeout(reactTimer); reactTimer = null; }
    isReacting = false;
  }
  if (isDragReacting) {
    isDragReacting = false;
  }
  forceResumeCursorPolling();
}

// --- Drag reaction (loops while dragging, idle-follow only) ---
function swapToSvg(svgFile) {
  queueSvgSwap(svgFile);
}

function startDragReaction() {
  if (isDragReacting) return;
  if (dndEnabled) return;  // DND: just move the window, no reaction animation
  if (miniMode) return;    // Mini-mode: slide seamlessly without visually popping out

  // Drag interrupts click reaction if active
  if (isReacting) {
    if (reactTimer) { clearTimeout(reactTimer); reactTimer = null; }
    isReacting = false;
  }

  isDragReacting = true;
  detachEyeTracking();
  pauseCursorPolling();
  swapToSvg(REACT_DRAG_SVG);
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  resumeCursorPolling();
}

// --- State change → switch SVG animation (preload + instant swap) ---
let clawdEl = document.getElementById("clawd");
let pendingNext = null;
let currentDisplayedSvg = getObjectSvgName(clawdEl);
currentIdleSvg = currentDisplayedSvg;

window.electronAPI.onStateChange((state, svg) => {
  // Main process state change → cancel any active click reaction
  cancelReaction();

  clearPendingSwap();
  if (clawdEl && clawdEl.isConnected && currentDisplayedSvg === svg) {
    if (shouldTrackEyes(state, svg) && !eyeTarget) {
      attachEyeTracking(clawdEl);
    } else if (!shouldTrackEyes(state, svg)) {
      detachEyeTracking();
    }
    currentIdleSvg = svg;
    return;
  }
  detachEyeTracking();
  queueSvgSwap(svg, (next) => {
    if (shouldTrackEyes(state, svg)) {
      attachEyeTracking(next);
    }
    currentIdleSvg = svg;
  });
});

// --- Eye tracking (idle state only) ---
let eyeTarget = null;
let bodyTarget = null;
let shadowTarget = null;
let lastEyeDx = 0;
let lastEyeDy = 0;
let eyeAttachToken = 0;

function applyEyeMove(dx, dy) {
  if (eyeTarget) {
    eyeTarget.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  if (bodyTarget || shadowTarget) {
    const bdx = Math.round(dx * 0.33 * 2) / 2;
    const bdy = Math.round(dy * 0.33 * 2) / 2;
    if (bodyTarget) bodyTarget.style.transform = `translate(${bdx}px, ${bdy}px)`;
    if (shadowTarget) {
      // Shadow stretches toward lean direction (feet stay anchored)
      const absDx = Math.abs(bdx);
      const scaleX = 1 + absDx * 0.15;
      const shiftX = Math.round(bdx * 0.3 * 2) / 2;
      shadowTarget.style.transform = `translate(${shiftX}px, 0) scaleX(${scaleX})`;
    }
  }
}

function attachEyeTracking(objectEl) {
  const token = ++eyeAttachToken;
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;

  const tryAttach = (attempt) => {
    if (token !== eyeAttachToken) return;
    if (!objectEl || !objectEl.isConnected) return;

    try {
      const svgDoc = objectEl.contentDocument;
      const eyes = svgDoc && svgDoc.getElementById("eyes-js");
      if (eyes) {
        eyeTarget = eyes;
        bodyTarget = svgDoc.getElementById("body-js");
        shadowTarget = svgDoc.getElementById("shadow-js");
        applyEyeMove(lastEyeDx, lastEyeDy);
        return;
      }
    } catch (e) {
      console.warn("Cannot access SVG contentDocument for eye tracking:", e.message);
      return;
    }

    if (attempt >= 60) {
      console.warn("Timed out waiting for SVG eye targets");
      return;
    }
    // setTimeout fallback — rAF may be throttled in unfocused windows
    setTimeout(() => tryAttach(attempt + 1), 16);
  };

  tryAttach(0);
}

function detachEyeTracking() {
  eyeAttachToken++;
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;
}

window.electronAPI.onEyeMove((dx, dy) => {
  lastEyeDx = dx;
  lastEyeDy = dy;
  // Detect stale eye targets (e.g. after DWM z-order recovery invalidates contentDocument)
  if (eyeTarget && !eyeTarget.ownerDocument?.defaultView) {
    eyeTarget = null;
    bodyTarget = null;
    shadowTarget = null;
    if (clawdEl && clawdEl.isConnected) attachEyeTracking(clawdEl);
    return;
  }
  applyEyeMove(dx, dy);
});

// --- Wake from doze (smooth eye opening) ---
window.electronAPI.onWakeFromDoze(() => {
  if (clawdEl && clawdEl.contentDocument) {
    try {
      const eyes = clawdEl.contentDocument.getElementById("eyes-doze");
      if (eyes) eyes.style.transform = "scaleY(1)";
    } catch (e) {}
  }
});

// --- Right-click context menu ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu();
});
