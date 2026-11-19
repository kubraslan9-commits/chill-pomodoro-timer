// =============================================================
// THE TOOLBAR POPUP  (PRD requirement F8)
// =============================================================
// The popup does not run the timer. It only:
//   - reads the timer's note from storage and shows it
//   - sends a one-word request to the timer engine when you
//     press a button ("start", "pause", "skipBreak" or "reset")
// =============================================================

const STORAGE_KEY = 'timerState';

// The pieces of the popup we need to update.
const phaseChip = document.getElementById('phase');        // the coloured chip
const phaseLabel = document.getElementById('phase-label'); // the word inside it
const timeText = document.getElementById('time');
const roundText = document.getElementById('round');
const messageText = document.getElementById('message');    // the short line under the time
const mainButton = document.getElementById('main-button');
const resetButton = document.getElementById('reset-button');
const muteButton = document.getElementById('mute-button');
const breakHint = document.getElementById('break-hint');          // "Hold to skip on the break screen"
const timerCard = document.querySelector('.timer-card');
const actionsRow = document.querySelector('.timer-card__actions');
const confirmRow = document.getElementById('reset-confirm');      // "Reset round?"
const confirmCancel = document.getElementById('reset-cancel');
const confirmYes = document.getElementById('reset-yes');

// The latest note from the timer engine.
let state = null;

// The user's settings. The popup needs them for the mute button and
// for the break strictness (only Relaxed gets a "Skip break" button).
// (DEFAULT_SETTINGS, SETTINGS_KEY and loadSettings come from
// shared/settings.js, loaded just before this file in popup.html.)
let settings = DEFAULT_SETTINGS;

// What the main button will ask for when pressed. It changes with
// the phase: "start", "pause" or "skipBreak".
let mainCommand = 'start';

// True while "Reset round?" is showing.
let confirming = false;


// Turns milliseconds into "12:40".
function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

// How much time is left in the current phase, in milliseconds.
function getRemainingMs() {
  if (state.phase === 'idle') return state.durationMs; // full focus length
  if (state.phase === 'breakDone') return 0;
  if (state.paused) return state.remainingMs;          // frozen while paused
  return Math.max(0, state.endTime - Date.now());
}

// Shows the time with each character in its own fixed-width box
// (see .timer-card__char in popup.css), so the digits don't shift
// sideways as they change. A screen reader still reads "12:40",
// since the boxes are plain inline spans with no spaces between.
function setTime(text) {
  if (timeText.dataset.text === text) return; // nothing changed
  timeText.dataset.text = text;
  timeText.textContent = '';
  for (const char of text) {
    const box = document.createElement('span');
    box.className = 'timer-card__char' + (char === ':' ? ' timer-card__char--colon' : '');
    box.textContent = char;
    timeText.append(box);
  }
}

// Changes an element's text, but only if it is really different.
// (Screen readers can re-read text that is set again, even to the
// same words, and this popup redraws four times a second.)
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

// Shows one phase on the timer card:
//   chip    - which colour of chip: 'idle', 'focus', 'break',
//             'long-break' or 'paused' (the .chip--… classes in
//             shared/components.css)
//   label   - the word in the chip
//   message - the short line under the time
//   button  - the label of the main button
function showPhase(chip, label, message, button) {
  phaseChip.className = 'chip chip--' + chip;
  setText(phaseLabel, label);
  setText(messageText, message);
  setText(mainButton, button);
}

// Redraws the whole popup from the note.
function render() {
  if (!state) return;

  setTime(formatTime(getRemainingMs()));
  setText(roundText, 'Round ' + state.round + ' of ' + state.totalRounds);

  // Defaults; the cases below change what they need.
  mainCommand = 'start';
  let showMain = true;
  const inBreak = state.phase === 'break';

  // Paused turns the big time grey-green (popup.css).
  timerCard.classList.toggle('timer-card--paused', state.phase === 'focus' && !!state.paused);

  if (state.phase === 'idle') {
    showPhase('idle', 'Idle', 'Ready when you are.', 'Start focus');
  } else if (state.phase === 'focus' && state.paused) {
    showPhase('paused', 'Paused', 'Pick up when you’re ready.', 'Resume');
  } else if (state.phase === 'focus') {
    showPhase('focus', 'Focus', 'One thing at a time.', 'Pause');
    mainCommand = 'pause';
  } else if (inBreak) {
    // A break can't be paused. In Relaxed mode the main button skips
    // the break instead (as the break screen's "Skip break" link
    // does); in Gentle and Strict mode there is no main button.
    if (state.breakType === 'long') {
      showPhase('long-break', 'Long break', 'A longer breath of fresh air.', 'Skip break');
    } else {
      showPhase('break', 'Break', 'Step away for a moment.', 'Skip break');
    }
    mainCommand = 'skipBreak';
    showMain = settings.strictness === 'relaxed';
  } else if (state.phase === 'breakDone') {
    // There is no "Break over" chip in the design, so it borrows the Idle one.
    showPhase('idle', 'Break over', 'Ready for the next round?', 'Start next focus');
  }

  // The mute button: only during a break, and only if ambient sound
  // is switched on in the settings (same rule as the break screen).
  // While it shows, it takes the place of the main button: the popup
  // has no room for a third button. (So in Relaxed mode with sound
  // on, "Skip break" is only on the break screen itself.)
  const showMute = inBreak && settings.ambientOn;
  setText(muteButton, settings.breakMuted ? 'Unmute break sound' : 'Mute break sound');

  // "Reset round?" only makes sense during a focus round. If the
  // round ends while it is showing, close it again.
  if (confirming && state.phase !== 'focus') closeConfirm(false);

  // If the keyboard was on a button that is about to disappear,
  // move it to the first one still showing, so it doesn't get lost.
  const focused = document.activeElement;
  muteButton.hidden = !showMute;
  mainButton.hidden = showMute || !showMain;

  // In a Gentle or Strict break with no mute button, a short hint
  // fills the main button's place, so Reset does not sit alone.
  breakHint.hidden = !(inBreak && !showMute && !showMain);
  setText(breakHint, settings.strictness === 'strict'
    ? 'Breaks can’t be skipped in Strict mode'
    : 'Hold to skip on the break screen');
  resetButton.hidden = state.phase === 'idle'; // nothing to reset
  if (focused && focused !== document.body && focused.hidden) {
    const next = [mainButton, muteButton, resetButton].find((button) => !button.hidden);
    if (next) next.focus();
  }
}

// -------------------------------------------------------------
// "Reset round?"
// -------------------------------------------------------------
// Reset throws away the focus round you are in, so during focus
// (running or paused) it asks first. The question takes the place
// of the buttons, so the popup does not get taller. In a break or
// after one, Reset works straight away, as before.

function openConfirm() {
  confirming = true;
  actionsRow.hidden = true;
  confirmRow.hidden = false;
  confirmCancel.focus(); // the safe choice gets the keyboard
}

// moveFocus: put the keyboard back on Reset (after Cancel), or on
// the main button (after resetting, when Reset itself is hidden).
function closeConfirm(moveFocus, target) {
  confirming = false;
  confirmRow.hidden = true;
  actionsRow.hidden = false;
  if (moveFocus) (target || resetButton).focus();
}

resetButton.addEventListener('click', () => {
  if (state && state.phase === 'focus') {
    openConfirm();
  } else {
    send('reset');
  }
});

confirmCancel.addEventListener('click', () => closeConfirm(true));

confirmYes.addEventListener('click', () => {
  send('reset');
  closeConfirm(true, mainButton);
});

// Escape answers "Cancel". (Without this, Escape would close the
// whole popup, which is what Chrome does by default.)
confirmRow.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeConfirm(true);
  }
});

// Sends a one-word request to the timer engine.
function send(command) {
  chrome.runtime.sendMessage({ command: command }).catch(() => {
    // The engine was not reachable for a moment; pressing again will work.
  });
}

mainButton.addEventListener('click', () => send(mainCommand));

// The engine saves the new mute state in the settings; the popup
// then redraws the button from the settings (see "Start" below).
muteButton.addEventListener('click', () => {
  send(settings.breakMuted ? 'unmute' : 'mute');
});

// (The "Settings" link is a plain link in popup.html; it needs no code here.)

// -------------------------------------------------------------
// Daily stats (F14)
// -------------------------------------------------------------
// STATS_KEY, loadStats, emptyDay and lastSevenDays come from
// shared/stats.js (loaded just before this file in popup.html).

const todayPomodorosText = document.getElementById('today-pomodoros');
const todayBreaksText = document.getElementById('today-breaks');
const todayBreaksUnit = document.getElementById('today-breaks-unit');
const weekTotalText = document.getElementById('week-total');
const statsToggle = document.getElementById('stats-toggle');   // "Today · … ▾"
const statsSummary = document.getElementById('stats-summary');
const statsSection = document.getElementById('stats');
const weekStrip = document.getElementById('week-strip');

// Height of the grey track inside a day bar, in pixels (matches
// .day-bar__track in popup.css). The busiest day of the week fills
// it; other days get a share of it.
const DAY_TRACK_PX = 24;

// A day with only a few minutes still gets a visible bit of fill.
const DAY_FILL_MIN_PX = 4;

// "45 min" under an hour, "2 h 55 min" from an hour on.
function formatMinutes(total) {
  if (total < 60) return total + ' min';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours + ' h' + (minutes ? ' ' + minutes + ' min' : '');
}

// "1 pomodoro", "3 pomodoros"
function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

// Draws the stats cards from the saved days.
function renderStats(stats) {
  const days = lastSevenDays(); // oldest first, today last
  const today = { ...emptyDay(), ...stats[days[6].key] };

  // The two metric cards: "Pomodoros today" and "Breaks today".
  // Breaks show as "4 of 5" (taken of all), or just "0" before the
  // first break of the day.
  todayPomodorosText.textContent = today.pomodoros;
  const totalBreaks = today.breaksTaken + today.breaksSkipped;
  todayBreaksText.textContent = today.breaksTaken;
  todayBreaksUnit.textContent = totalBreaks === 0 ? '' : 'of ' + totalBreaks;

  // The summary on the open/close row: "Today · 3 pomodoros · 1 h 15 min"
  statsSummary.textContent =
    'Today · ' + plural(today.pomodoros, 'pomodoro') + ' · ' + formatMinutes(today.focusMinutes);

  // The weekly card, top right: focus minutes over the last 7 days.
  const weekMinutes = days.reduce(
    (sum, day) => sum + (stats[day.key] ? stats[day.key].focusMinutes : 0),
    0
  );
  weekTotalText.textContent = formatMinutes(weekMinutes);

  // The 7 day bars. Each fill shows that day's focus minutes,
  // compared with the busiest day of the week (which fills its track).
  const minutes = days.map((day) => (stats[day.key] ? stats[day.key].focusMinutes : 0));
  const pomodoros = days.map((day) => (stats[day.key] ? stats[day.key].pomodoros : 0));
  const highest = Math.max(...minutes, 1); // at least 1, to avoid dividing by zero

  weekStrip.textContent = ''; // remove the old bars
  days.forEach((day, index) => {
    const dayMinutes = minutes[index];

    const item = document.createElement('li');
    item.className = 'day-bar';
    if (day.isToday) item.classList.add('day-bar--today');
    // Hover text for the mouse: "Tu: 45 min, 2 pomodoros"
    item.title = day.label + ': ' + dayMinutes + ' min, ' + plural(pomodoros[index], 'pomodoro');

    // What a screen reader says: "Today, Tuesday: 45 focus minutes, 2 pomodoros".
    // (Hover text alone is not reliably read out.)
    const spoken = document.createElement('span');
    spoken.className = 'visually-hidden';
    spoken.textContent =
      (day.isToday ? 'Today, ' : '') + day.name + ': ' +
      plural(dayMinutes, 'focus minute') + ', ' + plural(pomodoros[index], 'pomodoro');

    // The grey track with the teal fill inside it.
    const track = document.createElement('span');
    track.className = 'day-bar__track';
    const fill = document.createElement('span');
    fill.className = 'day-bar__fill';
    if (dayMinutes > 0) {
      const height = Math.max(DAY_FILL_MIN_PX, Math.round((dayMinutes / highest) * DAY_TRACK_PX));
      fill.style.height = height + 'px';
    }
    track.append(fill);

    // "45m", then the day's letter. Both are hidden from screen
    // readers because the spoken line above already says them.
    const minutesText = document.createElement('span');
    // A day with no focus shows a light dash instead of "0m".
    minutesText.className = 'day-bar__minutes' + (dayMinutes === 0 ? ' day-bar__minutes--empty' : '');
    minutesText.textContent = dayMinutes === 0 ? '–' : dayMinutes + 'm';
    minutesText.setAttribute('aria-hidden', 'true');

    const letter = document.createElement('span');
    letter.className = 'day-bar__day';
    letter.textContent = day.letter;
    letter.setAttribute('aria-hidden', 'true');

    item.append(spoken, track, minutesText, letter);
    weekStrip.append(item);
  });
}

// -------------------------------------------------------------
// Opening and closing the stats
// -------------------------------------------------------------
// The popup starts with only the timer. The row under it opens the
// stats. Open or closed is remembered for next time in this popup's
// own small storage (localStorage): it is only a view preference,
// not a setting. It starts closed the very first time.

const STATS_OPEN_KEY = 'popupStatsOpen';

function setStatsOpen(open, animate) {
  statsToggle.setAttribute('aria-expanded', String(open));
  statsSection.hidden = !open;
  statsSection.classList.toggle('is-opening', open && animate);
  try {
    localStorage.setItem(STATS_OPEN_KEY, open ? '1' : '0');
  } catch (error) {
    // Storage blocked: it just won't be remembered.
  }
}

statsToggle.addEventListener('click', () => {
  setStatsOpen(statsSection.hidden, true);
});

// The fade only plays once per opening.
statsSection.addEventListener('animationend', () => {
  statsSection.classList.remove('is-opening');
});

// Open it now if it was open last time (no fade on start-up).
let wasOpen = false;
try {
  wasOpen = localStorage.getItem(STATS_OPEN_KEY) === '1';
} catch (error) {
  // Storage blocked: start closed.
}
setStatsOpen(wasOpen, false);

// Read the stats once when the popup opens...
loadStats().then(renderStats);

// ...and again whenever the engine records something.
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STATS_KEY]) {
    renderStats(changes[STATS_KEY].newValue || {});
  }
});


// -------------------------------------------------------------
// Start
// -------------------------------------------------------------

// Read the note once when the popup opens...
chrome.storage.local.get(STORAGE_KEY).then((stored) => {
  state = stored[STORAGE_KEY] || null;
  render();
});

// ...and again every time the engine changes it.
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEY]) {
    state = changes[STORAGE_KEY].newValue;
    render();
  }
  if (changes[SETTINGS_KEY]) {
    settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    document.body.classList.toggle('reduced-motion', settings.reducedMotion === 'always');
    render();
  }
});

// The settings, for the mute button.
loadSettings().then((loaded) => {
  settings = loaded;
  // "Always reduce motion" on the settings page also stops the
  // popup's small fade (the system setting is handled in popup.css).
  document.body.classList.toggle('reduced-motion', settings.reducedMotion === 'always');
  render();
});

// Refresh the time on screen a few times a second while the popup
// is open. (This only repaints the number; the real timer lives in
// the engine and keeps going when the popup is closed.)
setInterval(render, 250);
