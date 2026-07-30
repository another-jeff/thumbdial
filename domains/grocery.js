/**
 * Grocery — a ThumbDial domain pack. See ./bible.js for the pack contract.
 *
 * Navigation-only: no node declares a `pick` mode, so sweep-select never turns
 * on and a leaf is committed by lifting on it (`onSelect`). Note that this is
 * now a *declaration*, not a coincidence — an earlier version inferred
 * range-selection from numeric labels, which would have mis-fired on any
 * quantity, size, or aisle number added here. (See doc/DESIGN.md §3.)
 *
 * The deferred basket mode is where `pick: 'set'` would land.
 */

const tree = {
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

export default {
  id: 'grocery',
  title: 'Grocery',
  tree,
  copy: { navHint: 'Navigate to an item' },
  hint: 'Drag to read · lift on an item to pick it · tap hub to zoom out',
};
