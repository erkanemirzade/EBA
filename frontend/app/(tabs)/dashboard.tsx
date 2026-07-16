import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useAuth } from '@/src/ctx/auth';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, formatMoney, CURRENCIES } from '@/src/theme';

type Summary = {
  total_income: Record<string, number>;
  pending_income: Record<string, number>;
  total_expenses: Record<string, number>;
  total_startup: Record<string, number>;
  total_investments: Record<string, number>;
  net_cash: Record<string, number>;
  available_cash: Record<string, number>;
};

type Tx = { id: string; date: string; amount: number; currency: string; description?: string; kind: string; label: string };

export default function Dashboard() {
  const { c } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<Summary>('/summary');
      setSummary(s);
      const [inc, exp, st] = await Promise.all([
        api.get<any[]>('/income'),
        api.get<any[]>('/expenses'),
        api.get<any[]>('/startup-costs'),
      ]);
      const combined: Tx[] = [
        ...inc.map((r) => ({ id: r.id, date: r.date, amount: r.amount, currency: r.currency, description: r.client_name, kind: 'income', label: 'Income' })),
        ...exp.map((r) => ({ id: r.id, date: r.date, amount: -r.amount, currency: r.currency, description: r.vendor, kind: 'expense', label: r.category })),
        ...st.map((r) => ({ id: r.id, date: r.date, amount: -r.amount, currency: r.currency, description: r.description, kind: 'startup', label: r.category })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
      setRecent(combined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const cards = summary ? [
    { key: 'income', label: 'Total Income', icon: 'trending-up', color: c.success, values: summary.total_income },
    { key: 'expenses', label: 'Operating Expenses', icon: 'trending-down', color: c.error, values: summary.total_expenses },
    { key: 'startup', label: 'Startup Costs', icon: 'rocket', color: c.warning, values: summary.total_startup },
    { key: 'net', label: 'Net Cash Balance', icon: 'scale', color: c.brand, values: summary.net_cash },
    { key: 'investment', label: 'Personal Investment', icon: 'wallet', color: c.brand, values: summary.total_investments },
    { key: 'available', label: 'Available Cash', icon: 'cash', color: c.success, values: summary.available_cash },
  ] : [];

  // Currency risk exposure: detect if income concentration in one currency is >60%
  // while expenses lean heavily on another → recommend hedge / invoicing shift.
  const currencyInsight = (() => {
    if (!summary) return null;
    const totalIncome = CURRENCIES.reduce((s, cur) => s + (summary.total_income[cur] || 0), 0);
    const totalPending = CURRENCIES.reduce((s, cur) => s + (summary.pending_income[cur] || 0), 0);
    const totalExpense = CURRENCIES.reduce((s, cur) => s + (summary.total_expenses[cur] || 0), 0);
    if (totalIncome + totalPending < 100) return null;

    const shares = CURRENCIES.map((cur) => ({
      cur,
      incShare: totalIncome > 0 ? (summary.total_income[cur] || 0) / totalIncome : 0,
      pendShare: totalPending > 0 ? (summary.pending_income[cur] || 0) / totalPending : 0,
      expShare: totalExpense > 0 ? (summary.total_expenses[cur] || 0) / totalExpense : 0,
    }));

    const domIncome = shares.reduce((a, b) => (b.incShare > a.incShare ? b : a));
    const domExpense = shares.reduce((a, b) => (b.expShare > a.expShare ? b : a));

    // Pending-heavy warning
    if (totalPending > totalIncome && totalPending > 0) {
      const domPend = shares.reduce((a, b) => (b.pendShare > a.pendShare ? b : a));
      return {
        tone: 'warning' as const,
        title: 'Cash flow risk',
        body: `You're holding ${Math.round(domPend.pendShare * 100)}% of pending receivables in ${domPend.cur}. Follow up on invoices to unlock cash.`,
      };
    }

    // Mismatch: income currency ≠ dominant expense currency
    if (domIncome.cur !== domExpense.cur && domIncome.incShare > 0.6 && domExpense.expShare > 0.4) {
      return {
        tone: 'warning' as const,
        title: 'FX exposure',
        body: `${Math.round(domIncome.incShare * 100)}% of your income is in ${domIncome.cur} but ${Math.round(domExpense.expShare * 100)}% of expenses are in ${domExpense.cur}. Consider invoicing more in ${domExpense.cur} to hedge.`,
      };
    }

    // Concentration risk
    if (domIncome.incShare > 0.8) {
      return {
        tone: 'info' as const,
        title: 'Currency concentration',
        body: `${Math.round(domIncome.incShare * 100)}% of your income sits in ${domIncome.cur}. Diversifying across currencies can reduce FX risk.`,
      };
    }

    // Healthy state
    return {
      tone: 'success' as const,
      title: 'Currency balance looks healthy',
      body: 'Your income and expenses are well distributed across currencies.',
    };
  })();

  // Compute chart data (income vs expense by currency)
  const chartMax = summary ? Math.max(
    ...CURRENCIES.flatMap((cur) => [summary.total_income[cur] || 0, summary.total_expenses[cur] || 0]),
    1
  ) : 1;

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.hi, { color: c.onSurfaceSecondary }]}>Welcome back,</Text>
            <Text testID="dashboard-user-name" style={[styles.name, { color: c.onSurface }]}>{user?.name || 'Erkan'}</Text>
          </View>
          <Pressable
            testID="dashboard-open-investment"
            onPress={() => router.push('/investments' as any)}
            style={[styles.iconBtn, { backgroundColor: c.brandTertiary }]}
          >
            <Ionicons name="wallet-outline" size={20} color={c.brand} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardsGrid}>
            {cards.map((card) => (
              <View
                key={card.key}
                testID={`summary-card-${card.key}`}
                style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
              >
                <View style={[styles.cardIcon, { backgroundColor: card.color + '18' }]}>
                  <Ionicons name={card.icon as any} size={16} color={card.color} />
                </View>
                <Text style={[styles.cardLabel, { color: c.onSurfaceSecondary }]}>{card.label}</Text>
                {CURRENCIES.map((cur) => (
                  <Text key={cur} style={[styles.cardAmount, { color: c.onSurface }]} numberOfLines={1}>
                    {formatMoney(card.values[cur] || 0, cur)}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          {currencyInsight && (
            <View
              testID="currency-insight-card"
              style={[
                styles.insightCard,
                {
                  backgroundColor:
                    currencyInsight.tone === 'warning' ? c.warning + '15' :
                    currencyInsight.tone === 'success' ? c.success + '15' : c.brandTertiary,
                  borderColor:
                    currencyInsight.tone === 'warning' ? c.warning + '40' :
                    currencyInsight.tone === 'success' ? c.success + '40' : c.brand + '30',
                },
              ]}
            >
              <View style={[styles.insightIcon, {
                backgroundColor:
                  currencyInsight.tone === 'warning' ? c.warning :
                  currencyInsight.tone === 'success' ? c.success : c.brand,
              }]}>
                <Ionicons
                  name={
                    currencyInsight.tone === 'warning' ? 'warning' :
                    currencyInsight.tone === 'success' ? 'checkmark' : 'sparkles'
                  }
                  size={14}
                  color="#FFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: c.onSurface }]}>{currencyInsight.title}</Text>
                <Text style={[styles.insightBody, { color: c.onSurfaceSecondary }]}>{currencyInsight.body}</Text>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Income vs Expenses</Text>
          <View style={[styles.chartCard, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            {CURRENCIES.map((cur) => {
              const inc = summary?.total_income[cur] || 0;
              const exp = summary?.total_expenses[cur] || 0;
              return (
                <View key={cur} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.chartLabel, { color: c.onSurfaceSecondary }]}>{cur}</Text>
                  <View style={styles.chartRow}>
                    <View style={styles.chartBarWrap}>
                      <View style={[styles.chartBar, { width: `${(inc / chartMax) * 100}%`, backgroundColor: c.success }]} />
                    </View>
                    <Text style={[styles.chartValue, { color: c.onSurface }]}>{formatMoney(inc, cur)}</Text>
                  </View>
                  <View style={styles.chartRow}>
                    <View style={styles.chartBarWrap}>
                      <View style={[styles.chartBar, { width: `${(exp / chartMax) * 100}%`, backgroundColor: c.error }]} />
                    </View>
                    <Text style={[styles.chartValue, { color: c.onSurface }]}>{formatMoney(exp, cur)}</Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c.success }]} /><Text style={[styles.legendText, { color: c.onSurfaceSecondary }]}>Income</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c.error }]} /><Text style={[styles.legendText, { color: c.onSurfaceSecondary }]}>Expenses</Text></View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Recent Transactions</Text>
          {recent.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Ionicons name="receipt-outline" size={32} color={c.muted} />
              <Text style={[styles.emptyText, { color: c.onSurfaceSecondary }]}>
                No transactions yet. Start by adding income or an expense.
              </Text>
            </View>
          ) : (
            <View style={[styles.list, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              {recent.map((tx, i) => (
                <View key={tx.id} style={[styles.listItem, i < recent.length - 1 && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.txIcon, { backgroundColor: tx.kind === 'income' ? c.success + '18' : c.error + '18' }]}>
                    <Ionicons
                      name={tx.kind === 'income' ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={tx.kind === 'income' ? c.success : c.error}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txLabel, { color: c.onSurface }]} numberOfLines={1}>{tx.description || tx.label}</Text>
                    <Text style={[styles.txSub, { color: c.onSurfaceSecondary }]}>{tx.label} • {tx.date}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.amount >= 0 ? c.success : c.onSurface }]}>
                    {tx.amount >= 0 ? '+' : '-'}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  hi: { fontSize: 13 },
  name: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  card: { width: '48%', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md, minHeight: 116 },
  cardIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  cardLabel: { fontSize: 11, fontWeight: '500', marginBottom: spacing.xs },
  cardAmount: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  insightCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.xs, marginBottom: spacing.md },
  insightIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightTitle: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  insightBody: { fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.md },
  chartCard: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  chartLabel: { fontSize: 12, fontWeight: '600', marginBottom: spacing.xs },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  chartBarWrap: { flex: 1, height: 12, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 6, overflow: 'hidden', marginRight: spacing.sm },
  chartBar: { height: '100%', borderRadius: 6 },
  chartValue: { fontSize: 12, fontWeight: '600', minWidth: 70, textAlign: 'right' },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  empty: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm },
  emptyText: { textAlign: 'center', fontSize: 13 },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  txIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txLabel: { fontSize: 14, fontWeight: '600' },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});
