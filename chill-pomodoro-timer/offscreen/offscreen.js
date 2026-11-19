// =============================================================
// THE SOUND PLAYER  (PRD requirements F12 and F13)
// =============================================================
// This runs inside a hidden page ("offscreen document"). It makes
// no decisions of its own: the timer engine checks the settings
// and then sends one of two messages here:
//
//   { type: 'chime', kind: 'focusEnd' | 'breakEnd' }
//   { type: 'ambient', playing: true | false, volume: 0..1 }
//
// Chrome closes this page by itself after about 30 seconds of
// silence. That's fine: the engine opens it again when needed.
// =============================================================

// How long the ambient sound takes to fade in and out.
const FADE_SECONDS = 2;

// The ambient recording. If this file doesn't exist yet, the
// ambient sound simply stays silent.
const AMBIENT_FILE = chrome.runtime.getURL('sounds/ambient-meadow.mp3');

// The Web Audio "mixing desk" that all sound goes through.
const audio = new AudioContext();


// -------------------------------------------------------------
// The chime: a gentle two-note wind chime, made from scratch
// -------------------------------------------------------------

// How loud each note starts (0 = silent, 1 = full volume) and how
// slowly it rings out (bigger = longer ring). Tweak these two to
// change the feel of the chime.
const CHIME_LOUDNESS = 0.32;
const CHIME_RING = 0.28;

// Plays one bell-like note: a quick soft start, then it rings out
// for about a second.
function playNote(frequency, startTime) {
  // The volume shape of the note.
  const envelope = audio.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(CHIME_LOUDNESS, startTime + 0.012); // soft attack
  envelope.gain.setTargetAtTime(0, startTime + 0.012, CHIME_RING);          // ring out
  envelope.connect(audio.destination);

  // Two pure tones: the note itself, plus a quiet higher overtone
  // that gives it the slightly metallic "chime" colour.
  const tones = [
    { multiple: 1, level: 1 },
    { multiple: 2.76, level: 0.25 },
  ];

  for (const tone of tones) {
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency * tone.multiple;

    const level = audio.createGain();
    level.gain.value = tone.level;

    oscillator.connect(level).connect(envelope);
    oscillator.start(startTime);
    oscillator.stop(startTime + 1.15);
  }
}

// Two notes, a moment apart. About 1.4 seconds in total.
//   focus ends -> high then low (settling down)
//   break ends -> low then high (back up again)
async function playChime(kind) {
  await audio.resume();

  const HIGH = 1046.5; // the note C6
  const LOW = 783.99;  // the note G5
  const notes = kind === 'breakEnd' ? [LOW, HIGH] : [HIGH, LOW];

  const start = audio.currentTime + 0.05;
  playNote(notes[0], start);
  playNote(notes[1], start + 0.22);
}


// -------------------------------------------------------------
// The ambient sound: a looping recording with slow fades
// -------------------------------------------------------------

const ambient = new Audio(AMBIENT_FILE);
ambient.loop = true;

// A volume knob for the recording, starting at silent.
const ambientVolume = audio.createGain();
ambientVolume.gain.value = 0;
audio.createMediaElementSource(ambient).connect(ambientVolume).connect(audio.destination);

// The volume we are currently at or fading towards (0 = off).
let targetVolume = 0;

// The timer that pauses the recording once a fade-out has finished.
let pauseTimer = null;

// Smoothly moves the volume knob to `volume` over `seconds`.
function fadeTo(volume, seconds) {
  const now = audio.currentTime;
  const knob = ambientVolume.gain;
  knob.cancelScheduledValues(now);
  knob.setValueAtTime(knob.value, now); // start from wherever we are
  knob.linearRampToValueAtTime(volume, now + seconds);
}

async function setAmbient(playing, volume) {
  const wanted = playing ? volume : 0;
  if (wanted === targetVolume) return; // already there (or on the way)

  const comingFromSilence = targetVolume === 0;
  targetVolume = wanted;
  clearTimeout(pauseTimer);

  if (wanted > 0) {
    await audio.resume();
    if (ambient.paused) {
      await ambient.play(); // fails here if the file is missing
    }
    // Slow fade when starting; quick glide when only the volume changed.
    fadeTo(wanted, comingFromSilence ? FADE_SECONDS : 0.3);
  } else {
    fadeTo(0, FADE_SECONDS);
    pauseTimer = setTimeout(() => ambient.pause(), FADE_SECONDS * 1000 + 100);
  }
}


// -------------------------------------------------------------
// Wiring: listen for the engine's messages
// -------------------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {
  // Other parts of the extension send messages too (button presses
  // meant for the engine). Only react to the ones addressed to us.
  if (!message || message.target !== 'offscreen') return;

  if (message.type === 'chime') {
    playChime(message.kind).catch(() => {});
  }

  if (message.type === 'ambient') {
    setAmbient(message.playing, message.volume).catch(() => {
      // Most likely the sound file isn't there yet. Stay silent, and
      // forget the target so a later attempt can try again.
      targetVolume = 0;
    });
  }
});
