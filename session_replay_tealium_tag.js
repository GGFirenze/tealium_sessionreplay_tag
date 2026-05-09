// Amplitude Session Replay (Standalone SDK) via Tealium iQ Custom Tag
// Version: 1.0.0 -- May 2026
//
// Architecture: assumption that events are sent to Amplitude via Tealium EventStream
// (server-side). This tag loads the Standalone Session Replay SDK on the client and
// passes deviceId / sessionId from the Tealium data layer so that replays link
// correctly to the server-side events.
//
// Requirements:
//   - The deviceId and sessionId values passed here MUST match the values sent
//     server-side via EventStream. If they differ, replays won't attach to events.
//   - Tealium data layer must expose: device_id (or amplitude_device_id) and
//     session_id (or amplitude_session_id) on every page view.
//
// SDK: @amplitude/session-replay-browser v1.39.0
// CDN: https://cdn.amplitude.com/libs/session-replay-browser-1.39.0-min.js.gz
// Data residency: US

(function () {
  "use strict";

  // ─── CONFIGURATION ───────────────────────────────────────────────────────────
  // Map these to the correct Tealium data layer variables in the Tealium UI,
  // or hardcode the API key below.
  var CONFIG = {
    apiKey: "##AMPLITUDE_API_KEY##",
    sampleRate: 1.0,
    // Data layer variable names (adjust to match your Tealium UDO/data layer)
    deviceIdVar: "amplitude_device_id",
    sessionIdVar: "amplitude_session_id"
  };

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  function getDataLayerValue(key) {
    // Tealium exposes the data layer on window.utag_data (iQ) or via b object.
    // In a Custom Tag (JS Code), utag_data is the most reliable global reference.
    if (window.utag_data && window.utag_data[key]) {
      return window.utag_data[key];
    }
    return undefined;
  }

  function loadScript(src, callback) {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = src;
    script.addEventListener("load", function () {
      callback(null);
    });
    script.addEventListener("error", function () {
      callback(new Error("Failed to load: " + src));
    });
    var head = document.getElementsByTagName("head")[0];
    if (head) head.appendChild(script);
  }

  // ─── MAIN ────────────────────────────────────────────────────────────────────

  var deviceId = getDataLayerValue(CONFIG.deviceIdVar);
  var sessionId = getDataLayerValue(CONFIG.sessionIdVar);

  if (!deviceId || !sessionId) {
    if (window.utag && utag.DB) {
      utag.DB("Amplitude SR: missing deviceId or sessionId in data layer, aborting.");
    }
    return;
  }

  // Ensure sessionId is a number (Unix timestamp in ms) for standard session tracking
  var sessionIdNum = Number(sessionId);
  if (isNaN(sessionIdNum)) {
    if (window.utag && utag.DB) {
      utag.DB("Amplitude SR: sessionId is not a valid number (" + sessionId + "), using as string.");
    }
    sessionIdNum = sessionId; // The SDK also accepts string for custom session definitions
  }

  // Avoid double-initialization on SPA navigations
  if (window.__amplitudeSessionReplayInitialized) {
    // Session may have rotated -- update the session ID
    if (window.sessionReplay && typeof window.sessionReplay.setSessionId === "function") {
      window.sessionReplay.setSessionId(sessionIdNum);
    }
    return;
  }

  loadScript(
    "https://cdn.amplitude.com/libs/session-replay-browser-1.39.0-min.js.gz",
    function (err) {
      if (err) {
        if (window.utag && utag.DB) {
          utag.DB("Amplitude SR: failed to load Session Replay SDK.");
        }
        return;
      }

      if (!window.sessionReplay || typeof window.sessionReplay.init !== "function") {
        if (window.utag && utag.DB) {
          utag.DB("Amplitude SR: window.sessionReplay not available after script load.");
        }
        return;
      }

      window.sessionReplay.init(CONFIG.apiKey, {
        deviceId: deviceId,
        sessionId: sessionIdNum,
        sampleRate: CONFIG.sampleRate
        // serverZone: "EU"  // Uncomment if migrating to EU data residency
        // privacyConfig: { blockSelector: ['.sensitive'], maskSelector: ['.pii'] }
      });

      window.__amplitudeSessionReplayInitialized = true;

      if (window.utag && utag.DB) {
        utag.DB("Amplitude SR: initialized (deviceId=" + deviceId + ", sessionId=" + sessionIdNum + ")");
      }
    }
  );
})();
