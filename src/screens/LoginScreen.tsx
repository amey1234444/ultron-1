import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      void router.replace(next);
    }
  }, [loading, user, router]);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      await router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-surface-dark px-6 py-12">
      <View className="w-full max-w-sm rounded-2xl border border-line-dark bg-surface-darkpanel p-7">
        <Text className="font-wordmark text-2xl tracking-widest text-ink">ULTRON</Text>
        <Text className="mt-1 font-body text-sm text-ink-muted">Sign in to continue</Text>

        <View className="mt-7 gap-1.5">
          <Text className="font-body-medium text-xs uppercase tracking-wide text-ink-muted">Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="username"
            placeholderTextColor="#5A5A5A"
            onSubmitEditing={onSubmit}
            className="rounded-xl border border-line-dark bg-surface-dark px-4 py-3 font-body text-base text-ink"
          />
        </View>

        <View className="mt-4 gap-1.5">
          <Text className="font-body-medium text-xs uppercase tracking-wide text-ink-muted">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#5A5A5A"
            onSubmitEditing={onSubmit}
            className="rounded-xl border border-line-dark bg-surface-dark px-4 py-3 font-body text-base text-ink"
          />
        </View>

        {error ? (
          <Text className="mt-4 font-body text-sm text-status-critical">{error}</Text>
        ) : null}

        <Pressable
          onPress={submitting ? undefined : onSubmit}
          accessibilityState={{ disabled: submitting }}
          className={`mt-6 items-center rounded-xl bg-ink px-4 py-3 ${submitting ? 'opacity-50' : ''}`}
        >
          {submitting ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text className="font-body-bold text-sm text-ink-inverse">Sign In</Text>
          )}
        </Pressable>

        <Text className="mt-6 font-body text-xs leading-5 text-ink-muted">
          Demo accounts — superadmin / admin / user (default passwords in README).
        </Text>
      </View>
    </View>
  );
}
