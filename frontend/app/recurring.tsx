import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList, Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius, CURRENCIES, formatMoney } from '@/src/theme';
import { LabeledInput, Chips } from '@/src/components/FormFields';

type Rule = {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'startup';
  frequency: 'weekly' | 'monthly' | 'yearly';
  next_run: string;
  active: boolean;
  posted_count: number;
  last_posted?: string;
  template: any;
};

const KINDS = ['expense', 'income', 'startup'] as const;
const FREQ = ['monthly', 'weekly', 'yearly'] as const;
const EXPENSE_CATEGORIES = ['Office', 'Software', 'Internet', 'Marketing', 'Travel', 'Education', 'Equipment', 'Professional Services', 'Other'];
const STARTUP_CATEGORIES = ['Company Registration', 'Lawyer', 'Accountant', 'Government Fees', 'Company Stamp', 'Website', 'Domain', 'Logo', 'Office Setup', 'Initial Equipment', 'Other'];
const PAID_BY = ['Personal', 'Company', 'Bahar', 'Other'];

const KIND_META = {
  income: { icon: 'trending-up-outline', label: 'Income' },
  expense: { icon: 'card-outline', label: 'Expense' },
  startup: { icon: 'rocket-outline', label: 'Startup Cost' },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function RecurringScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income' | 'startup'>('expense');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [nextRun, setNextRun] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Software');
  const [paidBy, setPaidBy] = useState('Company');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resetForm = () => {
    setName(''); setKind('expense'); setFrequency('monthly'); setNextRun(todayISO());
    setAmount(''); setCurrency('EUR'); setVendor(''); setDescription('');
    setCategory('Software'); setPaidBy('Company');
    setEditingId(null); setErr(null);
  };

  const load = useCallback(async () => {
    try {
      const r = await api.get<Rule[]>('/recurring');
      setRules(r);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setName(rule.name);
    setKind(rule.kind);
    setFrequency(rule.frequency);
    setNextRun(rule.next_run);
    setAmount(String(rule.template.amount || ''));
    setCurrency(rule.template.currency || 'EUR');
    setVendor(rule.template.vendor || rule.template.client_name || '');
    setDescription(rule.template.description || rule.template.service_description || '');
    setCategory(rule.template.category || (rule.kind === 'startup' ? 'Company Registration' : 'Software'));
    setPaidBy(rule.template.paid_by || 'Company');
    setShowForm(true);
  };

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Name is required'); return; }
    const n = parseFloat(amount.replace(',', '.'));
    if (isNaN(n) || n <= 0) { setErr('Enter a valid amount'); return; }
    if (kind === 'expense' && !vendor.trim()) { setErr('Vendor required for expenses'); return; }
    if (kind === 'income' && !vendor.trim()) { setErr('Client name required for income'); return; }
    if (!description.trim()) { setErr('Description required'); return; }

    const template: any = {
      amount: n, currency,
      description: description.trim(),
    };
    if (kind === 'expense') {
      template.category = category;
      template.vendor = vendor.trim();
      template.paid_by = paidBy;
    } else if (kind === 'income') {
      template.client_name = vendor.trim();
      template.service_description = description.trim();
      template.status = 'paid';
    } else {
      template.category = category;
      template.paid_by = paidBy;
    }

    const payload = { name: name.trim(), kind, frequency, next_run: nextRun, active: true, template };
    setSaving(true);
    try {
      if (editingId) await api.put(`/recurring/${editingId}`, payload);
      else await api.post('/recurring', payload);
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: Rule) => {
    const payload = {
      name: rule.name, kind: rule.kind, frequency: rule.frequency,
      next_run: rule.next_run, active: !rule.active, template: rule.template,
    };
    await api.put(`/recurring/${rule.id}`, payload);
    load();
  };

  const del = async (id: string) => {
    await api.del(`/recurring/${id}`);
    load();
  };

  const activeCategories = kind === 'startup' ? STARTUP_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Pressable testID="recurring-back" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={c.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: c.onSurface }]}>Recurring</Text>
          <Pressable
            testID="recurring-toggle-form"
            onPress={() => { if (showForm) { resetForm(); } setShowForm(!showForm); }}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color={c.brand} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <View style={[styles.heroCard, { backgroundColor: c.brand }]}>
          <View style={[styles.heroIcon, { backgroundColor: c.onBrand + '25' }]}>
            <Ionicons name="repeat" size={20} color={c.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroLabel, { color: c.onBrand + 'CC' }]}>Auto-post scheduler</Text>
            <Text style={[styles.heroBody, { color: c.onBrand }]}>
              Rules post entries automatically each time you open the app. Pause anytime.
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {showForm && (
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.formTitle, { color: c.onSurface }]}>{editingId ? 'Edit Rule' : 'New Recurring Rule'}</Text>
            <LabeledInput testID="recurring-name" label="Rule Name *" value={name} onChangeText={setName} placeholder="Notion subscription" />
            <Chips label="Type" options={[...KINDS]} value={kind} onChange={(v) => setKind(v as any)} testIDPrefix="recurring-kind" />
            <Chips label="Frequency" options={[...FREQ]} value={frequency} onChange={(v) => setFrequency(v as any)} testIDPrefix="recurring-freq" />
            <LabeledInput testID="recurring-next-run" label="Next Post Date *" value={nextRun} onChangeText={setNextRun} placeholder="YYYY-MM-DD" />

            {kind !== 'income' && (
              <Chips label="Category" options={activeCategories} value={category} onChange={setCategory} testIDPrefix="recurring-category" />
            )}
            <LabeledInput
              testID="recurring-vendor"
              label={kind === 'income' ? 'Client Name *' : 'Vendor *'}
              value={vendor}
              onChangeText={setVendor}
              placeholder={kind === 'income' ? 'Acme Ltd.' : 'Notion Labs'}
            />
            <LabeledInput
              testID="recurring-description"
              label={kind === 'income' ? 'Service Description *' : 'Description *'}
              value={description}
              onChangeText={setDescription}
              placeholder="Monthly team plan"
              multiline
            />
            <LabeledInput testID="recurring-amount" label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <Chips label="Currency" options={[...CURRENCIES]} value={currency} onChange={setCurrency} testIDPrefix="recurring-currency" />
            {kind !== 'income' && (
              <Chips label="Paid By" options={PAID_BY} value={paidBy} onChange={setPaidBy} testIDPrefix="recurring-paidby" />
            )}

            {err && <Text testID="recurring-error" style={{ color: c.error, fontSize: 13, marginBottom: spacing.md }}>{err}</Text>}
            <Pressable
              testID="recurring-save"
              onPress={submit}
              disabled={saving}
              style={({ pressed }) => [styles.cta, { backgroundColor: c.brand, opacity: pressed || saving ? 0.85 : 1 }]}
            >
              {saving ? <ActivityIndicator color={c.onBrand} /> : <Text style={{ color: c.onBrand, fontWeight: '600', fontSize: 15 }}>{editingId ? 'Update Rule' : 'Save & Post Now'}</Text>}
            </Pressable>
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.loader}><ActivityIndicator color={c.brand} /></View>
        ) : (
          <FlatList
            data={rules}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="repeat-outline" size={40} color={c.muted} />
                <Text style={{ color: c.onSurfaceSecondary, fontSize: 15, marginTop: spacing.sm, fontWeight: '600' }}>No recurring rules</Text>
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>Tap + to set up your first subscription or rent auto-post.</Text>
              </View>
            }
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => {
              const kindMeta = KIND_META[item.kind];
              return (
                <Pressable
                  testID={`recurring-row-${item.id}`}
                  onPress={() => openEdit(item)}
                  style={({ pressed }) => [styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border, opacity: pressed ? 0.85 : (item.active ? 1 : 0.6) }]}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.active ? c.brandTertiary : c.surfaceTertiary }]}>
                    <Ionicons name={kindMeta.icon as any} size={18} color={item.active ? c.brand : c.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: c.onSurface }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.rowSub, { color: c.onSurfaceSecondary }]} numberOfLines={1}>
                      {kindMeta.label} • {item.frequency} • {formatMoney(item.template.amount, item.template.currency)}
                    </Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>
                      Next {item.next_run} • {item.posted_count} posted
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Switch
                      testID={`recurring-toggle-${item.id}`}
                      value={item.active}
                      onValueChange={() => toggleActive(item)}
                      trackColor={{ true: c.brand, false: c.borderStrong }}
                    />
                    <Pressable onPress={() => del(item.id)} hitSlop={10} testID={`recurring-delete-${item.id}`}>
                      <Ionicons name="trash-outline" size={16} color={c.muted} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
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
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  heroIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  heroBody: { fontSize: 13, lineHeight: 18 },
  formTitle: { fontSize: 16, fontWeight: '700', marginBottom: spacing.md },
  cta: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm, minHeight: 48, justifyContent: 'center' },
  loader: { padding: spacing.xl, alignItems: 'center' },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 3 },
  rowMeta: { fontSize: 11, marginTop: 3 },
});
