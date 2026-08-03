import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AuthGate } from '../components/web/AuthGate';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiClient';
import {
  ONLINE_WINDOW_MS,
  ROLE_LABEL,
  ROLES,
  STATUS_LABEL,
  USER_PERMISSIONS,
  userHasPermission,
  type PublicUser,
  type ReputationStatus,
  type Role,
  type UserStatus,
} from '../lib/roles';

// Human-friendly "time ago" for last-login / last-seen timestamps.
function timeAgo(iso: string | null, now: number): string {
  if (!iso) return 'Never';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isOnline(u: PublicUser, now: number): boolean {
  return u.status === 'active' && !!u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

function StatusPill({ user, now }: { user: PublicUser; now: number }) {
  const online = isOnline(user, now);
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2 w-2 rounded-full ${online ? 'bg-status-success' : 'bg-ink-muted'}`} />
      <Text className={`font-body-medium text-[11px] ${online ? 'text-status-success' : 'text-ink-muted'}`}>
        {online ? 'Online' : `Last seen ${timeAgo(user.lastSeenAt, now)}`}
      </Text>
    </View>
  );
}

function AccountStatusBadge({ status }: { status: UserStatus }) {
  const tone =
    status === 'active'
      ? 'border-status-success/50 text-status-success'
      : status === 'pending'
        ? 'border-status-warning/60 text-status-warning'
        : 'border-status-critical/60 text-status-critical';
  return (
    <View className={`rounded-full border px-2 py-0.5 ${tone}`}>
      <Text className={`font-body-medium text-[11px] uppercase tracking-wide ${tone.split(' ')[1]}`}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

// Abstract email_quality.score must be ABOVE this to be considered trustable.
// Keep in sync with MIN_QUALITY_SCORE in server/emailReputation.ts.
const TRUST_MIN_SCORE = 0.85;

function isTrustable(status: ReputationStatus, score: number | null): boolean {
  return status === 'acceptable' && score !== null && score > TRUST_MIN_SCORE;
}

const REPUTATION_BADGE: Record<ReputationStatus, { label: string; tone: string }> = {
  acceptable: { label: '✅ Acceptable', tone: 'border-status-success/50 text-status-success' },
  overridden: { label: '✅ Overridden', tone: 'border-status-success/50 text-status-success' },
  not_acceptable: { label: '❌ Not acceptable', tone: 'border-status-critical/60 text-status-critical' },
  unknown: { label: '— Unchecked', tone: 'border-line-dark text-ink-muted' },
};

function reputationBadge(
  status: ReputationStatus,
  score: number | null,
): { label: string; tone: string } {
  if (status === 'acceptable') {
    return isTrustable(status, score)
      ? { label: `✅ Valid & trusted (${score})`, tone: 'border-status-success/50 text-status-success' }
      : { label: `⚠️ Low score (${score ?? 'n/a'})`, tone: 'border-status-warning/60 text-status-warning' };
  }
  return REPUTATION_BADGE[status] ?? REPUTATION_BADGE.unknown;
}

function ReputationBadge({ status, score = null }: { status: ReputationStatus; score?: number | null }) {
  const m = reputationBadge(status, score);
  return (
    <View className={`rounded-full border px-2 py-0.5 ${m.tone.split(' ')[0]}`}>
      <Text className={`font-body-medium text-[11px] ${m.tone.split(' ')[1]}`}>{m.label}</Text>
    </View>
  );
}

type FormState = {
  username: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  canEditDeleteSchema: boolean;
};

const EMPTY_FORM: FormState = { username: '', name: '', email: '', password: '', role: 'user', canEditDeleteSchema: false };

function RoleChips({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ROLES.map((r) => {
        const active = r === value;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            className={`rounded-lg border px-3 py-1.5 ${active ? 'border-accent bg-accent-soft' : 'border-line-dark'}`}
          >
            <Text className={`font-body-medium text-xs ${active ? 'text-accent' : 'text-ink-muted'}`}>
              {ROLE_LABEL[r]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
}) {
  return (
    <View className="min-w-[180px] flex-1 gap-1.5">
      <Text className="font-body-medium text-xs uppercase tracking-wide text-ink-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#5A5A5A"
        autoCapitalize="none"
        secureTextEntry={secureTextEntry}
        className="rounded-xl border border-line-dark bg-surface-dark px-3 py-2.5 font-body text-sm text-ink"
      />
    </View>
  );
}

// --- rate-limit config panel ----------------------------------------------

type RateRule = { max: number; windowSec: number };
type RateLimits = { signup: RateRule; login: RateRule; api: RateRule };

const RATE_ROWS: { key: keyof RateLimits; label: string; hint: string }[] = [
  { key: 'signup', label: 'Signup', hint: 'New-account requests per IP + device.' },
  { key: 'login', label: 'Login', hint: 'Sign-in attempts per IP + device.' },
  { key: 'api', label: 'General API', hint: 'All other API requests per IP + device.' },
];

function RateLimitsPanel() {
  const [limits, setLimits] = useState<RateLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/config/rate-limits');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load limits.');
      setLimits(data.rateLimits as RateLimits);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load limits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (key: keyof RateLimits, field: keyof RateRule, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setLimits((prev) => (prev ? { ...prev, [key]: { ...prev[key], [field]: n } } : prev));
  };

  const save = async () => {
    if (!limits) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch('/api/config/rate-limits', { method: 'PUT', body: JSON.stringify(limits) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setLimits(data.rateLimits as RateLimits);
      setMsg('Rate limits saved.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
      <Text className="font-body-bold text-sm text-ink">Rate Limits & Bot Protection</Text>
      <Text className="mt-1 font-body text-xs text-ink-muted">
        Requests are throttled per IP + device fingerprint. Signup also requires a CAPTCHA.
      </Text>
      {loading || !limits ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#F5F5F5" />
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {RATE_ROWS.map((row) => (
            <View key={row.key} className="flex-row flex-wrap items-end gap-3 border-t border-line-dark pt-3">
              <View className="min-w-[140px] flex-1">
                <Text className="font-body-medium text-sm text-ink">{row.label}</Text>
                <Text className="font-body text-[11px] text-ink-muted">{row.hint}</Text>
              </View>
              <View className="gap-1">
                <Text className="font-body-medium text-[11px] uppercase tracking-wide text-ink-muted">Max</Text>
                <TextInput
                  value={String(limits[row.key].max)}
                  onChangeText={(t) => update(row.key, 'max', t)}
                  keyboardType="numeric"
                  className="w-24 rounded-lg border border-line-dark bg-surface-dark px-3 py-2 font-body text-sm text-ink"
                />
              </View>
              <View className="gap-1">
                <Text className="font-body-medium text-[11px] uppercase tracking-wide text-ink-muted">Per (seconds)</Text>
                <TextInput
                  value={String(limits[row.key].windowSec)}
                  onChangeText={(t) => update(row.key, 'windowSec', t)}
                  keyboardType="numeric"
                  className="w-28 rounded-lg border border-line-dark bg-surface-dark px-3 py-2 font-body text-sm text-ink"
                />
              </View>
            </View>
          ))}
          {err ? <Text className="font-body text-sm text-status-critical">{err}</Text> : null}
          {msg ? <Text className="font-body text-sm text-status-success">{msg}</Text> : null}
          <View className="flex-row">
            <Pressable
              onPress={saving ? undefined : save}
              className={`items-center rounded-xl bg-ink px-4 py-2.5 ${saving ? 'opacity-50' : ''}`}
            >
              <Text className="font-body-bold text-sm text-ink-inverse">Save Limits</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// --- security alarms panel -------------------------------------------------

type SecurityAlertKind = 'duplicate_email' | 'rate_limit';
type SecurityAlert = {
  id: string;
  kind: SecurityAlertKind;
  email: string;
  ip: string;
  device: string;
  bucket: string;
  detail: string;
  acknowledged: boolean;
  createdAt: string;
};

function alertTitle(a: SecurityAlert): string {
  if (a.kind === 'duplicate_email') return 'Repeated signup with an existing email';
  if (a.bucket === 'signup') return 'Signup attempts exceeded the limit';
  if (a.bucket === 'login') return 'Login rate limit exceeded';
  return 'API rate limit exceeded';
}

function SecurityAlertsPanel({
  alerts,
  unacknowledged,
  loading,
  busy,
  now,
  onRefresh,
  onAcknowledge,
  onClose,
}: {
  alerts: SecurityAlert[];
  unacknowledged: number;
  loading: boolean;
  busy: boolean;
  now: number;
  onRefresh: () => void;
  onAcknowledge: () => void;
  onClose: () => void;
}) {
  return (
    <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View className="min-w-[180px] flex-1">
          <Text className="font-body-bold text-sm text-ink">User Alarms</Text>
          <Text className="mt-1 font-body text-xs text-ink-muted">
            Repeated duplicate-email signups and rate-limit / signup-limit breaches.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Pressable onPress={onRefresh} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">Refresh</Text>
          </Pressable>
          <Pressable
            onPress={busy || unacknowledged === 0 ? undefined : onAcknowledge}
            className={`rounded-lg border border-line-dark px-3 py-1.5 ${busy || unacknowledged === 0 ? 'opacity-40' : ''}`}
          >
            <Text className="font-body-medium text-xs text-ink">Mark all read</Text>
          </Pressable>
          <Pressable onPress={onClose} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">Close</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#F5F5F5" />
        </View>
      ) : alerts.length === 0 ? (
        <Text className="mt-4 font-body text-sm text-ink-muted">No security alarms. All clear.</Text>
      ) : (
        <View className="mt-3">
          {alerts.map((a, i) => (
            <View key={a.id} className={`gap-1 py-3 ${i > 0 ? 'border-t border-line-dark' : ''}`}>
              <View className="flex-row flex-wrap items-center gap-2">
                {!a.acknowledged ? <View className="h-2 w-2 rounded-full bg-status-critical" /> : null}
                <Text className="font-body-bold text-sm text-ink">{alertTitle(a)}</Text>
                <View className="rounded-full border border-line-dark px-2 py-0.5">
                  <Text className="font-body-medium text-[11px] uppercase tracking-wide text-ink-muted">
                    {a.kind === 'duplicate_email' ? 'Duplicate email' : 'Rate limit'}
                  </Text>
                </View>
              </View>
              {a.detail ? <Text className="font-body text-xs text-ink-muted">{a.detail}</Text> : null}
              <View className="flex-row flex-wrap gap-3">
                {a.email ? <Text className="font-body text-[11px] text-ink-muted">Email: {a.email}</Text> : null}
                {a.ip ? <Text className="font-body text-[11px] text-ink-muted">IP: {a.ip}</Text> : null}
                <Text className="font-body text-[11px] text-ink-muted">{timeAgo(a.createdAt, now)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// --- email reputation panel ------------------------------------------------

type ReputationEntry = {
  id: string;
  email: string;
  status: ReputationStatus;
  allowed: boolean;
  trustable: boolean;
  score: number | null;
  reasons: string[];
  detail: string;
  overridden: boolean;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  data: unknown | null;
};

function ReputationPanel({
  records,
  loading,
  busy,
  now,
  onRefresh,
  onOverride,
  onDelete,
  onClose,
}: {
  records: ReputationEntry[];
  loading: boolean;
  busy: boolean;
  now: number;
  onRefresh: () => void;
  onOverride: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View className="min-w-[180px] flex-1">
          <Text className="font-body-bold text-sm text-ink">Email Reputation (all records)</Text>
          <Text className="mt-1 font-body text-xs text-ink-muted">
            Every Abstract API result — approved, rejected, unknown and overridden — with the full stored response. An
            email is &quot;valid &amp; trusted&quot; only when its quality score is above {TRUST_MIN_SCORE}. Approve to
            override a rejection (re-enable signup), or Delete to remove a record.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Pressable onPress={onRefresh} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">Refresh</Text>
          </Pressable>
          <Pressable onPress={onClose} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">Close</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#F5F5F5" />
        </View>
      ) : records.length === 0 ? (
        <Text className="mt-4 font-body text-sm text-ink-muted">No reputation records yet.</Text>
      ) : (
        <View className="mt-3">
          {records.map((r, i) => (
            <View key={r.id} className={`gap-1 py-3 ${i > 0 ? 'border-t border-line-dark' : ''}`}>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-body-bold text-sm text-ink">{r.email}</Text>
                <ReputationBadge status={r.status} score={r.score} />
                <Text className="font-body text-[11px] text-ink-muted">{timeAgo(r.checkedAt ?? r.updatedAt, now)}</Text>
              </View>
              {r.detail ? <Text className="font-body text-xs text-ink-muted">{r.detail}</Text> : null}
              <View className="mt-1 flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => setExpanded((e) => (e === r.id ? null : r.id))}
                  className="rounded-lg border border-line-dark px-3 py-1.5"
                >
                  <Text className="font-body-medium text-xs text-ink">{expanded === r.id ? 'Hide details' : 'View details'}</Text>
                </Pressable>
                {r.status === 'not_acceptable' ? (
                  <Pressable
                    onPress={busy ? undefined : () => onOverride(r.id)}
                    className={`rounded-lg border border-status-success px-3 py-1.5 ${busy ? 'opacity-50' : ''}`}
                  >
                    <Text className="font-body-medium text-xs text-status-success">Approve (override)</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={busy ? undefined : () => onDelete(r.id)}
                  className={`rounded-lg border border-status-critical px-3 py-1.5 ${busy ? 'opacity-50' : ''}`}
                >
                  <Text className="font-body-medium text-xs text-status-critical">Delete</Text>
                </Pressable>
              </View>
              {expanded === r.id ? (
                <ScrollView horizontal className="mt-2 max-h-64 rounded-lg border border-line-dark bg-surface-dark">
                  <Text className="p-3 font-mono text-[11px] text-ink-muted">
                    {r.data ? JSON.stringify(r.data, null, 2) : 'No stored API response.'}
                  </Text>
                </ScrollView>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// --- dashboard building blocks --------------------------------------------

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type StatTone = 'neutral' | 'success' | 'warning' | 'critical' | 'accent';

const STAT_COLOUR: Record<StatTone, string> = {
  neutral: '#8A8A8A',
  success: '#3FB950',
  warning: '#F2A93B',
  critical: '#EF4444',
  accent: '#C9A15C',
};

function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
  onPress,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: StatTone;
  icon: IconName;
  onPress?: () => void;
}) {
  const colour = STAT_COLOUR[tone];
  const body = (
    <View className="min-w-[168px] flex-1 gap-2 rounded-2xl border border-line-dark bg-surface-darkpanel px-4 py-3.5">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${colour}1F` }}>
          <MaterialCommunityIcons name={icon} size={17} color={colour} />
        </View>
        <Text className="flex-1 font-body-medium text-[10px] uppercase tracking-[1.4px] text-ink-muted">{label}</Text>
      </View>
      <Text style={{ color: colour }} className="font-body-bold text-2xl">
        {value}
      </Text>
      <Text className="font-body text-[10px] text-ink-muted">{hint}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="min-w-[168px] flex-1" accessibilityRole="button">
      {body}
    </Pressable>
  );
}

function ToolbarButton({
  label,
  onPress,
  count,
  tone = 'neutral',
  icon,
}: {
  label: string;
  onPress: () => void;
  count?: number;
  tone?: StatTone;
  icon: IconName;
}) {
  const alerting = (count ?? 0) > 0;
  const colour = alerting ? STAT_COLOUR[tone === 'neutral' ? 'critical' : tone] : '#F5F5F5';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-2 rounded-full border px-3.5 py-2 ${
        alerting ? 'border-status-critical bg-status-critical/10' : 'border-line-dark bg-surface-darkpanel'
      }`}
    >
      <MaterialCommunityIcons name={icon} size={15} color={colour} />
      <Text style={{ color: colour }} className="font-body-medium text-xs">
        {label}
      </Text>
      {alerting ? (
        <View className="min-w-[18px] items-center rounded-full bg-status-critical px-1.5 py-0.5">
          <Text className="font-body-bold text-[10px] text-ink-inverse">{count! > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function FilterChip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`rounded-full border px-3 py-1.5 ${active ? 'border-accent bg-accent-soft' : 'border-line-dark'}`}
    >
      <Text className={`font-body-medium text-[11px] ${active ? 'text-accent' : 'text-ink-muted'}`}>
        {label}
        {count === undefined ? '' : ` ${count}`}
      </Text>
    </Pressable>
  );
}

function RoleDistribution({ users }: { users: PublicUser[] }) {
  const total = Math.max(1, users.length);
  return (
    <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
      <Text className="font-body-medium text-[11px] uppercase tracking-[1.6px] text-ink-muted">Role distribution</Text>
      <View className="mt-3 gap-2.5">
        {ROLES.map((role) => {
          const count = users.filter((u) => u.role === role).length;
          return (
            <View key={role} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-body text-xs text-ink">{ROLE_LABEL[role]}</Text>
                <Text className="font-mono text-[11px] text-ink-muted">{count}</Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-dark">
                <View className="h-1.5 rounded-full bg-accent" style={{ width: `${(count / total) * 100}%` }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// --- main screen -----------------------------------------------------------

type StatusFilter = 'all' | UserStatus;

function UsersScreenInner() {
  const router = useRouter();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [alertsUnack, setAlertsUnack] = useState(0);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [showAlarms, setShowAlarms] = useState(false);

  const [repRecords, setRepRecords] = useState<ReputationEntry[]>([]);
  const [repBarred, setRepBarred] = useState(0);
  const [rejectedLoading, setRejectedLoading] = useState(true);
  const [rejectedBusy, setRejectedBusy] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  // Users with an in-flight manual reputation re-check (keyed by user id).
  const [recheckBusy, setRecheckBusy] = useState<Record<string, boolean>>({});

  // Full reputation detail for a single user, fetched on demand (super-admin
  // endpoint) and shown inline. Keyed by user id.
  const [repDetail, setRepDetail] = useState<Record<string, unknown>>({});
  const [repOpen, setRepOpen] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users.');
      setUsers(data.users as PublicUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async (silent = false) => {
    if (!silent) setAlertsLoading(true);
    try {
      const res = await apiFetch('/api/security/alerts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load alarms.');
      setAlerts(data.alerts as SecurityAlert[]);
      setAlertsUnack(Number(data.unacknowledged) || 0);
    } catch {
      /* non-critical: leave the last-known alarms in place */
    } finally {
      if (!silent) setAlertsLoading(false);
    }
  }, []);

  const acknowledgeAlerts = useCallback(async () => {
    setAlertsBusy(true);
    try {
      const res = await apiFetch('/api/security/alerts', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setAlerts(data.alerts as SecurityAlert[]);
        setAlertsUnack(Number(data.unacknowledged) || 0);
      }
    } finally {
      setAlertsBusy(false);
    }
  }, []);

  const loadRejected = useCallback(async (silent = false) => {
    if (!silent) setRejectedLoading(true);
    try {
      const res = await apiFetch('/api/reputation/rejected');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reputation records.');
      setRepRecords(data.records as ReputationEntry[]);
      setRepBarred(Number(data.barred) || 0);
    } catch {
      /* non-critical */
    } finally {
      if (!silent) setRejectedLoading(false);
    }
  }, []);

  const overrideRejected = useCallback(async (id: string) => {
    setRejectedBusy(true);
    try {
      const res = await apiFetch('/api/reputation/rejected', { method: 'POST', body: JSON.stringify({ id }) });
      const data = await res.json();
      if (res.ok) {
        setRepRecords(data.records as ReputationEntry[]);
        setRepBarred(Number(data.barred) || 0);
      }
    } finally {
      setRejectedBusy(false);
    }
  }, []);

  const deleteRejected = useCallback(async (id: string) => {
    setRejectedBusy(true);
    try {
      const res = await apiFetch('/api/reputation/rejected', { method: 'DELETE', body: JSON.stringify({ id }) });
      const data = await res.json();
      if (res.ok) {
        setRepRecords(data.records as ReputationEntry[]);
        setRepBarred(Number(data.barred) || 0);
      }
    } finally {
      setRejectedBusy(false);
    }
  }, []);

  // Manual super-admin re-check: enqueue this user's email and drain the
  // rate-limited queue, then refresh the directory + records with the verdict.
  const recheckReputation = useCallback(
    async (userId: string) => {
      setRecheckBusy((prev) => ({ ...prev, [userId]: true }));
      try {
        const res = await apiFetch('/api/reputation/recheck', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
        const data = await res.json();
        if (res.ok && data.reputation) {
          setRepDetail((prev) => ({ ...prev, [userId]: data.reputation }));
        }
      } catch {
        /* leave state; the job stays queued and can be retried */
      } finally {
        setRecheckBusy((prev) => ({ ...prev, [userId]: false }));
        void load(true);
        void loadRejected(true);
      }
    },
    [load, loadRejected],
  );

  const toggleReputation = useCallback(
    async (userId: string) => {
      if (repOpen === userId) {
        setRepOpen(null);
        return;
      }
      setRepOpen(userId);
      if (!(userId in repDetail)) {
        try {
          const res = await apiFetch(`/api/reputation/user?id=${encodeURIComponent(userId)}`);
          const data = await res.json();
          if (res.ok) setRepDetail((prev) => ({ ...prev, [userId]: data.reputation }));
        } catch {
          /* leave undefined; UI shows unavailable */
        }
      }
    },
    [repOpen, repDetail],
  );

  useEffect(() => {
    void load();
    void loadAlerts();
    void loadRejected();
  }, [load, loadAlerts, loadRejected]);

  // Keep statuses live: re-fetch the directory and advance the clock so
  // online/last-seen labels stay accurate without a manual refresh.
  useEffect(() => {
    const poll = setInterval(() => {
      void load(true);
      void loadAlerts(true);
      void loadRejected(true);
    }, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load, loadAlerts, loadRejected]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const startEdit = (u: PublicUser) => {
    setEditingId(u.id);
    setShowForm(true);
    setForm({
      username: u.username,
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      canEditDeleteSchema: userHasPermission(u, USER_PERMISSIONS.SCHEMA_EDIT_DELETE),
    });
  };

  const hasSchemaAccessInForm = form.role === 'super_admin' || form.canEditDeleteSchema;
  const formPermissions = hasSchemaAccessInForm ? [USER_PERMISSIONS.SCHEMA_EDIT_DELETE] : [];

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (editingId) {
        const res = await apiFetch(`/api/users/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            role: form.role,
            password: form.password || undefined,
            permissions: formPermissions,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed.');
      } else {
        const res = await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username,
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            permissions: formPermissions,
            status: 'active',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed.');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (u: PublicUser, status: UserStatus) => {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: PublicUser) => {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      if (editingId === u.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const pendingCount = pendingUsers.length;
  const onlineCount = users.filter((u) => isOnline(u, now)).length;
  const disabledCount = users.filter((u) => u.status === 'disabled').length;
  const untrustedCount = users.filter((u) => !isTrustable(u.reputationStatus, u.reputationScore)).length;

  // Pending accounts float to the top so approvals are impossible to miss.
  const filtered = users
    .filter((u) => (statusFilter === 'all' ? true : u.status === statusFilter))
    .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
    .filter((u) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${u.name} ${u.username} ${u.email}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const rank = (s: UserStatus) => (s === 'pending' ? 0 : s === 'active' ? 1 : 2);
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
    });

  const userRow = (u: PublicUser, i: number) => (
    <View key={u.id} className={i > 0 ? 'border-t border-line-dark' : ''}>
      <View className="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
        <View className="min-w-[220px] flex-1 flex-row items-start gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
            <Text className="font-body-bold text-xs text-accent">{(u.name || u.username).slice(0, 2).toUpperCase()}</Text>
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-body-bold text-sm text-ink">{u.name}</Text>
              <View className="rounded-full bg-accent-soft px-2 py-0.5">
                <Text className="font-body-medium text-[11px] uppercase tracking-wide text-accent">{ROLE_LABEL[u.role]}</Text>
              </View>
              <AccountStatusBadge status={u.status} />
              <ReputationBadge status={u.reputationStatus} score={u.reputationScore} />
              {me?.id === u.id ? <Text className="font-body text-[11px] text-ink-muted">(you)</Text> : null}
              {userHasPermission(u, USER_PERMISSIONS.SCHEMA_EDIT_DELETE) ? (
                <View className="rounded-full border border-line-dark px-2 py-0.5">
                  <Text className="font-body-medium text-[11px] uppercase tracking-wide text-ink-muted">Schema Access</Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 font-body text-xs text-ink-muted">
              @{u.username}
              {u.email ? ` · ${u.email}` : ''}
            </Text>
            <View className="mt-1.5 flex-row flex-wrap items-center gap-3">
              <StatusPill user={u} now={now} />
              <Text className="font-body text-[11px] text-ink-muted">Last login: {timeAgo(u.lastLoginAt, now)}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {u.status === 'pending' ? (
            <Pressable
              onPress={busy ? undefined : () => setStatus(u, 'active')}
              className="rounded-lg border border-status-success px-3 py-1.5"
            >
              <Text className="font-body-medium text-xs text-status-success">Approve</Text>
            </Pressable>
          ) : null}
          {u.status === 'active' && me?.id !== u.id ? (
            <Pressable
              onPress={busy ? undefined : () => setStatus(u, 'disabled')}
              className="rounded-lg border border-status-warning px-3 py-1.5"
            >
              <Text className="font-body-medium text-xs text-status-warning">Suspend</Text>
            </Pressable>
          ) : null}
          {u.status === 'disabled' ? (
            <Pressable
              onPress={busy ? undefined : () => setStatus(u, 'active')}
              className="rounded-lg border border-status-success px-3 py-1.5"
            >
              <Text className="font-body-medium text-xs text-status-success">Reactivate</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void toggleReputation(u.id)} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">{repOpen === u.id ? 'Hide reputation' : 'Reputation'}</Text>
          </Pressable>
          {u.email && (u.reputationStatus === 'unknown' || recheckBusy[u.id]) ? (
            <Pressable
              onPress={recheckBusy[u.id] ? undefined : () => void recheckReputation(u.id)}
              className={`rounded-lg border border-accent px-3 py-1.5 ${recheckBusy[u.id] ? 'opacity-60' : ''}`}
            >
              <Text className="font-body-medium text-xs text-accent">{recheckBusy[u.id] ? 'Validating…' : 'Re-check'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => startEdit(u)} className="rounded-lg border border-line-dark px-3 py-1.5">
            <Text className="font-body-medium text-xs text-ink">Edit</Text>
          </Pressable>
          <Pressable
            onPress={busy || me?.id === u.id ? undefined : () => remove(u)}
            className={`rounded-lg border border-status-critical px-3 py-1.5 ${me?.id === u.id ? 'opacity-40' : ''}`}
          >
            <Text className="font-body-medium text-xs text-status-critical">Delete</Text>
          </Pressable>
        </View>
      </View>

      {repOpen === u.id ? (
        <View className="px-4 pb-3">
          <Text className="font-body-medium text-[11px] uppercase tracking-wide text-ink-muted">
            Reputation: {reputationBadge(u.reputationStatus, u.reputationScore).label}
            {u.reputationScore !== null ? ` · score ${u.reputationScore}` : ''}
            {u.reputationCheckedAt ? ` · checked ${timeAgo(u.reputationCheckedAt, now)}` : ''}
            {u.reputationStatus === 'acceptable'
              ? isTrustable(u.reputationStatus, u.reputationScore)
                ? ` · trusted (> ${TRUST_MIN_SCORE})`
                : ` · not trusted (≤ ${TRUST_MIN_SCORE})`
              : ''}
          </Text>
          {(() => {
            const rep = repDetail[u.id] as { data?: unknown } | undefined;
            const d = rep?.data as { unavailable?: boolean; detail?: string } | null | undefined;
            if (!d || typeof d !== 'object' || !d.unavailable) return null;
            return (
              <Text className="mt-1 font-body text-[11px] text-status-warning">
                Validation did not complete{d.detail ? `: ${d.detail}` : '.'}
              </Text>
            );
          })()}
          <ScrollView horizontal className="mt-2 max-h-64 rounded-lg border border-line-dark bg-surface-dark">
            <Text className="p-3 font-mono text-[11px] text-ink-muted">
              {(() => {
                const rep = repDetail[u.id] as { data?: unknown } | undefined;
                if (!(u.id in repDetail)) return 'Loading…';
                return rep?.data ? JSON.stringify(rep.data, null, 2) : 'No stored API response for this user.';
              })()}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-surface-dark">
      <View className="flex-row flex-wrap items-center justify-between gap-3 border-b border-line-dark px-5 py-4">
        <View className="min-w-[220px]">
          <Text className="font-heading-medium text-xl text-ink">User Management</Text>
          <Text className="mt-0.5 font-body text-xs text-ink-muted">
            Directory, approvals, email reputation and abuse protection for this deployment.
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <ToolbarButton
            icon="account-plus-outline"
            label={showForm && !editingId ? 'Close form' : 'Add user'}
            onPress={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
              setShowForm((s) => !s || !!editingId);
            }}
          />
          <ToolbarButton
            icon="bell-alert-outline"
            label="User Alarms"
            count={alertsUnack}
            onPress={() => {
              setShowAlarms((s) => !s);
              void loadAlerts();
            }}
          />
          <ToolbarButton
            icon="email-alert-outline"
            label="Email Reputation"
            count={repBarred}
            onPress={() => {
              setShowRejected((s) => !s);
              void loadRejected();
            }}
          />
          <ToolbarButton icon="speedometer-slow" label="Rate limits" onPress={() => setShowLimits((s) => !s)} />
          <ToolbarButton icon="refresh" label="Refresh" onPress={() => void load()} />
          <ToolbarButton icon="arrow-left" label="Back to Console" onPress={() => router.push('/')} />
        </View>
      </View>

      <ScrollView contentContainerClassName="p-5 gap-4" className="flex-1">
        <View className="flex-row flex-wrap gap-3">
          <StatCard icon="account-group-outline" label="Total users" value={users.length} hint="Accounts in the directory" tone="accent" />
          <StatCard icon="access-point" label="Online now" value={onlineCount} hint="Seen in the last few minutes" tone="success" />
          <StatCard
            icon="account-clock-outline"
            label="Pending approval"
            value={pendingCount}
            hint={pendingCount > 0 ? 'Tap to review the queue' : 'Nothing waiting'}
            tone={pendingCount > 0 ? 'warning' : 'neutral'}
            onPress={() => setStatusFilter(pendingCount > 0 ? 'pending' : 'all')}
          />
          <StatCard
            icon="account-off-outline"
            label="Suspended"
            value={disabledCount}
            hint="Disabled accounts"
            tone={disabledCount > 0 ? 'warning' : 'neutral'}
            onPress={() => setStatusFilter('disabled')}
          />
          <StatCard
            icon="shield-alert-outline"
            label="Unread alarms"
            value={alertsUnack}
            hint="Duplicate signups & rate limits"
            tone={alertsUnack > 0 ? 'critical' : 'neutral'}
            onPress={() => {
              setShowAlarms(true);
              void loadAlerts();
            }}
          />
          <StatCard
            icon="email-off-outline"
            label="Barred emails"
            value={repBarred}
            hint={`${untrustedCount} account${untrustedCount === 1 ? '' : 's'} not fully trusted`}
            tone={repBarred > 0 ? 'critical' : 'neutral'}
            onPress={() => {
              setShowRejected(true);
              void loadRejected();
            }}
          />
        </View>

        {showAlarms ? (
          <SecurityAlertsPanel
            alerts={alerts}
            unacknowledged={alertsUnack}
            loading={alertsLoading}
            busy={alertsBusy}
            now={now}
            onRefresh={() => void loadAlerts()}
            onAcknowledge={() => void acknowledgeAlerts()}
            onClose={() => setShowAlarms(false)}
          />
        ) : null}

        {showRejected ? (
          <ReputationPanel
            records={repRecords}
            loading={rejectedLoading}
            busy={rejectedBusy}
            now={now}
            onRefresh={() => void loadRejected()}
            onOverride={(id) => void overrideRejected(id)}
            onDelete={(id) => void deleteRejected(id)}
            onClose={() => setShowRejected(false)}
          />
        ) : null}

        {showForm ? (
          <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
            <Text className="font-body-bold text-sm text-ink">{editingId ? 'Edit User' : 'Add User'}</Text>
            <View className="mt-4 flex-row flex-wrap gap-3">
              <Field
                label="Username"
                value={form.username}
                onChangeText={(t) => setForm((f) => ({ ...f, username: t }))}
                placeholder="jdoe"
              />
              <Field label="Name" value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="Jane Doe" />
              <Field
                label="Email"
                value={form.email}
                onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                placeholder="jane@company.com"
              />
              <Field
                label={editingId ? 'New Password (optional)' : 'Password'}
                value={form.password}
                onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                placeholder="min 8 chars"
                secureTextEntry
              />
            </View>

            <View className="mt-4 gap-1.5">
              <Text className="font-body-medium text-xs uppercase tracking-wide text-ink-muted">Role</Text>
              <RoleChips
                value={form.role}
                onChange={(r) =>
                  setForm((f) => ({
                    ...f,
                    role: r,
                    canEditDeleteSchema: r === 'super_admin' ? true : f.canEditDeleteSchema,
                  }))
                }
              />
            </View>

            <View className="mt-4 gap-1.5">
              <Text className="font-body-medium text-xs uppercase tracking-wide text-ink-muted">Access</Text>
              <Pressable
                onPress={
                  form.role === 'super_admin'
                    ? undefined
                    : () => setForm((f) => ({ ...f, canEditDeleteSchema: !f.canEditDeleteSchema }))
                }
                accessibilityState={{ disabled: form.role === 'super_admin' }}
                className={`flex-row items-center gap-2 self-start rounded-lg border px-3 py-2 ${
                  hasSchemaAccessInForm ? 'border-accent bg-accent-soft' : 'border-line-dark'
                }`}
              >
                <View className={`h-3.5 w-3.5 rounded border ${hasSchemaAccessInForm ? 'border-accent bg-accent' : 'border-ink-muted'}`} />
                <Text className={`font-body-medium text-xs ${hasSchemaAccessInForm ? 'text-accent' : 'text-ink-muted'}`}>
                  Edit or delete hierarchy and rack schema
                </Text>
              </Pressable>
            </View>

            {editingId ? <Text className="mt-3 font-body text-xs text-ink-muted">Username cannot be changed.</Text> : null}

            {error ? <Text className="mt-3 font-body text-sm text-status-critical">{error}</Text> : null}

            <View className="mt-4 flex-row flex-wrap gap-2">
              <Pressable
                onPress={busy ? undefined : submit}
                className={`items-center rounded-xl bg-ink px-4 py-2.5 ${busy ? 'opacity-50' : ''}`}
              >
                <Text className="font-body-bold text-sm text-ink-inverse">{editingId ? 'Save Changes' : 'Create User'}</Text>
              </Pressable>
              <Pressable onPress={resetForm} className="items-center rounded-xl border border-line-dark px-4 py-2.5">
                <Text className="font-body-medium text-sm text-ink">Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : error ? (
          <Text className="font-body text-sm text-status-critical">{error}</Text>
        ) : null}

        <View className="flex-row flex-wrap gap-4">
          <View className="min-w-[520px] flex-1 gap-3">
            <View className="rounded-2xl border border-line-dark bg-surface-darkpanel">
              <View className="gap-3 border-b border-line-dark px-4 py-3">
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="font-body-bold text-sm text-ink">Directory</Text>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search name, username or email"
                    placeholderTextColor="#5A5A5A"
                    autoCapitalize="none"
                    className="min-w-[220px] flex-1 rounded-xl border border-line-dark bg-surface-dark px-3 py-2 font-body text-sm text-ink"
                  />
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <FilterChip label="All" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} count={users.length} />
                  <FilterChip
                    label="Pending"
                    active={statusFilter === 'pending'}
                    onPress={() => setStatusFilter('pending')}
                    count={pendingCount}
                  />
                  <FilterChip
                    label="Active"
                    active={statusFilter === 'active'}
                    onPress={() => setStatusFilter('active')}
                    count={users.filter((u) => u.status === 'active').length}
                  />
                  <FilterChip
                    label="Suspended"
                    active={statusFilter === 'disabled'}
                    onPress={() => setStatusFilter('disabled')}
                    count={disabledCount}
                  />
                  <View className="w-2" />
                  <FilterChip label="Any role" active={roleFilter === 'all'} onPress={() => setRoleFilter('all')} />
                  {ROLES.map((role) => (
                    <FilterChip
                      key={role}
                      label={ROLE_LABEL[role]}
                      active={roleFilter === role}
                      onPress={() => setRoleFilter(role)}
                      count={users.filter((u) => u.role === role).length}
                    />
                  ))}
                </View>
              </View>

              {loading ? (
                <View className="items-center py-10">
                  <ActivityIndicator color="#F5F5F5" />
                </View>
              ) : filtered.length === 0 ? (
                <Text className="px-4 py-8 font-body text-sm text-ink-muted">No users match the current filters.</Text>
              ) : (
                filtered.map(userRow)
              )}
            </View>
          </View>

          <View className="min-w-[280px] gap-3" style={{ maxWidth: 340 }}>
            <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
              <Text className="font-body-medium text-[11px] uppercase tracking-[1.6px] text-ink-muted">Approval queue</Text>
              {pendingCount === 0 ? (
                <Text className="mt-2 font-body text-xs text-ink-muted">No accounts are awaiting approval.</Text>
              ) : (
                <View className="mt-2.5 gap-2.5">
                  {pendingUsers.map((u) => (
                    <View key={u.id} className="gap-1.5 rounded-xl border border-status-warning/40 bg-status-warning/5 px-3 py-2.5">
                      <Text className="font-body-medium text-xs text-ink">{u.name}</Text>
                      <Text className="font-body text-[10px] text-ink-muted">
                        @{u.username}
                        {u.email ? ` · ${u.email}` : ''}
                      </Text>
                      <ReputationBadge status={u.reputationStatus} score={u.reputationScore} />
                      <View className="flex-row flex-wrap gap-2">
                        <Pressable
                          onPress={busy ? undefined : () => setStatus(u, 'active')}
                          className="rounded-lg border border-status-success px-2.5 py-1"
                        >
                          <Text className="font-body-medium text-[11px] text-status-success">Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={busy ? undefined : () => remove(u)}
                          className="rounded-lg border border-status-critical px-2.5 py-1"
                        >
                          <Text className="font-body-medium text-[11px] text-status-critical">Reject</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <RoleDistribution users={users} />

            <View className="rounded-2xl border border-line-dark bg-surface-darkpanel p-4">
              <Text className="font-body-medium text-[11px] uppercase tracking-[1.6px] text-ink-muted">Latest alarms</Text>
              {alerts.length === 0 ? (
                <Text className="mt-2 font-body text-xs text-ink-muted">No security alarms. All clear.</Text>
              ) : (
                <View className="mt-2.5 gap-2.5">
                  {alerts.slice(0, 4).map((a) => (
                    <View key={a.id} className="flex-row gap-2">
                      <View className={`mt-1 h-1.5 w-1.5 rounded-full ${a.acknowledged ? 'bg-ink-muted' : 'bg-status-critical'}`} />
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={2} className="font-body-medium text-[11px] text-ink">
                          {alertTitle(a)}
                        </Text>
                        <Text className="font-body text-[10px] text-ink-muted">
                          {a.email || a.ip || 'unknown source'} · {timeAgo(a.createdAt, now)}
                        </Text>
                      </View>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      setShowAlarms(true);
                      void loadAlerts();
                    }}
                    className="self-start rounded-lg border border-line-dark px-3 py-1.5"
                  >
                    <Text className="font-body-medium text-[11px] text-ink">Open alarms</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </View>

        {showLimits ? <RateLimitsPanel /> : null}
      </ScrollView>
    </View>
  );
}

export default function UsersScreen() {
  return (
    <AuthGate minRole="super_admin">
      <UsersScreenInner />
    </AuthGate>
  );
}
