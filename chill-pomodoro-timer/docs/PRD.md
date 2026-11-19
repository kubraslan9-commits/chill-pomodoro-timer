# Pomodoro Chrome Extension — Product Requirements

Nov 14, 2026 · @Kübra

## Overview

A Pomodoro timer for Chrome that stays out of the way while you work and pulls you away from the screen when you should rest. During focus time it's a thin progress bar on the edge of the page. When a break starts, an animated meadow with swaying grass and birds covers the page and says "Time to touch grass."

**Problem.** Most Pomodoro tools fail in one of two ways. They're too loud during focus: pop-ups, big timers, a separate tab to manage. Or they're too easy to ignore during breaks: a small notification gets dismissed, and the break never happens.

**Target users.** People who work in the browser for long stretches: students, designers, developers, writers. They want structure without clutter, and something friendly rather than strict to get them to step away.

**Goals**

- Stay visible during focus without pulling attention (the progress bar is the only on-page element).
- Make breaks actually happen, with a full-screen experience that feels like a reward rather than a punishment.
- Get published on the Chrome Web Store with a polish level good enough for a portfolio case study.

**Non-goals for v1**

- Accounts, cloud sync or cross-device stats
- Task lists or project tracking
- Website blocking during focus time
- Firefox, Safari or mobile versions

## Core experience

The product has three surfaces: the progress bar during focus, the meadow during breaks, and a toolbar popup for control. A session loops focus → break, with a long break after a set number of rounds, and it always waits for you before the next focus round starts.

### 1. Focus mode: the progress bar

- A thin bar (3–4 px) along the top edge of every page. It fills from left to right as the focus time passes.
- No numbers on the page. Hovering over the bar shows a small tooltip with the time left ("12:40 left").
- Soft, low-contrast color, with an option to put it on the bottom edge instead.
- It never takes clicks or covers page content: pointer events pass through everything except the hover zone.
- Hidden on sites the user has blocklisted.

### 2. Break mode: the meadow

- When focus ends, a soft chime plays and the meadow fades in over the current page (about 600 ms).
- Illustrated, animated scene with three layers of motion:
  - **Flowers and grass** sway gently in the wind, in a slow loop.
  - **Birds** fly across the sky now and then, and some land and hop on the grass.
  - **Cats** chase the birds: a cat crouches, wiggles, pounces, and the bird flutters away safely. The cat sits down looking puzzled, then wanders off. It's playful, never violent: the birds always get away.
- Visual reference: [Kübra's mood image](https://i.pinimg.com/1200x/12/f4/f4/12f4f46d0354782248505ad84470a5ef.jpg). Use it for mood and palette only. The shipped art has to be original or licensed, because a Pinterest image usually belongs to an artist and can't be published on the Web Store without permission.
- Center: a rotating message such as "Time to touch grass," plus a calm countdown of the break time left.
- Optional ambient birdsong or wind, with a mute toggle on the screen.
- How strict it is depends on the user's setting (see Settings):
  - **Relaxed:** a small "Skip break" link.
  - **Gentle friction:** skip only after holding a button for 2 seconds.
  - **Strict:** no skip until the countdown ends.
- When the break ends: a chime plays and the countdown becomes a **"Start next focus"** button. Nothing auto-starts.
- It respects `prefers-reduced-motion`: animation slows down or becomes a still illustration.

#### Meadow art direction (from the reference)

The meadow should feel like a hand-painted gouache garden: flat, matte, folk-style shapes with a visible brush texture, not glossy vector art.

- **Composition:** a bright lime lawn curving through the middle like a path. Flower borders frame all four edges, which leaves a calm open area in the center for the message and countdown.
- **Palette:** lime and grass greens; deep teal and navy for the leafy bushes (with small white dots); warm accents in poppy red, coral, peach, pink and buttery yellow; small touches of lavender and sky blue. Gray-blue stones along one border.
- **Flowers:** poppies, roses, cosmos, daisies, tulips and little clusters of tiny blossoms. Each type sways at its own speed and amplitude, so the movement feels natural rather than in sync.
- **Cats:** two simple, chunky cats in flat colors (one orange, one black) with minimal faces. Idle states are sitting, tail flicking, looking up, and blinking slowly. The chase loop is crouch → butt wiggle → pounce → bird escapes → puzzled sit.
- **Birds:** small white and blue birds with simple wing shapes and a 2–3 frame flap. They flutter just out of the cats' reach.
- **Text on the meadow:** set the message on the open lawn in a soft, rounded hand-lettered style, in a dark teal from the palette, with enough contrast to meet WCAG AA.
- **Build approach:** layered SVG or PNG cut-outs (background lawn → back borders → cats and birds → front borders), animated with CSS transforms or a light Lottie file. Keep the full scene under about 1.5 MB so the overlay opens instantly.
- **Originality:** the reference shows the mood we want. The final scene must be newly drawn (by Kübra or a commissioned illustrator), not traced or copied, so it's safe to publish.

### 3. Controls: the toolbar popup

- Click the extension icon to open the popup.
- It shows: the current phase (Focus / Break / Idle), time left, round count (e.g. "Round 2 of 4"), and Start / Pause / Reset buttons.
- Today's stats: pomodoros completed and total focus minutes, plus a small 7-day strip.
- A link to Settings.

## Functional requirements

v1 ships every Must and Should item. Could items wait until after launch.

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | The timer runs in the background service worker (chrome.alarms) and keeps going across tab switches, reloads and closed popups | Must |
| F2 | Users can set the focus, short break and long break lengths, plus the number of rounds before a long break | Must |
| F3 | A thin progress bar appears on every page during focus, with a hover tooltip that shows the time left | Must |
| F4 | Users can add domains to a blocklist where the bar is hidden | Must |
| F5 | When a break starts, the full-screen meadow covers the active tab | Must |
| F6 | Break strictness setting: Relaxed, Gentle friction or Strict | Must |
| F7 | At the end of a break, the next focus round waits until the user clicks "Start next focus" | Must |
| F8 | A toolbar popup with Start / Pause / Reset, the current phase, time left and round count | Must |
| F9 | A system notification fallback when the meadow can't be shown | Must |
| F10 | Accessibility: reduced-motion support, keyboard access to every control, readable contrast on the meadow text | Must |
| F11 | Rotating break messages (a pool of 20 or more, no repeat twice in a row) | Should |
| F12 | A soft chime when focus or a break ends, on by default, can be turned off | Should |
| F13 | Ambient birdsong or wind during breaks, with a mute toggle on the meadow and a volume setting | Should |
| F14 | Daily stats: today's pomodoros and focus minutes plus a 7-day strip, stored locally | Should |
| F15 | Options for the bar's position (top or bottom) and color theme | Could |
| F16 | Several meadow scenes (morning, sunset, night) that rotate | Could |

## Settings

Out of the box the extension works with classic Pomodoro defaults, so a new user can press Start without opening Settings.

| Setting | Options | Default |
| --- | --- | --- |
| Focus length | 5–90 min | 25 min |
| Short break | 1–30 min | 5 min |
| Long break | 5–60 min | 15 min |
| Rounds before long break | 2–8 | 4 |
| Break strictness | Relaxed / Gentle friction / Strict | Gentle friction |
| After a break | Wait for user (only option in v1) | Wait for user |
| Progress bar position | Top / Bottom | Top |
| Hidden on these sites | List of domains | Empty |
| Transition chime | On / Off | On |
| Break ambient sound | On / Off, volume 0–100% | On, 40% |
| Reduced motion | Follow system / Always on | Follow system |

## Edge cases

Whenever the meadow can't appear, the user gets a desktop notification instead: "Break time — go touch grass."

| Situation | Behavior |
| --- | --- |
| Active tab is a restricted page (chrome://, the Web Store, the new tab page, PDFs) | Send a system notification. Show the meadow the next time the user lands on a normal page during the break |
| No Chrome window is focused, or the browser is minimized | Send a system notification. The timer keeps running |
| User is on a blocklisted site when the break starts | The meadow still appears: the blocklist only hides the bar. Open question: should blocklisted sites also skip the meadow (e.g. video calls)? |
| User switches tabs during a break | The meadow follows them onto every tab they open until the break ends |
| Several Chrome windows are open | The meadow shows on the active tab of each window |
| Computer sleeps during focus or a break | On wake, the timer checks the real time that passed. If the phase is over, move to the next one; don't replay a missed break |
| User pauses the timer | The bar freezes and dims. The popup shows "Paused" |
| Chrome restarts mid-session | Restore the phase and remaining time from storage. If it's been more than 30 min, reset to Idle |
| A page's own CSS clashes with the bar or meadow | Render inside a Shadow DOM with the highest z-index, so page styles can't leak in |

## Technical notes

Build it as a Manifest V3 extension. All data stays on the user's device, which keeps the permission list short and the Web Store review simple.

- **Architecture**
  - *Service worker:* the source of truth for timer state; it schedules phase changes with `chrome.alarms`.
  - *Content script:* injects the progress bar and the meadow overlay into a Shadow DOM, and listens for state messages.
  - *Popup:* controls and today's stats.
  - *Options page:* settings and the blocklist.
  - *Offscreen document:* plays the chime and ambient audio, so sound works no matter which tab is active.
- **Permissions:** `storage`, `alarms`, `notifications`, `offscreen`, plus content scripts on `<all_urls>`. Content scripts on every site will trigger a longer Web Store review, so the listing should explain why they're needed (the progress bar and break screen).
- **Storage:** `chrome.storage.local` for the timer state, stats and settings. Optionally `chrome.storage.sync` for settings only.
- **Privacy:** no analytics, no network requests, no accounts. Publish a one-paragraph privacy policy saying exactly that; the Web Store requires one.
- **Performance:** the bar updates through a CSS transition, not per-second JS repaints. The meadow's assets are lazy-loaded the first time a break starts, then cached.
- **Web Store listing:** 128 px icon, 3–5 screenshots (the bar in focus mode, the meadow, the popup, settings), a 440×280 promo tile, and a short demo video of a cat chasing a bird.

## Name and voice

The voice is warm and a little cheeky: a friend nudging you outside, not a productivity coach. Check Web Store availability before picking a name.

| Name | Tone | Why it fits |
| --- | --- | --- |
| Touch Grass | Playful, meme | Says the core joke out loud; instantly memorable |
| Meadow Break | Calm, cozy | Describes the experience; easy to search for |
| Catnap Garden | Cozy, cute | Puts the cats front and center and hints at rest |
| Little Garden Timer | Gentle | Fits the painted, storybook art style |
| Pounce | Playful | Short; the cat chase as a metaphor for jumping back in |
| Go Outside, Friend | Warm, cheeky | A softer take on the meme |

**Break messages (first set for the rotating pool)**

- Time to touch grass.
- The cats are out. Are you?
- Go stand by a window for a bit.
- Stretch like a cat waking up.
- Your eyes would love to look at something far away.
- Water break. The flowers are having one too.
- Roll your shoulders. Then roll them again.
- The birds will wait. Your back won't.
- Five minutes of nothing. You've earned it.
- Go say hi to someone (or a plant).

## Open questions, success and milestones

**Open questions**

- [ ] Should blocklisted sites (e.g. video calls) also skip the meadow, or only hide the bar?
- [ ] Who draws the final meadow art: Kübra herself, or a commissioned illustrator?
- [ ] Should a long break get its own scene (e.g. sunset, cats asleep in the grass)?
- [ ] Free forever, or free with optional extra scenes later?
- [ ] Which name, after checking availability?

**What success looks like**

- Most started breaks run to the end instead of being skipped (track this locally and show it in your own stats).
- People keep using it: Web Store ratings and reviews mention that it's calm and that the meadow is a joy.
- It works as a portfolio case study covering research, art direction, motion and shipping.

**Milestones**

1. **Prototype:** the timer engine, the progress bar and a placeholder meadow (a still image), tested by Kübra for a week.
2. **Art and motion:** final illustration layers, the flower sway, birds, and the cat chase loop.
3. **Polish:** settings, stats, sounds, edge cases, accessibility pass.
4. **Beta:** 5–10 friends test it for two weeks; collect feedback.
5. **Launch:** Web Store listing, privacy policy, screenshots and demo video.
