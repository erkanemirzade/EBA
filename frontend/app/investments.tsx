import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, CURRENCIES, formatMoney } from '@/src/theme';
import { LabeledInput, Chips } from '@/src/components/FormFields';

type Inv = { id: string; date: string; amount: number; currency: string; description?: string };

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function Investments() {
  const { c } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Inv[]>('/investments');
      setRows(r);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals: Record<string, number> = { EUR: 0, TRY: 0, GBP: 0 };
  rows.forEach((r) => { if (totals[r.currency] !== undefined) totals[r.currency] += r.amount; });

  const save = async () => {
    setErr(null);
    const n = parseFloat(amount.replace(',', '.'));
    if (isNaN(n) || n <= 0) { setErr('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api.post('/investments', { date, amount: n, currency, description: description || undefined });
      setAmount(''); setDescription(''); setShowForm(false);
      load();
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    await api.del(`/investments/${id}`);
    load();
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Pressable testID="investments-back" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={c.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: c.onSurface }]}>Personal Investment</Text>
          <Pressable testID="investments-toggle-form" onPress={() => setShowForm(!showForm)} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color={c.brand} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={[styles.heroCard, { backgroundColor: c.brand }]}>
          <Text style={[styles.heroLabel, { color: c.onBrand + 'CC' }]}>Total Personal Investment</Text>
          {CURRENCIES.map((cur) => (
            <Text key={cur} testID={`investment-total-${cur}`} style={[styles.heroAmount, { color: c.onBrand }]}>
              {formatMoney(totals[cur], cur)}
            </Text>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {showForm && (
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <LabeledInput testID="investment-amount" label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <Chips label="Currency" options={[...CURRENCIES]} value={currency} onChange={setCurrency} testIDPrefix="investment-currency" />
            <LabeledInput testID="investment-description" label="Description" value={description} onChangeText={setDescription} placeholder="Initial capital" />
            <LabeledInput testID="investment-date" label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            {err && <Text testID="investment-error" style={{ color: c.error, fontSize: 13, marginBottom: spacing.md }}>{err}</Text>}
            <Pressable
              testID="investment-save"
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [styles.cta, { backgroundColor: c.brand, opacity: pressed || saving ? 0.85 : 1 }]}
            >
              {saving ? <ActivityIndicator color={c.onBrand} /> : <Text style={[styles.ctaText, { color: c.onBrand }]}>Save Investment</Text>}
            </Pressable>
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.loader}><ActivityIndicator color={c.brand} /></View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="wallet-outline" size={40} color={c.muted} />
                <Text style={{ color: c.onSurfaceSecondary, fontSize: 14, marginTop: spacing.sm }}>No investments recorded yet</Text>
              </View>
            }
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <View testID={`investment-row-${item.id}`} style={[styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
                <View style={[styles.iconBox, { backgroundColor: c.brandTertiary }]}>
                  <Ionicons name="wallet" size={16} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: c.onSurface }]}>{item.description || 'Investment'}</Text>
                  <Text style={[styles.rowSub, { color: c.onSurfaceSecondary }]}>{item.date}</Text>
                </View>
                <Text style={[styles.amount, { color: c.brand }]}>+{formatMoney(item.amount, item.currency)}</Text>
                <Pressable onPress={() => del(item.id)} hitSlop={10} testID={`investment-delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={16} color={c.muted} />
                </Pressable>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: 17, fontWeight: '700' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heroCard: { padding: spacing.lg, borderRadius: radius.md, marginTop: spacing.sm, marginBottom: spacing.md },
  heroLabel: { fontSize: 12, fontWeight: '500', marginBottom: spacing.sm },
  heroAmount: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  cta: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm, minHeight: 48, justifyContent: 'center' },
  ctaText: { fontSize: 15, fontWeight: '600' },
  loader: { padding: spacing.xl, alignItems: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
});
