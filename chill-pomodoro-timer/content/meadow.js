// =============================================================
// THE MEADOW SCENE  (PRD F5: the break screen's artwork and motion)
// =============================================================
// This file only puts the picture together and switches its motion
// on and off. The cards on top of it (countdown, hold to skip,
// buttons) are in content.js, which loads after this file and uses
// `TouchGrassMeadow.create(...)`.
//
// The picture is the Figma frame "Touch Grass · Meadow break"
// (1440 × 900), exported to assets/meadow/:
//   base.webp, base@2x.webp   the layers that never move
//                             (ground, pigment washes, moss)
//   layers/*.svg              one file per animated Figma layer:
//                             19 flower and grass groups, each
//                             cat's tail and body, 4 birds and
//                             their wings (plus the two soft
//                             shadows under the cats). The flower
//                             and grass files hold one
//                             <g data-flower> per Figma flower and
//                             are placed in the page as SVG (not
//                             as pictures), so each flower can
//                             react to the cursor on its own.
//   accessories/*.svg         the cats' party hats and bow ties
//                             (drawn in code, NOT from Figma; see
//                             setAccessory below)
//   grain.webp                the gouache paper grain, laid on top
//   layers.json               where every piece goes, back to front
//
// The motion itself is NOT in this file. It is in
// content/meadow-motion.css: the keyframes of the Figma frame,
// one rule per layer, all on the same 16 second loop. This file
// only adds two classes to the scene:
//   meadow--running   during a break (never with reduced motion)
//   meadow--paused    while the tab is hidden
// Without "meadow--running" nothing moves and every layer sits
// exactly as drawn in Figma.
//
// Hover reactions (a cat perks up when the cursor touches it) are
// in content/meadow-hover.js, which loads before this file. Each
// reacting layer gets an extra box around it (the "wrapper") for
// the reaction, so it adds to the Figma loop instead of replacing it.
// =============================================================

const TouchGrassMeadow = (function () {
  'use strict';

  // The Figma frame the artwork was drawn in.
  const FRAME_WIDTH = 1440;
  const FRAME_HEIGHT = 900;

  const ASSET_FOLDER = 'assets/meadow/';

  // ----- The cats (customizable cats, 2026-11-17) -----
  //
  // Figma has two cat drawings ("poses"): the ginger cat (looking
  // up and right) and the navy cat (looking up and left). Each is
  // three layers: the soft shadow under it, the tail, the body.
  // `ground` is the middle of the shadow, where the cat sits; `zones`
  // are the body and the tail with a little room around them
  // (content.js passes the cards' positions to fit(), and the scene
  // is scaled so these stay clear).
  const CAT_POSES = {
    ginger: {
      layers: ['ginger-contact-wash', 'ginger-cat-tail', 'ginger-cat-body'],
      ground: { x: 743, y: 538 },
      zones: [
        { x: 702, y: 396, width: 92, height: 146 }, // body (and a party hat)
        { x: 683, y: 519, width: 42, height: 65 },  // tail
      ],
    },
    navy: {
      layers: ['dark-cat-contact-wash', 'navy-cat-tail', 'navy-cat-body'],
      ground: { x: 988.5, y: 517 },
      zones: [
        { x: 948, y: 381, width: 86, height: 140 }, // body (and a party hat)
        { x: 1019, y: 493, width: 32, height: 64 }, // tail
      ],
    },
  };

  // The four places a cat can sit (options page, "Number of cats").
  // Cats 1 and 2 are the Figma cats, exactly where Figma has them.
  // Cats 3 and 4 reuse a pose, mirrored and a little smaller, so they
  // don't look like copies; `ground` is where they sit in the frame.
  // NOT FROM FIGMA: these two places were chosen in code, on the lawn
  // between the flower borders, below the quote (top left) and the
  // countdown panel (top right), away from the buttons at the bottom.
  const CAT_SLOTS = [
    { pose: 'ginger' },
    { pose: 'navy' },
    { pose: 'navy', mirror: true, scale: 0.92, ground: { x: 330, y: 505 } },
    { pose: 'ginger', mirror: true, scale: 0.94, ground: { x: 1225, y: 525 } },
  ];

  // Moves a pose to a slot: mirrored (x flipped around the cat's
  // ground point) and scaled, then set down on the slot's ground.
  // Returns the 2D matrix [a, b, c, d, e, f], or null for "as in Figma".
  function slotMatrix(slot) {
    if (!slot.ground) return null;
    const from = CAT_POSES[slot.pose].ground;
    const s = slot.scale || 1;
    const sx = (slot.mirror ? -1 : 1) * s;
    return [sx, 0, 0, s, slot.ground.x - sx * from.x, slot.ground.y - s * from.y];
  }

  // A slot's zones in frame coordinates (after mirroring/scaling).
  function slotZones(slot) {
    const m = slotMatrix(slot);
    return CAT_POSES[slot.pose].zones.map((zone) => {
      if (!m) return zone;
      const xs = [zone.x, zone.x + zone.width].map((x) => m[0] * x + m[4]);
      const ys = [zone.y, zone.y + zone.height].map((y) => m[3] * y + m[5]);
      return { x: Math.min(...xs), y: Math.min(...ys),
        width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) };
    });
  }

  // Which pose a layer belongs to, if it is a cat layer.
  function poseOf(slug) {
    return Object.keys(CAT_POSES).find((pose) => CAT_POSES[pose].layers.includes(slug)) || null;
  }

  // The name a cat layer has for the hover reactions
  // (content/meadow-hover.js): "cat3-body", "cat1-tail".
  function catKey(slotIndex, slug) {
    return 'cat' + (slotIndex + 1) + (slug.endsWith('-tail') ? '-tail' : '-body');
  }

  function assetUrl(file) {
    return chrome.runtime.getURL(ASSET_FOLDER + file);
  }

  // A flower group: the SVG file's own elements, placed in the page
  // (layers.json marks these with "inline": true). Same place and
  // size as a picture would have.
  // The same file is read only once (four cats share two drawings).
  const svgTexts = new Map();
  function readSvg(file) {
    if (!svgTexts.has(file)) {
      svgTexts.set(file, fetch(assetUrl(file)).then((response) => response.text()));
    }
    return svgTexts.get(file);
  }

  // `idSuffix`: the cat files hold a clip path with an id (it keeps
  // the calico patches and tabby stripes inside the cat). Each copy
  // in the page needs its own id, or every cat would use the first one.
  async function makeInlineSvg(image, origin, idSuffix) {
    const text = await readSvg(image.file);
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') throw new Error('not an SVG: ' + image.file);
    const element = document.importNode(svg, true);
    if (idSuffix) {
      element.querySelectorAll('[id]').forEach((node) => { node.id += idSuffix; });
      element.querySelectorAll('[clip-path]').forEach((node) => {
        node.setAttribute('clip-path', node.getAttribute('clip-path').replace(/\)$/, idSuffix + ')'));
      });
      element.querySelectorAll('use[href]').forEach((node) => {
        node.setAttribute('href', node.getAttribute('href') + idSuffix);
      });
    }
    element.classList.add('meadow__image', 'meadow__svg');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('focusable', 'false');
    place(element, image.x - origin.x, image.y - origin.y, image.width, image.height);
    return element;
  }

  // Places an element in its parent, in pixels.
  function place(element, x, y, width, height) {
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = width + 'px';
    element.style.height = height + 'px';
  }

  // One picture file. `image` comes from layers.json; `origin` is
  // the top left corner of the box the picture is placed inside.
  function makeImage(image, origin) {
    const element = document.createElement('img');
    element.className = 'meadow__image';
    element.alt = '';
    element.draggable = false;
    element.decoding = 'async';
    element.src = assetUrl(image.file);
    place(element, image.x - origin.x, image.y - origin.y, image.width, image.height);
    return element;
  }

  // One animated Figma layer: a box of exactly the layer's size in
  // Figma (so "transform-origin: 50% 100%" means the same point as
  // in Figma) with the layer's picture inside. `data-layer` is the
  // name meadow-motion.css uses to give it its animation.
  function makeLayer(layer, origin) {
    const element = document.createElement('div');
    element.className = 'meadow__layer';
    element.dataset.layer = layer.slug;
    place(element, layer.box.x - origin.x, layer.box.y - origin.y, layer.box.width, layer.box.height);
    return element;
  }

  // Same, but for a layer that reacts to the cursor: an outer box
  // (the wrapper, which plays the hover reaction) of the same size
  // and place, with the layer inside it at 0, 0. Returns both; for
  // a layer that doesn't react, `outer` is the layer itself.
  // `key`: the layer's name for the hover reactions, when it isn't
  // its slug (the cats: "cat1-body", …).
  function makeLayerBox(layer, origin, key) {
    if (!TouchGrassMeadowHover.reacts(key || layer.slug)) {
      const element = makeLayer(layer, origin);
      return { outer: element, inner: element, wrapped: false };
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'meadow__react';
    place(wrapper, layer.box.x - origin.x, layer.box.y - origin.y, layer.box.width, layer.box.height);
    const inner = makeLayer(layer, layer.box);
    wrapper.append(inner);
    return { outer: wrapper, inner, wrapped: true };
  }


  // ---------------------------------------------------------------
  // create(): builds one meadow inside `container`
  // ---------------------------------------------------------------

  function create(container) {
    // The scene: a 1440 × 900 box that is scaled to fill the screen.
    const root = document.createElement('div');
    root.className = 'meadow';
    root.setAttribute('aria-hidden', 'true'); // decoration only
    const scene = document.createElement('div');
    scene.className = 'meadow__scene';
    const grain = document.createElement('div');
    grain.className = 'meadow__grain';
    root.append(scene, grain);
    container.append(root);

    let baseImage = null;
    let loading = null;          // the promise of load(), once started
    let ready = false;           // every picture has arrived
    let wantRunning = false;     // what content.js asked for
    let scale = 1;
    let hover = null;            // the hover reactions, once loaded
    let flowers = [];            // every <g data-flower>, once loaded
    let clearRect = null;        // the screen area kept free of flowers
    let lastFit = null;          // the last fit() arguments, to fit again

    // The cats: one box per slot (CAT_SLOTS), each holding a whole
    // cat (shadow, tail, body). Built on load; setCats() says how many
    // show and in which coats.
    let catChoice = { count: 2, coats: ['ginger', 'navy', 'cream', 'grey'] };
    let catsShown = 2;           // fewer when the window is too small
    const catBoxes = CAT_SLOTS.map((slot, index) => {
      const box = document.createElement('div');
      box.className = 'meadow__cat';
      box.dataset.catSlot = String(index + 1);
      const m = slotMatrix(slot);
      if (m) box.style.transform = 'matrix(' + m.join(', ') + ')';
      return box;
    });


    // How far back a slot's cat sits: higher up in the frame = further away.
    function slotGroundY(index) {
      const slot = CAT_SLOTS[index];
      return (slot.ground || CAT_POSES[slot.pose].ground).y;
    }

    // One cat layer (shadow, tail or body) inside cat box `index`, at
    // its Figma place; the box moves it to the slot. The tail and body
    // are drawn as SVG in the page (not as pictures), so the coat
    // colours (shared/cat-art.css) reach them. `data-layer` stays the
    // Figma name, so the Figma loop (meadow-motion.css) plays on every
    // cat that uses this pose.
    function addCatLayer(layer, index, order, images, inlineSvgs, reacting) {
      const catBox = catBoxes[index];
      const idSuffix = '-cat' + (index + 1);

      // The soft shadow under the cat: a picture that never moves.
      if (layer.kind === 'static') {
        const image = makeImage(layer.image, { x: 0, y: 0 });
        catBox.append(image);
        images.push(image);
        return;
      }

      const key = catKey(index, layer.slug);
      const box = makeLayerBox(layer, { x: 0, y: 0 }, key);
      const element = box.inner;
      catBox.append(box.outer);
      inlineSvgs.push(makeInlineSvg(layer.image, layer.box, idSuffix).then((svg) => {
        element.prepend(svg); // behind the accessories
      }));

      // A cat's party hat and bow tie go inside its body layer, in
      // front of the body, so they follow every move of the body
      // (Figma loop and hover) and can't drift off it. Both are
      // always there; CSS shows only the chosen one. Their colours
      // come from the coat (shared/cat-coats.js).
      if (layer.accessories) {
        Object.entries(layer.accessories).forEach(([name, info]) => {
          const holder = document.createElement('div');
          holder.className = 'meadow__accessory';
          holder.dataset.accessory = name;
          place(holder, info.x - layer.box.x, info.y - layer.box.y, info.width, info.height);
          // The point it will wobble around (the brim, the knot).
          holder.style.transformOrigin =
            (info.pivot.x - info.x) + 'px ' + (info.pivot.y - info.y) + 'px';
          element.append(holder);
          inlineSvgs.push(makeInlineSvg(info, info).then((svg) => holder.append(svg)));
        });
      }

      if (box.wrapped) {
        // The hover file finds the cat's outline in the file's own
        // picture (the shape is the same in every coat).
        reacting.push({ slug: key, box, src: assetUrl(layer.image.file), imageInfo: layer.image,
          layerBox: layer.box, parents: [catBox], order });
      }
    }

    // ----- Loading (once, the first time a break comes near) -----

    function load() {
      if (loading) return loading;
      loading = (async () => {
        const layout = await (await fetch(assetUrl('layers.json'))).json();
        const frameOrigin = { x: 0, y: 0 };
        const images = [];
        const inlineSvgs = [];   // flower groups still being read
        const reacting = [];     // layers that react to the cursor
        const flowerGroups = new Map(); // svg element -> { slug, order }

        baseImage = document.createElement('img');
        baseImage.className = 'meadow__base';
        baseImage.alt = '';
        baseImage.draggable = false;
        baseImage.decoding = 'async';
        // The browser picks 1x or 2x from the screen and the scale.
        baseImage.srcset = assetUrl(layout.base['1x']) + ' 1440w, ' + assetUrl(layout.base['2x']) + ' 2880w';
        baseImage.sizes = Math.round(FRAME_WIDTH * scale) + 'px';
        baseImage.src = assetUrl(layout.base['1x']);
        scene.append(baseImage);
        images.push(baseImage);

        // Back to front, in Figma's layer order.
        let catsPlaced = false;
        layout.layers.forEach((layer) => {
          // A cat layer goes into every cat box that uses its pose.
          // The boxes go into the scene where Figma has the cats,
          // the furthest back (highest up in the frame) first.
          const pose = poseOf(layer.slug);
          if (pose) {
            if (!catsPlaced) {
              catsPlaced = true;
              CAT_SLOTS.map((slot, index) => index)
                .sort((a, b) => slotGroundY(a) - slotGroundY(b))
                .forEach((index) => scene.append(catBoxes[index]));
            }
            CAT_SLOTS.forEach((slot, index) => {
              if (slot.pose === pose) {
                addCatLayer(layer, index, layout.layers.indexOf(layer), images, inlineSvgs, reacting);
              }
            });
            return;
          }

          // The soft shadows under the cats: pictures that never move.
          if (layer.kind === 'static') {
            const image = makeImage(layer.image, frameOrigin);
            scene.append(image);
            images.push(image);
            return;
          }

          const box = makeLayerBox(layer, frameOrigin);
          const element = box.inner;

          // A bird's wings are a layer inside the bird, behind its
          // body: they flap on their own and travel with the bird.
          if (layer.wings) {
            const wings = makeLayerBox(layer.wings, layer.box);
            const wingsImage = makeImage(layer.wings.image, layer.wings.box);
            wings.inner.append(wingsImage);
            element.append(wings.outer);
            images.push(wingsImage);
            if (wings.wrapped) {
              reacting.push({ slug: layer.wings.slug, box: wings, src: wingsImage.src,
                imageInfo: layer.wings.image, layerBox: layer.wings.box,
                parents: box.wrapped ? [box.outer, box.inner] : [box.inner],
                order: layout.layers.indexOf(layer) });
            }
          }

          if (layer.image.inline) {
            // A flower group: read the file and put its SVG in here.
            const order = layout.layers.indexOf(layer);
            inlineSvgs.push(makeInlineSvg(layer.image, layer.box).then((svg) => {
              element.append(svg);
              flowerGroups.set(svg, { slug: layer.slug, order });
            }));
            scene.append(box.outer);
            return;
          }

          const image = makeImage(layer.image, layer.box);
          element.append(image);
          images.push(image);

          scene.append(box.outer);
          if (box.wrapped) {
            reacting.push({ slug: layer.slug, box, src: image.src, imageInfo: layer.image,
              layerBox: layer.box, parents: [], order: layout.layers.indexOf(layer) });
          }
        });
        applyCats();

        // Wait for every picture, so all 31 layers can start their
        // loop at the same moment, as in Figma. (A picture that
        // fails to load must not hold up the rest.)
        await Promise.all(images.map((image) => image.decode().catch(() => {})));
        await Promise.all(inlineSvgs.map((promise) => promise.catch(() => {})));
        setUpHover(reacting, flowerGroups);
        flowers = Array.from(scene.querySelectorAll('[data-flower]'));
        clearArea(clearRect); // the flowers arrived after the first fit
        ready = true;
        updateMotion();
      })().catch(() => {
        // An asset could not be read (the extension was reloaded
        // while this page was open, for example). The break screen
        // still works over the plain lawn colour.
      });
      return loading;
    }


    // ----- Hover reactions (content/meadow-hover.js) -----
    //
    // Tells the hover file where every reacting layer is: its
    // wrapper, the boxes between the frame and its picture (to trace
    // the cursor back through every turn and move), and its picture.

    function setUpHover(reacting, flowerGroups) {
      const layers = {};
      reacting.forEach((entry) => {
        const { outer, inner } = entry.box;
        // The reaction turns around the same point as the Figma loop.
        const origin = getComputedStyle(inner).transformOrigin;
        outer.style.transformOrigin = origin;
        const originX = parseFloat(origin) || 0;
        layers[entry.slug] = {
          wrapper: outer,
          order: entry.order,
          pivotX: entry.layerBox.x + originX,
          target: {
            chain: entry.parents.concat([outer, inner]),
            offsetX: entry.imageInfo.x - entry.layerBox.x,
            offsetY: entry.imageInfo.y - entry.layerBox.y,
            width: entry.imageInfo.width,
            height: entry.imageInfo.height,
            src: entry.src,
            map: null,
          },
        };
      });
      // Which single flower is under a screen point, if any. Asks the
      // browser, which only counts the painted parts of each flower
      // (pointer-events: visiblePainted in content.css), front-most
      // first.
      const shadowRoot = root.getRootNode();
      function flowerAt(clientX, clientY) {
        for (const element of shadowRoot.elementsFromPoint(clientX, clientY)) {
          const flower = element.closest && element.closest('[data-flower]');
          if (!flower) continue;
          const group = flowerGroups.get(flower.ownerSVGElement);
          if (group) return { element: flower, slug: group.slug, order: group.order };
        }
        return null;
      }

      hover = TouchGrassMeadowHover.create(layers, toFrame, flowerAt);
      hover.setPaused(document.visibilityState === 'hidden');
    }

    // A point on the screen → the same point in the 1440 × 900 frame.
    function toFrame(clientX, clientY) {
      const rect = scene.getBoundingClientRect();
      return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    }

    // Called by content.js when the cursor moves over the break
    // screen. `overArt` is false when it is over a card or button.
    function pointerMove(clientX, clientY, overArt) {
      if (!hover) return;
      if (overArt) hover.move(clientX, clientY);
      else hover.out();
    }

    function pointerLeave() {
      if (hover) hover.out();
    }


    // ----- Fitting the scene to the screen -----
    //
    // The artwork covers the whole window, anchored at the bottom
    // centre. If a card would then cover a cat, the scene is moved:
    // made a little smaller or larger, and/or slid sideways, picking
    // the smallest change that keeps both cats clear. Its sides
    // always reach the window's edges. Any gap that opens above it
    // is the same lawn colour. If nothing works (a very small
    // window), the scene stays as it is.

    function fit(width, height, avoidRects) {
      lastFit = [width, height, avoidRects];
      const cover = Math.max(width / FRAME_WIDTH, height / FRAME_HEIGHT);
      const smallest = Math.min(cover, width / FRAME_WIDTH);
      const largest = cover * 1.3;
      const MARGIN = 8;

      function catsAreClear(zones, s, shift) {
        return zones.every((zone) => {
          const left = width / 2 + shift + (zone.x - FRAME_WIDTH / 2) * s;
          const top = height - (FRAME_HEIGHT - zone.y) * s;
          const right = left + zone.width * s;
          const bottom = top + zone.height * s;
          return avoidRects.every((rect) =>
            right + MARGIN <= rect.left || left - MARGIN >= rect.right ||
            bottom + MARGIN <= rect.top || top - MARGIN >= rect.bottom
          );
        });
      }

      // The smallest change that keeps these zones clear, or null.
      function solve(zones) {
        if (catsAreClear(zones, cover, 0)) return { s: cover, shift: 0 };
        let best = null;
        let bestCost = Infinity;
        const SCALE_STEPS = 30;
        const SHIFT_STEPS = 20;
        for (let i = 0; i <= SCALE_STEPS; i++) {
          const s = smallest + (largest - smallest) * (i / SCALE_STEPS);
          // How far it can slide and still cover both edges.
          const room = Math.max(0, (FRAME_WIDTH * s - width) / 2);
          for (let j = 0; j <= SHIFT_STEPS; j++) {
            const shift = -room + (2 * room) * (j / SHIFT_STEPS);
            // Prefer small changes: staying close to "cover" matters
            // most, then sliding as little as possible.
            const cost = Math.abs(s / cover - 1) * 3 + Math.abs(shift) / width;
            if (cost < bestCost && catsAreClear(zones, s, shift)) {
              bestCost = cost;
              best = { s, shift };
            }
          }
        }
        return best;
      }

      // Try all the chosen cats; if the cards would cover one whatever
      // we do, leave out the last cat (4, then 3, …) and try again.
      // If even one cat can't be kept clear (a very small window), all
      // chosen cats stay and the scene stays as it is.
      let best = null;
      catsShown = catChoice.count;
      for (let n = catChoice.count; n >= 1 && !best; n--) {
        const zones = [];
        CAT_SLOTS.slice(0, n).forEach((slot) => zones.push(...slotZones(slot)));
        best = solve(zones);
        if (best) catsShown = n;
      }
      if (!best) {
        best = { s: cover, shift: 0 };
        catsShown = catChoice.count;
      }
      showCats();

      scale = best.s;
      scene.style.transform =
        'translateX(-50%) translateX(' + best.shift + 'px) scale(' + scale + ')';
      if (baseImage) baseImage.sizes = Math.round(FRAME_WIDTH * scale) + 'px';
      return scale;
    }


    // ----- Keeping the quote clear (2026-11-17, user's request) -----
    //
    // Hides every single flower (or grass blade) that overlaps the
    // given screen rectangle, so the break sentence on top of the
    // meadow has plain lawn behind it. Which flowers those are
    // depends on the window size and the fit above, so content.js
    // calls this after every fit. Flowers no longer in the way come
    // back. The art files are not changed; content.css fades them.
    // rect: { left, top, right, bottom } in screen pixels, or null.

    function clearArea(rect) {
      clearRect = rect;
      flowers.forEach((flower) => {
        const box = flower.getBoundingClientRect();
        const inTheWay = rect !== null && box.width > 0 &&
          box.right > rect.left && box.left < rect.right &&
          box.bottom > rect.top && box.top < rect.bottom;
        flower.classList.toggle('is-cleared', inTheWay);
      });
    }


    // ----- Starting, pausing and stopping -----
    //
    // The animation is plain CSS (meadow-motion.css). Adding the
    // class starts all layers in the same frame, so they share one
    // timeline; removing it stops them and puts every layer back
    // where Figma has it.

    function updateMotion() {
      root.classList.toggle('meadow--running', wantRunning && ready);
      // Hover reactions follow the same rule: only while the break
      // shows and motion is allowed. Switching off resets them.
      if (hover) hover.setActive(wantRunning && ready);
    }

    // Called by content.js: true while the break screen is showing
    // (and reduced motion is off).
    function setRunning(shouldRun) {
      wantRunning = shouldRun;
      if (shouldRun) load();
      updateMotion();
    }

    // A hidden tab pauses everything, exactly where it is, and it
    // carries on from there when the tab is shown again.
    function updatePause() {
      root.classList.toggle('meadow--paused', document.visibilityState === 'hidden');
      if (hover) hover.setPaused(document.visibilityState === 'hidden');
    }
    document.addEventListener('visibilitychange', updatePause);
    updatePause();

    // ----- Cat accessories (options page, "Cat accessories") -----
    //
    // name: 'none' | 'party-hat' | 'bow-tie'. content.js calls this
    // when the break screen opens, so a change on the options page
    // shows from the next break. content.css shows the accessories
    // whose name matches data-accessory on the scene.

    function setAccessory(name) {
      root.dataset.accessory = name || 'none';
    }

    // ----- How many cats, and their coats (options page) -----
    //
    // choice: { count: 1–4, coats: ['ginger', 'navy', …] } (coat
    // names from shared/cat-coats.js). content.js calls this when the
    // break screen opens, so changes show from the next break.
    // Cats 3 and 4 also get a new random starting point in the Figma
    // loop each time, so no two cats move in step.

    function setCats(choice) {
      const count = Math.min(CAT_SLOTS.length, Math.max(1, Math.round(Number(choice && choice.count) || 2)));
      const coats = (choice && Array.isArray(choice.coats)) ? choice.coats : catChoice.coats;
      catChoice = { count, coats };
      applyCats();
      if (lastFit) fit(...lastFit);
      else { catsShown = count; showCats(); }
    }

    function applyCats() {
      const used = [];
      catBoxes.forEach((box, index) => {
        applyCatCoat(box, catChoice.coats[index] || CAT_SLOTS[index].pose);
        // Where in the 16 s loop this cat starts (cats 1 and 2: as in
        // Figma). At least 3 s away from the others, so even two cats
        // sharing a pose never move together.
        let delay = 0;
        if (index >= 2) {
          for (let tries = 0; tries < 20; tries++) {
            delay = 2 + Math.random() * 12;
            if (used.every((other) => Math.abs(other - delay) >= 3)) break;
          }
          used.push(delay);
        }
        box.style.setProperty('--cat-delay', (-delay).toFixed(2) + 's');
        // The hat / bow wobble: cat 2 as before, the others at random.
        const accessoryDelay = index === 0 ? 0 : index === 1 ? 1.5 : Math.random() * 4;
        box.style.setProperty('--accessory-delay', (-accessoryDelay).toFixed(2) + 's');
        box.style.setProperty('--pompom-delay', (-(accessoryDelay * 0.6)).toFixed(2) + 's');
      });
      showCats();
    }

    function showCats() {
      catBoxes.forEach((box, index) => { box.hidden = index >= catsShown; });
    }
    applyCats();

    return { load, fit, clearArea, setRunning, setAccessory, setCats, pointerMove, pointerLeave };
  }

  return { create };
})();
