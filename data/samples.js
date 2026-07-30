// Sample hierarchies for ThumbDial.
//  - `bible`: navigate down to a reference you plug in elsewhere.
//  - `grocery`: walk departments down to a concrete item.
//
// `short` is an optional abbreviation used when a wedge is too small for the
// full label. `group: true` marks an organizational layer that the "Flatten"
// control can hoist away (its children promote to its place).

export const bible = {
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

export const grocery = {
  label: 'Grocery',
  detail: '4 zones',
  children: [
    {
      label: 'Fresh',
      children: [
        {
          label: 'Fruits',
          short: 'Fruit',
          children: [{ label: 'Apples' }, { label: 'Bananas' }, { label: 'Berries' }],
        },
        {
          label: 'Vegetables',
          short: 'Veg',
          children: [{ label: 'Potatoes' }, { label: 'Carrots' }, { label: 'Greens' }],
        },
      ],
    },
    {
      label: 'Frozen',
      children: [
        { label: 'Vegetables', short: 'Veg', children: [{ label: 'Peas' }, { label: 'Corn' }] },
        {
          label: 'Desserts',
          short: 'Sweet',
          children: [{ label: 'Ice Cream', short: 'Cream' }, { label: 'Popsicles', short: 'Pops' }],
        },
      ],
    },
    {
      label: 'Fridge',
      children: [
        { label: 'Dairy', children: [{ label: 'Milk' }, { label: 'Cheese' }, { label: 'Yogurt' }] },
        { label: 'Deli', children: [{ label: 'Ham' }, { label: 'Turkey' }] },
      ],
    },
    {
      label: 'Shelf',
      children: [
        { label: 'Starches', short: 'Starch', children: [{ label: 'Pasta' }, { label: 'Rice' }, { label: 'Bread' }] },
        { label: 'Canned', children: [{ label: 'Beans' }, { label: 'Tomatoes', short: 'Toms' }] },
      ],
    },
  ],
};

// Each chapter carries a `verses` count; ThumbDial expands it to verse leaves
// just-in-time (see childrenOf in lib/arrange.js). Counts vary so the verse
// ring is proportional. (1 Cor 13 lands on 19 verses — enough for 1-3;10-12;18.)
function chapters(n) {
  return Array.from({ length: n }, (_, i) => ({ label: String(i + 1), verses: verseCount(i + 1) }));
}

function verseCount(ch) {
  return 12 + ((ch * 7) % 28); // deterministic 12..39
}
