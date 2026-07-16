import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/ctx/auth';
import { useTheme } from '@/src/ctx/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const { c } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/(tabs)/dashboard');
    else router.replace('/(auth)/sign-in');
  }, [user, loading]);

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ActivityIndicator color={c.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
