import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, formatMoney, CURRENCIES } from '@/src/theme';

type StartupRow = {
  id: string; date: string; category: string; vendor?: string; description: string;
  amount: number; currency: string; paid_by: string; notes?: string;
};

export default function StartupScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<StartupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<StartupRow[]>('/startup-costs');
      setRows(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async (id: string) => {
    await api.del(`/startup-costs/${id}`);
    load();
  };

  const totals: Record<string, number> = { EUR: 0, TRY: 0, GBP: 0 };
  rows.forEach((r) => { if (totals[r.currency] !== undefined) totals[r.currency] += r.amount; });

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.onSurface }]}>Startup Costs</Text>
          <Text style={[styles.subtitle, { color: c.onSurfaceSecondary }]}>One-time establishment expenses</Text>
        </View>

        <View style={{ paddingHorizontal: spacing.lg }}>
          <View style={[styles.heroCard, { backgroundColor: c.brand }]}>
            <Text style={[styles.heroLabel, { color: c.onBrand + 'CC' }]}>Total Startup Cost</Text>
            {CURRENCIES.map((cur) => (
              <Text key={cur} testID={`startup-total-${cur}`} style={[styles.heroAmount, { color: c.onBrand }]}>
                {formatMoney(totals[cur], cur)}
              </Text>
            ))}
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="rocket-outline" size={40} color={c.muted} />
          <Text style={[styles.emptyText, { color: c.onSurfaceSecondary }]}>No startup costs logged</Text>
          <Text style={[styles.emptySub, { color: c.muted }]}>Tap + to add establishment costs</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.brand} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`startup-row-${item.id}`}
              onPress={() => router.push({ pathname: '/startup-form', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={[styles.catIcon, { backgroundColor: c.warning + '20' }]}>
                <Ionicons name="rocket-outline" size={18} color={c.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.onSurface }]} numberOfLines={1}>{item.category}</Text>
                <Text style={[styles.rowSub, { color: c.onSurfaceSecondary }]} numberOfLines={1}>{item.description}</Text>
                <Text style={[styles.rowMeta, { color: c.muted }]}>{item.date} • Paid by {item.paid_by}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amount, { color: c.onSurface }]}>-{formatMoney(item.amount, item.currency)}</Text>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={10} testID={`startup-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={c.muted} style={{ marginTop: 8 }} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        testID="startup-add-fab"
        onPress={() => router.push('/startup-form')}
        style={[styles.fab, { backgroundColor: c.brand }]}
      >
        <Ionicons name="add" size={28} color={c.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  heroCard: { padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.sm },
  heroLabel: { fontSize: 12, fontWeight: '500', marginBottom: spacing.sm },
  heroAmount: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptySub: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 3 },
  rowMeta: { fontSize: 11, marginTop: 3 },
  amount: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: 100, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)', elevation: 6,
  },
});
