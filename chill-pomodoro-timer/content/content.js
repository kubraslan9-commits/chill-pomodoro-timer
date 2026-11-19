// =============================================================
// ON-PAGE PIECES: the progress bar (F3, F4, F15) and the
// meadow break screen (F5, F6, F7)
// =============================================================
// The meadow picture and its motion are in content/meadow.js
// (loaded just before this file). This file draws the cards on
// top of it: countdown, hold to skip, the sentence and the buttons.
// Chrome runs this file on every normal web page. Like the popup,
// it does not run the timer. It reads two things from storage:
//   - the timer's note (`state`): which phase, when it ends
//   - the user's settings: bar position, strictness, blocklist
// It draws the bar or the break screen from them, and redraws
// whenever either one changes.
//
// DEFAULT_SETTINGS, SETTINGS_KEY and isBlocked come from
// shared/settings.js, which Chrome loads just before this file.
//
// Everything is wrapped in one function so our names can't clash
// with anything else.
// =============================================================

(function () {
  const STORAGE_KEY = 'timerState';

  // The mouse counts as "hovering the bar" when it is within this
  // many pixels of the edge the bar is on.
  const HOVER_ZONE_PX = 10;

  // How long the "Hold to skip" button must be held (Gentle friction).
  // The Figma "Hold to skip" component is drawn for 2 seconds.
  const HOLD_TO_SKIP_MS = 2000;

  // Start loading the meadow pictures when a focus round has this
  // little time left, so the break screen opens with them ready.
  const PRELOAD_BEFORE_BREAK_MS = 60000;

  // Don't add ourselves twice, and skip odd documents with no body.
  if (!document.body || document.getElementById('touch-grass-extension')) {
    return;
  }

  // The latest note from the timer engine, and the user's settings.
  let state = null;
  let settings = DEFAULT_SETTINGS;

  // The once-a-second ticker that updates the numbers (see section 5).
  let ticker = null;

  // The countdown for "Hold to skip" (see section 4).
  let holdTimer = null;

  // Accessibility (F10) bookkeeping for the break screen:
  // - where keyboard focus was on the page before the break, so we
  //   can put it back afterwards
  // - whether the "Skip break?" question is showing (screen readers)
  // - which minute we last read out, so the countdown is announced
  //   once a minute and not every second
  let lastPageFocus = null;
  let confirmingSkip = false;
  let lastAnnouncedMinute = null;

  // Should we use less motion? Yes if the system asks for it (macOS:
  // System Settings > Accessibility > Display > Reduce motion), or if
  // "Reduced motion: Always on" is chosen on our settings page.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function prefersReducedMotion() {
    return motionQuery.matches || settings.reducedMotion === 'always';
  }

  // With reduced motion the bar doesn't glide. It jumps forward one
  // small step every this many milliseconds instead.
  const REDUCED_MOTION_STEP_MS = 15000;


  // -----------------------------------------------------------
  // 1. Build the elements
  // -----------------------------------------------------------

  // Small helper: make an element with a class name and some text.
  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  // The "host" is the one element we add to the page. It covers the
  // window, sits above everything, and lets all clicks pass through.
  const host = document.createElement('div');
  host.id = 'touch-grass-extension';
  host.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';

  // The Shadow DOM: a sealed box inside the host. The page's styles
  // can't reach in, so the bar and break screen look the same on
  // every site.
  const shadow = host.attachShadow({ mode: 'open' });

  // Our stylesheet (content.css), loaded into the sealed box. Its
  // first line pulls in the design tokens (shared/tokens.css) too.
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('content/content.css');

  // Everything visible goes in this wrapper. It stays hidden until
  // the stylesheet has loaded, so nothing ever shows up unstyled.
  const wrapper = makeElement('div', 'wrapper');
  wrapper.hidden = true;

  // The progress bar
  const bar = makeElement('div', 'bar');
  // For screen readers (F10): this is a progress bar called "Focus
  // time". updateBarValue fills in its value, e.g. "12 minutes left".
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Focus time');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-hidden', 'true'); // until a focus round is running
  const barFill = makeElement('div', 'bar-fill');
  bar.append(barFill);

  // The "12:40 left" tooltip
  const tooltip = makeElement('div', 'tooltip');

  // ----- The break screen (Figma: "Touch Grass · Meadow break") -----
  //
  //   overlay                    the whole screen, a dialog
  //     meadow                   the picture (content/meadow.js)
  //     ui                       the cards, in the four corners
  //       top:    countdown panel (right)
  //       bottom: the sentence for this break (centred, its own row),
  //               then the controls: Mute sound (left),
  //               Settings and Full screen (right)

  const overlay = makeElement('div', 'overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true'); // tells screen readers the page behind is off limits
  // The card no longer shows a heading, so screen readers get it
  // here: "Time to touch grass", then the sentence for this break.
  overlay.setAttribute('aria-label', 'Time to touch grass');
  overlay.setAttribute('aria-describedby', 'tg-message'); // read the message with the title
  overlay.tabIndex = -1; // lets us move keyboard focus onto the break screen

  // The meadow picture goes in here (loaded on the first break).
  const meadowHost = makeElement('div', 'meadow-host');
  const meadow = TouchGrassMeadow.create(meadowHost);

  const ui = makeElement('div', 'ui');
  const uiTop = makeElement('div', 'ui__top');
  const uiBottom = makeElement('div', 'ui__bottom');
  ui.append(uiTop, uiBottom);

  // The sentence for this break (F11), shown as a quote in the top
  // left corner (2026-11-17, user's request): no pill, no background,
  // just the words in curly quotation marks on the meadow (the marks
  // come from content.css). "Time to touch grass" is not shown; it is
  // the dialog's label above. DEFAULT_ENCOURAGEMENT only shows if no
  // sentence was saved for this break (the list is in
  // shared/break-messages.js).
  const quote = makeElement('div', 'quote');
  const DEFAULT_ENCOURAGEMENT = 'Take three slow, deep breaths.';
  const message = makeElement('p', 'quote__text', DEFAULT_ENCOURAGEMENT);
  message.id = 'tg-message';
  quote.append(message);

  // Figma: "Break countdown panel".
  const panel = makeElement('div', 'break-card panel');
  const panelTop = makeElement('div', 'panel__top');
  const phaseChip = makeElement('p', 'chip chip--break');
  const phaseLabel = makeElement('span', '', 'Break');
  phaseChip.append(makeElement('span', 'chip__dot'), phaseLabel);
  const roundText = makeElement('p', 'panel__round');
  panelTop.append(phaseChip, roundText);
  // "Break ends in": for screen readers only since 2026-11-17 (the
  // big time speaks for itself, and the panel is smaller without it).
  const timerLabel = makeElement('p', 'visually-hidden', 'Break ends in');
  // role="timer": screen readers can read it on request, but don't
  // read it out every second.
  const countdown = makeElement('p', 'panel__timer');
  countdown.setAttribute('role', 'timer');
  const panelAction = makeElement('div', 'panel__action');
  const panelHint = makeElement('p', 'panel__hint');
  panelHint.id = 'tg-panel-hint';
  // After the break, in place of the countdown (2026-11-17): a short
  // headline and what comes next, "Next: 25 min focus · round 3 of 4".
  const doneTitle = makeElement('p', 'panel__done-title', 'Nice break.');
  const doneNext = makeElement('p', 'panel__done-next');
  panel.append(panelTop, timerLabel, countdown, doneTitle, doneNext, panelAction, panelHint);

  // After the break: the countdown becomes this button (F7).
  const startNextButton = makeElement('button', 'btn btn--primary panel__button', 'Start next focus');
  startNextButton.type = 'button';

  // Relaxed: a plain text link.
  const skipButton = makeElement('button', 'btn btn--link panel__button', 'Skip break');
  skipButton.type = 'button';

  // Gentle friction: Figma "Hold to skip". Two layers: the lime fill
  // that slides in while you hold, and the label on top of it.
  // States: Default, Hover, Focus (CSS), Filling and Complete
  // (classes is-filling / is-complete, set below).
  const holdButton = makeElement('button', 'hold-skip');
  holdButton.type = 'button';
  holdButton.style.setProperty('--hold-ms', HOLD_TO_SKIP_MS + 'ms');
  // The label says how long to hold, so no extra line is needed under it.
  const HOLD_LABEL = 'Hold ' + HOLD_TO_SKIP_MS / 1000 + ' s to skip';
  const holdLabel = makeElement('span', 'hold-label', HOLD_LABEL);
  holdButton.append(makeElement('span', 'hold-fill'), holdLabel);
  // Extra instructions, heard by screen readers only. (The visible
  // "Hold 2 seconds to skip" under the button is read too.)
  const holdHint = makeElement(
    'span',
    'visually-hidden',
    'Hold Space or Enter. With a screen reader, press once and then confirm.'
  );
  holdHint.id = 'tg-hold-hint';
  holdButton.setAttribute('aria-describedby', 'tg-panel-hint tg-hold-hint');

  // Screen readers press buttons with a single "click" and can't
  // hold one down. For them the hold button asks this question
  // instead: still one extra step, just a different kind.
  const confirmSkip = makeElement('div', 'confirm-skip');
  confirmSkip.setAttribute('role', 'group');
  confirmSkip.setAttribute('aria-label', 'Skip break?');
  const confirmYesButton = makeElement('button', 'btn btn--secondary', 'Skip break');
  confirmYesButton.type = 'button';
  const confirmNoButton = makeElement('button', 'btn btn--primary', 'Keep resting');
  confirmNoButton.type = 'button';
  confirmSkip.append(
    makeElement('p', 'confirm-skip__question', 'Skip break?'),
    confirmNoButton,
    confirmYesButton
  );
  confirmSkip.hidden = true;

  panelAction.append(holdButton, holdHint, skipButton, confirmSkip, startNextButton);
  uiTop.append(quote, panel); // quote upper left, panel upper right

  // Figma: "Break sound utility". Turns the ambient sound off and on
  // (the existing mute; the chime is never affected).
  // A round icon-only button (2026-11-17, user's request): a speaker
  // with sound waves while the sound plays, a speaker with a cross
  // while it is muted. The words "Mute sound" / "Unmute sound" are
  // kept for screen readers (visually hidden) and as the hover tooltip.
  const soundButton = makeElement('button', 'btn btn--secondary sound-button');
  soundButton.type = 'button';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const soundIcon = document.createElementNS(SVG_NS, 'svg');
  soundIcon.setAttribute('viewBox', '0 0 24 24');
  soundIcon.setAttribute('aria-hidden', 'true');
  soundIcon.setAttribute('class', 'sound-button__icon');
  const speaker = document.createElementNS(SVG_NS, 'path');
  speaker.setAttribute('d', 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z'); // the speaker
  const waves = document.createElementNS(SVG_NS, 'path');
  waves.setAttribute('d', 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'); // sound waves
  const cross = document.createElementNS(SVG_NS, 'path');
  cross.setAttribute('d', 'M16 9.5l5 5M21 9.5l-5 5'); // the cross when muted
  soundIcon.append(speaker, waves, cross);
  const soundLabel = makeElement('span', 'visually-hidden');
  soundButton.append(soundIcon, soundLabel);

  // Figma: "Break view utilities".
  const viewButtons = makeElement('div', 'view-buttons');
  const settingsButton = makeElement('button', 'btn btn--secondary settings-button', 'Settings');
  settingsButton.type = 'button';
  const fullscreenButton = makeElement('button', 'btn btn--secondary fullscreen-button', 'Full screen');
  fullscreenButton.type = 'button';
  viewButtons.append(settingsButton, fullscreenButton);

  // The controls row, under the sentence.
  const controls = makeElement('div', 'ui__controls');
  controls.append(soundButton, viewButtons);
  uiBottom.append(controls);

  // An invisible line that screen readers read aloud whenever its
  // text changes. We use it for "5 minutes left" (once a minute)
  // and "Break over".
  const announcer = makeElement('div', 'visually-hidden');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');

  overlay.append(meadowHost, ui, announcer);

  // Hover reactions in the meadow (content/meadow-hover.js). The
  // cards sit on top of the picture, so the cursor is "over the
  // art" only when it points at the empty layout boxes around them,
  // not at a card or button. Touch screens have no hover.
  const emptyLayoutBoxes = [overlay, meadowHost, ui, uiTop, uiBottom, controls];
  overlay.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    meadow.pointerMove(event.clientX, event.clientY, emptyLayoutBoxes.includes(event.target));
  });
  overlay.addEventListener('pointerleave', () => meadow.pointerLeave());

  wrapper.append(bar, tooltip, overlay);
  shadow.append(stylesheet, wrapper);
  document.documentElement.append(host);


  // -----------------------------------------------------------
  // 2. Small helpers
  // -----------------------------------------------------------

  // Turns milliseconds into "12:40".
  function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  // The break countdown, as drawn in Figma: "05:00".
  function formatClock(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  // Changes an element's text, but only if it is really different
  // (screen readers can re-read text that is set again).
  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  // Puts a new sentence in the pill. While the pill is on
  // screen, the old sentence fades out (150 ms), the pill takes its
  // new size while the text is invisible, and the new one fades in
  // (200 ms), so the pill never visibly jumps. When the screen is
  // just opening, or with reduced motion, it simply swaps.
  const MESSAGE_FADE_OUT_MS = 150;
  let messageGoingTo = null; // the sentence a fade is heading to
  let messageTimer = 0;
  function showMessage(text, onScreen) {
    const target = messageGoingTo !== null ? messageGoingTo : message.textContent;
    if (target === text) return;
    clearTimeout(messageTimer);
    if (!onScreen || prefersReducedMotion()) {
      messageGoingTo = null;
      message.classList.remove('is-swapping');
      setText(message, text);
      return;
    }
    messageGoingTo = text;
    message.classList.add('is-swapping');
    messageTimer = setTimeout(() => {
      setText(message, text);
      messageGoingTo = null;
      message.classList.remove('is-swapping');
      scheduleFit(); // the quote may now take more or fewer lines
    }, MESSAGE_FADE_OUT_MS);
  }

  // How much time is left in the current phase, in milliseconds.
  function getRemainingMs() {
    if (state.paused) return state.remainingMs;
    return Math.max(0, state.endTime - Date.now());
  }

  // Turns milliseconds into words for screen readers:
  // "5 minutes left", "1 minute left", "30 seconds left".
  function describeTimeLeft(ms) {
    if (ms > 59000) {
      const minutes = Math.ceil(ms / 60000);
      return minutes + (minutes === 1 ? ' minute left' : ' minutes left');
    }
    return Math.ceil(ms / 1000) + ' seconds left';
  }

  // Sends a one-word request to the timer engine.
  function send(command) {
    try {
      chrome.runtime.sendMessage({ command: command }).catch(() => {});
    } catch (error) {
      // This happens if the extension was reloaded while this page
      // was open. Refreshing the page fixes it.
    }
  }

  // The fonts (DM Sans, plus the quote's serif), from the extension's own fonts
  // folder: nothing is downloaded from the internet. A sealed
  // Shadow DOM box can't declare a font in its CSS, so we hand the
  // font file to the page here instead. It gets a private name,
  // "Touch Grass Sans", so it can't replace or mix with any font
  // the page itself uses. It is loaded once, the first time the bar
  // shows up; until then (or if it fails) the tooltip simply uses
  // the computer's own font.
  let fontRequested = false;
  function loadFont() {
    if (fontRequested) return;
    fontRequested = true;
    try {
      const font = new FontFace(
        'Touch Grass Sans',
        'url("' + chrome.runtime.getURL('fonts/DMSans-Variable.ttf') + '")',
        { weight: '100 1000' }
      );
      font.load().then(() => document.fonts.add(font)).catch(() => {});
      // The serif for the break sentence (Instrument Serif Italic),
      // under the private name "Touch Grass Serif" for the same reason.
      const serif = new FontFace(
        'Touch Grass Serif',
        'url("' + chrome.runtime.getURL('fonts/InstrumentSerif-Italic.ttf') + '")',
        { style: 'italic', weight: '400' }
      );
      serif.load().then(() => {
        document.fonts.add(serif);
        scheduleFit(); // the quote changes size once its font arrives
      }).catch(() => {});
    } catch (error) {
      // Same as in send() below: the extension was reloaded while
      // this page was open. The fallback font is fine.
    }
  }

  // Should the bar be on this page right now? Only during focus,
  // and never on a site from the blocklist (F4).
  function barIsShown() {
    return (
      state !== null &&
      state.phase === 'focus' &&
      !isBlocked(location.hostname, settings.blocklist)
    );
  }


  // -----------------------------------------------------------
  // 3. Drawing the progress bar
  // -----------------------------------------------------------

  function renderBar() {
    const shown = barIsShown();

    // Top or bottom edge (the CSS moves the bar and the tooltip).
    wrapper.classList.toggle('bar-bottom', settings.barPosition === 'bottom');

    bar.classList.toggle('visible', shown);
    bar.classList.toggle('paused', shown && state.paused);

    // Screen readers only "see" the bar while it is on screen.
    bar.setAttribute('aria-hidden', shown ? 'false' : 'true');

    if (!shown) {
      tooltip.classList.remove('visible');
      return;
    }

    loadFont(); // for the tooltip; does nothing after the first time
    updateBarValue();

    const remainingMs = getRemainingMs();

    // Step 1: jump (no animation) to where the bar should be right now.
    barFill.style.transition = 'none';
    barFill.style.transform = 'scaleX(' + getBarProgress() + ')';

    // Reduced motion: stop here. The ticker moves the bar in small
    // jumps instead of the smooth glide below.
    if (!state.paused && !prefersReducedMotion()) {
      // Step 2: ask the browser to apply step 1 before we continue...
      barFill.getBoundingClientRect();

      // Step 3: ...then let ONE smooth CSS transition fill the rest
      // over exactly the time that is left. No per-second repaints.
      barFill.style.transition = 'transform ' + remainingMs + 'ms linear';
      barFill.style.transform = 'scaleX(1)';
    }
  }

  // How full the bar is: 0 = empty, 1 = full. With reduced motion
  // the answer only changes every 15 seconds, so the bar moves in
  // small jumps.
  function getBarProgress() {
    let elapsedMs = state.durationMs - getRemainingMs();
    if (prefersReducedMotion()) {
      elapsedMs = Math.floor(elapsedMs / REDUCED_MOTION_STEP_MS) * REDUCED_MOTION_STEP_MS;
    }
    return Math.min(1, Math.max(0, elapsedMs / state.durationMs));
  }

  // What a screen reader says when it reads the bar: "Focus time,
  // 12 minutes left". Rounded up to whole minutes, so the text only
  // changes once a minute and not every second.
  function updateBarValue() {
    const remainingMs = getRemainingMs();
    const minutes = Math.ceil(remainingMs / 60000);
    const text =
      minutes + (minutes === 1 ? ' minute left' : ' minutes left') +
      (state.paused ? ', paused' : '');

    if (bar.getAttribute('aria-valuetext') === text) return; // nothing new
    bar.setAttribute('aria-valuetext', text);
    bar.setAttribute(
      'aria-valuenow',
      String(Math.round((1 - remainingMs / state.durationMs) * 100))
    );
  }

  // "12:40 remaining", or "Paused · 12:40".
  function updateTooltipText() {
    const time = formatTime(getRemainingMs());
    tooltip.textContent = state.paused ? 'Paused · ' + time : time + ' remaining';
  }

  // The bar never catches the mouse (so it can't block clicks on the
  // page). Instead we watch where the mouse is, and show the tooltip
  // when it is at the edge the bar is on.
  document.addEventListener(
    'mousemove',
    (event) => {
      const nearBar =
        settings.barPosition === 'bottom'
          ? event.clientY >= window.innerHeight - HOVER_ZONE_PX
          : event.clientY <= HOVER_ZONE_PX;

      if (barIsShown() && nearBar) {
        updateTooltipText();
        // Follow the mouse, but keep the label inside the window.
        const x = Math.min(Math.max(event.clientX, 60), window.innerWidth - 60);
        tooltip.style.left = x + 'px';
        tooltip.classList.add('visible');
      } else {
        tooltip.classList.remove('visible');
      }
    },
    { passive: true }
  );

  // Mouse left the page (for example up to the tab strip).
  document.documentElement.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
  });


  // -----------------------------------------------------------
  // 4. Drawing the break screen
  // -----------------------------------------------------------

  function renderOverlay() {
    const onBreak = state !== null && state.phase === 'break';
    const breakDone = state !== null && state.phase === 'breakDone';
    const wasVisible = overlay.classList.contains('visible');
    const nowVisible = onBreak || breakDone;

    // Which way to skip depends on the strictness setting (F6):
    //   relaxed -> "Skip break" link   gentle -> Hold to skip   strict -> nothing
    const showSkipLink = onBreak && settings.strictness === 'relaxed';
    const showHoldButton = onBreak && settings.strictness === 'gentle';

    // Is keyboard focus on our break screen right now?
    const focusWasInside = shadow.activeElement !== null;

    // The break screen is opening: remember where keyboard focus was
    // on the page, and start everything from scratch.
    if (nowVisible && !wasVisible) {
      const active = document.activeElement;
      lastPageFocus = active && active !== host && active !== document.body ? active : null;
      lastAnnouncedMinute = null;
      announcer.textContent = '';
      confirmingSkip = false;
      resetHold();
      loadFont();
      // What the cats wear. Read only here, as the screen opens, so a
      // change on the options page shows from the next break.
      meadow.setAccessory(settings.catAccessory);
    }

    overlay.classList.toggle('visible', nowVisible);

    // The meadow moves while the break screen shows, but never with
    // reduced motion: then it is the still picture from Figma.
    meadow.setRunning(nowVisible && !prefersReducedMotion());
    if (nowVisible) meadow.load(); // does nothing after the first time

    // The cards only change while the screen is showing. While it
    // fades out, they keep their last look (e.g. "Break skipped").
    if (nowVisible) {
      renderPanel(onBreak, breakDone, showSkipLink, showHoldButton);
      renderBottomRow(onBreak);

      // The line for this break (F11). The engine picked it and saved
      // it in the note, so every tab shows the same one.
      const line = state.message || DEFAULT_ENCOURAGEMENT;
      showMessage(line, wasVisible);

      scheduleFit();
    }

    // Move keyboard focus onto the break screen itself (not onto a
    // button), so typing doesn't go to the page underneath and no
    // button looks pre-selected: the first thing you see is the rest,
    // not "skip" (2026-11-17). Tab then goes to the buttons, and
    // after the break Enter starts the next focus (see keydown below).
    // This runs on every redraw, so focus also moves in when you
    // switch to this tab in the middle of a break.
    if (nowVisible && document.visibilityState === 'visible') {
      const current = shadow.activeElement;
      const currentIsGone = !current || current.closest('[hidden]') !== null;
      if (currentIsGone) {
        // In the "Skip break?" question, the safe choice gets focus.
        (confirmingSkip ? confirmNoButton : overlay).focus({ preventScroll: true });
      }
    }

    // The break screen is closing: leave full screen, and hand
    // keyboard focus back to wherever it was on the page.
    if (wasVisible && !nowVisible) {
      leaveFullscreen();
      if (focusWasInside) {
        if (lastPageFocus && lastPageFocus.isConnected) {
          lastPageFocus.focus({ preventScroll: true });
        } else if (shadow.activeElement) {
          shadow.activeElement.blur();
        }
      }
      lastPageFocus = null;
      swallowHeldKey();
    }
  }

  // The countdown panel (top right).
  function renderPanel(onBreak, breakDone, showSkipLink, showHoldButton) {
    // The phase chip: same colours as in the popup.
    if (breakDone) {
      phaseChip.className = 'chip chip--idle';
      setText(phaseLabel, 'Break over');
    } else if (state.breakType === 'long') {
      phaseChip.className = 'chip chip--long-break';
      setText(phaseLabel, 'Long break');
    } else {
      phaseChip.className = 'chip chip--break';
      setText(phaseLabel, 'Break');
    }
    setText(roundText, 'Round ' + state.round + ' of ' + state.totalRounds);
    roundText.hidden = breakDone; // "Next: … round 3 of 4" says it then

    // During the break: the countdown.
    // After the break: "Nice break.", what comes next, and the
    // "Start next focus" button (F7).
    timerLabel.hidden = breakDone;
    countdown.hidden = breakDone;
    doneTitle.hidden = !breakDone;
    doneNext.hidden = !breakDone;
    if (breakDone) {
      // After a long break the set starts over at round 1 (as in the engine).
      const nextRound = state.breakType === 'long' ? 1 : state.round + 1;
      // TEST_MODE (shared/settings.js) makes every focus round 30 seconds.
      const focusLength = TEST_MODE ? '30 sec' : settings.focusMinutes + ' min';
      setText(doneNext, 'Next: ' + focusLength + ' focus · round ' + nextRound + ' of ' + state.totalRounds);
    } else {
      setText(countdown, formatClock(getRemainingMs()));
    }

    if (!showHoldButton) {
      resetHold();
      confirmingSkip = false;
    }
    // The hold button swaps places with the "Skip break?" question.
    holdButton.hidden = !showHoldButton || confirmingSkip;
    confirmSkip.hidden = !(showHoldButton && confirmingSkip);
    skipButton.hidden = !showSkipLink;
    startNextButton.hidden = !breakDone;
    panelAction.hidden = !(showHoldButton || showSkipLink || breakDone);

    // The small line at the bottom of the panel.
    // (The hold button says how long to hold in its own label.)
    let hint = '';
    if (onBreak && settings.strictness === 'strict') {
      hint = 'This break ends on its own.';
    }
    setText(panelHint, hint);
    panelHint.hidden = hint === '';

    // Screen readers hear "Break over" when the countdown ends.
    // (The minutes during the break are announced by the ticker.)
    if (breakDone && announcer.textContent !== 'Break over') {
      announcer.textContent = 'Break over';
    }
  }

  // The bottom rows: the sentence, then Mute sound, Settings, Full screen.
  function renderBottomRow(onBreak) {
    // Mute sound (F13): only during a break, and only if ambient
    // sound is switched on in the settings.
    soundButton.hidden = !(onBreak && settings.ambientOn);
    const soundWords = settings.breakMuted ? 'Unmute sound' : 'Mute sound';
    setText(soundLabel, soundWords);
    soundButton.title = soundWords; // tooltip on hover
    soundButton.classList.toggle('is-muted', !!settings.breakMuted);

    // Some sites don't allow full screen at all: then no button.
    fullscreenButton.hidden = !document.fullscreenEnabled;
    setText(fullscreenButton, isOurFullscreen() ? 'Exit full screen' : 'Full screen');
  }


  // ----- Fitting the meadow around the cards -----
  // The meadow fills the window. meadow.js makes it a little smaller
  // if a card would otherwise cover one of the cats.

  let fitQueued = false;
  function scheduleFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => {
      fitQueued = false;
      fitScene();
    });
  }

  function fitScene() {
    if (!overlay.classList.contains('visible')) return;
    const box = overlay.getBoundingClientRect();
    const cards = [panel, soundButton, quote, viewButtons]
      .filter((element) => element.getClientRects().length > 0) // skips hidden ones
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left - box.left,
          right: rect.right - box.left,
          top: rect.top - box.top,
          bottom: rect.bottom - box.top,
        };
      });
    meadow.fit(box.width, box.height, cards);
    // Hide the flowers under the sentence, plus a 12px margin (the
    // flowers sway a little, so they stay clear while they move).
    const quoteBox = quote.getBoundingClientRect();
    const QUOTE_CLEAR_MARGIN = 12;
    meadow.clearArea({
      left: quoteBox.left - QUOTE_CLEAR_MARGIN,
      top: quoteBox.top - QUOTE_CLEAR_MARGIN,
      right: quoteBox.right + QUOTE_CLEAR_MARGIN,
      bottom: quoteBox.bottom + QUOTE_CLEAR_MARGIN,
    });
  }

  window.addEventListener('resize', scheduleFit, { passive: true });
  // Cards change size when a longer message wraps, or the font arrives.
  new ResizeObserver(scheduleFit).observe(ui);
  [panel, quote, uiBottom].forEach((element) => new ResizeObserver(scheduleFit).observe(element));


  // ----- Full screen -----
  // Uses the browser's Fullscreen API on the break screen itself.
  // Pressing it again (or Escape) goes back.

  function isOurFullscreen() {
    // From outside, the page only sees our host element.
    return document.fullscreenElement === host;
  }

  function leaveFullscreen() {
    if (isOurFullscreen()) document.exitFullscreen().catch(() => {});
  }

  fullscreenButton.addEventListener('click', () => {
    if (isOurFullscreen()) {
      leaveFullscreen();
    } else {
      overlay.requestFullscreen().catch(() => {
        // The site doesn't allow it; nothing to do.
      });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (state !== null && overlay.classList.contains('visible')) {
      setText(fullscreenButton, isOurFullscreen() ? 'Exit full screen' : 'Full screen');
      scheduleFit();
    }
  });


  // ----- Keyboard -----

  // If a key is still held down when the break screen closes (for
  // example Enter, after "Hold to skip"), the keyboard keeps firing
  // it. Without this, those repeats would land on the page and could
  // press a button there or scroll it. We ignore the repeats, and
  // the moment the key is let go, until the next fresh key press.
  function swallowHeldKey() {
    function onKeyDown(event) {
      if (event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        stop(); // a fresh key press: back to normal
      }
    }
    function onKeyUp(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
    }
    function stop() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
  }

  // The buttons on the break screen that can be used right now.
  function focusableButtons() {
    return Array.from(overlay.querySelectorAll('button')).filter(
      (button) => button.closest('[hidden]') === null
    );
  }

  // Keyboard rules for the whole break screen.
  overlay.addEventListener('keydown', (event) => {
    // Tab stays inside the break screen: after the last button it
    // goes round to the first, and Shift+Tab goes the other way.
    if (event.key === 'Tab') {
      const buttons = focusableButtons();
      event.preventDefault();
      if (buttons.length === 0) return;
      const index = buttons.indexOf(shadow.activeElement);
      const next = event.shiftKey
        ? (index <= 0 ? buttons.length - 1 : index - 1)
        : (index + 1) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    }

    // After the break, with the screen itself focused (nothing chosen
    // yet), Enter starts the next focus, like the button would.
    if (
      event.key === 'Enter' &&
      event.target === overlay &&
      state !== null && state.phase === 'breakDone'
    ) {
      event.preventDefault();
      send('start');
    }

    // Escape skips the break, but only in Relaxed mode. (In full
    // screen, Escape belongs to the browser: it leaves full screen.)
    if (
      event.key === 'Escape' &&
      !isOurFullscreen() &&
      state !== null && state.phase === 'break' &&
      settings.strictness === 'relaxed'
    ) {
      event.preventDefault();
      send('skipBreak');
    }
  });

  // Keys pressed on the break screen stop here, so they don't also
  // trigger the keyboard shortcuts of the page underneath.
  ['keydown', 'keyup', 'keypress'].forEach((type) => {
    host.addEventListener(type, (event) => event.stopPropagation());
  });


  // ----- Buttons -----

  startNextButton.addEventListener('click', () => send('start'));
  skipButton.addEventListener('click', () => send('skipBreak'));

  // The engine saves the new mute state in the settings; this page
  // (and every other tab) then redraws the button from the settings.
  soundButton.addEventListener('click', () => {
    send(settings.breakMuted ? 'unmute' : 'mute');
  });

  // A web page can't open the extension's settings itself, so it
  // asks the engine to.
  settingsButton.addEventListener('click', () => send('openSettings'));


  // ----- Hold to skip (Gentle friction) -----
  // Pressing starts a 2-second countdown and the fill (Figma state
  // "Filling"). Letting go early empties it again. Reaching the end
  // shows "Break skipped" (state "Complete") and skips the break.

  let holdCountTimer = null;
  let holdComplete = false;

  function startHold() {
    if (holdTimer !== null || holdComplete) return; // already holding, or done
    holdButton.classList.add('is-filling'); // the CSS slides the fill in
    setText(holdLabel, 'Keep holding…');
    holdTimer = setTimeout(completeHold, HOLD_TO_SKIP_MS);

    // Reduced motion: no sliding fill. The label counts down
    // instead: "Keep holding… 2", "1".
    if (prefersReducedMotion()) {
      let secondsLeft = Math.round(HOLD_TO_SKIP_MS / 1000);
      setText(holdLabel, 'Keep holding… ' + secondsLeft);
      holdCountTimer = setInterval(() => {
        secondsLeft = Math.max(1, secondsLeft - 1);
        setText(holdLabel, 'Keep holding… ' + secondsLeft);
      }, 1000);
    }
  }

  function completeHold() {
    holdTimer = null;
    clearInterval(holdCountTimer);
    holdCountTimer = null;
    holdComplete = true;
    holdButton.classList.remove('is-filling');
    holdButton.classList.add('is-complete');
    setText(holdLabel, 'Break skipped');
    send('skipBreak');
  }

  // Let go too early: back to the start.
  function cancelHold() {
    if (holdComplete) return;
    clearTimeout(holdTimer);
    holdTimer = null;
    clearInterval(holdCountTimer);
    holdCountTimer = null;
    holdButton.classList.remove('is-filling'); // the CSS empties the fill
    setText(holdLabel, HOLD_LABEL);
  }

  // Ready for the next break.
  function resetHold() {
    holdComplete = false;
    cancelHold();
    holdButton.classList.remove('is-complete');
  }

  // Mouse, touch or pen
  holdButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0) startHold(); // main button only
  });
  holdButton.addEventListener('pointerup', cancelHold);
  holdButton.addEventListener('pointerleave', cancelHold);
  holdButton.addEventListener('pointercancel', cancelHold);

  // Keyboard: hold Space or Enter, the same as the mouse.
  holdButton.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      startHold();
    }
  });
  holdButton.addEventListener('keyup', cancelHold);
  holdButton.addEventListener('blur', cancelHold);

  // Screen readers: a "click" that came from neither the mouse nor a
  // real key press (detail is 0). Show the "Skip break?" question.
  holdButton.addEventListener('click', (event) => {
    if (event.detail !== 0 || holdComplete) return; // a normal mouse click: holding is required
    confirmingSkip = true;
    renderOverlay(); // swaps the button for the question and moves focus
  });
  confirmYesButton.addEventListener('click', () => send('skipBreak'));
  confirmNoButton.addEventListener('click', () => {
    confirmingSkip = false;
    renderOverlay(); // back to the hold button
  });


  // -----------------------------------------------------------
  // 5. The ticker: updates the numbers once a second
  // -----------------------------------------------------------
  // Only the text changes here (break countdown, tooltip). The bar
  // itself is moved by CSS, and the real timer is in the engine.

  function tick() {
    if (state === null) return;
    if (state.phase === 'break') {
      setText(countdown, formatClock(getRemainingMs()));
      announceTimeLeft();
    }
    // Near the end of a focus round: start loading the meadow
    // pictures, so the break screen opens with them ready.
    if (state.phase === 'focus' && !state.paused && getRemainingMs() < PRELOAD_BEFORE_BREAK_MS) {
      meadow.load(); // does nothing after the first time
    }
    if (barIsShown()) {
      updateBarValue();
      if (prefersReducedMotion() && !state.paused) {
        // Jump to the current step (no glide). Most seconds this
        // sets the same value again, which changes nothing.
        barFill.style.transition = 'none';
        barFill.style.transform = 'scaleX(' + getBarProgress() + ')';
      }
    }
    if (state.phase === 'focus' && tooltip.classList.contains('visible')) {
      updateTooltipText();
    }
  }

  // Reads the time left to screen readers: within a second of the
  // break starting (or of you arriving on this tab), then once each
  // time a whole minute passes.
  function announceTimeLeft() {
    if (document.visibilityState !== 'visible') return;
    const remainingMs = getRemainingMs();
    if (remainingMs <= 0) return;
    const minute = Math.ceil(remainingMs / 60000);
    if (minute === lastAnnouncedMinute) return;
    lastAnnouncedMinute = minute;
    announcer.textContent = describeTimeLeft(remainingMs);
  }

  function startOrStopTicker() {
    const needsTicker =
      state !== null && (state.phase === 'break' || (state.phase === 'focus' && !state.paused));

    if (needsTicker && ticker === null) {
      ticker = setInterval(tick, 1000);
    } else if (!needsTicker && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }


  // -----------------------------------------------------------
  // 6. Wiring: read the note and settings, redraw when they change
  // -----------------------------------------------------------

  function render() {
    // The CSS switches off fades when this class is on the wrapper.
    wrapper.classList.toggle('reduced-motion', prefersReducedMotion());
    renderBar();
    renderOverlay();
    startOrStopTicker();
  }

  // Start only once the stylesheet is ready.
  stylesheet.addEventListener('load', () => {
    wrapper.hidden = false;

    // Read the note and the settings once...
    chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]).then((stored) => {
      state = stored[STORAGE_KEY] || null;
      settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
      render();
    });

    // ...and again every time either one changes. This is what makes
    // a change on the settings page show up here without a refresh.
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEY]) {
        state = changes[STORAGE_KEY].newValue || null;
      }
      if (changes[SETTINGS_KEY]) {
        settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
      }
      if (changes[STORAGE_KEY] || changes[SETTINGS_KEY]) {
        render();
      }
    });

    // If the system's "Reduce motion" switch is flipped while a page
    // is open, redraw so the bar changes style straight away.
    motionQuery.addEventListener('change', render);

    // When you come back to this tab, line the bar up with the
    // clock again in case the browser paused it in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        lastAnnouncedMinute = null; // read the time left again on arrival
        render();
      }
    });
  });
})();
