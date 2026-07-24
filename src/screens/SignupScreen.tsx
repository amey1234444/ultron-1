import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { AUTH_FONT_BODY, AuthButton, AuthField, AuthShell, CaptchaField, useCaptcha } from './AuthShell';

export default function SignupScreen() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      void router.replace(next);
    }
  }, [loading, user, router]);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!captcha.answer.trim()) {
      setError('Please solve the CAPTCHA.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup({
        username: username.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer.trim(),
      });
      setDone(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.');
      void captcha.reload(); // rotate the challenge after any failure
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell subtitle="Registration received">
        <View className="mt-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-4">
          <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-sm leading-6 text-ink">
            {done}
          </Text>
        </View>
        <AuthButton label="Back to Sign In" onPress={() => router.replace('/login')} />
      </AuthShell>
    );
  }

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
        placeholder="min 8 chars"
      />

      <CaptchaField captcha={captcha} onSubmitEditing={onSubmit} />

      {error ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="mt-3 text-sm text-status-critical">
          {error}
        </Text>
      ) : null}

      <AuthButton label="Create Account" submitting={submitting} onPress={onSubmit} />

      <View className="mt-3 flex-row items-center gap-1">
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
