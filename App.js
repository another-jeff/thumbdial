import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ThumbDial from './components/ThumbDial';
import { bible, grocery } from './data/samples';

const DATASETS = { Bible: bible, Grocery: grocery };
const HEADER_GAP = 32; // ~2em of breathing room below the safe-area inset

function Demo() {
  const insets = useSafeAreaInsets();
  const [which, setWhich] = useState('Bible');
  const [result, setResult] = useState(null);

  const handleSelect = (leaf, ctx) => {
    // The "conclusion": for Bible this is like `John 1`; for Grocery, the item.
    const tail = ctx.labels.slice(-2).join(' ');
    setResult({ tail, path: ctx.labels.join(' › ') });
  };

  const handleCommit = (payload) => {
    // A compound verse reference, e.g. "1 Cor 13:1-3; 10-12; 18".
    setResult({ tail: payload.formatted, path: `${payload.groups.length} range(s)` });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + HEADER_GAP }]}>
      <StatusBar style="light" />

      <View style={styles.switcher}>
        {Object.keys(DATASETS).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setWhich(k);
              setResult(null);
            }}
            style={[styles.tab, which === k && styles.tabActive]}
          >
            <Text style={[styles.tabText, which === k && styles.tabTextActive]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      {/* key forces a fresh dial (reset to root) when the dataset changes */}
      <ThumbDial
        key={which}
        data={DATASETS[which]}
        onSelect={handleSelect}
        onCommitSelection={handleCommit}
      />

      <View style={[styles.readout, { paddingBottom: insets.bottom + 12 }]}>
        {result ? (
          <>
            <Text style={styles.readoutLabel}>selected</Text>
            <Text style={styles.readoutValue}>{result.tail}</Text>
            <Text style={styles.readoutPath}>{result.path}</Text>
          </>
        ) : (
          <Text style={styles.readoutHint}>
            Drag to read · lift to zoom/pick · tap hub to zoom out · on a chapter, ＋select then sweep verses
          </Text>
        )}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Demo />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#18181b' },
  switcher: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#27272a' },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { color: '#a1a1aa', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  readout: {
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  readoutLabel: { color: '#71717a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  readoutValue: { color: '#fafafa', fontSize: 22, fontWeight: '800', marginTop: 2 },
  readoutPath: { color: '#818cf8', fontSize: 12, marginTop: 4 },
  readoutHint: { color: '#52525b', fontSize: 13, textAlign: 'center' },
});
