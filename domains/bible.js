/**
 * Bible — a ThumbDial domain pack.
 *
 * A "domain" (list type) is one file holding everything specific to a dataset:
 * the tree, the citation punctuation, and the wording. The engine knows none of
 * it — `lib/` and `components/` speak only of ordinals and pick modes.
 *
 * Node conventions used here:
 *  - `short`     abbreviation shown when a wedge is too small for the full label
 *  - `group`     an organizational layer the "Flatten" control can hoist away
 *  - `ordinals`  N implicit leaves "1".."N", expanded just-in-time; implies
 *                `pick: 'range'`, so a chapter is where sweep-select turns on
 */

// Each chapter declares its verse count as `ordinals`; ThumbDial expands it to
// leaves on demand (see childrenOf in lib/arrange.js) rather than storing ~31k
// verse nodes. Counts vary so the verse ring is proportional.
// (1 Cor 13 lands on 19 verses — enough for 1-3; 10-12; 18.)
function chapters(n) {
  return Array.from({ length: n }, (_, i) => ({
    label: String(i + 1),
    ordinals: verseCount(i + 1),
  }));
}

function verseCount(ch) {
  return 12 + ((ch * 7) % 28); // deterministic 12..39
}

const tree = {
  label: 'Bible',
  detail: '2 testaments',
  children: [
    {
      label: 'Old Testament',
      short: 'OT',
      detail: 'Wisdom · Prophets',
      arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }],
      children: [
        {
          label: 'Wisdom',
          short: 'Wis',
          group: true,
          children: [
            { label: 'Psalms', short: 'Ps', detail: '150 chapters', children: chapters(150) },
            { label: 'Proverbs', short: 'Prov', detail: '31 chapters', children: chapters(31) },
            { label: 'Job', short: 'Job', detail: '42 chapters', children: chapters(42) },
          ],
        },
        {
          label: 'Prophets',
          short: 'Proph',
          group: true,
          children: [
            { label: 'Isaiah', short: 'Isa', detail: '66 chapters', children: chapters(66) },
            { label: 'Jeremiah', short: 'Jer', detail: '52 chapters', children: chapters(52) },
            { label: 'Daniel', short: 'Dan', detail: '12 chapters', children: chapters(12) },
          ],
        },
      ],
    },
    {
      label: 'New Testament',
      short: 'NT',
      detail: 'Gospels · Letters · Prophecy',
      arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }],
      children: [
        {
          label: 'Gospels',
          short: 'Gsp',
          group: true,
          children: [
            { label: 'Matthew', short: 'Mt', detail: '28 chapters', children: chapters(28) },
            { label: 'Mark', short: 'Mk', detail: '16 chapters', children: chapters(16) },
            { label: 'Luke', short: 'Lk', detail: '24 chapters', children: chapters(24) },
            { label: 'John', short: 'Jn', detail: '21 chapters', children: chapters(21) },
          ],
        },
        {
          label: 'Letters',
          short: 'Let',
          group: true,
          children: [
            { label: 'Romans', short: 'Rom', detail: '16 chapters', children: chapters(16) },
            { label: '1 Corinthians', short: '1 Cor', detail: '16 chapters', children: chapters(16) },
            { label: 'Hebrews', short: 'Heb', detail: '13 chapters', children: chapters(13) },
          ],
        },
        {
          label: 'Prophecy',
          short: 'Proph',
          group: true,
          children: [
            { label: 'Revelation', short: 'Rev', detail: '22 chapters', children: chapters(22) },
          ],
        },
      ],
    },
  ],
};

export default {
  id: 'bible',
  title: 'Bible',
  tree,
  // "1 Cor 13:1-3; 10-12; 18" — chapter:verses, ranges joined by semicolons.
  grammar: { joiner: ':', between: '; ', dash: '-' },
  copy: {
    pickHint: 'Sweep across verses',
    navHint: 'Navigate to build a reference',
    pickParentHint: 'pick a chapter',
  },
  hint: 'Drag to read · lift to zoom · tap hub to zoom out · on a chapter, sweep verses',
};
