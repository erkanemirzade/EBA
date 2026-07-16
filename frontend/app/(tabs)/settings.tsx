import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/ctx/auth';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius } from '@/src/theme';

export default function SettingsScreen() {
  const { c, isDark, mode, setMode } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.onSurface }]}>Settings</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <View style={[styles.profileCard, { backgroundColor: c.brand }]}>
          <View style={styles.avatar}>
            <Text style={{ color: c.brand, fontWeight: '700', fontSize: 20 }}>
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="settings-user-name" style={{ color: c.onBrand, fontSize: 16, fontWeight: '700' }}>{user?.name || 'User'}</Text>
            <Text style={{ color: c.onBrand + 'CC', fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
          </View>
        </View>

        {/* Preferences */}
        <Text style={[styles.section, { color: c.onSurfaceSecondary }]}>Preferences</Text>
        <View style={[styles.group, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <View style={[styles.row, { borderBottomColor: c.divider }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="moon-outline" size={20} color={c.onSurface} />
              <Text style={{ color: c.onSurface, fontSize: 15 }}>Dark Mode</Text>
            </View>
            <Switch
              testID="settings-dark-mode-toggle"
              value={isDark}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ true: c.brand, false: c.borderStrong }}
            />
          </View>
          <Pressable
            testID="settings-theme-system"
            onPress={() => setMode('system')}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="phone-portrait-outline" size={20} color={c.onSurface} />
              <Text style={{ color: c.onSurface, fontSize: 15 }}>Match System Theme</Text>
            </View>
            {mode === 'system' && <Ionicons name="checkmark-circle" size={20} color={c.brand} />}
          </Pressable>
        </View>

        {/* Data */}
        <Text style={[styles.section, { color: c.onSurfaceSecondary }]}>Data</Text>
        <View style={[styles.group, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Pressable
            testID="settings-investment"
            onPress={() => router.push('/investments' as any)}
            style={[styles.row, { borderBottomColor: c.divider }]}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="wallet-outline" size={20} color={c.onSurface} />
              <Text style={{ color: c.onSurface, fontSize: 15 }}>Personal Investment</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="cash-outline" size={20} color={c.onSurface} />
              <Text style={{ color: c.onSurface, fontSize: 15 }}>Currencies</Text>
            </View>
            <Text style={{ color: c.onSurfaceSecondary, fontSize: 13 }}>EUR • TRY • GBP</Text>
          </View>
        </View>

        {/* Account */}
        <Text style={[styles.section, { color: c.onSurfaceSecondary }]}>Account</Text>
        <View style={[styles.group, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Pressable
            testID="settings-signout"
            onPress={signOut}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color={c.error} />
              <Text style={{ color: c.error, fontSize: 15, fontWeight: '600' }}>Sign Out</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: c.muted }]}>EBA Finance Tracker • v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.lg },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 12, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { textAlign: 'center', fontSize: 12, marginTop: spacing.xl },
});
