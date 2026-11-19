// =============================================================
// THE SETTINGS PAGE  (PRD "Settings" table: F2, F4, F6, F15)
// =============================================================
// This page only reads and writes the saved settings. It never
// talks to the timer or to web pages directly: they notice the
// saved settings changing and update themselves.
//
// DEFAULT_SETTINGS, SETTING_RANGES, loadSettings, cleanDomain and
// TEST_MODE come from shared/settings.js (loaded just before this
// file in options.html).
// =============================================================

// The current settings. Filled in by start() at the bottom.
let settings = null;


// -------------------------------------------------------------
// Saving, and the small "Saved" label
// -------------------------------------------------------------

const savedLabel = document.getElementById('saved');
let savedLabelTimer = null;
let savedLabelClearTimer = null;

// Shows a short confirmation ("Saved") in the corner for two seconds.
function showConfirmation(text) {
  savedLabel.textContent = text;
  savedLabel.classList.add('visible');
  clearTimeout(savedLabelTimer);
  clearTimeout(savedLabelClearTimer);
  savedLabelTimer = setTimeout(() => {
    savedLabel.classList.remove('visible');
    // Once it has faded out, empty it. A screen reader only reads
    // this label when its text changes, so "Saved" has to go away
    // before the next "Saved" can be heard.
    savedLabelClearTimer = setTimeout(() => {
      savedLabel.textContent = '';
    }, 300);
  }, 2000);
}

// "Reduced motion: Always on" also applies to this page (the fade
// of the "Saved" label). The CSS does the rest.
function applyReducedMotion() {
  document.body.classList.toggle('reduced-motion', settings.reducedMotion === 'always');
}

// Saves one or more settings, e.g. save({ rounds: 3 }).
async function save(changes) {
  // Re-read the saved settings first, in case something else changed
  // them since this page opened (the mute button on the break screen).
  settings = { ...(await loadSettings()), ...changes };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  applyReducedMotion();
  showConfirmation('Saved');
}

// Shows or clears the red message under a field.
function setError(input, errorElement, message) {
  if (message) {
    // Only touch the text when it is new. Screen readers read an
    // error out when it appears; without this check they would
    // repeat it on every keystroke.
    if (errorElement.hidden || errorElement.textContent !== message) {
      errorElement.textContent = message;
    }
    errorElement.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  } else {
    errorElement.hidden = true;
    input.removeAttribute('aria-invalid');
  }
}


// -------------------------------------------------------------
// Number fields: focus, short break, long break, rounds
// -------------------------------------------------------------

function setUpNumberField(key) {
  const input = document.getElementById(key);
  const errorElement = document.getElementById(key + '-error');
  const range = SETTING_RANGES[key];

  // Take the limits from shared/settings.js so they live in one place.
  input.min = range.min;
  input.max = range.max;
  input.value = settings[key];
  // The helper line under the field: "5–90 minutes".
  document.querySelector('[data-range="' + key + '"]').textContent =
    range.min + '–' + range.max;

  // Runs on every keystroke and on the little up/down arrows.
  input.addEventListener('input', () => {
    const number = Number(input.value);
    const isValid =
      input.value.trim() !== '' &&
      Number.isInteger(number) &&
      number >= range.min &&
      number <= range.max;

    if (!isValid) {
      // Don't save. The last valid value stays in effect.
      setError(input, errorElement,
        'Enter a whole number from ' + range.min + ' to ' + range.max + '.');
      return;
    }

    setError(input, errorElement, null);
    if (number !== settings[key]) {
      save({ [key]: number });
    }
  });

  // When you leave a field that still has a problem, put the last
  // valid value back so the page always shows what is really saved.
  input.addEventListener('blur', () => {
    if (input.getAttribute('aria-invalid') === 'true') {
      input.value = settings[key];
      setError(input, errorElement, null);
    }
  });
}


// -------------------------------------------------------------
// Radio choices: break strictness and bar position
// -------------------------------------------------------------

function setUpRadioGroup(key) {
  const radios = document.querySelectorAll('input[name="' + key + '"]');

  radios.forEach((radio) => {
    radio.checked = radio.value === settings[key];
    radio.addEventListener('change', () => {
      if (radio.checked) {
        save({ [key]: radio.value });
      }
    });
  });
}


// -------------------------------------------------------------
// Sounds: chime on/off, ambient on/off, ambient volume
// -------------------------------------------------------------

function setUpCheckbox(key) {
  const checkbox = document.getElementById(key);
  checkbox.checked = settings[key];
  checkbox.addEventListener('change', () => {
    save({ [key]: checkbox.checked });
  });
}

function setUpVolumeSlider() {
  const slider = document.getElementById('ambientVolume');
  const valueText = document.getElementById('ambientVolume-value');
  const ambientCheckbox = document.getElementById('ambientOn');

  slider.value = settings.ambientVolume;
  valueText.textContent = settings.ambientVolume + '%';
  // What a screen reader says for the slider: "40%" instead of "40".
  slider.setAttribute('aria-valuetext', settings.ambientVolume + '%');

  // The slider is greyed out while ambient sound is off.
  function updateDisabled() {
    slider.disabled = !ambientCheckbox.checked;
  }
  updateDisabled();
  ambientCheckbox.addEventListener('change', updateDisabled);

  // While dragging: only update the "40%" text.
  slider.addEventListener('input', () => {
    valueText.textContent = slider.value + '%';
    slider.setAttribute('aria-valuetext', slider.value + '%');
  });

  // When you let go: save.
  slider.addEventListener('change', () => {
    save({ ambientVolume: Number(slider.value) });
  });
}


// -------------------------------------------------------------
// Blocklist: sites where the bar is hidden
// -------------------------------------------------------------

const blocklistForm = document.getElementById('blocklist-form');
const blocklistInput = document.getElementById('blocklist-input');
const blocklistError = document.getElementById('blocklist-error');
const blocklistList = document.getElementById('blocklist');
const blocklistEmpty = document.getElementById('blocklist-empty');

// Rebuilds the list on the page from settings.blocklist.
function renderBlocklist() {
  blocklistList.textContent = ''; // remove the old rows
  blocklistEmpty.hidden = settings.blocklist.length > 0;

  settings.blocklist.forEach((domain) => {
    // One Figma "Blocklist row": the address, and a round "×" button.
    const row = document.createElement('li');
    row.className = 'blocklist-row';

    const name = document.createElement('span');
    name.className = 'blocklist-row__domain';
    name.textContent = domain;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-btn';
    removeButton.textContent = '×';
    // The "×" alone says nothing to a screen reader, so the button
    // gets a spoken name (and the same words as hover text).
    removeButton.setAttribute('aria-label', 'Remove ' + domain);
    removeButton.title = 'Remove ' + domain;
    removeButton.addEventListener('click', async () => {
      const position = settings.blocklist.indexOf(domain);
      await save({ blocklist: settings.blocklist.filter((item) => item !== domain) });
      renderBlocklist();

      // The row (and the button you just pressed) is gone. Move
      // keyboard focus to the next row's Remove button, or the one
      // before it, or the text field if the list is now empty.
      const buttons = blocklistList.querySelectorAll('button');
      (buttons[position] || buttons[position - 1] || blocklistInput).focus();
    });

    row.append(name, removeButton);
    blocklistList.append(row);
  });
}

function setUpBlocklist() {
  renderBlocklist();

  // Pressing Add (or Enter in the field).
  blocklistForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // stop the browser from reloading the page

    if (blocklistInput.value.trim() === '') {
      setError(blocklistInput, blocklistError, 'Type a website address first.');
      return;
    }

    // "https://www.youtube.com/watch..." becomes "youtube.com".
    const domain = cleanDomain(blocklistInput.value);

    if (domain === null) {
      setError(blocklistInput, blocklistError,
        "That doesn't look like a website address. Try something like meet.google.com.");
      return;
    }

    if (settings.blocklist.includes(domain)) {
      setError(blocklistInput, blocklistError, domain + ' is already on the list.');
      return;
    }

    setError(blocklistInput, blocklistError, null);
    await save({ blocklist: [...settings.blocklist, domain] });
    blocklistInput.value = '';
    renderBlocklist();
  });

  // Clear the error as soon as you start typing again.
  blocklistInput.addEventListener('input', () => {
    setError(blocklistInput, blocklistError, null);
  });
}


// -------------------------------------------------------------
// Stats: "Reset stats" with a confirmation step (F14)
// -------------------------------------------------------------
// STATS_KEY comes from shared/stats.js.

function setUpResetStats() {
  const resetButton = document.getElementById('reset-stats');
  const confirmBox = document.getElementById('reset-stats-confirm');
  const yesButton = document.getElementById('reset-stats-yes');
  const noButton = document.getElementById('reset-stats-no');

  // Step 1: clicking "Reset stats" only shows the question.
  resetButton.addEventListener('click', () => {
    confirmBox.hidden = false;
    resetButton.hidden = true;
    noButton.focus(); // the safe choice gets keyboard focus
  });

  function closeConfirmation() {
    confirmBox.hidden = true;
    resetButton.hidden = false;
    resetButton.focus();
  }

  // Step 2a: "Cancel" changes nothing.
  noButton.addEventListener('click', closeConfirmation);

  // Step 2b: "Delete" removes every saved day.
  yesButton.addEventListener('click', async () => {
    await chrome.storage.local.remove(STATS_KEY);
    closeConfirmation();
    showConfirmation('Stats deleted');
  });
}


// -------------------------------------------------------------
// Start: read the saved settings, then fill in the page
// -------------------------------------------------------------

async function start() {
  settings = await loadSettings();

  document.getElementById('test-mode-note').hidden = !TEST_MODE;

  Object.keys(SETTING_RANGES).forEach(setUpNumberField);
  setUpRadioGroup('strictness');
  setUpRadioGroup('barPosition');
  setUpRadioGroup('reducedMotion');
  setUpRadioGroup('catAccessory');
  applyReducedMotion();
  setUpCheckbox('chimeOn');
  setUpCheckbox('ambientOn');
  setUpVolumeSlider();
  setUpBlocklist();
  setUpResetStats();
}

start();
