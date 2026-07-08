import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { AUTH_FONT_BODY, AuthButton, AuthField, AuthShell } from './AuthShell';

export default function SignupScreen() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await signup({ username: username.trim(), name: name.trim(), email: email.trim(), password });
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      await router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Create your account">
      <AuthField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="jdoe" />
      <AuthField label="Full name" value={name} onChangeText={setName} placeholder="Jane Doe" />
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="jane@company.com"
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="min 6 chars"
        onSubmitEditing={onSubmit}
      />

      {error ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="mt-4 text-sm text-status-critical">
          {error}
        </Text>
      ) : null}

      <AuthButton label="Create Account" submitting={submitting} onPress={onSubmit} />

      <View className="mt-6 flex-row items-center gap-1">
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-ink-muted">
          Already have an account?
        </Text>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-accent">
            Sign in
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
