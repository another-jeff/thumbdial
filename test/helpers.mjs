/**
 * Shared test helpers. Deliberately tiny — the suite uses node:test + node:assert
 * (built in, no dependencies) and these only cover things we assert repeatedly.
 */
import assert from 'node:assert/strict';
import { childrenOf, effectiveWeight } from '../lib/arrange.js';

const TAU = Math.PI * 2;

/** Every node in a tree, parents before children. */
export function walk(node, out = []) {
  out.push(node);
  for (const c of node.children || []) walk(c, out);
  return out;
}

/** Every node including JIT-expanded ordinals (use sparingly — Bible ⇒ ~31k). */
export function walkExpanded(node, out = []) {
  out.push(node);
  for (const c of childrenOf(node)) walkExpanded(c, out);
  return out;
}

/** Find the first descendant with this label (breadth-ish, parents first). */
export function find(node, label) {
  return walk(node).find((n) => n.label === label);
}

/** Path of labels from a root down to `label`, or null. */
export function pathTo(node, label, trail = []) {
  const next = [...trail, node];
  if (node.label === label) return next;
  for (const c of node.children || []) {
    const hit = pathTo(c, label, next);
    if (hit) return hit;
  }
  return null;
}

export const labelsOf = (nodes) => nodes.map((n) => String(n.label));

/** Angles are floats; compare with tolerance. */
export function assertClose(actual, expected, msg, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `${msg || 'expected close'}: got ${actual}, want ${expected} (±${epsilon})`
  );
}

/**
 * The invariant the whole component rests on (DESIGN.md: "proportional
 * invariance = spatial memory"): a ring's wedges exactly partition their
 * parent's arc, in order, with no gaps or overlaps, and angle ∝ weight.
 */
export function assertPartitions(segments, parentA0, parentA1, items) {
  assert.equal(segments.length, items.length, 'one segment per item');
  const total = items.reduce((s, n) => s + effectiveWeight(n), 0) || 1;
  let cursor = parentA0;
  segments.forEach((s, i) => {
    assertClose(s.a0, cursor, `segment ${i} starts where the previous ended`);
    const want = (effectiveWeight(items[i]) / total) * (parentA1 - parentA0);
    assertClose(s.a1 - s.a0, want, `segment ${i} span ∝ weight`);
    cursor = s.a1;
  });
  assertClose(cursor, parentA1, 'wedges fill the parent arc exactly');
}

export { TAU };
