// =============================================================
// CAT COATS  (customizable cats, 2026-11-17, user's request;
// NOT FROM FIGMA except Ginger and Navy, which are the Figma cats'
// own colours)
// =============================================================
// The ONE place that says what each coat looks like, and which
// party hat / bow tie colours go with it. Used by:
//   content/meadow.js     colours the cats on the break screen
//   options/options.js    the swatches and the live preview
//
// How the colours reach the art: the cat SVGs in
// assets/meadow/layers/ mark each painted part with a class
// (cat-fur, cat-shade, cat-ear, cat-nose, cat-eye, cat-whisker,
// cat-patch-a, cat-patch-b, cat-stripe). shared/cat-art.css paints
// each class with a CSS custom property (--cat-fur, …), and
// catCoatStyle() below turns a coat into those properties.
//
// fur        the main coat
// shade      the soft shadow on the haunch and the fur lines
// ear        inside of the ears
// nose, eye, whisker   the small face lines
// marks      'calico' (two kinds of patches) or 'tabby' (stripes),
//            or none
// patchA/B   calico patch colours; stripe = tabby stripe colour
// accessory  the party hat / bow tie: main colour, the hat's dots,
//            and the pompom / bow knot. Always meadow palette
//            colours (shared/tokens.css primitives) that stand out
//            against the coat.
// =============================================================

const CAT_COATS = {
  ginger: {
    label: 'Ginger',
    fur: '#eab45a', shade: '#d49443', ear: '#cd9aa2', nose: '#ab7750', eye: '#996e32', whisker: '#ba8a40',
    accessory: { main: '#234d43', dots: '#f8f9f2', knot: '#f1d784' },   // teal, paper, butter
  },
  navy: {
    label: 'Navy',
    fur: '#3b4340', shade: '#202d2d', ear: '#cd9aa2', nose: '#242a29', eye: '#182322', whisker: '#222d2a',
    accessory: { main: '#b43f35', dots: '#f3c9a8', knot: '#f1d784' },   // poppy, peach, butter
  },
  black: {
    label: 'Black',
    fur: '#25292a', shade: '#121617', ear: '#b9848f', nose: '#3d3637', eye: '#5a6360', whisker: '#4a5452',
    accessory: { main: '#f1d784', dots: '#234d43', knot: '#234d43' },   // butter, teal, teal
  },
  grey: {
    label: 'Grey',
    fur: '#9ba49d', shade: '#77837b', ear: '#d6a3ad', nose: '#a8747c', eye: '#4b544e', whisker: '#7f8a83',
    accessory: { main: '#ee937e', dots: '#f8f9f2', knot: '#234d43' },   // coral, paper, teal
  },
  cream: {
    label: 'Cream',
    fur: '#f2e4c6', shade: '#d8c098', ear: '#e3a9b4', nose: '#c98e8a', eye: '#8c7550', whisker: '#c9b28a',
    accessory: { main: '#172f36', dots: '#f1d784', knot: '#ee937e' },   // navy, butter, coral
  },
  calico: {
    label: 'Calico',
    fur: '#f5eddd', shade: '#d6c9b0', ear: '#d9a2ac', nose: '#cf9a9a', eye: '#5c4b3b', whisker: '#c7baa1',
    marks: 'calico', patchA: '#de9548', patchB: '#2f3533',
    accessory: { main: '#234d43', dots: '#f1d784', knot: '#eabccb' },   // teal, butter, pink
  },
  tabby: {
    label: 'Tabby brown',
    fur: '#a07c56', shade: '#7c5d3f', ear: '#d29da5', nose: '#7d5446', eye: '#3e2c1e', whisker: '#b8976f',
    marks: 'tabby', stripe: '#5f4531',
    accessory: { main: '#d3eb58', dots: '#234d43', knot: '#234d43' },   // lime, teal, teal
  },
};

// The order the swatches appear in.
const CAT_COAT_ORDER = ['ginger', 'navy', 'black', 'grey', 'cream', 'calico', 'tabby'];

// The CSS custom properties for one coat, as an object
// ({ '--cat-fur': '#eab45a', … }). Apply with element.style.setProperty.
function catCoatStyle(coatName) {
  const coat = CAT_COATS[coatName] || CAT_COATS.ginger;
  return {
    '--cat-fur': coat.fur,
    '--cat-shade': coat.shade,
    '--cat-ear': coat.ear,
    '--cat-nose': coat.nose,
    '--cat-eye': coat.eye,
    '--cat-whisker': coat.whisker,
    '--cat-patch-a': coat.patchA || coat.fur,
    '--cat-patch-b': coat.patchB || coat.fur,
    '--cat-stripe': coat.stripe || coat.shade,
    '--cat-accessory': coat.accessory.main,
    '--cat-accessory-dots': coat.accessory.dots,
    '--cat-accessory-knot': coat.accessory.knot,
  };
}

// Puts a coat on an element (the cat's box); the art inside picks
// the colours up. Also sets data-marks, which shows the calico
// patches or tabby stripes (shared/cat-art.css).
function applyCatCoat(element, coatName) {
  const style = catCoatStyle(coatName);
  Object.keys(style).forEach((name) => element.style.setProperty(name, style[name]));
  const coat = CAT_COATS[coatName] || CAT_COATS.ginger;
  element.dataset.coat = CAT_COATS[coatName] ? coatName : 'ginger';
  element.dataset.marks = coat.marks || 'none';
}
