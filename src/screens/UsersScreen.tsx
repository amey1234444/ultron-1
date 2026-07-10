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

// --- main screen -----------------------------------------------------------

function UsersScreenInner() {
  const router = useRouter();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    void load();
  }, [load]);

  // Keep statuses live: re-fetch the directory and advance the clock so
  // online/last-seen labels stay accurate without a manual refresh.
  useEffect(() => {
    const poll = setInterval(() => void load(true), 30_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (u: PublicUser) => {
    setEditingId(u.id);
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

  // Pending accounts float to the top so approvals are impossible to miss.
  const sorted = [...users].sort((a, b) => {
    const rank = (s: UserStatus) => (s === 'pending' ? 0 : s === 'active' ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  const pendingCount = users.filter((u) => u.status === 'pending').length;

  return (
    <View className="flex-1 bg-surface-dark">
      <View className="flex-row items-center justify-between border-b border-line-dark px-4 py-3">
        <Text className="font-heading-medium text-lg text-ink">User Management</Text>
        <Pressable onPress={() => router.push('/')} className="rounded-lg border border-line-dark px-3 py-1.5">
          <Text className="font-body-medium text-xs text-ink">Back to Studio</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="p-4 gap-6" className="flex-1">
        {pendingCount > 0 ? (
          <View className="rounded-xl border border-status-warning/50 bg-status-warning/10 px-4 py-3">
            <Text className="font-body-medium text-sm text-status-warning">
              {pendingCount} account{pendingCount === 1 ? '' : 's'} awaiting your approval.
            </Text>
          </View>
        ) : null}

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
            {editingId ? (
              <Pressable onPress={resetForm} className="items-center rounded-xl border border-line-dark px-4 py-2.5">
                <Text className="font-body-medium text-sm text-ink">Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="rounded-2xl border border-line-dark bg-surface-darkpanel">
          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#F5F5F5" />
            </View>
          ) : (
            sorted.map((u, i) => (
              <View
                key={u.id}
                className={`flex-row flex-wrap items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line-dark' : ''}`}
              >
                <View className="min-w-[160px] flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="font-body-bold text-sm text-ink">{u.name}</Text>
                    <View className="rounded-full bg-accent-soft px-2 py-0.5">
                      <Text className="font-body-medium text-[11px] uppercase tracking-wide text-accent">{ROLE_LABEL[u.role]}</Text>
                    </View>
                    <AccountStatusBadge status={u.status} />
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
            ))
          )}
        </View>

        <RateLimitsPanel />
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
