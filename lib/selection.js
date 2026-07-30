/**
 * selection.js — turning a set of picked leaf indices into ranges + a string.
 * Pure JS; unit-testable. Indices are positions in the focused node's leaf
 * list; `labels` maps those positions to display labels (e.g. verse numbers).
 *
 * The formatter here is a general *citation* grammar — "<title> <index><joiner>
 * <ranges>" — not a Bible one. A domain supplies its punctuation via
 * `makeReferenceFormatter`, or replaces the whole thing via ThumbDial's
 * `formatSelection` prop.
 */
import { pickModeOf } from './arrange.js';

// Sorted, de-duped indices → contiguous groups [{from,to}] (index space).
export function coalesce(indices) {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const groups = [];
  for (const x of sorted) {
    const last = groups[groups.length - 1];
    if (last && x === last.to + 1) last.to = x;
    else groups.push({ from: x, to: x });
  }
  return groups;
}

export const DEFAULT_GRAMMAR = {
  joiner: ':', // between the index and its ranges — "13:1-3"
  between: '; ', // between ranges — "1-3; 10-12"
  dash: '-', // within a range — "1-3"
};

// Groups (index space) → "1-3; 10-12; 18" using the labels array.
export function formatGroups(groups, labels, grammar = DEFAULT_GRAMMAR) {
  const g = { ...DEFAULT_GRAMMAR, ...grammar };
  return groups
    .map(({ from, to }) => {
      const a = labels[from];
      const b = labels[to];
      return a === b ? `${a}` : `${a}${g.dash}${b}`;
    })
    .join(g.between);
}

/**
 * Which node in the path is the INDEX (the numbered subdivision whose children
 * were picked), and which is the TITLE (the thing being cited)?
 *
 * Roles come from declarations first — the index is the deepest node with a pick
 * mode — with a numeric-label fallback so a plain navigation path still reads
 * sensibly. The title is the nearest node above the index that is neither
 * organizational (`group`) nor itself an index.
 */
export function citationRoles(context) {
  const isNum = (n) => /^\d+$/.test(String(n.label));
  const isIndex = (n) => !!pickModeOf(n) || isNum(n);

  let indexIdx = -1;
  for (let i = context.length - 1; i >= 0; i--) {
    if (pickModeOf(context[i])) {
      indexIdx = i;
      break;
    }
  }
  if (indexIdx < 0) {
    for (let i = context.length - 1; i >= 0; i--) {
      if (isNum(context[i])) {
        indexIdx = i;
        break;
      }
    }
  }

  const index = indexIdx >= 0 ? context[indexIdx] : null;
  const upto = indexIdx >= 0 ? indexIdx : context.length;
  let title = null;
  for (let i = upto - 1; i >= 0; i--) {
    const n = context[i];
    if (!isIndex(n) && !n.group) {
      title = n;
      break;
    }
  }
  if (!title && !index) {
    const last = context[context.length - 1];
    if (last && !last.group) title = last;
  }
  return { title, index };
}

/**
 * Build a reference formatter for a domain's punctuation, e.g.
 *   makeReferenceFormatter({ joiner: ':', between: '; ' })
 *     → "1 Cor 13:1-3; 10-12; 18"
 */
export function makeReferenceFormatter(grammar = DEFAULT_GRAMMAR) {
  const g = { ...DEFAULT_GRAMMAR, ...grammar };
  return function formatReference(context, groups, labels) {
    const { title, index } = citationRoles(context);
    const ranges = formatGroups(groups, labels, g);
    let ref = title ? String(title.short || title.label) : '';
    if (index) ref += (ref ? ' ' : '') + index.label;
    if (ranges) ref += g.joiner + ranges;
    return ref;
  };
}

// The formatter ThumbDial falls back to when a domain supplies none.
export const defaultFormatSelection = makeReferenceFormatter();
