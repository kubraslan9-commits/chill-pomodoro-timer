// =============================================================
// SHARED SETTINGS
// =============================================================
// One place for the things several parts of the extension need
// to agree on: the default settings, the allowed ranges, and a
// few small helpers. This file is loaded by the timer engine,
// by every web page (before content.js) and by the settings page.
// =============================================================


// ---------- TEST MODE ----------------------------------------
// true  = short times, so you can test quickly
//         (30 s focus, 30 s breaks, long break after 2 rounds).
//         The lengths and rounds on the settings page are ignored.
// false = use the lengths and rounds from the settings page.
//
// After changing this line, go to chrome://extensions and press
// the reload arrow on the extension card, then press Reset in
// the popup.
const TEST_MODE = false;
// -------------------------------------------------------------


// The name the settings are saved under in Chrome's storage.
const SETTINGS_KEY = 'settings';

// What a new user gets (PRD "Settings" table).
const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  rounds: 4,
  strictness: 'gentle',   // 'relaxed' | 'gentle' | 'strict'
  barPosition: 'top',     // 'top' | 'bottom'
  blocklist: [],          // domains where the bar is hidden, e.g. 'meet.google.com'
  chimeOn: true,          // soft chime when focus or a break ends
  ambientOn: true,        // ambient sound during breaks
  ambientVolume: 40,      // 0-100 (%)
  breakMuted: false,      // the mute button on the break screen (remembers its state)
  reducedMotion: 'system', // 'system' (follow the computer's setting) | 'always'
  catAccessory: 'none',    // what the meadow cats wear: 'none' | 'party-hat' | 'bow-tie'
};

// The smallest and largest value allowed for each number setting.
const SETTING_RANGES = {
  focusMinutes: { min: 5, max: 90 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 5, max: 60 },
  rounds: { min: 2, max: 8 },
};

// Reads the saved settings. Anything not saved yet falls back to
// its default, so this always returns a complete set.
async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

// Cleans up whatever someone types or pastes into the blocklist
// field and returns a bare domain:
//   "https://www.youtube.com/watch?v=abc"  ->  "youtube.com"
//   "Meet.Google.com/xyz"                  ->  "meet.google.com"
// Returns null if the text doesn't look like a website address.
function cleanDomain(text) {
  let value = text.trim().toLowerCase();
  if (value === '') return null;

  // Add "https://" if it's missing, so the browser can take the
  // address apart for us.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    value = 'https://' + value;
  }

  let hostname;
  try {
    hostname = new URL(value).hostname; // just the "www.youtube.com" part
  } catch (error) {
    return null;
  }

  // Drop a leading "www." and any trailing dot.
  hostname = hostname.replace(/^www\./, '').replace(/\.$/, '');

  // It must look like "name.something" (at least one dot).
  if (!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(hostname)) {
    return null;
  }

  return hostname;
}

// Is this page's address on the blocklist? Subdomains count:
// "youtube.com" on the list also matches "music.youtube.com".
function isBlocked(hostname, blocklist) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return blocklist.some((domain) => host === domain || host.endsWith('.' + domain));
}
