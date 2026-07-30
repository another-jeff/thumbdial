/**
 * sunburst.js — nested proportional layout + hit-testing for ThumbDial.
 *
 * Given a focused node, lay out its descendants as a classic sunburst: each
 * ring is one level deeper, every wedge's ANGLE is proportional to its subtree
 * weight, and a child's arc nests strictly inside its parent's arc. Because
 * proportions are computed per-level (children partition their parent's arc),
 * relative sizes are invariant across zoom — the spatial memory anchor.
 *
 * Angles use the d3-arc convention: 0 at 12 o'clock, increasing clockwise.
 *
 * Pure JS (uses only arrange.js): fully unit-testable without React/d3/touch.
 */
import { buildDisplay, effectiveWeight, isBranch } from './arrange.js';

const TAU = Math.PI * 2;

/**
 * Flatten the focused node's descendants (down to `maxDepth` rings) into
 * positioned segments: { node, depth, a0, a1, hue, light, sidx, i }.
 * `depth` is 1-based (ring 1 = children). Segments are emitted parent-before-
 * child, so a segment's ancestors always precede it in the array.
 */
export function layout(focused, options = {}) {
  const { arrangeId = 'canonical', maxDepth = 2, maxSlices = 12, collapseGroups = false } = options;
  const segments = [];

  function recurse(node, depth, a0, a1, hue) {
    if (depth >= maxDepth) return;
    const items =
      depth === 0
        ? buildDisplay(node, arrangeId, { maxSlices, collapseGroups }).items
        : buildDisplay(node, 'canonical', { maxSlices, collapseGroups }).items;
    const n = items.length;
    if (n === 0) return;

    const weights = items.map(effectiveWeight);
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    let acc = a0;
    items.forEach((child, i) => {
      const span = (weights[i] / total) * (a1 - a0);
      const c0 = acc;
      const c1 = acc + span;
      acc = c1;
      const childHue = depth === 0 ? Math.round((i / n) * 360) : hue;
      const light = 42 + depth * 7 + (i % 3) * 4;
      segments.push({
        node: child,
        depth: depth + 1,
        a0: c0,
        a1: c1,
        hue: childHue,
        light,
        i,
        sidx: segments.length,
      });
      if (isBranch(child)) recurse(child, depth + 1, c0, c1, childHue);
    });
  }

  recurse(focused, 0, 0, TAU, 0);
  return segments;
}

/**
 * Which segment is under a touch at radius `r`, angle `theta` (0 = top, cw)?
 * Radius selects the target ring; if that ring is empty at this angle (the arc
 * belongs to a shallower leaf), we fall back to the deepest segment that does
 * cover the angle — so the empty space beyond a small leaf still selects it.
 * Returns { hub, segment, chain } where `chain` is root→target segments.
 */
export function hitTest(r, theta, geom) {
  const { innerR, ringThickness, maxDepth, segments } = geom;
  if (r < innerR) return { hub: true, segment: null, chain: [] };

  const targetRing = Math.min(maxDepth, Math.floor((r - innerR) / ringThickness) + 1);
  const covering = segments
    .filter((s) => theta >= s.a0 && theta < s.a1)
    .sort((a, b) => a.depth - b.depth); // nested: root-ward first

  let pick = null;
  for (const s of covering) {
    if (s.depth <= targetRing) pick = s;
    else break;
  }
  if (!pick && covering.length) pick = covering[0];

  const chain = pick ? covering.filter((s) => s.depth <= pick.depth) : [];
  return { hub: false, segment: pick, chain };
}

/** Radial band [inner, outer] for a given 1-based ring depth. */
export function ringRadii(depth, innerR, ringThickness) {
  return [innerR + (depth - 1) * ringThickness, innerR + depth * ringThickness];
}

export { TAU };
