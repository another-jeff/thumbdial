import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, PanResponder, StyleSheet } from 'react-native';
import Svg, { G, Path, Defs, Text as SvgText, TextPath } from 'react-native-svg';
import { arc as d3arc } from 'd3-shape';
import { availableArrangements, isBranch, childrenOf } from '../lib/arrange';
import { layout, hitTest, ringRadii } from '../lib/sunburst';
import { coalesce, defaultFormatSelection } from '../lib/selection';

/**
 * ThumbDial — a thumb-driven, zoomable nested sunburst for hierarchical data.
 * See lib/sunburst.js (layout) and lib/arrange.js (ordering/bucketing).
 *
 * Gesture: drag to read a wedge out in the hub (radius = ring, angle = wedge);
 * lift to zoom a branch (fills the circle, animated) or pick a leaf. Tap the
 * hub to zoom out. Chip row re-orders ring 0; ◯/◎/∞ sets visible depth.
 *
 * Labels curve along their arc and abbreviate to fit: full label → `short` →
 * single letter → nothing (the hub still names it).
 *
 * Node shape: { label, short?, detail?, children?, verses?, value?, color?, meta?, arrangements? }
 *   `verses: N` — a leaf-count that expands to verse leaves "1".."N" just in time.
 * Props: data, onSelect(leaf, ctx), onNavigate(node, ctx),
 *        onCommitSelection(payload), formatSelection(context, groups, labels),
 *        maxSlices=12, depth=2
 */
const DEPTHS = [
  { id: 1, glyph: '◯' },
  { id: 2, glyph: '◎' },
  { id: 5, glyph: '∞' },
];
const TAU = Math.PI * 2;
const TWEEN_MS = 220;
const VERSE_BLOCK = 10; // verses are labeled in blocks of this size when numerous

export default function ThumbDial({
  data,
  onSelect,
  onNavigate,
  onCommitSelection,
  formatSelection,
  maxSlices = 12,
  depth = 2,
}) {
  const [stack, setStack] = useState([data]);
  const [arrangeId, setArrangeId] = useState('canonical');
  const [maxDepth, setMaxDepth] = useState(depth);
  const [hover, setHover] = useState(null);
  const [size, setSize] = useState(0);
  const [u, setU] = useState(1); // tween progress; 1 = settled
  // Selection is sticky and tied to the chapter it was made on, so navigating
  // (esp. zooming out) never destroys the reference you're building.
  const [sel, setSel] = useState(null); // { chapter, context, verses:Set } | null
  const [stroke, setStroke] = useState(null); // pending sweep { a, b, mode }
  const [collapseGroups, setCollapseGroups] = useState(false); // skip organizational layers

  const current = stack[stack.length - 1];
  const atRoot = stack.length === 1;

  const arrangements = useMemo(() => availableArrangements(current), [current]);
  const activeId = arrangements.some((a) => a.id === arrangeId) ? arrangeId : 'canonical';
  // You're on a chapter when its children are ordinal leaves (verses) — and it's
  // not a synthetic bucket. That is the ONLY place verse-selection turns on.
  const selecting = useMemo(() => {
    if (current.__bucket) return false;
    const kids = childrenOf(current);
    return kids.length > 0 && kids.every((c) => !isBranch(c) && /^\d+$/.test(String(c.label)));
  }, [current]);
  // Are there organizational (grouping) layers here that could be collapsed?
  const hasGroups = useMemo(() => childrenOf(current).some((c) => c.group), [current]);
  // At a "book": children are ordinal branches (chapters). Drives the hub readout.
  const atBook = useMemo(() => {
    if (selecting) return false;
    const kids = childrenOf(current);
    return kids.length > 0 && kids.every((c) => isBranch(c) && /^\d+$/.test(String(c.label)));
  }, [current, selecting]);
  // The verses selected for the CURRENT chapter (sticky sel may belong elsewhere).
  const activeVerses = sel && sel.chapter === current ? sel.verses : null;
  const hasVerse = (i) => !!activeVerses && activeVerses.has(i);

  const segments = useMemo(
    () =>
      selecting
        ? layout(current, { arrangeId: 'canonical', maxDepth: 1, maxSlices: 1e9 }) // one unbucketed ring of verses
        : layout(current, { arrangeId: activeId, maxDepth, maxSlices, collapseGroups }),
    [current, activeId, maxDepth, maxSlices, selecting, collapseGroups]
  );
  const actualDepth = useMemo(() => segments.reduce((m, s) => Math.max(m, s.depth), 1), [segments]);
  const hasNesting = segments.some((s) => isBranch(s.node));
  // Identity for the current view — labels key off this so their arc paths
  // remount (reposition) whenever what's on screen changes.
  const viewKey = `${stack.length}|${activeId}|${maxDepth}|${selecting ? 'sel' : 'nav'}|${collapseGroups ? 'flat' : 'grp'}`;

  const clearSelection = () => {
    setSel(null);
    setStroke(null);
  };
  const versesLabelsFor = (chapter) =>
    Array.from({ length: chapter?.verses || 0 }, (_, i) => String(i + 1));

  // ---- tween --------------------------------------------------------------
  const transRef = useRef(null); // { dir:'in'|'out', sa0, sa1 }
  const rafRef = useRef(null);
  const startTween = useCallback((dir, sa0, sa1) => {
    if (sa1 - sa0 < 1e-4 || sa1 - sa0 >= TAU - 1e-4) {
      transRef.current = null;
      setU(1);
      return;
    }
    transRef.current = { dir, sa0, sa1 };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = Date.now();
    setU(0);
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / TWEEN_MS);
      setU(p);
      rafRef.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);

  const spanOfChildIn = (parent, child) => {
    const segs = layout(parent, { arrangeId: 'canonical', maxDepth: 1, maxSlices, collapseGroups });
    const s = segs.find((x) => x.node === child);
    return s ? [s.a0, s.a1] : null;
  };

  // ---- navigation ---------------------------------------------------------
  const cleanPath = (nodes) => nodes.filter((n) => !n.__bucket);
  const notify = useCallback(
    (next) => {
      if (!onNavigate) return;
      const node = next[next.length - 1];
      const path = cleanPath(next.slice(1));
      onNavigate(node, { path, labels: path.map((n) => n.label) });
    },
    [onNavigate]
  );
  const zoom = useCallback(
    (chainNodes, seg) => {
      setHover(null);
      startTween('in', seg.a0, seg.a1);
      const next = [...stack, ...chainNodes];
      setStack(next);
      notify(next);
    },
    [stack, notify, startTween]
  );
  const pick = useCallback(
    (chainNodes) => {
      setHover(null);
      if (!onSelect) return;
      const path = cleanPath([...stack.slice(1), ...chainNodes]);
      onSelect(chainNodes[chainNodes.length - 1], { path, labels: path.map((n) => n.label) });
    },
    [stack, onSelect]
  );
  const back = useCallback(() => {
    setHover(null);
    setStroke(null);
    if (atRoot) return;
    const parent = stack[stack.length - 2];
    const span = spanOfChildIn(parent, current);
    if (span) startTween('out', span[0], span[1]);
    else setU(1);
    const next = stack.slice(0, -1);
    setStack(next);
    notify(next);
  }, [stack, atRoot, current, notify, startTween]);
  const jumpTo = useCallback(
    (d) => {
      setHover(null);
      setStroke(null);
      const span = d + 1 < stack.length ? spanOfChildIn(stack[d], stack[d + 1]) : null;
      if (span) startTween('out', span[0], span[1]);
      else setU(1);
      const next = stack.slice(0, d + 1);
      setStack(next);
      notify(next);
    },
    [stack, notify, startTween]
  );

  // ---- geometry -----------------------------------------------------------
  const dim = size || 320;
  const cx = dim / 2;
  const cy = dim / 2;
  const outerR = dim / 2 - 6;
  const innerR = Math.max(46, outerR * 0.4);
  const t = (outerR - innerR) / actualDepth;

  // Arc geometry, with the tween transform applied while u < 1.
  const arcs = useMemo(() => {
    const tr = transRef.current;
    const settled = u >= 1 || !tr;
    const e = 1 - Math.pow(1 - u, 3); // easeCubicOut
    const mapAngle = (A) =>
      tr.dir === 'in'
        ? tr.sa0 + (A * (tr.sa1 - tr.sa0)) / TAU
        : ((A - tr.sa0) / (tr.sa1 - tr.sa0)) * TAU;

    return segments.map((s) => {
      let a0 = s.a0;
      let a1 = s.a1;
      let [rIn, rOut] = ringRadii(s.depth, innerR, t);
      if (!settled) {
        a0 = lerp(mapAngle(s.a0), s.a0, e);
        a1 = lerp(mapAngle(s.a1), s.a1, e);
        if (tr.dir === 'in') {
          rIn = innerR + (rIn - innerR) * e;
          rOut = innerR + (rOut - innerR) * e;
        }
      }
      const gen = d3arc()
        .innerRadius(rIn + (s.depth > 1 ? 1.5 : 0))
        .outerRadius(rOut)
        .padAngle(0.006)
        .cornerRadius(2);
      const datum = { startAngle: a0, endAngle: a1 };
      return { s, d: gen(datum), labelR: (rIn + rOut) / 2, span: a1 - a0 };
    });
  }, [segments, innerR, t, u]);

  // Curved, abbreviated labels — only when settled (skipped during the tween).
  const labels = useMemo(() => {
    if (u < 1) return [];

    // Verse-selection ring: verses are ALWAYS individually selectable (never
    // range-bucketed, so any range like 19-26 is reachable). Labels adapt — show
    // each verse number when they fit, otherwise label in blocks (1–10, 11–20…)
    // purely for orientation.
    if (selecting) {
      const n = arcs.length;
      if (n === 0) return [];
      const fontSize = 12;
      const midR = (innerR + outerR) / 2;
      const perArc = (TAU / n) * midR;
      const individual = chooseLabel({ label: '88' }, perArc, fontSize, t) !== null;
      if (individual) {
        return arcs
          .map(({ s, span, labelR }) => {
            const text = chooseLabel(s.node, span * labelR, fontSize, t);
            if (!text) return null;
            return {
              id: `lp-${viewKey}-v${s.sidx}`,
              text,
              fontSize,
              arcD: labelArc(s.a0, s.a1, labelR),
              letterSpacing: spread(text, span * labelR, fontSize),
            };
          })
          .filter(Boolean);
      }
      const blocks = [];
      for (let b = 0; b * VERSE_BLOCK < n; b++) {
        const start = b * VERSE_BLOCK;
        const end = Math.min(n, start + VERSE_BLOCK);
        const first = arcs[start];
        const last = arcs[end - 1];
        const text = end - 1 > start ? `${first.s.node.label}–${last.s.node.label}` : first.s.node.label;
        blocks.push({
          id: `lp-${viewKey}-b${b}`,
          text,
          fontSize,
          arcD: labelArc(first.s.a0, last.s.a1, first.labelR),
          letterSpacing: 0,
        });
      }
      return blocks;
    }

    return arcs
      .map(({ s, span, labelR }) => {
        const fontSize = s.depth === 1 ? 12 : s.depth === 2 ? 10 : 9;
        // Only render if there's ample room to read it — angularly AND radially.
        const text = chooseLabel(s.node, span * labelR, fontSize, t);
        if (!text) return null;
        return {
          id: `lp-${viewKey}-${s.sidx}`,
          text,
          fontSize,
          arcD: labelArc(s.a0, s.a1, labelR),
          letterSpacing: spread(text, span * labelR, fontSize),
        };
      })
      .filter(Boolean);
  }, [arcs, u, viewKey, t, selecting, innerR, outerR]);

  // ---- gesture ------------------------------------------------------------
  const geoRef = useRef({});
  geoRef.current = { segments, innerR, t, actualDepth, cx, cy };
  const hoverRef = useRef(null);
  const sawSegRef = useRef(false);
  const strokeStartRef = useRef(null);
  const strokeModeRef = useRef('add');
  const strokeRef = useRef(null);
  const sawVerseRef = useRef(false); // did this select-gesture ever touch a verse?

  const polar = (e) => {
    const g = geoRef.current;
    const dx = e.nativeEvent.locationX - g.cx;
    const dy = e.nativeEvent.locationY - g.cy;
    const r = Math.hypot(dx, dy);
    let theta = Math.atan2(dx, -dy);
    if (theta < 0) theta += TAU;
    return { r, theta, g };
  };
  const verseAt = (r, theta, g) => {
    if (r < g.innerR) return null;
    const res = hitTest(r, theta, { innerR: g.innerR, ringThickness: g.t, maxDepth: 1, segments: g.segments });
    return res.segment ? res.segment.i : null;
  };
  const navTouch = (e) => {
    const { r, theta, g } = polar(e);
    const res = hitTest(r, theta, {
      innerR: g.innerR,
      ringThickness: g.t,
      maxDepth: g.actualDepth,
      segments: g.segments,
    });
    if (res.hub || !res.segment) {
      hoverRef.current = res.hub ? { hub: true } : null;
      setHover(res.hub ? { hub: true } : null);
    } else {
      sawSegRef.current = true;
      hoverRef.current = res;
      setHover({ sidx: res.segment.sidx, chain: res.chain.map((s) => s.sidx) });
    }
  };

  // Handlers live in a ref so the once-built PanResponder always reads fresh
  // state and can branch between navigate-mode and sweep-select mode.
  const H = useRef({});
  H.current.grant = (e) => {
    if (selecting) {
      sawVerseRef.current = false;
      const { r, theta, g } = polar(e);
      const i = verseAt(r, theta, g);
      if (i == null) {
        strokeStartRef.current = null;
        strokeRef.current = null;
        setStroke(null);
        return;
      }
      sawVerseRef.current = true;
      strokeStartRef.current = i;
      strokeModeRef.current = hasVerse(i) ? 'remove' : 'add';
      const st = { a: i, b: i, mode: strokeModeRef.current };
      strokeRef.current = st;
      setStroke(st);
    } else {
      sawSegRef.current = false;
      navTouch(e);
    }
  };
  H.current.move = (e) => {
    if (selecting) {
      const { r, theta, g } = polar(e);
      const i = verseAt(r, theta, g);
      if (i == null) return;
      sawVerseRef.current = true;
      let s = strokeStartRef.current;
      if (s == null) {
        s = i;
        strokeStartRef.current = i;
        strokeModeRef.current = hasVerse(i) ? 'remove' : 'add';
      }
      const st = { a: Math.min(s, i), b: Math.max(s, i), mode: strokeModeRef.current };
      strokeRef.current = st;
      setStroke(st);
    } else {
      navTouch(e);
    }
  };
  H.current.release = (e) => {
    if (selecting) {
      // A pure tap on the hub (no verse ever touched) zooms out — this is how
      // you leave a verse ring, since generated verse leaves have no wedge to lift on.
      if (!sawVerseRef.current) {
        strokeStartRef.current = null;
        strokeRef.current = null;
        setStroke(null);
        back();
        return;
      }
      const st = strokeRef.current;
      if (st) {
        const base = new Set(activeVerses || []);
        for (let k = st.a; k <= st.b; k++) (st.mode === 'add' ? base.add(k) : base.delete(k));
        if (base.size === 0) setSel(null);
        else setSel({ chapter: current, context: cleanPath(stack.slice(1)), verses: base });
      }
      strokeStartRef.current = null;
      strokeRef.current = null;
      setStroke(null);
      return;
    }
    const { r } = polar(e);
    const h = hoverRef.current;
    if (r < geoRef.current.innerR || !h || h.hub || !h.segment) {
      if (!sawSegRef.current) back();
      else setHover(null);
      return;
    }
    // Navigation stops at chapters: if the target lives inside a chapter's verse
    // territory, land on the chapter (not the verse/bucket you happened to touch).
    const chainSegs = h.chain;
    const chapAt = chainSegs.findIndex((s) => s.node.verses > 0);
    if (chapAt >= 0) {
      const upto = chainSegs.slice(0, chapAt + 1);
      zoom(upto.map((s) => s.node), upto[upto.length - 1]);
    } else if (isBranch(h.segment.node)) {
      zoom(chainSegs.map((s) => s.node), h.segment);
    } else {
      pick(chainSegs.map((s) => s.node));
    }
  };
  H.current.terminate = () => {
    setHover(null);
    setStroke(null);
    strokeStartRef.current = null;
    strokeRef.current = null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => H.current.grant(e),
      onPanResponderMove: (e) => H.current.move(e),
      onPanResponderRelease: (e) => H.current.release(e),
      onPanResponderTerminate: () => H.current.terminate(),
    })
  ).current;

  // ---- reference (sticky selection, else current nav path) ----------------
  const verseLabels = useMemo(
    () => (selecting ? segments.map((s) => s.node.label) : []),
    [selecting, segments]
  );
  const currentContext = useMemo(() => cleanPath(stack.slice(1)), [stack]);
  const hasSel = !!(sel && sel.verses.size);
  const refContext = hasSel ? sel.context : currentContext;
  const refGroups = hasSel ? coalesce([...sel.verses]) : [];
  const refLabels = hasSel ? versesLabelsFor(sel.chapter) : [];
  const formatted = (formatSelection || defaultFormatSelection)(refContext, refGroups, refLabels);
  const commitSelection = () => {
    const payload = { context: refContext, groups: refGroups, labels: refLabels, formatted };
    if (onCommitSelection) onCommitSelection(payload);
    else if (onSelect) onSelect(null, payload);
    clearSelection();
  };

  // ---- hub readout --------------------------------------------------------
  const hoveredSeg =
    !selecting && hover?.sidx != null ? segments.find((s) => s.sidx === hover.sidx) : null;
  const hoverChain =
    !selecting && hover?.chain ? hover.chain.map((sx) => segments.find((s) => s.sidx === sx)) : [];
  // The hub always reads like a reference: a stable title on top, the drilling
  // target on the bottom. At a book → book / chapter; under a chapter →
  // book / chapter:verse; elsewhere → generic hovered wedge + detail.
  let hubTop;
  let hubDetail;
  let chainAbove = '';
  if (selecting) {
    const book = stack[stack.length - 2];
    hubTop = book ? book.short || book.label : current.label;
    const chap = current.label;
    if (stroke) {
      const a = verseLabels[stroke.a];
      const b = verseLabels[stroke.b];
      hubDetail = `${chap}:${a === b ? a : `${a}–${b}`}`;
    } else {
      const n = activeVerses ? activeVerses.size : 0;
      hubDetail = n ? `${chap} · ${n}✓` : chap;
    }
  } else if (atBook) {
    hubTop = current.short || current.label;
    // Show the chapter whose territory you're over, never a verse bucket.
    const chapSeg = hoverChain.find((s) => s?.node.verses > 0);
    const chapNode = chapSeg?.node || hoveredSeg?.node;
    hubDetail = chapNode ? chapNode.label : 'pick a chapter';
  } else {
    hubTop = hoveredSeg ? hoveredSeg.node.label : current.label;
    hubDetail = hoveredSeg ? fmtDetail(hoveredSeg.node) : atRoot ? fmtDetail(current) : 'tap to zoom out';
    chainAbove = hoverChain.slice(0, -1).map((s) => s?.node.label).filter(Boolean).join(' › ');
  }

  return (
    <View style={styles.root}>
      {/* Breadcrumb */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.crumbBar}
        contentContainerStyle={styles.crumbContent}
      >
        {stack.map((node, i) => {
          const last = i === stack.length - 1;
          return (
            <View key={i} style={styles.crumbItem}>
              {i > 0 && <Text style={styles.crumbSep}>›</Text>}
              <Pressable onPress={() => !last && jumpTo(i)} disabled={last} hitSlop={6}>
                <Text style={[styles.crumbText, last && styles.crumbActive]}>{node.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        {!selecting && arrangements.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
            style={styles.chipScroll}
          >
            {arrangements.map((a) => {
              const on = a.id === activeId;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    setHover(null);
                    setArrangeId(a.id);
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {!selecting && hasGroups && (
          <Pressable
            onPress={() => {
              setHover(null);
              setCollapseGroups((v) => !v);
            }}
            style={[styles.chip, collapseGroups && styles.chipOn]}
            hitSlop={4}
          >
            <Text style={[styles.chipText, collapseGroups && styles.chipTextOn]}>Flatten</Text>
          </Pressable>
        )}
        {!selecting && hasNesting && (
          <View style={styles.depthCtl}>
            {DEPTHS.map((d) => {
              const on = d.id === maxDepth;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    setHover(null);
                    setMaxDepth(d.id);
                  }}
                  style={[styles.depthBtn, on && styles.depthBtnOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.depthGlyph, on && styles.depthGlyphOn]}>{d.glyph}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Dial */}
      <View
        style={styles.dialWrap}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize(Math.max(160, Math.min(width, height)));
        }}
      >
        {size > 0 && (
          <View style={{ width: dim, height: dim }} {...pan.panHandlers}>
            <Svg width={dim} height={dim}>
              <Defs>
                {labels.map((l) => (
                  <Path key={l.id} id={l.id} d={l.arcD} />
                ))}
              </Defs>
              <G transform={`translate(${cx}, ${cy})`} opacity={u < 1 && transRef.current?.dir === 'in' ? 0.25 + 0.75 * u : 1}>
                {arcs.map(({ s, d }) => {
                  if (!d) return null;
                  let fill = colorFor(s);
                  let opacity = 0.88;
                  let strokeColor = 'transparent';
                  let strokeWidth = 0;
                  if (selecting) {
                    const isSel = hasVerse(s.i);
                    const inStroke = stroke && s.i >= stroke.a && s.i <= stroke.b;
                    // Alternate shading per block of 10 so verses read as large blocks.
                    const band = Math.floor(s.i / VERSE_BLOCK) % 2 === 0;
                    fill = isSel ? '#6366f1' : band ? '#454562' : '#33333f';
                    opacity = 1;
                    if (inStroke) {
                      if (stroke.mode === 'add') {
                        fill = '#818cf8';
                        strokeColor = '#e0e7ff';
                        strokeWidth = 2;
                      } else {
                        opacity = 0.4;
                        strokeColor = '#f4f4f5';
                        strokeWidth = 1;
                      }
                    }
                  } else {
                    const hovered = hover?.sidx === s.sidx;
                    const inChain = hover?.chain?.includes(s.sidx);
                    opacity = hovered || inChain ? 1 : 0.88;
                    strokeColor = hovered ? '#fafafa' : inChain ? '#c7d2fe' : 'transparent';
                    strokeWidth = hovered ? 2.5 : inChain ? 1.25 : 0;
                  }
                  return (
                    <Path key={s.sidx} d={d} fill={fill} opacity={opacity} stroke={strokeColor} strokeWidth={strokeWidth} />
                  );
                })}
                {labels.map((l) => (
                  <SvgText
                    key={l.id}
                    fill="#fafafa"
                    fontSize={l.fontSize}
                    fontWeight="600"
                    textAnchor="middle"
                    alignmentBaseline="central"
                    letterSpacing={l.letterSpacing || 0}
                  >
                    <TextPath href={`#${l.id}`} startOffset="50%">
                      {l.text}
                    </TextPath>
                  </SvgText>
                ))}
              </G>
            </Svg>

            {/* Hub */}
            <View
              style={[
                styles.hub,
                {
                  width: innerR * 2,
                  height: innerR * 2,
                  borderRadius: innerR,
                  top: cy - innerR,
                  left: cx - innerR,
                  pointerEvents: 'none',
                },
              ]}
            >
              {!!chainAbove && (
                <Text style={styles.hubPath} numberOfLines={1}>
                  {chainAbove} ›
                </Text>
              )}
              {!atRoot && !hoveredSeg && !stroke && (
                <Text style={styles.hubBack}>‹ tap to zoom out</Text>
              )}
              <Text style={styles.hubTop} numberOfLines={2}>
                {hubTop}
              </Text>
              <View style={styles.hubRule} />
              <Text style={styles.hubDetail} numberOfLines={1}>
                {hubDetail}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Reference tray — you are always building toward a reference */}
      <View style={styles.tray}>
        <Text style={styles.trayText} numberOfLines={2}>
          {formatted || (selecting ? 'Sweep across verses' : 'Navigate to build a reference')}
        </Text>
        <View style={styles.trayBtns}>
          {hasSel && (
            <Pressable onPress={clearSelection} style={styles.trayBtn} hitSlop={4}>
              <Text style={styles.trayBtnText}>Clear</Text>
            </Pressable>
          )}
          <Pressable
            onPress={commitSelection}
            disabled={!formatted}
            style={[styles.trayBtn, styles.trayDone, !formatted && styles.trayDisabled]}
            hitSlop={4}
          >
            <Text style={styles.trayDoneText}>Use ✓</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---- helpers --------------------------------------------------------------

const lerp = (a, b, e) => a + (b - a) * e;

function fmtDetail(node) {
  if (node.detail != null) return String(node.detail);
  const n = node.children ? node.children.length : 0;
  return n > 0 ? `${n} item${n === 1 ? '' : 's'}` : '';
}

// A gentle nudge of letter-spacing so a WORD on a wide (sparse) arc doesn't bunch
// in the middle. Never applied to numbers or numeric ranges, and kept subtle.
function spread(text, arcLen, fontSize) {
  const s = String(text);
  if (s.length < 2 || /[0-9]/.test(s)) return 0; // words only — never kern numbers/ranges
  const cw = fontSize * 0.62;
  const extra = arcLen * 0.32 - s.length * cw;
  if (extra <= 0) return 0;
  return Math.min(fontSize * 0.35, extra / (s.length - 1));
}

// Full label → `short`, whichever first fits with AMPLE room (radial + angular).
// Numbers and ranges are ALL-OR-NOTHING: never show a partial ("1" for "1–25",
// "1" for "12"). A single-letter initial is only offered for word labels.
function chooseLabel(node, arcLen, fontSize, bandThickness) {
  if (bandThickness < fontSize + 4) return null; // ring too thin to read radially
  const cw = fontSize * 0.62; // approx glyph advance
  const room = arcLen - fontSize; // leave a glyph of breathing space in the arc
  if (room < cw) return null;
  const fits = (str) => String(str).length * cw <= room;
  const full = String(node.label);
  if (fits(full)) return full;
  if (node.short && fits(node.short)) return String(node.short);
  // Anything containing a digit or a range dash is atomic — don't abbreviate it.
  if (/[0-9‒-―-]/.test(full)) return null;
  const letter = (full.trim()[0] || '').toUpperCase();
  return letter && fits(letter) ? letter : null;
}

// Baseline arc for a label: a slice of the invisible circle through the MIDDLE
// of the wedge's band. Reversed on the bottom half so text stays upright. No
// radius fudge — vertical centering is done by alignmentBaseline on the text.
function labelArc(a0, a1, midBandR) {
  const mid = (a0 + a1) / 2;
  const flip = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
  const R = midBandR;
  const P = (a) => [R * Math.sin(a), -R * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (!flip) {
    const [x0, y0] = P(a0);
    const [x1, y1] = P(a1);
    return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  }
  const [x0, y0] = P(a1);
  const [x1, y1] = P(a0);
  return `M${x0} ${y0}A${R} ${R} 0 ${large} 0 ${x1} ${y1}`;
}

function colorFor(seg) {
  if (seg.node.color) return seg.node.color;
  return `hsl(${seg.hue}, 45%, ${seg.light}%)`;
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%' },
  crumbBar: { flexGrow: 0, maxHeight: 40 },
  crumbContent: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  crumbItem: { flexDirection: 'row', alignItems: 'center' },
  crumbSep: { color: '#71717a', marginHorizontal: 6, fontSize: 14 },
  crumbText: { color: '#a1a1aa', fontSize: 14 },
  crumbActive: { color: '#fafafa', fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  chipContent: { alignItems: 'center', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  chipOn: { backgroundColor: '#3730a3', borderColor: '#6366f1' },
  chipText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  depthCtl: { flexDirection: 'row', gap: 2, backgroundColor: '#27272a', borderRadius: 999, padding: 2 },
  depthBtn: { width: 30, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  depthBtnOn: { backgroundColor: '#6366f1' },
  depthGlyph: { color: '#a1a1aa', fontSize: 14, fontWeight: '700' },
  depthGlyphOn: { color: '#fff' },
  dialWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingHorizontal: 12,
  },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  trayText: { flex: 1, color: '#fafafa', fontSize: 15, fontWeight: '700' },
  trayBtns: { flexDirection: 'row', gap: 6 },
  trayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#3f3f46' },
  trayBtnText: { color: '#d4d4d8', fontWeight: '600', fontSize: 13 },
  trayDone: { backgroundColor: '#6366f1' },
  trayDoneText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  trayDisabled: { opacity: 0.4 },
  hubPath: { color: '#818cf8', fontSize: 10, marginBottom: 2, maxWidth: '92%' },
  hubBack: { color: '#71717a', fontSize: 11, marginBottom: 2 },
  hubTop: { color: '#fafafa', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  hubRule: { height: 1, width: '58%', backgroundColor: '#52525b', marginVertical: 5 },
  hubDetail: { color: '#a1a1aa', fontSize: 12, textAlign: 'center' },
});
