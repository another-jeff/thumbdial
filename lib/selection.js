/**
 * selection.js — turning a set of picked leaf indices into ranges + a string.
 * Pure JS; unit-testable. Indices are positions in the focused node's leaf
 * list; `labels` maps those positions to display labels (e.g. verse numbers).
 */

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

// Groups (index space) → "1-3; 10-12; 18" using the labels array.
export function formatGroups(groups, labels) {
  return groups
    .map((g) => {
      const a = labels[g.from];
      const b = labels[g.to];
      return a === b ? `${a}` : `${a}-${b}`;
    })
    .join('; ');
}

// Default compound reference: "<book> <chapter>:<ranges>", e.g. "1 Cor 13:1-3; 10-12; 18".
// Derives roles from the path rather than position: the chapter is the deepest
// numeric node; the book is the nearest non-numeric, non-organizational node
// above it. (An app can override all of this via the `formatSelection` prop.)
export function defaultFormatSelection(context, groups, labels) {
  const isNum = (n) => /^\d+$/.test(String(n.label));
  let chapterIdx = -1;
  for (let i = context.length - 1; i >= 0; i--) {
    if (isNum(context[i])) {
      chapterIdx = i;
      break;
    }
  }
  const chapter = chapterIdx >= 0 ? context[chapterIdx] : null;
  const upto = chapterIdx >= 0 ? chapterIdx : context.length;
  let title = null;
  for (let i = upto - 1; i >= 0; i--) {
    const n = context[i];
    if (!isNum(n) && !n.group) {
      title = n;
      break;
    }
  }
  if (!title && !chapter) {
    const last = context[context.length - 1];
    if (last && !last.group) title = last;
  }
  const ranges = formatGroups(groups, labels);
  let ref = title ? String(title.short || title.label) : '';
  if (chapter) ref += (ref ? ' ' : '') + chapter.label;
  if (ranges) ref += ':' + ranges;
  return ref;
}
