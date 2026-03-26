/**
 * Create a reference-counted controller for pausing and resuming cursor polling.
 *
 * @param {{ pauseCursorPolling: () => void, resumeFromReaction: () => void }} electronApi
 * @returns {{
 *   pause: () => void,
 *   resume: () => void,
 *   forceResume: () => void,
 *   getDepth: () => number
 * }}
 */
function createCursorPollingController(electronApi) {
  let pauseDepth = 0;

  return {
    pause() {
      pauseDepth += 1;
      if (pauseDepth === 1) {
        electronApi.pauseCursorPolling();
      }
    },

    resume() {
      if (pauseDepth === 0) return;
      pauseDepth -= 1;
      if (pauseDepth === 0) {
        electronApi.resumeFromReaction();
      }
    },

    forceResume() {
      if (pauseDepth === 0) return;
      pauseDepth = 0;
      electronApi.resumeFromReaction();
    },

    getDepth() {
      return pauseDepth;
    },
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createCursorPollingController,
  };
}

if (typeof window !== "undefined") {
  window.rendererStateUtils = {
    createCursorPollingController,
  };
}
