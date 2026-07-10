import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiClient';
import { AUTH_FONT_BODY, AuthButton, AuthField, AuthShell } from './AuthShell';

function svgToDataUri(svg: string): string {
  // Base64 keeps the data URI robust regardless of the glyphs/quotes inside.
  const encoded = typeof window === 'undefined' ? Buffer.from(svg).toString('base64') : window.btoa(svg);
  return `data:image/svg+xml;base64,${encoded}`;
}

export default function SignupScreen() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      void router.replace(next);
    }
  }, [loading, user, router]);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer('');
    try {
      const res = await apiFetch('/api/captcha');
      const data = await res.json();
      if (res.ok) {
        setCaptchaToken(data.token as string);
        setCaptchaSvg(data.svg as string);
      }
    } catch {
      /* leave captcha blank; submit will fail with a clear message */
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!captchaAnswer.trim()) {
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
        captchaToken,
        captchaAnswer: captchaAnswer.trim(),
      });
      setDone(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.');
      void loadCaptcha(); // rotate the challenge after any failure
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

      <View className="mt-3 gap-1">
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-[11px] uppercase tracking-wider text-ink-muted">
          CAPTCHA
        </Text>
        <View className="flex-row items-center gap-3">
          <View className="h-[56px] w-[168px] max-w-full items-center justify-center overflow-hidden rounded-xl border border-line-dark bg-surface-dark">
            {captchaLoading ? (
              <ActivityIndicator color="#C9A15C" />
            ) : captchaSvg ? (
              <Image source={{ uri: svgToDataUri(captchaSvg) }} style={{ width: 168, height: 56 }} resizeMode="contain" />
            ) : (
              <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-ink-muted">
                Unavailable
              </Text>
            )}
          </View>
          <Pressable onPress={loadCaptcha} accessibilityLabel="Refresh CAPTCHA" className="rounded-lg border border-line-dark px-3 py-2">
            <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-accent">
              ↻ New
            </Text>
          </Pressable>
        </View>
      </View>
      <AuthField
        label="Type the characters above"
        value={captchaAnswer}
        onChangeText={setCaptchaAnswer}
        autoCapitalize="characters"
        placeholder="e.g. AB3KP"
        onSubmitEditing={onSubmit}
      />

      {error ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="mt-4 text-sm text-status-critical">
          {error}
        </Text>
      ) : null}

      <AuthButton label="Create Account" submitting={submitting} onPress={onSubmit} />

      <View className="mt-5 flex-row items-center gap-1">
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
