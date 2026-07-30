import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ThumbDial from './components/ThumbDial';
import { domains } from './domains';

const HEADER_GAP = 32; // ~2em of breathing room below the safe-area inset

function Demo() {
  const insets = useSafeAreaInsets();
  const [which, setWhich] = useState(domains[0].id);
  const [result, setResult] = useState(null);
  // A domain pack bundles the tree with its grammar and wording; the dial itself
  // is domain-agnostic, so switching list types is switching one object.
  const domain = domains.find((d) => d.id === which);

  const handleSelect = (leaf, ctx) => {
    // The "conclusion": for Bible this is like `John 1`; for Grocery, the item.
    const tail = ctx.labels.slice(-2).join(' ');
    setResult({ tail, path: ctx.labels.join(' › ') });
  };

  const handleCommit = (payload) => {
    // A compound reference, e.g. "1 Cor 13:1-3; 10-12; 18".
    setResult({ tail: payload.formatted, path: `${payload.groups.length} range(s)` });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + HEADER_GAP }]}>
      <StatusBar style="light" />

      <View style={styles.switcher}>
        {domains.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => {
              setWhich(d.id);
              setResult(null);
            }}
            style={[styles.tab, which === d.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, which === d.id && styles.tabTextActive]}>{d.title}</Text>
          </Pressable>
        ))}
      </View>

      {/* key forces a fresh dial (reset to root) when the domain changes */}
      <ThumbDial
        key={which}
        data={domain.tree}
        grammar={domain.grammar}
        copy={domain.copy}
        formatSelection={domain.formatSelection}
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
          <Text style={styles.readoutHint}>{domain.hint}</Text>
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
