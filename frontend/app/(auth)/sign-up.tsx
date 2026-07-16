import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/ctx/auth';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius } from '@/src/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const { c } = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!email || !password) { setErr('Email and password required'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim() || undefined);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.surface }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Pressable testID="sign-up-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={c.onSurface} />
          </Pressable>

          <Text style={[styles.title, { color: c.onSurface }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: c.onSurfaceSecondary }]}>
            Start tracking EBA Consulting&apos;s finances
          </Text>

          <Text style={[styles.label, { color: c.onSurfaceSecondary }]}>Name (optional)</Text>
          <TextInput
            testID="sign-up-name-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            placeholder="Erkan"
            placeholderTextColor={c.muted}
            value={name}
            onChangeText={setName}
          />

          <Text style={[styles.label, { color: c.onSurfaceSecondary }]}>Email</Text>
          <TextInput
            testID="sign-up-email-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            placeholder="you@ebaconsulting.com"
            placeholderTextColor={c.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.label, { color: c.onSurfaceSecondary }]}>Password</Text>
          <TextInput
            testID="sign-up-password-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            placeholder="At least 6 characters"
            placeholderTextColor={c.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {err && <Text testID="sign-up-error" style={[styles.err, { color: c.error }]}>{err}</Text>}

          <Pressable
            testID="sign-up-submit-button"
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.brand, opacity: pressed || submitting ? 0.85 : 1 },
            ]}
          >
            {submitting
              ? <ActivityIndicator color={c.onBrand} />
              : <Text style={[styles.ctaText, { color: c.onBrand }]}>Create account</Text>}
          </Pressable>

          <View style={styles.footer}>
            <Text style={{ color: c.onSurfaceSecondary }}>Already have one? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable testID="sign-up-goto-signin">
                <Text style={{ color: c.brand, fontWeight: '600' }}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center', marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '700', marginBottom: spacing.xs },
  subtitle: { fontSize: 14, marginBottom: spacing.xl },
  label: { fontSize: 13, fontWeight: '500', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16 },
  err: { marginTop: spacing.md, fontSize: 13 },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl, minHeight: 52, justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
