import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { AUTH_FONT_BODY, AuthAltAction, AuthButton, AuthError, AuthField, AuthShell, CaptchaField, useCaptcha } from './AuthShell';

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
      setError('Please solve the security check.');
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
      <AuthShell title="Registration received" subtitle="An administrator will review your request.">
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: 'rgba(201,161,92,0.4)', backgroundColor: 'rgba(201,161,92,0.1)', paddingHorizontal: 14, paddingVertical: 14 }}>
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, lineHeight: 22, color: '#E8D7B5' }}>{done}</Text>
        </View>
        <AuthButton label="Back to sign in" onPress={() => router.replace('/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up access to the ULTRON monitoring console."
      footer={<AuthAltAction prompt="Already have an account?" action="Sign in" onPress={() => router.push('/login')} />}
    >
      <AuthField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="jdoe" />
      <AuthField label="Full name" value={name} onChangeText={setName} placeholder="Jane Doe" />
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="name@company.com"
      />
      <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />

      <CaptchaField captcha={captcha} onSubmitEditing={onSubmit} />

      {error ? <AuthError message={error} /> : null}

      <AuthButton label="Create account" submitting={submitting} onPress={onSubmit} />
    </AuthShell>
  );
}
