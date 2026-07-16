import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, formatMoney, CURRENCIES } from '@/src/theme';
import { Chips } from '@/src/components/FormFields';

type ExpenseRow = {
  id: string; date: string; category: string; vendor: string; description: string;
  amount: number; currency: string; payment_method?: string; paid_by: string; notes?: string;
};

const CATEGORY_ICONS: Record<string, any> = {
  Office: 'business-outline',
  Software: 'code-slash-outline',
  Internet: 'wifi-outline',
  Marketing: 'megaphone-outline',
  Travel: 'airplane-outline',
  Education: 'school-outline',
  Equipment: 'hardware-chip-outline',
  'Professional Services': 'briefcase-outline',
  Other: 'ellipsis-horizontal-outline',
};

const FILTERS = ['All', ...CURRENCIES];

export default function ExpensesScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (CURRENCIES.includes(filter as any)) params.set('currency', filter);
      const qs = params.toString();
      const r = await api.get<ExpenseRow[]>(`/expenses${qs ? '?' + qs : ''}`);
      setRows(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async (id: string) => {
    await api.del(`/expenses/${id}`);
    load();
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.onSurface }]}>Expenses</Text>
          <Text style={[styles.subtitle, { color: c.onSurfaceSecondary }]}>{rows.length} entries</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Ionicons name="search" size={16} color={c.muted} />
            <TextInput
              testID="expense-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search vendor, description…"
              placeholderTextColor={c.muted}
              style={[styles.searchInput, { color: c.onSurface }]}
              returnKeyType="search"
            />
            {search ? (
              <Pressable testID="expense-search-clear" onPress={() => setSearch('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          <Chips options={FILTERS} value={filter} onChange={setFilter} testIDPrefix="expense-filter" />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-down-outline" size={40} color={c.muted} />
          <Text style={[styles.emptyText, { color: c.onSurfaceSecondary }]}>
            {search ? 'No matches' : 'No expenses logged'}
          </Text>
          <Text style={[styles.emptySub, { color: c.muted }]}>{search ? 'Try a different search' : 'Tap + to add an expense'}</Text>
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
              testID={`expense-row-${item.id}`}
              onPress={() => router.push({ pathname: '/expense-form', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={[styles.catIcon, { backgroundColor: c.brandTertiary }]}>
                <Ionicons name={CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.onSurface }]} numberOfLines={1}>{item.vendor}</Text>
                <Text style={[styles.rowSub, { color: c.onSurfaceSecondary }]} numberOfLines={1}>
                  {item.category} • {item.date}
                </Text>
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: c.surfaceTertiary }]}>
                    <Text style={{ color: c.onSurfaceSecondary, fontSize: 10, fontWeight: '600' }}>Paid by {item.paid_by}</Text>
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amount, { color: c.onSurface }]}>-{formatMoney(item.amount, item.currency)}</Text>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={10} testID={`expense-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={c.muted} style={{ marginTop: 8 }} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        testID="expense-add-fab"
        onPress={() => router.push('/expense-form')}
        style={[styles.fab, { backgroundColor: c.brand }]}
      >
        <Ionicons name="add" size={28} color={c.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptySub: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  amount: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: 100, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)', elevation: 6,
  },
});
