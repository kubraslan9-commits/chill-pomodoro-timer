// =============================================================
// MEADOW HOVER REACTIONS  (the meadow answers the mouse cursor)
// =============================================================
// When the cursor touches a cat, a bird or a single flower on the
// break screen, it reacts a little: a cat perks up, a bird hops, a
// flower leans as if brushed past. Each of the ~700 flowers and
// grass blades reacts on its own (2026-11-17; before that, a whole
// clump leaned together).
//
// IMPORTANT: these values are NOT from Figma. The Figma file has
// no hover components or prototype interactions for the meadow, so
// the numbers below were chosen from common interface-motion
// practice and agreed with the user (2026-11-17):
//   - small reactions take about 150–300 ms; this calm screen uses
//     300–450 ms in, and a slightly longer way back
//   - "ease-out" towards Hover (quick start, soft landing), and
//     "ease-in-out" back to Idle (a calm settle)
//   - small movements: a few degrees, a few pixels, 2–5 % scale
// Change them freely in REACTIONS below. The Figma 16 s loop in
// meadow-motion.css is separate and must stay untouched.
//
// How it fits together:
//   - meadow.js puts every reacting layer inside an extra box (the
//     "wrapper"). The layer inside keeps its Figma loop; the wrapper
//     plays the reaction with the Web Animations API, so the two
//     movements add up.
//   - Flowers are placed in the page as SVG, one <g data-flower>
//     per Figma flower. The reaction plays on that <g>, inside its
//     clump, which keeps its Figma loop. meadow.js finds the flower
//     under the cursor; the browser counts only its painted shapes.
//   - Only the painted parts count as "touched", not the empty
//     corners of a box. For cats and birds (pictures) this file
//     keeps a small see-through map of each picture and checks the
//     pixel under the cursor (see buildHitMap).
//   - The artwork stays hidden from screen readers (aria-hidden),
//     and nothing important depends on these reactions.
// =============================================================

const TouchGrassMeadowHover = (function () {
  'use strict';

  // ----- The values (edit here) ---------------------------------
  //
  // trigger:
  //   'while-hovering'  goes to Hover when the cursor arrives and
  //                     stays there; goes back to Idle when it leaves
  //   'mouse-enter'     goes to Hover when the cursor arrives, waits
  //                     `delay` ms, then goes back to Idle by itself
  // toHover / toIdle: duration in ms and easing of each half.
  // layers: what changes in Hover, per layer (names from layers.json):
  //   x, y      move, in pixels of the 1440 × 900 Figma frame
  //   rotate    degrees (positive = clockwise)
  //   scale     1 = unchanged, 1.02 = 2 % bigger
  // leanAway: true flips the rotation so the element leans away from
  //   the side the cursor came from (like brushing past flowers).
  // Every rotation and scale turns around the same point the layer
  // uses in its Figma loop (a flower's stem base, a cat's feet).

  const CAT = {
    trigger: 'while-hovering',
    toHover: { duration: 300, easing: 'ease-out' },
    toIdle: { duration: 450, easing: 'ease-in-out' },
  };
  const BIRD = {
    trigger: 'mouse-enter',
    delay: 150,
    toHover: { duration: 250, easing: 'ease-out' },
    toIdle: { duration: 350, easing: 'ease-in-out' },
  };

  // Single flowers, by the clump (Figma group) they belong to. Each
  // turns and grows around the bottom of its own stem.
  //   painted:  "Painted flower" / "Companion flower" in the big
  //             borders (the groups named flowers-…)
  //   bloom:    "Meadow bloom" / "Low meadow flower" (meadow-flowers-…
  //             and low-blooms-…)
  //   blade:    "Fine grass blade" (foreground-grasses)
  const FLOWERS = {
    painted: {
      name: 'painted flower',
      trigger: 'mouse-enter',
      delay: 150,
      leanAway: true,
      toHover: { duration: 350, easing: 'ease-out' },
      toIdle: { duration: 500, easing: 'ease-in-out' },
      change: { rotate: 5 },
    },
    bloom: {
      name: 'meadow bloom',
      trigger: 'mouse-enter',
      delay: 100,
      leanAway: true,
      toHover: { duration: 300, easing: 'ease-out' },
      toIdle: { duration: 450, easing: 'ease-in-out' },
      change: { rotate: 6, scale: 1.04 },
    },
    blade: {
      name: 'grass blade',
      trigger: 'mouse-enter',
      delay: 100,
      leanAway: true,
      toHover: { duration: 250, easing: 'ease-out' },
      toIdle: { duration: 400, easing: 'ease-in-out' },
      change: { rotate: 8 },
    },
  };

  function flowerKind(groupSlug) {
    if (groupSlug === 'foreground-grasses') return FLOWERS.blade;
    if (groupSlug.startsWith('flowers-')) return FLOWERS.painted;
    return FLOWERS.bloom; // meadow-flowers-… and low-blooms-…
  }

  function cat(name, prefix) {
    return Object.assign({ name }, CAT, {
      layers: {
        [prefix + '-body']: { y: -2, scale: 1.02 },
        [prefix + '-tail']: { y: -2, rotate: 8 }, // moves up with the body, and flicks
      },
    });
  }
  function bird(slug) {
    return Object.assign({ name: slug }, BIRD, {
      layers: {
        [slug]: { y: -6, rotate: -4 },
        [slug + '-wings']: { rotate: -15 },
      },
    });
  }

  const REACTIONS = [
    cat('cat 1', 'cat1'),
    cat('cat 2', 'cat2'),
    cat('cat 3', 'cat3'),
    cat('cat 4', 'cat4'),
    bird('bird-ivory'),
    bird('bird-blue'),
    bird('bird-butter'),
    bird('bird-pale'),
    // Flowers are not listed here: every single flower reacts on
    // its own, with the values in FLOWERS above.
  ];

  // After an element is back in Idle, it rests this long before it
  // can react again, so fast mouse movement still looks calm.
  const COOLDOWN_MS = 1500;

  // The see-through maps are kept at half the picture's size: plenty
  // for a cursor, and small in memory.
  const HIT_MAP_SCALE = 0.5;
  const ALPHA_THRESHOLD = 32; // out of 255: fainter pixels don't count

  const IDLE = 'translate(0px, 0px) rotate(0deg) scale(1)';

  // Is this layer one that reacts? (meadow.js asks, to add a wrapper.)
  const REACTING_SLUGS = new Set();
  REACTIONS.forEach((r) => Object.keys(r.layers).forEach((slug) => REACTING_SLUGS.add(slug)));
  function reacts(slug) {
    return REACTING_SLUGS.has(slug);
  }

  function hoverTransform(change, sign) {
    const x = change.x || 0;
    const y = change.y || 0;
    const rotate = (change.rotate || 0) * sign;
    const scale = change.scale || 1;
    return 'translate(' + x + 'px, ' + y + 'px) rotate(' + rotate + 'deg) scale(' + scale + ')';
  }


  // ----- Finding the exact point under the cursor -----
  //
  // The layers turn and move all the time (their Figma loop, plus a
  // reaction), so the cursor's position is traced back through every
  // box between the frame and the picture, using each box's current
  // position, turn and size.

  function readTranslate(value) {
    if (!value || value === 'none') return [0, 0];
    const parts = value.split(' ').map(parseFloat);
    return [parts[0] || 0, parts[1] || 0];
  }
  function readRotate(value) {
    if (!value || value === 'none') return 0;
    const parts = value.trim().split(' ');
    const angle = parts[parts.length - 1];
    const number = parseFloat(angle);
    if (angle.endsWith('rad')) return number * 180 / Math.PI;
    if (angle.endsWith('turn')) return number * 360;
    return number; // degrees
  }
  function readScale(value) {
    if (!value || value === 'none') return [1, 1];
    const parts = value.split(' ').map(parseFloat);
    return [parts[0], parts.length > 1 ? parts[1] : parts[0]];
  }

  // The box's own position and movement, as one matrix (the order
  // the browser uses: translate, rotate, scale, then transform).
  function boxMatrix(element) {
    const style = getComputedStyle(element);
    const left = parseFloat(element.style.left) || 0;
    const top = parseFloat(element.style.top) || 0;
    const origin = style.transformOrigin.split(' ').map(parseFloat);
    const [tx, ty] = readTranslate(style.translate);
    const [sx, sy] = readScale(style.scale);
    let matrix = new DOMMatrix()
      .translate(left + origin[0], top + origin[1])
      .translate(tx, ty)
      .rotate(readRotate(style.rotate))
      .scale(sx, sy);
    if (style.transform && style.transform !== 'none') {
      matrix = matrix.multiply(new DOMMatrix(style.transform));
    }
    return matrix.translate(-origin[0], -origin[1]);
  }

  // Is the painted part of this picture under the frame point?
  function hitsPicture(target, framePoint) {
    let matrix = new DOMMatrix();
    target.chain.forEach((element) => { matrix = matrix.multiply(boxMatrix(element)); });
    const local = matrix.inverse().transformPoint(framePoint);
    const x = local.x - target.offsetX;
    const y = local.y - target.offsetY;
    if (x < 0 || y < 0 || x >= target.width || y >= target.height) return false;
    if (!target.map) return true; // no map (yet): the whole box counts
    const mx = Math.floor(x * HIT_MAP_SCALE);
    const my = Math.floor(y * HIT_MAP_SCALE);
    return target.map.data[my * target.map.width + mx] === 1;
  }

  // Draws the picture small and keeps a 1/0 per pixel: painted or
  // see-through. Uses its own copy of the picture, loaded with
  // crossOrigin so the browser lets us read its pixels.
  async function buildHitMap(target) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = target.src;
    await image.decode();
    const width = Math.max(1, Math.ceil(target.width * HIT_MAP_SCALE));
    const height = Math.max(1, Math.ceil(target.height * HIT_MAP_SCALE));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data; // throws if the browser says no
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) {
      data[i] = pixels[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
    }
    return { width, height, data };
  }


  // ---------------------------------------------------------------
  // create(): one controller for one meadow
  // ---------------------------------------------------------------
  // `layers` maps a slug to { wrapper, chain, image, order, pivotX }
  // (built by meadow.js). `toFrame(clientX, clientY)` turns a screen
  // point into a point in the 1440 × 900 frame. `flowerAt(clientX,
  // clientY)` returns the single flower there ({ element, slug,
  // order }) or null.

  function create(layers, toFrame, flowerAt) {
    let active = false;  // break showing, motion allowed
    let paused = false;  // tab hidden
    let pointer = null;  // last cursor position in the frame
    let lastX = null;    // for "which way is the cursor moving"
    let direction = 0;
    let client = null;   // last cursor position on the screen
    let frameRequest = 0;
    let current = null;  // the reactor under the cursor

    // One "reactor" per entry in REACTIONS that exists in the scene.
    const reactors = REACTIONS.map((reaction) => {
      const parts = Object.keys(reaction.layers)
        .filter((slug) => layers[slug])
        .map((slug) => ({ slug, change: reaction.layers[slug], layer: layers[slug] }));
      return {
        reaction,
        parts,
        order: Math.max(-1, ...parts.map((p) => p.layer.order)),
        phase: 'idle',        // idle | toHover | hover | toIdle
        restUntil: 0,         // cooldown end time
        animations: [],
        token: 0,             // ignores stale "finished" callbacks
      };
    }).filter((r) => r.parts.length > 0);

    // One reactor per single flower, made the first time the cursor
    // touches it (there are ~700).
    const flowerReactors = new Map(); // <g data-flower> -> reactor
    function flowerReactor(found) {
      let reactor = flowerReactors.get(found.element);
      if (!reactor) {
        const kind = flowerKind(found.slug);
        reactor = {
          reaction: kind,
          parts: [{ change: kind.change, layer: { wrapper: found.element } }],
          order: found.order,
          flower: found.element,
          phase: 'idle',
          restUntil: 0,
          animations: [],
          token: 0,
        };
        flowerReactors.set(found.element, reactor);
      }
      return reactor;
    }
    function allReactors() {
      return reactors.concat(Array.from(flowerReactors.values()));
    }

    // Front-most first, so overlapping shapes go to the one on top.
    const byDepth = reactors.slice().sort((a, b) => b.order - a.order);

    // The see-through maps: built one by one in the background.
    (async () => {
      for (const reactor of reactors) {
        for (const part of reactor.parts) {
          const target = part.layer.target;
          try {
            target.map = await buildHitMap(target);
          } catch (error) {
            target.map = null; // the whole box counts for this one
          }
          await new Promise((resolve) => setTimeout(resolve, 0)); // stay smooth
        }
      }
    })();

    function stopAnimations(reactor) {
      reactor.token++;
      reactor.animations.forEach((animation) => animation.cancel());
      reactor.animations = [];
    }

    function rest(reactor) {
      reactor.phase = 'idle';
      reactor.animations.forEach((animation) => animation.cancel());
      reactor.animations = [];
      reactor.restUntil = performance.now() + COOLDOWN_MS;
    }

    // Lean away from the cursor: +1 leans right, -1 leans left.
    // When the cursor isn't moving sideways, lean away from the side
    // of the stem it is on.
    function leanSign(reactor) {
      if (!reactor.reaction.leanAway) return 1;
      if (direction !== 0) return direction;
      if (reactor.flower) {
        const box = reactor.flower.getBoundingClientRect();
        return client && client.x < box.left + box.width / 2 ? 1 : -1;
      }
      const pivotX = reactor.parts[0].layer.pivotX;
      return pointer && pointer.x < pivotX ? 1 : -1;
    }

    function animateAll(reactor, makeKeyframes, timing, whenDone) {
      stopAnimations(reactor);
      const token = reactor.token;
      reactor.animations = reactor.parts.map((part) =>
        part.layer.wrapper.animate(makeKeyframes(part), Object.assign({ fill: 'forwards' }, timing))
      );
      if (paused) reactor.animations.forEach((animation) => animation.pause());
      Promise.all(reactor.animations.map((animation) => animation.finished))
        .then(() => { if (token === reactor.token) whenDone(); })
        .catch(() => {}); // cancelled: someone else took over
    }

    function enter(reactor) {
      if (reactor.phase !== 'idle' || performance.now() < reactor.restUntil) return;
      const reaction = reactor.reaction;
      const sign = leanSign(reactor);

      if (reaction.trigger === 'while-hovering') {
        reactor.phase = 'toHover';
        animateAll(reactor,
          (part) => [{ transform: IDLE }, { transform: hoverTransform(part.change, sign) }],
          { duration: reaction.toHover.duration, easing: reaction.toHover.easing },
          () => { reactor.phase = 'hover'; });
        return;
      }

      // 'mouse-enter': to Hover, wait, back to Idle, in one go.
      const total = reaction.toHover.duration + reaction.delay + reaction.toIdle.duration;
      reactor.phase = 'toHover';
      animateAll(reactor,
        (part) => {
          const hover = hoverTransform(part.change, sign);
          return [
            { offset: 0, transform: IDLE, easing: reaction.toHover.easing },
            { offset: reaction.toHover.duration / total, transform: hover, easing: 'linear' },
            { offset: (reaction.toHover.duration + reaction.delay) / total, transform: hover, easing: reaction.toIdle.easing },
            { offset: 1, transform: IDLE },
          ];
        },
        { duration: total },
        () => rest(reactor));
    }

    function leave(reactor) {
      if (reactor.reaction.trigger !== 'while-hovering') return; // plays out by itself
      if (reactor.phase !== 'toHover' && reactor.phase !== 'hover') return;
      // Start the way back from wherever it is right now.
      const from = reactor.parts.map((part) => getComputedStyle(part.layer.wrapper).transform);
      reactor.phase = 'toIdle';
      animateAll(reactor,
        (part) => {
          const now = from[reactor.parts.indexOf(part)];
          return [{ transform: now === 'none' ? IDLE : now }, { transform: IDLE }];
        },
        { duration: reactor.reaction.toIdle.duration, easing: reactor.reaction.toIdle.easing },
        () => rest(reactor));
    }

    // The front-most reacting thing under the cursor: a cat or bird
    // (see-through maps), or a single flower (asked from meadow.js).
    // Layer order decides when both are there.
    function findUnderPointer() {
      if (!pointer) return null;
      let picture = null;
      for (const reactor of byDepth) {
        // A cat that isn't shown (fewer cats chosen, or no room).
        if (reactor.parts[0].layer.wrapper.closest('[hidden]')) continue;
        if (reactor.parts.some((part) => hitsPicture(part.layer.target, pointer))) { picture = reactor; break; }
      }
      const flower = client ? flowerAt(client.x, client.y) : null;
      if (flower && (!picture || flower.order > picture.order)) return flowerReactor(flower);
      return picture;
    }

    function update() {
      frameRequest = 0;
      if (!active || paused) return;
      const found = findUnderPointer();
      if (found === current) return;
      if (current) leave(current);
      current = found;
      if (current) enter(current);
    }

    // ----- Called by meadow.js -----

    // The cursor moved over the meadow (not over a card).
    function move(clientX, clientY) {
      if (!active || paused) return;
      const point = toFrame(clientX, clientY);
      if (lastX !== null && Math.abs(point.x - lastX) > 0.5) {
        direction = point.x > lastX ? 1 : -1;
      }
      lastX = point.x;
      pointer = new DOMPoint(point.x, point.y);
      client = { x: clientX, y: clientY };
      if (!frameRequest) frameRequest = requestAnimationFrame(update); // at most once per frame
    }

    // The cursor left the meadow, or went onto a card.
    function out() {
      pointer = null;
      client = null;
      lastX = null;
      direction = 0;
      if (current) leave(current);
      current = null;
    }

    // Everything back to Idle at once, no cooldowns left.
    function reset() {
      out();
      if (frameRequest) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      allReactors().forEach((reactor) => {
        stopAnimations(reactor);
        reactor.phase = 'idle';
        reactor.restUntil = 0;
      });
      flowerReactors.clear();
    }

    // On during a break with motion allowed; off resets everything
    // (break ended, or reduced motion switched on).
    function setActive(on) {
      if (active === on) return;
      active = on;
      if (!on) reset();
    }

    // A hidden tab freezes reactions where they are.
    function setPaused(on) {
      paused = on;
      allReactors().forEach((reactor) => reactor.animations.forEach((animation) => {
        if (on) animation.pause(); else animation.play();
      }));
      if (on) out();
    }

    return { move, out, setActive, setPaused, reset };
  }

  return { create, reacts };
})();
