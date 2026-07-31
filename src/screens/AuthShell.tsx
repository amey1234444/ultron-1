import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { apiFetch } from '../lib/apiClient';

// Auth pages share the landing page's typography (Bebas Neue display + DM Sans
// body, loaded via Google Fonts in _document.tsx). These are applied inline so
// only the auth + home surfaces adopt the new look — the studio keeps its own
// bundled fonts untouched.
export const AUTH_FONT_DISPLAY = "'Bebas Neue', 'DM Sans', system-ui, sans-serif";
export const AUTH_FONT_BODY = "'DM Sans', system-ui, sans-serif";
const GOLD = '#C9A15C';

export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const glass = {
    backgroundColor: 'rgba(18,18,18,0.66)',
    backdropFilter: 'blur(22px) saturate(160%)',
    WebkitBackdropFilter: 'blur(22px) saturate(160%)',
  } as unknown as ViewStyle;

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ minHeight: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 20, backgroundColor: '#0A0A0A' }}
    >
      {/* Ambient glows built from soft box-shadows (no blur filter needed). */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 90, left: 120, width: 1, height: 1, boxShadow: '0 0 240px 150px rgba(201,161,92,0.16)' } as unknown as ViewStyle}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', bottom: 80, right: 130, width: 1, height: 1, boxShadow: '0 0 260px 160px rgba(88,166,255,0.13)' } as unknown as ViewStyle}
      />

      <View
        className="w-full max-w-sm overflow-hidden rounded-2xl border p-5"
        style={[{ borderColor: 'rgba(255,255,255,0.10)', boxShadow: '0 30px 90px rgba(0,0,0,0.55)' } as unknown as ViewStyle, glass]}
      >
        <LinearGradient
          colors={[GOLD, '#F0D9A8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: 38, borderRadius: 999, marginBottom: 10 }}
        />
        <Text style={{ fontFamily: AUTH_FONT_DISPLAY, fontSize: 30, letterSpacing: 5, color: '#F5F5F5', lineHeight: 32 }}>ULTRON</Text>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#8A8A8A', marginTop: 4 }}>{subtitle}</Text>

        <View style={{ marginTop: 12 }}>{children}</View>
      </View>
    </ScrollView>
  );
}

export function AuthField({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View className="mt-2 gap-0.5">
      <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-[10px] uppercase tracking-wider text-ink-muted">
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#5A5A5A"
        style={{ fontFamily: AUTH_FONT_BODY, backgroundColor: 'rgba(255,255,255,0.03)' }}
        className="rounded-lg border border-line-dark px-3.5 py-2 text-[14px] text-ink"
        {...props}
      />
    </View>
  );
}

export function AuthButton({ label, submitting, onPress }: { label: string; submitting?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={submitting ? undefined : onPress}
      accessibilityState={{ disabled: !!submitting }}
      className={`mt-4 items-center rounded-lg px-4 py-2.5 ${submitting ? 'opacity-60' : ''}`}
      style={{ backgroundColor: '#F5F5F5' }}
    >
      {submitting ? (
        <ActivityIndicator color="#0A0A0A" />
      ) : (
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontWeight: '700', letterSpacing: 0.3 }} className="text-sm text-ink-inverse">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// --- shared CAPTCHA --------------------------------------------------------

function svgToDataUri(svg: string): string {
  // Base64 keeps the data URI robust regardless of the glyphs/quotes inside.
  const encoded = typeof window === 'undefined' ? Buffer.from(svg).toString('base64') : window.btoa(svg);
  return `data:image/svg+xml;base64,${encoded}`;
}

export type Captcha = {
  answer: string;
  setAnswer: (v: string) => void;
  token: string;
  svg: string;
  loading: boolean;
  reload: () => Promise<void>;
};

// Fetches a fresh challenge from /api/captcha and tracks the user's answer.
// Used by signup/create-account so automated account creation is CAPTCHA-gated.
export function useCaptcha(): Captcha {
  const [answer, setAnswer] = useState('');
  const [token, setToken] = useState('');
  const [svg, setSvg] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setAnswer('');
    try {
      const res = await apiFetch('/api/captcha');
      const data = await res.json();
      if (res.ok) {
        setToken(data.token as string);
        setSvg(data.svg as string);
      }
    } catch {
      /* leave captcha blank; submit will fail with a clear message */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { answer, setAnswer, token, svg, loading, reload };
}

export function CaptchaField({ captcha, onSubmitEditing }: { captcha: Captcha; onSubmitEditing?: () => void }) {
  return (
    <>
      <View className="mt-2 gap-0.5">
        <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-[10px] uppercase tracking-wider text-ink-muted">
          CAPTCHA
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="h-[46px] w-[150px] max-w-full items-center justify-center overflow-hidden rounded-lg border border-line-dark bg-surface-dark">
            {captcha.loading ? (
              <ActivityIndicator color="#C9A15C" />
            ) : captcha.svg ? (
              <Image source={{ uri: svgToDataUri(captcha.svg) }} style={{ width: 150, height: 46 }} resizeMode="contain" />
            ) : (
              <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-ink-muted">
                Unavailable
              </Text>
            )}
          </View>
          <Pressable onPress={() => void captcha.reload()} accessibilityLabel="Refresh CAPTCHA" className="rounded-lg border border-line-dark px-2.5 py-1.5">
            <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-xs text-accent">
              ↻ New
            </Text>
          </Pressable>
        </View>
      </View>
      <AuthField
        label="Type the characters above"
        value={captcha.answer}
        onChangeText={captcha.setAnswer}
        autoCapitalize="characters"
        placeholder="e.g. AB3KP"
        onSubmitEditing={onSubmitEditing}
      />
    </>
  );
}
