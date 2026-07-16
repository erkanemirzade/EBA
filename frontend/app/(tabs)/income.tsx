import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, formatMoney, CURRENCIES } from '@/src/theme';
import { Chips } from '@/src/components/FormFields';

type IncomeRow = {
  id: string; date: string; client_name: string; service_description: string;
  invoice_number?: string; amount: number; currency: string; status: 'paid' | 'pending'; notes?: string;
};

const FILTERS = ['All', ...CURRENCIES, 'Paid', 'Pending'];

export default function IncomeScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (filter === 'Paid') params.set('status', 'paid');
      else if (filter === 'Pending') params.set('status', 'pending');
      else if (CURRENCIES.includes(filter as any)) params.set('currency', filter);
      const qs = params.toString();
      const r = await api.get<IncomeRow[]>(`/income${qs ? '?' + qs : ''}`);
      setRows(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async (id: string) => {
    await api.del(`/income/${id}`);
    load();
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.onSurface }]}>Income</Text>
          <Text style={[styles.subtitle, { color: c.onSurfaceSecondary }]}>{rows.length} entries</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Ionicons name="search" size={16} color={c.muted} />
            <TextInput
              testID="income-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search client, service, invoice…"
              placeholderTextColor={c.muted}
              style={[styles.searchInput, { color: c.onSurface }]}
              returnKeyType="search"
            />
            {search ? (
              <Pressable testID="income-search-clear" onPress={() => setSearch('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          <Chips options={FILTERS} value={filter} onChange={setFilter} testIDPrefix="income-filter" />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-up-outline" size={40} color={c.muted} />
          <Text style={[styles.emptyText, { color: c.onSurfaceSecondary }]}>
            {search ? 'No matches' : 'No income logged'}
          </Text>
          <Text style={[styles.emptySub, { color: c.muted }]}>{search ? 'Try a different search' : 'Tap + to add your first income'}</Text>
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
              testID={`income-row-${item.id}`}
              onPress={() => router.push({ pathname: '/income-form', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.onSurface }]}>{item.client_name}</Text>
                <Text style={[styles.rowSub, { color: c.onSurfaceSecondary }]} numberOfLines={1}>
                  {item.service_description} • {item.date}
                </Text>
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: item.status === 'paid' ? c.success + '20' : c.warning + '20' }]}>
                    <Text style={{ color: item.status === 'paid' ? c.success : c.warning, fontSize: 11, fontWeight: '600' }}>
                      {item.status === 'paid' ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                  {item.invoice_number && (
                    <Text style={[styles.invoice, { color: c.muted }]}>#{item.invoice_number}</Text>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amount, { color: c.success }]}>+{formatMoney(item.amount, item.currency)}</Text>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={10} testID={`income-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={c.muted} style={{ marginTop: 8 }} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        testID="income-add-fab"
        onPress={() => router.push('/income-form')}
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
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  invoice: { fontSize: 11 },
  amount: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: 100, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)', elevation: 6,
  },
});
