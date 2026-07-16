import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/ctx/auth';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius } from '@/src/theme';

const HERO_LIGHT = 'https://images.unsplash.com/photo-1483366774565-c783b9f70e2c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwbW9kZXJuJTIwd2hpdGUlMjBvZmZpY2UlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg0MTc0NDE2fDA&ixlib=rb-4.1.0&q=85';
const HERO_DARK = 'https://images.unsplash.com/photo-1614850523011-8f49ffc73908?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBuYXZ5JTIwYmx1ZSUyMGFic3RyYWN0JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODQxNzQ0MTd8MA&ixlib=rb-4.1.0&q=85';

export default function SignIn() {
  const { signIn } = useAuth();
  const { c, isDark } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSignIn = async () => {
    setErr(null);
    if (!email || !password) { setErr('Enter email and password'); return; }
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setErr(e.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <View style={styles.hero}>
        <Image
          source={{ uri: isDark ? HERO_DARK : HERO_LIGHT }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', c.surface]}
          style={StyleSheet.absoluteFill}
          locations={[0.3, 1]}
        />
        <SafeAreaView edges={['top']} style={styles.heroContent}>
          <View style={[styles.badge, { backgroundColor: c.brand }]}>
            <Ionicons name="pie-chart" size={18} color={c.onBrand} />
          </View>
          <Text style={[styles.brandTitle, { color: c.onSurface }]}>EBA Finance</Text>
          <Text style={[styles.brandSub, { color: c.onSurfaceSecondary }]}>Consulting Ltd.</Text>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.formWrap}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: c.onSurface }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: c.onSurfaceSecondary }]}>Sign in to track your company&apos;s finances</Text>

          <Text style={[styles.label, { color: c.onSurfaceSecondary }]}>Email</Text>
          <TextInput
            testID="sign-in-email-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            placeholder="you@ebaconsulting.com"
            placeholderTextColor={c.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={[styles.label, { color: c.onSurfaceSecondary }]}>Password</Text>
          <TextInput
            testID="sign-in-password-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            placeholder="••••••••"
            placeholderTextColor={c.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {err && <Text testID="sign-in-error" style={[styles.err, { color: c.error }]}>{err}</Text>}

          <Pressable
            testID="sign-in-submit-button"
            onPress={handleSignIn}
            disabled={submitting}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.brand, opacity: pressed || submitting ? 0.85 : 1 },
            ]}
          >
            {submitting
              ? <ActivityIndicator color={c.onBrand} />
              : <Text style={[styles.ctaText, { color: c.onBrand }]}>Sign In</Text>}
          </Pressable>

          <View style={styles.footer}>
            <Text style={{ color: c.onSurfaceSecondary }}>New here? </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable testID="sign-in-goto-signup">
                <Text style={{ color: c.brand, fontWeight: '600' }}>Create account</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { height: 260, width: '100%' },
  heroContent: { flex: 1, alignItems: 'flex-start', justifyContent: 'flex-end', padding: spacing.xl, paddingBottom: spacing.lg },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  brandTitle: { fontSize: 28, fontWeight: '700' },
  brandSub: { fontSize: 14, marginTop: 2 },
  formWrap: { flex: 1 },
  form: { padding: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.xs },
  subtitle: { fontSize: 14, marginBottom: spacing.xl },
  label: { fontSize: 13, fontWeight: '500', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16 },
  err: { marginTop: spacing.md, fontSize: 13 },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl, minHeight: 52, justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
