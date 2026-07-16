import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, BACKEND_URL, tokenStore } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, formatMoney, CURRENCIES } from '@/src/theme';
import { Chips } from '@/src/components/FormFields';

type Monthly = {
  month: string;
  income: Record<string, number>;
  expenses: Record<string, number>;
  startup: Record<string, number>;
};

type Category = { category: string; EUR: number; TRY: number; GBP: number };

const TABS = ['Monthly', 'Category', 'Cash Flow'];

export default function ReportsScreen() {
  const { c } = useTheme();
  const [tab, setTab] = useState('Monthly');
  const [monthly, setMonthly] = useState<Monthly[]>([]);
  const [category, setCategory] = useState<{ expenses: Category[]; startup: Category[] } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, cat, s] = await Promise.all([
        api.get<Monthly[]>('/reports/monthly'),
        api.get<any>('/reports/category'),
        api.get<any>('/summary'),
      ]);
      setMonthly(m);
      setCategory(cat);
      setSummary(s);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportFile = async (kind: 'csv' | 'pdf', csvKind: string = 'all') => {
    const token = await tokenStore.get();
    const path = kind === 'pdf' ? '/export/pdf' : `/export/csv?kind=${csvKind}`;
    const url = `${BACKEND_URL}/api${path}`;
    if (Platform.OS === 'web') {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = kind === 'pdf'
          ? `eba-finance-summary-${new Date().toISOString().slice(0, 10)}.pdf`
          : `eba-finance-${csvKind}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
      } catch {}
      return;
    }
    // Native: download to cache dir then share
    try {
      const filename = kind === 'pdf'
        ? `eba-finance-summary-${new Date().toISOString().slice(0, 10)}.pdf`
        : `eba-finance-${csvKind}-${new Date().toISOString().slice(0, 10)}.csv`;
      const target = (FileSystem.cacheDirectory || '') + filename;
      await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: kind === 'pdf' ? 'application/pdf' : 'text/csv',
          dialogTitle: 'Export EBA Finance data',
        });
      } else {
        await WebBrowser.openBrowserAsync(target);
      }
    } catch {}
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.onSurface }]}>Reports</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Chips options={TABS} value={tab} onChange={setTab} testIDPrefix="reports-tab" />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
          {tab === 'Monthly' && (
            monthly.length === 0 ? (
              <EmptyReport c={c} label="Not enough data to generate monthly report" />
            ) : (
              monthly.map((m) => {
                const total = (v: Record<string, number>) => CURRENCIES.map((cur) => ({ cur, v: v[cur] || 0 })).filter((x) => x.v > 0);
                return (
                  <View key={m.month} testID={`report-month-${m.month}`} style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
                    <Text style={[styles.cardTitle, { color: c.onSurface }]}>{m.month}</Text>
                    <View style={styles.gridRow}>
                      <ReportCol c={c} label="Income" color={c.success} items={total(m.income)} />
                      <ReportCol c={c} label="Expenses" color={c.error} items={total(m.expenses)} />
                      <ReportCol c={c} label="Startup" color={c.warning} items={total(m.startup)} />
                    </View>
                    <View style={[styles.netRow, { borderTopColor: c.divider }]}>
                      <Text style={{ color: c.onSurfaceSecondary, fontSize: 12, fontWeight: '500' }}>Net</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        {CURRENCIES.map((cur) => {
                          const net = (m.income[cur] || 0) - (m.expenses[cur] || 0) - (m.startup[cur] || 0);
                          if (net === 0) return null;
                          return (
                            <Text key={cur} style={{ color: net >= 0 ? c.success : c.error, fontWeight: '700', fontSize: 14 }}>
                              {net >= 0 ? '+' : ''}{formatMoney(net, cur)}
                            </Text>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })
            )
          )}

          {tab === 'Category' && category && (
            <>
              <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Operating Expenses</Text>
              {category.expenses.length === 0 ? <EmptyReport c={c} label="No expenses yet" /> : category.expenses.map((cat) => (
                <CategoryRow key={cat.category} cat={cat} c={c} />
              ))}
              <Text style={[styles.sectionTitle, { color: c.onSurface, marginTop: spacing.lg }]}>Startup Costs</Text>
              {category.startup.length === 0 ? <EmptyReport c={c} label="No startup costs yet" /> : category.startup.map((cat) => (
                <CategoryRow key={cat.category} cat={cat} c={c} />
              ))}
            </>
          )}

          {tab === 'Cash Flow' && summary && (
            <View style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.onSurface, marginBottom: spacing.md }]}>Cash Flow Summary</Text>
              {CURRENCIES.map((cur) => (
                <View key={cur} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.currencyLabel, { color: c.brand }]}>{cur}</Text>
                  <FlowRow c={c} label="Personal Investment" v={summary.total_investments[cur]} sign="+" color={c.brand} />
                  <FlowRow c={c} label="Received Income" v={summary.total_income[cur]} sign="+" color={c.success} />
                  <FlowRow c={c} label="Operating Expenses" v={summary.total_expenses[cur]} sign="-" color={c.error} />
                  <FlowRow c={c} label="Startup Costs" v={summary.total_startup[cur]} sign="-" color={c.warning} />
                  <View style={[styles.totalRow, { borderTopColor: c.divider }]}>
                    <Text style={{ color: c.onSurface, fontWeight: '700', fontSize: 14 }}>Available Cash</Text>
                    <Text style={{ color: c.onSurface, fontWeight: '700', fontSize: 16 }}>
                      {formatMoney(summary.available_cash[cur] || 0, cur)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.exportSection}>
            <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Export</Text>

            <Pressable
              testID="export-pdf"
              onPress={() => exportFile('pdf')}
              style={[styles.exportPdfBtn, { backgroundColor: c.brand }]}
            >
              <Ionicons name="document-text" size={18} color={c.onBrand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.onBrand, fontWeight: '700', fontSize: 14 }}>PDF Summary</Text>
                <Text style={{ color: c.onBrand + 'CC', fontSize: 12, marginTop: 2 }}>
                  Complete financial statement in one file
                </Text>
              </View>
              <Ionicons name="download-outline" size={18} color={c.onBrand} />
            </Pressable>

            <Text style={[styles.exportSubLabel, { color: c.onSurfaceSecondary }]}>CSV Files</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {[
                { k: 'all', label: 'All data' },
                { k: 'income', label: 'Income' },
                { k: 'expenses', label: 'Expenses' },
                { k: 'startup', label: 'Startup' },
              ].map((it) => (
                <Pressable
                  key={it.k}
                  testID={`export-csv-${it.k}`}
                  onPress={() => exportFile('csv', it.k)}
                  style={[styles.exportBtn, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
                >
                  <Ionicons name="download-outline" size={14} color={c.onSurface} />
                  <Text style={{ color: c.onSurface, fontWeight: '600', fontSize: 13 }}>{it.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function EmptyReport({ c, label }: any) {
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
      <Ionicons name="bar-chart-outline" size={36} color={c.muted} />
      <Text style={{ color: c.onSurfaceSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function ReportCol({ c, label, color, items }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.onSurfaceSecondary, fontSize: 11, fontWeight: '500' }}>{label}</Text>
      {items.length === 0 ? <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>—</Text> : items.map((x: any) => (
        <Text key={x.cur} style={{ color, fontWeight: '600', fontSize: 12, marginTop: 4 }}>
          {formatMoney(x.v, x.cur)}
        </Text>
      ))}
    </View>
  );
}

function CategoryRow({ cat, c }: any) {
  return (
    <View style={[styles.catRow, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
      <Text style={{ color: c.onSurface, fontWeight: '600', fontSize: 14, flex: 1 }}>{cat.category}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        {CURRENCIES.map((cur) => {
          const v = cat[cur];
          if (!v) return null;
          return <Text key={cur} style={{ color: c.onSurface, fontSize: 13, fontWeight: '500' }}>{formatMoney(v, cur)}</Text>;
        })}
      </View>
    </View>
  );
}

function FlowRow({ c, label, v, sign, color }: any) {
  if (!v) return null;
  return (
    <View style={styles.flowRow}>
      <Text style={{ color: c.onSurfaceSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color, fontWeight: '600', fontSize: 13 }}>{sign}{formatMoney(v, '')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  gridRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.sm },
  catRow: { flexDirection: 'row', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm, alignItems: 'center' },
  currencyLabel: { fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  flowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  exportSection: { marginTop: spacing.xl },
  exportPdfBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  exportSubLabel: { fontSize: 12, fontWeight: '600', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
});
