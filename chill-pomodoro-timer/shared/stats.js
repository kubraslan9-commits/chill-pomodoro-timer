// =============================================================
// SHARED STATS HELPERS  (PRD requirement F14)
// =============================================================
// The stats are one small record per day, saved in Chrome's local
// storage. They look like this:
//
//   {
//     "2026-11-14": { pomodoros: 3, focusMinutes: 75, breaksTaken: 2, breaksSkipped: 1 },
//     "2026-11-13": { ... }
//   }
//
// The timer engine writes them. The popup and the settings page
// read them. This file is loaded by all three.
// =============================================================

// The name the stats are saved under in Chrome's storage.
const STATS_KEY = 'stats';

// Days older than this are deleted automatically.
const STATS_KEEP_DAYS = 90;

// Turns a date into the name of its day, e.g. "2026-11-14".
// It uses the computer's local time, so a day runs from local
// midnight to local midnight.
function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// A day on which nothing has happened yet.
function emptyDay() {
  return { pomodoros: 0, focusMinutes: 0, breaksTaken: 0, breaksSkipped: 0 };
}

// Reads all saved days.
async function loadStats() {
  const stored = await chrome.storage.local.get(STATS_KEY);
  return stored[STATS_KEY] || {};
}

// Removes days older than STATS_KEEP_DAYS. Day names like
// "2026-11-14" sort in date order, so a plain comparison works.
function pruneStats(stats) {
  const now = new Date();
  const oldestKept = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (STATS_KEEP_DAYS - 1));
  const oldestKey = dateKey(oldestKept);

  for (const key of Object.keys(stats)) {
    if (key < oldestKey) {
      delete stats[key];
    }
  }
  return stats;
}

// Adds numbers to one day's record, for example:
//   addToStats(Date.now(), { pomodoros: 1, focusMinutes: 25 })
// `timestamp` decides which day it counts for. Passing the moment a
// round ENDED is what makes a round that crosses midnight count for
// the day it ended.
async function addToStats(timestamp, changes) {
  const stats = await loadStats();
  const key = dateKey(new Date(timestamp));
  const day = { ...emptyDay(), ...stats[key] };

  for (const name of Object.keys(changes)) {
    day[name] += changes[name];
  }

  stats[key] = day;
  await chrome.storage.local.set({ [STATS_KEY]: pruneStats(stats) });
}

// The last seven days, oldest first and today last. Each entry has
// the day's name in storage, a short label, a full name, and whether it is today.
function lastSevenDays() {
  const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  // One letter, as on the Figma "Day bar" component (04 · Day bars).
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Full names, for screen readers ("Tu" alone is hard to understand).
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const days = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    days.push({
      key: dateKey(date),
      label: labels[date.getDay()],
      letter: letters[date.getDay()],
      name: names[date.getDay()],
      isToday: daysAgo === 0,
    });
  }
  return days;
}
