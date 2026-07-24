import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { AUTH_FONT_BODY, AuthButton, AuthField, AuthShell, CaptchaField, useCaptcha } from './AuthShell';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const captcha = useCaptcha();
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
    if (!captcha.answer.trim()) {
      setError('Please solve the CAPTCHA.');
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password, captcha.token, captcha.answer.trim());
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      await router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
      void captcha.reload(); // rotate the challenge after any failure
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Sign in to continue">
      <AuthField
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="username"
        onSubmitEditing={onSubmit}
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        onSubmitEditing={onSubmit}
      />

      <CaptchaField captcha={captcha} onSubmitEditing={onSubmit} />

      {error ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="mt-4 text-sm text-status-critical">
          {error}
        </Text>
      ) : null}

      <AuthButton label="Sign In" submitting={submitting} onPress={onSubmit} />

      <View className="mt-6 flex-row items-center gap-1">
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-ink-muted">
          Don&apos;t have an account?
        </Text>
        <Pressable onPress={() => router.push('/signup')}>
          <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-accent">
            Create one
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontFamily: AUTH_FONT_BODY }} className="mt-4 text-xs leading-5 text-ink-muted">
        Demo accounts — superadmin / admin / user (default passwords in README).
      </Text>
    </AuthShell>
  );
}
