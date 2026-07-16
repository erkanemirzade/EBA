import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, CURRENCIES } from '@/src/theme';
import { LabeledInput, Chips } from '@/src/components/FormFields';

const CATEGORIES = ['Office', 'Software', 'Internet', 'Marketing', 'Travel', 'Education', 'Equipment', 'Professional Services', 'Other'];
const PAID_BY = ['Personal', 'Company', 'Bahar', 'Other'];

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function ExpenseForm() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('Office');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [payMethod, setPayMethod] = useState('');
  const [paidBy, setPaidBy] = useState('Company');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const rows = await api.get<any[]>('/expenses');
        const item = rows.find((r) => r.id === id);
        if (item) {
          setDate(item.date);
          setCategory(item.category);
          setVendor(item.vendor);
          setDescription(item.description);
          setAmount(String(item.amount));
          setCurrency(item.currency);
          setPayMethod(item.payment_method || '');
          setPaidBy(item.paid_by || 'Company');
          setNotes(item.notes || '');
        }
      } finally { setLoading(false); }
    })();
  }, [id, editing]);

  const save = async () => {
    setErr(null);
    if (!vendor || !description || !amount) { setErr('Vendor, description, and amount required'); return; }
    const n = parseFloat(amount.replace(',', '.'));
    if (isNaN(n) || n <= 0) { setErr('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const payload = {
        date, category, vendor, description, amount: n, currency,
        payment_method: payMethod || undefined, paid_by: paidBy,
        notes: notes || undefined,
      };
      if (editing) await api.put(`/expenses/${id}`, payload);
      else await api.post('/expenses', payload);
      router.back();
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Pressable testID="expense-form-close" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={c.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: c.onSurface }]}>{editing ? 'Edit Expense' : 'New Expense'}</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Chips label="Category" options={CATEGORIES} value={category} onChange={setCategory} testIDPrefix="expense-form-category" />
          <LabeledInput testID="expense-form-vendor" label="Vendor *" value={vendor} onChangeText={setVendor} placeholder="Notion Labs" />
          <LabeledInput testID="expense-form-description" label="Description *" value={description} onChangeText={setDescription} placeholder="Monthly subscription" multiline />
          <LabeledInput testID="expense-form-amount" label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
          <Chips label="Currency" options={[...CURRENCIES]} value={currency} onChange={setCurrency} testIDPrefix="expense-form-currency" />
          <Chips label="Paid By" options={PAID_BY} value={paidBy} onChange={setPaidBy} testIDPrefix="expense-form-paidby" />
          <LabeledInput testID="expense-form-paymethod" label="Payment Method" value={payMethod} onChangeText={setPayMethod} placeholder="Credit Card" />
          <LabeledInput testID="expense-form-date" label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <LabeledInput testID="expense-form-notes" label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

          {err && <Text testID="expense-form-error" style={{ color: c.error, fontSize: 13, marginBottom: spacing.md }}>{err}</Text>}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Pressable
            testID="expense-form-save"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.cta, { backgroundColor: c.brand, opacity: pressed || saving ? 0.85 : 1 }]}
          >
            {saving ? <ActivityIndicator color={c.onBrand} /> : <Text style={[styles.ctaText, { color: c.onBrand }]}>{editing ? 'Update' : 'Save Expense'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: 17, fontWeight: '700' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.xl },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '600' },
});
