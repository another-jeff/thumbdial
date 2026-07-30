/**
 * arrange.js — the "children -> slices" pipeline for ThumbDial.
 *
 *   node.children  ->  [arrange]  ->  [bucket if too many]  ->  display items
 *
 * Pure JS (no React, no d3) so it can be unit-tested directly in Node.
 *
 * Concepts:
 *  - ARRANGEMENT: how to order/regroup a node's descendants.
 *      canonical (as authored), az (A-Z), size (by weight, proportional),
 *      plus author-declared arrangements on `node.arrangements`.
 *  - BUCKETING ("summary wheels"): when the arranged list is longer than
 *      `maxSlices`, group it into synthetic branch nodes (`1-25`, `26-50`, ...
 *      for numbers; contiguous `First-Last` chunks otherwise), recursively.
 *  - WEIGHT: a node's size = `node.value` if present, else its leaf count.
 */

const DEFAULT_LADDER = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const DEFAULT_MAX_SLICES = 12;

// ---- children (with just-in-time expansion) -------------------------------

// A node's children. If it has none but carries a `verses` count, generate the
// verse leaves on demand ("1".."N") rather than storing them in the data.
export function childrenOf(node) {
  if (node.children && node.children.length) return node.children;
  if (node.verses > 0) {
    return Array.from({ length: node.verses }, (_, i) => ({
      label: String(i + 1),
      __verse: true,
    }));
  }
  return node.children || [];
}

// ---- weight helpers -------------------------------------------------------

export function leafCount(node) {
  if (node.verses > 0 && !(node.children && node.children.length)) return node.verses;
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + leafCount(c), 0);
}

export function effectiveWeight(node) {
  return node.value != null ? node.value : leafCount(node);
}

export function isBranch(node) {
  return !!(node.children && node.children.length) || node.verses > 0;
}

// ---- introspection --------------------------------------------------------

function isAllNumeric(items) {
  return items.length > 0 && items.every((n) => /^\s*-?\d+\s*$/.test(String(n.label)));
}

function num(node) {
  return parseInt(String(node.label), 10);
}

function weightsVary(items) {
  if (items.length < 2) return false;
  const w = items.map(effectiveWeight);
  return new Set(w).size > 1;
}

// Gather nodes `depth` levels below `node` (1 = direct children).
function gatherDepth(node, depth) {
  let level = [node];
  for (let d = 0; d < depth; d++) {
    level = level.flatMap((n) => childrenOf(n));
  }
  return level;
}

// ---- arrangements ---------------------------------------------------------

/**
 * Which arrangements make sense for this node, in chip order. Always includes
 * `canonical`; adds author-declared ones; adds auto `az`/`size` where useful.
 */
export function availableArrangements(node) {
  const list = [{ id: 'canonical', label: 'Canonical', weighted: false }];

  const authored = node.arrangements || [];
  for (const a of authored) {
    list.push({ id: a.id, label: a.label, weighted: !!a.weighted });
  }

  const kids = childrenOf(node);
  // Auto A-Z only when there's nothing author-declared taking over ordering,
  // and the labels aren't already an ordinal number sequence.
  if (authored.length === 0 && kids.length > 1 && !isAllNumeric(kids)) {
    list.push({ id: 'az', label: 'A–Z', weighted: false });
  }
  if (kids.length > 1 && weightsVary(kids)) {
    list.push({ id: 'size', label: 'By size', weighted: true });
  }

  // de-dupe by label
  const seen = new Set();
  return list.filter((a) => (seen.has(a.label) ? false : seen.add(a.label)));
}

function resolveArrangement(node, id) {
  const authored = (node.arrangements || []).find((a) => a.id === id);
  if (authored) {
    return {
      id: authored.id,
      label: authored.label,
      depth: authored.depth || 1,
      sort: authored.sort || 'none',
      weighted: !!authored.weighted,
    };
  }
  if (id === 'az') return { id: 'az', label: 'A–Z', depth: 1, sort: 'label', weighted: false };
  if (id === 'size') return { id: 'size', label: 'By size', depth: 1, sort: 'value-desc', weighted: true };
  return { id: 'canonical', label: 'Canonical', depth: 1, sort: 'none', weighted: false };
}

function sortPool(pool, sort) {
  if (sort === 'label') {
    return [...pool].sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, { numeric: true })
    );
  }
  if (sort === 'value-desc') {
    return [...pool].sort((a, b) => effectiveWeight(b) - effectiveWeight(a));
  }
  return pool;
}

// ---- bucketing ------------------------------------------------------------

// The coarsest ladder step that fits the range into `maxSlices` buckets — but
// never so coarse that it yields a SINGLE bucket holding everything, which would
// make makeBucket's recursion non-terminating (it would re-bucket the same set
// forever). Every split must strictly shrink its input.
function pickNiceStep(range, maxSlices, ladder) {
  const cap = Math.max(1, Math.floor(range / 2)); // ⇒ at least two buckets
  for (const s of ladder) {
    if (s > cap) break;
    if (Math.ceil(range / s) <= maxSlices) return s;
  }
  return Math.max(1, Math.min(cap, Math.ceil(range / Math.max(2, maxSlices))));
}

function makeBucket(label, members, proportional, opts) {
  const children =
    members.length > opts.maxSlices ? bucketize(members, proportional, opts) : members;
  const leaves = members.reduce((s, m) => s + leafCount(m), 0);
  const bucket = {
    label,
    detail: `${leaves} item${leaves === 1 ? '' : 's'}`,
    children,
    __bucket: true,
  };
  if (proportional) {
    bucket.value = members.reduce((s, m) => s + effectiveWeight(m), 0);
    bucket.__proportional = true;
  }
  return bucket;
}

function numericBuckets(items, proportional, opts) {
  const sorted = [...items].sort((a, b) => num(a) - num(b));
  const lo = num(sorted[0]);
  const hi = num(sorted[sorted.length - 1]);
  const step = pickNiceStep(hi - lo + 1, opts.maxSlices, opts.ladder);
  const buckets = [];
  for (let s = lo; s <= hi; s += step) {
    const e = s + step - 1;
    const members = sorted.filter((n) => num(n) >= s && num(n) <= e);
    if (!members.length) continue;
    const a = num(members[0]);
    const b = num(members[members.length - 1]);
    const label = a === b ? String(a) : `${a}–${b}`;
    buckets.push(makeBucket(label, members, proportional, opts));
  }
  return buckets;
}

function chunkBuckets(items, proportional, opts) {
  // At least two chunks, for the same termination reason as pickNiceStep.
  const size = Math.max(1, Math.ceil(items.length / Math.max(2, opts.maxSlices)));
  const buckets = [];
  for (let i = 0; i < items.length; i += size) {
    const members = items.slice(i, i + size);
    const first = short(members[0].label);
    const last = short(members[members.length - 1].label);
    const label = members.length === 1 ? first : `${first}–${last}`;
    buckets.push(makeBucket(label, members, proportional, opts));
  }
  return buckets;
}

function short(label, n = 4) {
  const s = String(label);
  return s.length <= n ? s : s.slice(0, n);
}

function bucketize(items, proportional, opts) {
  if (items.length <= opts.maxSlices) return items;
  if (isAllNumeric(items)) return numericBuckets(items, proportional, opts);
  return chunkBuckets(items, proportional, opts);
}

// Replace any `group: true` node with its (recursively hoisted) children, so
// organizational layers can be skipped. Weights are preserved — a group's total
// equals the sum of what it held — so proportions don't change, only the ring.
function hoistGroups(items) {
  const out = [];
  for (const it of items) {
    if (it.group) out.push(...hoistGroups(childrenOf(it)));
    else out.push(it);
  }
  return out;
}

// ---- the pipeline ---------------------------------------------------------

/**
 * Build the display items for a node under a given arrangement.
 * Returns { items, proportional } where `items` is <= maxSlices long
 * (deeper overflow is folded into synthetic bucket branch nodes).
 */
export function buildDisplay(node, arrangementId, options = {}) {
  const opts = {
    maxSlices: options.maxSlices || DEFAULT_MAX_SLICES,
    ladder: options.ladder || DEFAULT_LADDER,
  };
  const arr = resolveArrangement(node, arrangementId);
  const gathered = gatherDepth(node, arr.depth);
  const pool = options.collapseGroups ? hoistGroups(gathered) : gathered;
  const sorted = sortPool(pool, arr.sort);
  const proportional = arr.weighted || !!node.__proportional;
  const items = bucketize(sorted, proportional, opts);
  return { items, proportional };
}
