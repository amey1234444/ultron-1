import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { AUTH_FONT_BODY, AuthAltAction, AuthButton, AuthError, AuthField, AuthShell } from './AuthShell';

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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your account to continue."
      footer={<AuthAltAction prompt="Don't have an account?" action="Create one" onPress={() => router.push('/signup')} />}
    >
      <AuthField
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="name@company.com"
        onSubmitEditing={onSubmit}
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        onSubmitEditing={onSubmit}
        hint={
          <Pressable onPress={() => router.push('/signup')}>
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#64748b' }}>Forgot password?</Text>
          </Pressable>
        }
      />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Sign in" submitting={submitting} onPress={onSubmit} />

      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, lineHeight: 20, color: '#94a3b8', textAlign: 'center' }}>
          Demo accounts — superadmin / admin / user (default passwords in README).
        </Text>
      </View>
    </AuthShell>
  );
}
