import { useRouter } from 'next/router';
import { useState } from 'react';
import { Text } from 'react-native';

import { apiFetch } from '../lib/apiClient';
import { AUTH_FONT_BODY, AuthAltAction, AuthButton, AuthError, AuthField, AuthShell } from './AuthShell';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setFieldError('Enter the email address on your account.');
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not start the reset.');
      // The server answers identically whether or not the account exists, so
      // this screen must not imply that an email definitely went out.
      setSent(data.message ?? 'If an account exists for that address, a reset link is on its way.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the reset.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="A reset link is on its way if that address has an account."
        footer={<AuthAltAction prompt="Remembered it?" action="Back to sign in" onPress={() => router.push('/login')} />}
      >
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, lineHeight: 21, color: '#8A8A8A' }}>{sent}</Text>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, lineHeight: 20, color: '#8A8A8A' }}>
          The link can be used once and expires in 30 minutes. If it does not arrive, check your spam folder before
          requesting another.
        </Text>
        <AuthButton label="Back to sign in" onPress={() => router.push('/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a link to choose a new password."
      footer={<AuthAltAction prompt="Remembered it?" action="Back to sign in" onPress={() => router.push('/login')} />}
    >
      <AuthField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (fieldError) setFieldError(undefined);
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="name@company.com"
        error={fieldError}
        onSubmitEditing={onSubmit}
      />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Send reset link" submitting={submitting} onPress={onSubmit} />
    </AuthShell>
  );
}
