// =============================================================
// THE TIMER ENGINE  (PRD requirements F1 and F2)
// =============================================================
// This file runs in the background, separate from any web page.
// It is the ONLY place that decides what the timer is doing.
//
// How it works, in short:
//   1. It never counts seconds. Instead it saves a small "note"
//      (called `state`) in Chrome's storage, for example:
//      "Focus, round 2 of 4, ends at 14:25:00".
//   2. It sets a Chrome alarm for the moment the phase ends.
//   3. The popup and every web page read that note and draw
//      themselves from it. When the note changes, they redraw.
//
// Chrome can put this file to sleep at any time to save memory.
// That is fine: the note and the alarm are kept by Chrome, and
// Chrome wakes this file up again when the alarm rings.
// =============================================================

// Bring in the shared files:
//   settings.js  TEST_MODE, the default settings, loadSettings()
//   stats.js     addToStats() for the daily stats
//   break-messages.js  the break sentences and pickMessage()
importScripts('/shared/settings.js', '/shared/stats.js', '/shared/break-messages.js');

const MINUTE = 60 * 1000; // one minute in milliseconds

const STORAGE_KEY = 'timerState';            // the name of the note in storage
const ALARM_NAME = 'phase-end';              // the name of our one alarm
const LAST_MESSAGE_KEY = 'lastBreakMessage'; // remembers the previous break message

// If a phase ended longer ago than this (for example while the
// computer was asleep), we don't play its chime late.
const CHIME_LATE_LIMIT_MS = 10 * 1000;


// =============================================================
// How long is each phase?
// =============================================================
// Read fresh every time a phase starts. That is why a change on
// the settings page applies from the NEXT phase, and never
// shortens or stretches the one that is already running.

async function loadConfig() {
  if (TEST_MODE) {
    // 30 seconds of focus, 30-second breaks (short and long), long break after 2 rounds.
    return { focusMs: 0.5 * MINUTE, shortBreakMs: 0.5 * MINUTE, longBreakMs: 0.5 * MINUTE, rounds: 2 };
  }

  const settings = await loadSettings();
  return {
    focusMs: settings.focusMinutes * MINUTE,
    shortBreakMs: settings.shortBreakMinutes * MINUTE,
    longBreakMs: settings.longBreakMinutes * MINUTE,
    rounds: settings.rounds,
  };
}


// =============================================================
// Sounds  (F12 chime, F13 ambient)
// =============================================================
// The engine can't play sound itself. It opens a hidden page (the
// "offscreen document", see offscreen/offscreen.js) and tells it
// what to play. The settings are checked HERE, right before each
// sound, so nothing plays that the user didn't switch on.
//
// Every function below catches its own errors: sound is a
// nice-to-have and must never be able to break the timer.

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

// Opens the hidden sound page if it isn't open already. (Chrome
// closes it by itself after about 30 seconds of silence.)
async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Plays the timer chime and the ambient break sound.',
  });
}

function sendToOffscreen(message) {
  return chrome.runtime.sendMessage({ target: 'offscreen', ...message });
}

// Plays the transition chime. `kind` is 'focusEnd' or 'breakEnd';
// `endedAt` is the moment the phase really ended.
async function playChime(kind, endedAt) {
  try {
    if (Date.now() - endedAt > CHIME_LATE_LIMIT_MS) return; // too late to be useful

    const settings = await loadSettings();
    if (!settings.chimeOn) return;

    await ensureOffscreenDocument();
    await sendToOffscreen({ type: 'chime', kind: kind });
  } catch (error) {
    // No sound this time. The timer carries on.
  }
}

// Makes the ambient sound match the current situation. It should
// play only when ALL of these are true:
//   - a break is running
//   - ambient sound is on in the settings
//   - the mute button on the break screen is not pressed
// Safe to call as often as we like: if nothing changed, the sound
// page does nothing.
async function syncAmbient(state) {
  try {
    const settings = await loadSettings();
    const shouldPlay =
      state.phase === 'break' && settings.ambientOn && !settings.breakMuted;

    if (shouldPlay) {
      await ensureOffscreenDocument();
      await sendToOffscreen({
        type: 'ambient',
        playing: true,
        volume: settings.ambientVolume / 100,
      });
    } else if (await hasOffscreenDocument()) {
      // Only if the sound page is open: ask it to fade out.
      await sendToOffscreen({ type: 'ambient', playing: false, volume: 0 });
    }
  } catch (error) {
    // No sound this time. The timer carries on.
  }
}


// =============================================================
// Break messages  (F11)
// =============================================================

// Picks the sentence for the next break: random, from the one list
// in shared/break-messages.js (short and long breaks alike), and
// never the same as last time.
async function pickBreakMessage() {
  const stored = await chrome.storage.local.get(LAST_MESSAGE_KEY);
  const message = pickMessage(BREAK_MESSAGES, stored[LAST_MESSAGE_KEY]);
  await chrome.storage.local.set({ [LAST_MESSAGE_KEY]: message });
  return message;
}


// =============================================================
// The four possible notes. `phase` is one of:
//   'idle'      nothing is running
//   'focus'     a focus round is running (or paused)
//   'break'     a break is running
//   'breakDone' the break is over, waiting for the user (F7)
// =============================================================

function makeIdleState(config) {
  return {
    phase: 'idle',
    round: 1,
    totalRounds: config.rounds,
    durationMs: config.focusMs, // lets the popup show "25:00" before you start
    paused: false,
  };
}

function makeFocusState(round, config) {
  const now = Date.now();
  return {
    phase: 'focus',
    round: round,
    totalRounds: config.rounds,
    startTime: now,
    endTime: now + config.focusMs,
    durationMs: config.focusMs,
    paused: false,
  };
}

// The last round of the set earns the long break.
function isLongBreak(round, config) {
  return round >= config.rounds;
}

// `startTime` is passed in (instead of using "now") so that if the
// computer was asleep when focus ended, the break is counted from
// the moment focus really ended. `message` is the line to show on
// the break screen; saving it in the note means every tab shows
// the same one.
function makeBreakState(round, startTime, config, message) {
  const isLong = isLongBreak(round, config);
  const durationMs = isLong ? config.longBreakMs : config.shortBreakMs;
  return {
    phase: 'break',
    breakType: isLong ? 'long' : 'short',
    message: message,
    round: round,
    totalRounds: config.rounds,
    startTime: startTime,
    endTime: startTime + durationMs,
    durationMs: durationMs,
    paused: false,
  };
}

// Which round comes after this break? After a long break we start over at 1.
function nextRoundAfter(state) {
  return state.breakType === 'long' ? 1 : state.round + 1;
}


// =============================================================
// Reading and saving the note
// =============================================================

async function loadState(config) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || makeIdleState(config);
}

// Saving does three things: it stores the note (which makes the
// popup and all pages redraw), it keeps the alarm in step with the
// note, and it starts or stops the ambient sound to match.
async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });

  const isCountingDown =
    (state.phase === 'focus' && !state.paused) || state.phase === 'break';

  if (isCountingDown) {
    await chrome.alarms.create(ALARM_NAME, { when: state.endTime });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }

  await syncAmbient(state);
}


// =============================================================
// Moving from one phase to the next
// =============================================================

// Looks at the clock and moves the note forward if a phase has ended.
// It is safe to call at any time; if nothing is due, nothing changes.
// This is also where the daily stats (F14) are counted and the
// chime (F12) is played, because it is the one place a phase can
// "run to the end".
async function catchUp(state, config) {
  const now = Date.now();

  // Focus time is up -> the break starts.
  if (state.phase === 'focus' && !state.paused && now >= state.endTime) {
    // A completed pomodoro. It counts for the day the round ended.
    await addToStats(state.endTime, {
      pomodoros: 1,
      focusMinutes: Math.round(state.durationMs / MINUTE),
    });
    await playChime('focusEnd', state.endTime);

    const message = await pickBreakMessage();
    state = makeBreakState(state.round, state.endTime, config, message);
  }

  // Break time is up -> wait for the user. Nothing auto-starts (F7).
  if (state.phase === 'break' && now >= state.endTime) {
    // The break ran to the end, so it counts as taken.
    await addToStats(state.endTime, { breaksTaken: 1 });
    await playChime('breakEnd', state.endTime);
    state = { ...state, phase: 'breakDone' };
  }

  return state;
}

// Check the clock, then save. Used when the alarm rings, when Chrome
// starts up, and when the settings change.
async function syncWithClock() {
  const config = await loadConfig();
  let state = await catchUp(await loadState(config), config);

  // Rebuild the idle note so the popup always shows the current
  // focus length and number of rounds.
  if (state.phase === 'idle') {
    state = makeIdleState(config);
  }

  await saveState(state);
}


// =============================================================
// Requests from the popup and from the break screen
// =============================================================
// They send one word, and this function decides what it means
// for the current phase.

// Changes one or more saved settings (used by the mute button).
async function changeSettings(changes) {
  const settings = await loadSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, ...changes } });
}

async function handleCommand(command) {
  const config = await loadConfig();
  let state = await catchUp(await loadState(config), config);

  if (command === 'start') {
    if (state.phase === 'idle') {
      state = makeFocusState(1, config);
    } else if (state.phase === 'focus' && state.paused) {
      // Resume: move the start and end times so the time that was
      // left when you paused is the time left now.
      const now = Date.now();
      state = {
        ...state,
        paused: false,
        endTime: now + state.remainingMs,
        startTime: now + state.remainingMs - state.durationMs,
      };
    } else if (state.phase === 'breakDone') {
      state = makeFocusState(nextRoundAfter(state), config);
    }
  }

  // Pause only works during focus (decided for milestone 1).
  if (command === 'pause') {
    if (state.phase === 'focus' && !state.paused) {
      state = {
        ...state,
        paused: true,
        remainingMs: Math.max(0, state.endTime - Date.now()),
      };
    }
  }

  if (command === 'reset') {
    // Resetting in the middle of a break cuts it short, so it counts
    // as a skipped break. (A focus round that is reset counts as
    // nothing: only rounds that run to the end are pomodoros.)
    if (state.phase === 'break') {
      await addToStats(Date.now(), { breaksSkipped: 1 });
    }
    state = makeIdleState(config);
  }

  // Skipping from the break screen: go straight back to focus.
  if (command === 'skipBreak') {
    if (state.phase === 'break') {
      await addToStats(Date.now(), { breaksSkipped: 1 });
      state = makeFocusState(nextRoundAfter(state), config);
    }
  }

  // The mute button on the break screen. It only silences the
  // ambient sound, and its state is remembered for next time.
  if (command === 'mute') {
    await changeSettings({ breakMuted: true });
  }
  if (command === 'unmute') {
    await changeSettings({ breakMuted: false });
  }

  await saveState(state);
}


// =============================================================
// Wiring: what wakes this file up
// =============================================================

// Two things can wake this file at almost the same moment (say, the
// alarm rings just as you press a button). `inTurn` makes them wait
// for each other and run one after the other. Without it, both could
// see "focus just ended" and count the same pomodoro twice.
let lastJob = Promise.resolve();

function inTurn(job) {
  lastJob = lastJob.catch(() => {}).then(job);
  return lastJob;
}

// 1. A button was pressed in the popup or on the break screen.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.command) return; // not meant for the engine

  // The "Play chime" test buttons in the developer tools. They play
  // straight away, without touching the timer.
  if (message.command === 'testChimeFocusEnd' || message.command === 'testChimeBreakEnd') {
    const kind = message.command === 'testChimeFocusEnd' ? 'focusEnd' : 'breakEnd';
    ensureOffscreenDocument()
      .then(() => sendToOffscreen({ type: 'chime', kind: kind }))
      .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }

  // "Settings" on the break screen: a web page can't open the
  // extension's settings page itself, so it asks here.
  if (message.command === 'openSettings') {
    chrome.runtime.openOptionsPage().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    );
    return true;
  }

  inTurn(() => handleCommand(message.command)).then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false })
  );
  return true; // tells Chrome we will answer a little later
});

// 2. The alarm rang: a phase has ended.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    inTurn(syncWithClock);
  }
});

// 3. Chrome was opened, or the extension was installed or reloaded.
//    Alarms can get lost when Chrome restarts, so we check the clock
//    and set the alarm again.
chrome.runtime.onStartup.addListener(() => inTurn(syncWithClock));
chrome.runtime.onInstalled.addListener(() => inTurn(syncWithClock));

// 4. Something changed in the settings. A running phase is left
//    alone; this refreshes the idle note (so the popup shows the new
//    focus length straight away) and updates the ambient sound (new
//    volume, switched on or off, muted or unmuted).
chrome.storage.onChanged.addListener((changes) => {
  if (changes[SETTINGS_KEY]) {
    inTurn(syncWithClock);
  }
});
