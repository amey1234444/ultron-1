import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../context/AuthContext';
import {
  AUTH_FONT_BODY,
  AuthAltAction,
  AuthButton,
  AuthError,
  AuthField,
  AuthPasswordField,
  AuthShell,
} from './AuthShell';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      void router.replace(next);
    }
  }, [loading, user, router]);

  const onSubmit = async () => {
    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = 'Enter your username or email.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to monitor plant health, alarms and live telemetry."
      footer={<AuthAltAction prompt="Don't have an account?" action="Request access" onPress={() => router.push('/signup')} />}
    >
      <AuthField
        label="Username or email"
        value={username}
        onChangeText={(text) => {
          setUsername(text);
          if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: undefined }));
        }}
        autoCapitalize="none"
        autoComplete="username"
        placeholder="name@company.com"
        error={fieldErrors.username}
        onSubmitEditing={onSubmit}
      />
      <AuthPasswordField
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
        }}
        placeholder="••••••••"
        autoComplete="current-password"
        error={fieldErrors.password}
        onSubmitEditing={onSubmit}
        hint={
          <Pressable onPress={() => router.push('/forgot-password')} accessibilityRole="link">
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#8A8A8A' }}>Forgot password?</Text>
          </Pressable>
        }
      />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Sign in" submitting={submitting} onPress={onSubmit} />
    </AuthShell>
  );
}
