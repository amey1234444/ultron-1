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
  useWindowDimensions,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { apiFetch } from '../lib/apiClient';

// Auth pages share the landing page's typography (Bebas Neue display + DM Sans
// body, loaded via Google Fonts in _document.tsx). These are applied inline so
// only the auth + home surfaces adopt the new look — the console keeps its own
// bundled fonts untouched.
export const AUTH_FONT_DISPLAY = "'Bebas Neue', 'DM Sans', system-ui, sans-serif";
export const AUTH_FONT_BODY = "'DM Sans', system-ui, sans-serif";

export const AUTH_GOLD = '#C9A15C';
const GOLD = AUTH_GOLD;

// Dark auth palette, matching the landing page's near-black surface.
const BRAND = '#F5F5F5';
const SURFACE = '#0A0A0A';
const FIELD = '#141414';
const INK = '#F5F5F5';
const MUTED = '#8A8A8A';
const LINE = 'rgba(255,255,255,0.14)';

// Rotating claims on the brand panel, mirroring the carousel on the reference
// split-screen sign-in.
const BRAND_SLIDES = [
  { kicker: 'BUILT FOR', headline: 'ROTATING\nEQUIPMENT', caption: 'VIBRATION · TEMPERATURE · SPEED' },
  { kicker: 'STREAMING AT', headline: '10 Hz', caption: 'EDGE GATEWAY TO BROWSER' },
  { kicker: 'PREDICTS', headline: 'FAILURES', caption: 'BEFORE THEY STOP THE LINE' },
  { kicker: 'SCALES TO', headline: '1,600+', caption: 'CHANNELS PER PLANT' },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const stacked = width > 0 && width < 900;
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((value) => (value + 1) % BRAND_SLIDES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const active = BRAND_SLIDES[slide];

  return (
    <View style={{ flex: 1, flexDirection: stacked ? 'column' : 'row', backgroundColor: SURFACE, minHeight: '100%' }}>
      {/* Form column */}
      <View style={{ flex: 1, backgroundColor: SURFACE }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: stacked ? 24 : 56,
            paddingVertical: 48,
          }}
        >
          <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
            <Text style={{ fontFamily: AUTH_FONT_DISPLAY, fontSize: 30, letterSpacing: 6, color: INK }}>ULTRON</Text>
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, letterSpacing: 1.6, color: MUTED, marginTop: 2 }}>
              ASSET MONITORING
            </Text>

            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 30, fontWeight: '700', color: INK, marginTop: 44 }}>{title}</Text>
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, color: MUTED, marginTop: 6 }}>{subtitle}</Text>

            <View style={{ marginTop: 24 }}>{children}</View>

            {footer ? <View style={{ marginTop: 24 }}>{footer}</View> : null}
          </View>
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: stacked ? 24 : 48,
            paddingBottom: 20,
            paddingTop: 8,
          }}
        >
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: MUTED }}>
            © {new Date().getFullYear()} ULTRON. All rights reserved.
          </Text>
          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: MUTED }}>Legal</Text>
        </View>
      </View>

      {/* Brand column */}
      <View style={{ flex: 1, minHeight: stacked ? 320 : undefined, borderLeftWidth: stacked ? 0 : 1, borderTopWidth: stacked ? 1 : 0, borderColor: LINE }}>
        <LinearGradient
          colors={['#161616', '#0E0E0E', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, paddingHorizontal: 40, paddingVertical: 48, justifyContent: 'space-between' }}
        >
          <Text style={{ fontFamily: AUTH_FONT_DISPLAY, fontSize: 34, letterSpacing: 6, color: '#ffffff' }}>
            ULTRON <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 20, fontWeight: '600', letterSpacing: 1, color: GOLD }}>Studio</Text>
          </Text>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, letterSpacing: 4, color: GOLD }}>{active.kicker}</Text>
            <Text
              style={{
                fontFamily: AUTH_FONT_DISPLAY,
                fontSize: 66,
                lineHeight: 68,
                letterSpacing: 2,
                color: '#ffffff',
                textAlign: 'center',
                marginTop: 14,
              }}
            >
              {active.headline}
            </Text>
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, letterSpacing: 3, color: 'rgba(255,255,255,0.72)', marginTop: 18 }}>
              {active.caption}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 30 }}>
              {BRAND_SLIDES.map((item, index) => (
                <Pressable
                  key={item.headline}
                  onPress={() => setSlide(index)}
                  style={{
                    height: 5,
                    width: index === slide ? 30 : 6,
                    borderRadius: 999,
                    backgroundColor: index === slide ? GOLD : 'rgba(255,255,255,0.28)',
                  }}
                />
              ))}
            </View>
          </View>

          <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
            Crafted for teams that keep industrial plants running.
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

export function AuthField({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, fontWeight: '600', color: INK }}>{label}</Text>
        {hint}
      </View>
      <TextInput
        placeholderTextColor="#6B6B6B"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={
          {
            fontFamily: AUTH_FONT_BODY,
            backgroundColor: FIELD,
            borderWidth: 1,
            borderColor: focused ? GOLD : LINE,
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 11,
            marginTop: 8,
            fontSize: 15,
            color: INK,
            outlineStyle: 'none',
          } as unknown as ViewStyle
        }
        {...props}
      />
    </View>
  );
}

export function AuthButton({ label, submitting, onPress }: { label: string; submitting?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={submitting ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!submitting }}
      style={{
        marginTop: 24,
        alignItems: 'center',
        justifyContent: 'center',
        height: 46,
        borderRadius: 8,
        backgroundColor: BRAND,
        opacity: submitting ? 0.65 : 1,
      }}
    >
      {submitting ? (
        <ActivityIndicator color={SURFACE} />
      ) : (
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontWeight: '700', fontSize: 15, color: '#0A0A0A' }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthAltAction({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, color: MUTED }}>{prompt}</Text>
      <Pressable onPress={onPress}>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, fontWeight: '700', color: GOLD }}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <View style={{ marginTop: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(248,81,73,0.4)', backgroundColor: 'rgba(248,81,73,0.12)', paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#F85149' }}>{message}</Text>
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

export function CaptchaField({ captcha, onSubmitEditing }: { captcha: Captcha; onSubmitEditing?: () => void }) {
  return (
    <>
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 14, fontWeight: '600', color: INK }}>Security check</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <View
            style={{
              height: 46,
              width: 150,
              maxWidth: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: LINE,
              backgroundColor: '#ffffff',
            }}
          >
            {captcha.loading ? (
              <ActivityIndicator color={GOLD} />
            ) : captcha.svg ? (
              <Image source={{ uri: svgToDataUri(captcha.svg) }} style={{ width: 150, height: 46 }} resizeMode="contain" />
            ) : (
              <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 12, color: MUTED }}>Unavailable</Text>
            )}
          </View>
          <Pressable
            onPress={() => void captcha.reload()}
            accessibilityLabel="Refresh CAPTCHA"
            style={{ borderRadius: 8, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: GOLD }}>↻ New</Text>
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
