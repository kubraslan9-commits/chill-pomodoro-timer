# Chill Pomodoro Timer 🌿

A quiet Pomodoro timer for Chrome. While you focus, it's just a thin progress bar at the edge of the page. When it's time for a break, a hand-painted meadow with swaying flowers, birds and two cats covers the screen and tells you to go touch grass.

<!-- Add screenshots here, e.g.:
![The meadow break screen](docs/screenshots/meadow.png)
![Focus mode progress bar and popup](docs/screenshots/popup.png)
-->

## Why

Most Pomodoro tools are either too loud while you work (pop-ups, big timers, an extra tab to manage) or too easy to ignore when it's break time (a small notification you dismiss without looking). This one tries to do the opposite: stay out of the way during focus, and make the break feel like a reward you actually take.

## Features

- **Focus mode:** a 3–4 px bar along the top (or bottom) of every page. No numbers on the page; hover it to see the time left.
- **Break mode:** a full-screen animated meadow with a rotating break message and a calm countdown. Flowers sway, birds fly in, and the cats try (and fail) to catch them.
- **Break strictness:** Relaxed (skip link), Gentle friction (hold to skip) or Strict (no skip).
- **Nothing auto-starts:** after a break, the next focus round waits for you.
- **Sound:** a soft chime between phases and optional ambient meadow sound, with volume and mute.
- **Stats:** today's pomodoros and focus minutes, plus a 7-day strip.
- **Blocklist:** hide the bar on sites like video calls.
- **Accessible:** respects `prefers-reduced-motion`, works with the keyboard, readable contrast on the meadow.
- **Private:** no accounts, no analytics, no network requests. Everything stays in `chrome.storage.local`.

## Install (developer mode)

The extension isn't on the Chrome Web Store yet. To try it:

1. Download this repo (green **Code** button → **Download ZIP**) and unzip it, or `git clone` it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Pin the extension and press **Start** in the popup.

Requires Chrome 116 or newer.

## How it's built

Manifest V3, plain HTML, CSS and JavaScript, no build step.

| Part | What it does |
| --- | --- |
| `background/service-worker.js` | Source of truth for the timer; schedules phase changes with `chrome.alarms` |
| `content/` | Draws the progress bar and the meadow inside a Shadow DOM so page styles can't leak in |
| `popup/` | Start / Pause / Reset, current phase, round count and today's stats |
| `options/` | Settings and the blocklist |
| `offscreen/` | Plays the chime and ambient sound, whichever tab is active |
| `shared/` | Design tokens, components, settings, stats and break messages |
| `assets/meadow/` | The layered meadow artwork (SVG and WebP layers) |

The design system (tokens and components) was designed in Figma first and translated into `shared/tokens.css` and `shared/components.css`. The product requirements are in [`docs/PRD.md`](docs/PRD.md).

**Permissions:** `storage` (settings and stats), `alarms` (the timer), `offscreen` (sound), and content scripts on all sites (to show the progress bar and the break screen on whatever page you're on).

## Credits

Design, artwork and development by **Kübra Aslan**. See [CREDITS.md](CREDITS.md) for fonts and sound.

## License

[MIT](LICENSE), including the artwork. Bundled fonts keep their own SIL Open Font License (see `fonts/`).
