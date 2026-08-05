import type { ReactNode } from 'react';
import { Children, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { LOGO_DARK } from '../../lib/brandLogos';
import { apiFetch } from '../lib/apiClient';

// Auth pages share the landing page's typography (Bebas Neue display + DM Sans
// body, loaded via Google Fonts in _document.tsx). These are applied inline so
// only the auth + home surfaces adopt the new look - the console keeps its own
// bundled fonts untouched.
export const AUTH_FONT_DISPLAY = "'Bebas Neue', 'DM Sans', system-ui, sans-serif";
export const AUTH_FONT_BODY = "'DM Sans', system-ui, sans-serif";
export const AUTH_FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace";

export const AUTH_GOLD = '#C9A15C';
const GOLD = AUTH_GOLD;
const GOLD_SOFT = 'rgba(201,161,92,0.14)';

// Dark auth palette, matching the landing page's near-black surface.
const SURFACE = '#08090B';
const PANEL = '#0E1013';
const FIELD = '#131518';
const INK = '#F5F5F5';
const MUTED = '#8A8A8A';
const FAINT = '#5F6266';
const LINE = 'rgba(255,255,255,0.10)';
const LINE_STRONG = 'rgba(255,255,255,0.18)';
const DANGER = '#F85149';
const SUCCESS = '#3FB950';
const LOGO_ASPECT = 284 / 77;

// Both auth pages must fit a single viewport. Below this height the shell falls
// back to a scroll container so short windows stay usable.
const MIN_FIT_HEIGHT = 640;

function FitColumn({ children, paddingHorizontal }: { children: ReactNode; paddingHorizontal: number }) {
  return <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal, paddingVertical: 20 }}>{children}</View>;
}

function ScrollColumn({ children, paddingHorizontal }: { children: ReactNode; paddingHorizontal: number }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal, paddingVertical: 32 }}
    >
      {children}
    </ScrollView>
  );
}

// Signup pairs fields on wider screens to keep the form short, while narrow
// screens stay stacked and easy to type into.
export function AuthFieldRow({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const stacked = width > 0 && width < 620;
  return (
    <View style={{ flexDirection: stacked ? 'column' : 'row', gap: stacked ? 0 : 14 }}>
      {Children.map(children, (child) => (
        <View style={{ flex: 1, minWidth: 0 }}>{child}</View>
      ))}
    </View>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  badge,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  badge?: string;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width > 0 && width < 560;
  const fits = height >= MIN_FIT_HEIGHT;
  const Column = fits ? FitColumn : ScrollColumn;

  return (
    <View style={{ flex: 1, backgroundColor: SURFACE, height: fits ? '100%' : undefined, minHeight: '100%' }}>
      <View style={{ flex: 1, backgroundColor: SURFACE }}>
        <Column paddingHorizontal={compact ? 18 : 28}>
          <View style={{ width: '100%', maxWidth: 432, alignSelf: 'center' }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Image source={LOGO_DARK} style={{ height: 30, width: 30 * LOGO_ASPECT }} resizeMode="contain" accessibilityLabel="ULTRON" />
              <Text style={{ fontFamily: AUTH_FONT_MONO, fontSize: 10, letterSpacing: 3.4, color: MUTED }}>
                ASSET MONITORING
              </Text>
            </View>

            <View
              style={{
                marginTop: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: LINE,
                backgroundColor: PANEL,
                paddingHorizontal: compact ? 18 : 24,
                paddingVertical: 22,
                boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
              } as ViewStyle}
            >
              {badge ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(201,161,92,0.4)',
                    backgroundColor: GOLD_SOFT,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontFamily: AUTH_FONT_MONO, fontSize: 9.5, letterSpacing: 2, color: GOLD }}>{badge}</Text>
                </View>
              ) : null}

              <Text
                style={{
                  fontFamily: AUTH_FONT_DISPLAY,
                  fontSize: 36,
                  lineHeight: 38,
                  color: INK,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {title}
              </Text>
              <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, lineHeight: 19, color: MUTED, marginTop: 6 }}>{subtitle}</Text>

              <View style={{ marginTop: 10 }}>{children}</View>

              {footer ? (
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 14 }}>{footer}</View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14, justifyContent: 'center' }}>
              {['Encrypted session cookies', 'Role-based access', 'Admin-approved accounts'].map((item) => (
                <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: SUCCESS }}>OK</Text>
                  <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: FAINT }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </Column>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: compact ? 20 : 32,
            paddingBottom: 14,
            paddingTop: 6,
          }}
        >
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: FAINT }}>
            (c) {new Date().getFullYear()} ULTRON. All rights reserved.
          </Text>
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: FAINT }}>Legal</Text>
        </View>
      </View>
    </View>
  );
}

export function AuthField({
  label,
  hint,
  error,
  helper,
  adornment,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  helper?: string;
  adornment?: ReactNode;
} & TextInputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? DANGER : focused ? GOLD : LINE_STRONG;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: AUTH_FONT_MONO, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: MUTED }}>
          {label}
        </Text>
        {hint}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: FIELD,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          marginTop: 6,
          paddingRight: adornment ? 6 : 0,
          ...(focused && !error ? { boxShadow: `0 0 0 3px ${GOLD_SOFT}` } : null),
        } as ViewStyle}
      >
        <TextInput
          placeholderTextColor="#63666B"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={
            {
              flex: 1,
              // Web inputs have an intrinsic width; without this they overflow
              // the field when two fields share a row.
              minWidth: 0,
              fontFamily: AUTH_FONT_BODY,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 15,
              color: INK,
              backgroundColor: 'transparent',
              borderWidth: 0,
              outlineStyle: 'none',
            } as unknown as ViewStyle
          }
          {...props}
        />
        {adornment}
      </View>
      {error ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: DANGER, marginTop: 6 }}>{error}</Text>
      ) : helper ? (
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: FAINT, marginTop: 6 }}>{helper}</Text>
      ) : null}
    </View>
  );
}

// Password input with a reveal toggle, so long generated passwords can be
// checked before submitting.
export function AuthPasswordField({
  label,
  ...props
}: { label: string; hint?: ReactNode; error?: string | null; helper?: string } & TextInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      label={label}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoComplete="off"
      adornment={
        <Pressable
          onPress={() => setVisible((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          style={{ paddingHorizontal: 10, paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, fontWeight: '600', color: GOLD }}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      }
      {...props}
    />
  );
}

export type PasswordScore = { score: number; label: string; color: string; suggestions: string[] };

export function passwordScore(password: string): PasswordScore {
  const checks = [
    { pass: password.length >= 8, tip: 'at least 8 characters' },
    { pass: password.length >= 12, tip: '12+ characters is stronger' },
    { pass: /[A-Z]/.test(password) && /[a-z]/.test(password), tip: 'mixed upper and lower case' },
    { pass: /\d/.test(password), tip: 'a number' },
    { pass: /[^A-Za-z0-9]/.test(password), tip: 'a symbol' },
  ];
  const score = checks.filter((check) => check.pass).length;
  const label = score <= 1 ? 'Weak' : score <= 2 ? 'Fair' : score <= 4 ? 'Good' : 'Strong';
  const color = score <= 1 ? DANGER : score <= 2 ? '#F2A93B' : score <= 4 ? '#58A6FF' : SUCCESS;
  return { score, label, color, suggestions: checks.filter((check) => !check.pass).map((check) => check.tip) };
}

export function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => passwordScore(password), [password]);
  if (!password) return null;
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              backgroundColor: index < strength.score ? strength.color : 'rgba(255,255,255,0.10)',
            }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: strength.color }}>
        {strength.label}
        {strength.suggestions.length > 0 ? (
          <Text style={{ color: FAINT }}> - add {strength.suggestions.slice(0, 2).join(', ')}</Text>
        ) : null}
      </Text>
    </View>
  );
}

export function AuthButton({
  label,
  submitting,
  disabled,
  onPress,
  variant = 'primary',
}: {
  label: string;
  submitting?: boolean;
  disabled?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}) {
  const [hovered, setHovered] = useState(false);
  const inert = !!submitting || !!disabled;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: !!submitting }}
      style={{
        marginTop: 18,
        alignItems: 'center',
        justifyContent: 'center',
        height: 46,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: primary ? 'rgba(201,161,92,0.9)' : LINE_STRONG,
        backgroundColor: primary ? (hovered && !inert ? '#F0C684' : GOLD) : 'transparent',
        opacity: inert ? 0.55 : 1,
        ...(primary && !inert ? { boxShadow: '0 14px 34px rgba(201,161,92,0.26)' } : null),
      } as ViewStyle}
    >
      {submitting ? (
        <ActivityIndicator color={primary ? SURFACE : INK} />
      ) : (
        <Text
          style={{
            fontFamily: AUTH_FONT_MONO,
            fontWeight: '600',
            fontSize: 12,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: primary ? '#17130B' : INK,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function AuthAltAction({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, color: MUTED }}>{prompt}</Text>
      <Pressable onPress={onPress} accessibilityRole="link">
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, fontWeight: '700', color: GOLD }}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <View
      style={{
        marginTop: 16,
        flexDirection: 'row',
        gap: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(248,81,73,0.4)',
        backgroundColor: 'rgba(248,81,73,0.12)',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: DANGER }}>!</Text>
      <Text style={{ flex: 1, fontFamily: AUTH_FONT_BODY, fontSize: 13, lineHeight: 19, color: DANGER }}>{message}</Text>
    </View>
  );
}

// Collapsible block for the demo credentials, so the sign-in form stays clean
// but the seeded accounts are still one tap away.
export function AuthDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 14 }}>
      <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: MUTED, textAlign: 'center' }}>
          {open ? 'Less' : 'More'} {label}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: FIELD, padding: 12 }}>{children}</View>
      ) : null}
    </View>
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

export function CaptchaField({
  captcha,
  error,
  onSubmitEditing,
}: {
  captcha: Captcha;
  error?: string | null;
  onSubmitEditing?: () => void;
}) {
  return (
    <>
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontFamily: AUTH_FONT_MONO, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: MUTED }}>
          Security check
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <View
            style={{
              height: 56,
              width: 160,
              maxWidth: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: LINE_STRONG,
              backgroundColor: '#0E0E0E',
            }}
          >
            {captcha.loading ? (
              <ActivityIndicator color={GOLD} />
            ) : captcha.svg ? (
              <Image source={{ uri: svgToDataUri(captcha.svg) }} style={{ width: '100%', height: '100%' }} resizeMode="stretch" />
            ) : (
              <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: MUTED }}>Unavailable</Text>
            )}
          </View>
          <Pressable
            onPress={() => void captcha.reload()}
            accessibilityRole="button"
            accessibilityLabel="Refresh CAPTCHA"
            style={{
              minHeight: 56,
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: LINE_STRONG,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          >
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: GOLD }}>New</Text>
          </Pressable>
        </View>
      </View>
      <AuthField
        label="Type the characters above"
        value={captcha.answer}
        onChangeText={captcha.setAnswer}
        autoCapitalize="characters"
        placeholder="e.g. AB3KP"
        error={error}
        onSubmitEditing={onSubmitEditing}
      />
    </>
  );
}
