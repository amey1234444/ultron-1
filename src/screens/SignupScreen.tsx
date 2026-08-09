import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import {
  AUTH_FONT_BODY,
  AuthAltAction,
  AuthButton,
  AuthError,
  AuthField,
  AuthFieldRow,
  AuthPasswordField,
  AuthShell,
  CaptchaField,
  PasswordStrength,
  passwordScore,
  useCaptcha,
} from './AuthShell';

type FieldErrors = {
  username?: string;
  name?: string;
  email?: string;
  password?: string;
  captcha?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const captcha = useCaptcha();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      void router.replace(next);
    }
  }, [loading, user, router]);

  const clearError = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (username.trim().length < 3) errors.username = 'Pick a username with at least 3 characters.';
    else if (!/^[A-Za-z0-9._-]+$/.test(username.trim())) errors.username = 'Use letters, numbers, dots, dashes or underscores only.';
    if (!name.trim()) errors.name = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid work email address.';
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (passwordScore(password).score < 3) errors.password = 'Add a number, a symbol or mixed case to strengthen this password.';
    if (!captcha.answer.trim()) errors.captcha = 'Solve the security check to continue.';
    return errors;
  };

  const onSubmit = async () => {
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

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
      <AuthShell badge="REQUEST RECEIVED" title="Registration received" subtitle="An administrator will review your request.">
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.30)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, lineHeight: 22, color: '#F2F2F0' }}>{done}</Text>
        </View>
        <View style={{ marginTop: 16, gap: 8 }}>
          {[
            'A super admin reviews and approves the account.',
            'Your email is validated for reputation before access is granted.',
            'You will be able to sign in as soon as it is approved.',
          ].map((step, index) => (
            <View key={step} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#F2F2F0' }}>{index + 1}.</Text>
              <Text style={{ flex: 1, fontFamily: AUTH_FONT_BODY, fontSize: 13, lineHeight: 20, color: '#8A8A8A' }}>{step}</Text>
            </View>
          ))}
        </View>
        <AuthButton label="Back to sign in" onPress={() => router.replace('/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      footer={<AuthAltAction prompt="Already have an account?" action="Sign in" onPress={() => router.push('/login')} />}
    >
      <AuthFieldRow>
        <AuthField
          label="Username"
          value={username}
          onChangeText={(text) => {
            setUsername(text);
            clearError('username');
          }}
          autoCapitalize="none"
          autoComplete="username"
          placeholder="jdoe"
          error={fieldErrors.username}
        />
        <AuthField
          label="Full name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            clearError('name');
          }}
          autoComplete="name"
          placeholder="Jane Doe"
          error={fieldErrors.name}
        />
      </AuthFieldRow>
      <AuthFieldRow>
        <AuthField
          label="Work email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearError('email');
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="name@company.com"
          error={fieldErrors.email}
        />
        <AuthPasswordField
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            clearError('password');
          }}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={fieldErrors.password}
        />
      </AuthFieldRow>
      <PasswordStrength password={password} />

      <CaptchaField
        captcha={captcha}
        error={fieldErrors.captcha}
        onSubmitEditing={onSubmit}
      />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Create account" submitting={submitting} onPress={onSubmit} />
    </AuthShell>
  );
}
