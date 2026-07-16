import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, CURRENCIES } from '@/src/theme';
import { LabeledInput, Chips } from '@/src/components/FormFields';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function IncomeForm() {
  const { c } = useTheme();
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [client, setClient] = useState('');
  const [service, setService] = useState('');
  const [invoice, setInvoice] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [status, setStatus] = useState('paid');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!client || !service || !amount) { setErr('Client, service, and amount are required'); return; }
    const n = parseFloat(amount.replace(',', '.'));
    if (isNaN(n) || n <= 0) { setErr('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api.post('/income', {
        date, client_name: client, service_description: service,
        invoice_number: invoice || undefined, amount: n, currency, status,
        notes: notes || undefined,
      });
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
          <Pressable testID="income-form-close" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={c.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: c.onSurface }]}>New Income</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <LabeledInput testID="income-form-client" label="Client Name *" value={client} onChangeText={setClient} placeholder="Acme Ltd." />
          <LabeledInput testID="income-form-service" label="Service Description *" value={service} onChangeText={setService} placeholder="Consulting services" multiline />
          <LabeledInput testID="income-form-invoice" label="Invoice Number" value={invoice} onChangeText={setInvoice} placeholder="INV-001" />
          <LabeledInput testID="income-form-amount" label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
          <Chips label="Currency" options={[...CURRENCIES]} value={currency} onChange={setCurrency} testIDPrefix="income-form-currency" />
          <Chips label="Payment Status" options={['paid', 'pending']} value={status} onChange={setStatus} testIDPrefix="income-form-status" />
          <LabeledInput testID="income-form-date" label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <LabeledInput testID="income-form-notes" label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

          {err && <Text testID="income-form-error" style={{ color: c.error, fontSize: 13, marginBottom: spacing.md }}>{err}</Text>}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Pressable
            testID="income-form-save"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.cta, { backgroundColor: c.brand, opacity: pressed || saving ? 0.85 : 1 }]}
          >
            {saving ? <ActivityIndicator color={c.onBrand} /> : <Text style={[styles.ctaText, { color: c.onBrand }]}>Save Income</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
