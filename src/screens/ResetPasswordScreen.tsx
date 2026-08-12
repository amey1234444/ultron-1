import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { apiFetch } from '../lib/apiClient';
import {
  AUTH_FONT_BODY,
  AuthAltAction,
  AuthButton,
  AuthError,
  AuthPasswordField,
  AuthShell,
  PasswordStrength,
} from './AuthShell';

const MIN_LENGTH = 8;

type TokenState = 'checking' | 'valid' | 'invalid';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';

  const [tokenState, setTokenState] = useState<TokenState>('checking');
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check the link before showing the form, so nobody types a new password into
  // an expired one and only finds out on submit.
  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setTokenState('invalid');
      setTokenMessage('This reset link is not valid. Request a new one.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { state?: string; message?: string | null };
        if (cancelled) return;
        if (data.state === 'valid') setTokenState('valid');
        else {
          setTokenState('invalid');
          setTokenMessage(data.message ?? 'This reset link is not valid. Request a new one.');
        }
      } catch {
        if (!cancelled) {
          setTokenState('invalid');
          setTokenMessage('Could not check this reset link. Request a new one.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token]);

  const onSubmit = async () => {
    const errors: { password?: string; confirm?: string } = {};
    if (password.length < MIN_LENGTH) errors.password = `Use at least ${MIN_LENGTH} characters.`;
    if (confirm !== password) errors.confirm = 'Passwords do not match.';
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not reset the password.');
      setDone(data.message ?? 'Your password has been changed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password changed" subtitle="Sign in with your new password.">
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, lineHeight: 21, color: '#8A8A8A' }}>{done}</Text>
        <AuthButton label="Go to sign in" onPress={() => router.replace('/login')} />
      </AuthShell>
    );
  }

  if (tokenState !== 'valid') {
    return (
      <AuthShell
        title={tokenState === 'checking' ? 'Checking your link' : 'Link no longer valid'}
        subtitle={tokenState === 'checking' ? 'One moment.' : 'Reset links can be used once and expire after 30 minutes.'}
        footer={<AuthAltAction prompt="Need another?" action="Request a new link" onPress={() => router.push('/forgot-password')} />}
      >
        {tokenState === 'invalid' ? (
          <>
            <AuthError message={tokenMessage ?? 'This reset link is not valid.'} />
            <AuthButton label="Request a new link" onPress={() => router.push('/forgot-password')} />
          </>
        ) : (
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, color: '#8A8A8A' }}>Checking…</Text>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Signing in everywhere else will be required after this."
      footer={<AuthAltAction prompt="Remembered it?" action="Back to sign in" onPress={() => router.push('/login')} />}
    >
      <AuthPasswordField
        label="New password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
        }}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <PasswordStrength password={password} />
      <AuthPasswordField
        label="Confirm new password"
        value={confirm}
        onChangeText={(text) => {
          setConfirm(text);
          if (fieldErrors.confirm) setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        placeholder="Repeat it"
        autoComplete="new-password"
        error={fieldErrors.confirm}
        onSubmitEditing={onSubmit}
      />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Change password" submitting={submitting} onPress={onSubmit} />
    </AuthShell>
  );
}
