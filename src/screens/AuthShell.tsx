import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

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
    <View className="flex-1 items-center justify-center px-6 py-8" style={{ backgroundColor: '#0A0A0A' }}>
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
        className="w-full max-w-sm overflow-hidden rounded-3xl border p-6"
        style={[{ borderColor: 'rgba(255,255,255,0.10)', boxShadow: '0 30px 90px rgba(0,0,0,0.55)' } as unknown as ViewStyle, glass]}
      >
        <LinearGradient
          colors={[GOLD, '#F0D9A8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: 44, borderRadius: 999, marginBottom: 14 }}
        />
        <Text style={{ fontFamily: AUTH_FONT_DISPLAY, fontSize: 38, letterSpacing: 6, color: '#F5F5F5', lineHeight: 40 }}>ULTRON</Text>
        <Text style={{ fontFamily: AUTH_FONT_BODY, fontSize: 13, color: '#8A8A8A', marginTop: 4 }}>{subtitle}</Text>

        <View style={{ marginTop: 16 }}>{children}</View>
      </View>
    </View>
  );
}

export function AuthField({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View className="mt-3 gap-1">
      <Text style={{ fontFamily: AUTH_FONT_BODY }} className="text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#5A5A5A"
        style={{ fontFamily: AUTH_FONT_BODY, backgroundColor: 'rgba(255,255,255,0.03)' }}
        className="rounded-xl border border-line-dark px-4 py-2.5 text-sm text-ink"
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
      className={`mt-5 items-center rounded-xl px-4 py-3 ${submitting ? 'opacity-60' : ''}`}
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
