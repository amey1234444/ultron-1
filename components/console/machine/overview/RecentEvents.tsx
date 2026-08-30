import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { levelHexes } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';
import { Hoverable, radius } from '../../../ui';

// There is no event log in the data model — nothing records that a machine
// started, that a channel dropped out, or that a trend crossed a limit. This is
// the shape such a log needs, so the section can be wired to a real feed without
// changing the component. It is deliberately prop-driven and shows an honest
// empty state rather than manufacturing a plausible history: an invented "machine
// started 01:02" on an events panel is a fact someone will act on.
export type MachineEventKind = 'info' | 'normal' | 'alert' | 'danger' | 'sensor-offline' | 'comms-failure';

export type MachineEvent = {
  id: string;
  // ISO timestamp, so ordering does not depend on locale parsing.
  at: string;
  kind: MachineEventKind;
  summary: string;
  detail?: string;
};

// Resolved per theme rather than at module load: light mode carries its own,
// deeper status ramp — see the note at the top of `consoleTheme.ts`.
function kindHexes(isDark: boolean): Record<MachineEventKind, string> {
  const levels = levelHexes(isDark);
  const quiet = consolePalette(isDark).neutral;
  return {
    info: quiet,
    normal: levels.normal,
    alert: levels.alert,
    danger: levels.danger,
    'sensor-offline': quiet,
    'comms-failure': levels.danger,
  };
}

const KIND_LABEL: Record<MachineEventKind, string> = {
  info: 'INFO',
  normal: 'OK',
  alert: 'ALERT',
  danger: 'DANGER',
  'sensor-offline': 'OFFLINE',
  'comms-failure': 'COMMS',
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function RecentEvents({ events, limit = 6 }: { events?: MachineEvent[]; limit?: number }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : palette.lineSubtle;
  const kindHex = kindHexes(isDark);

  const shown = (events ?? []).slice(0, limit);

  return (
    <View className="gap-3">
      <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Recent events</Text>

      {shown.length === 0 ? (
        <Text className={cn('font-body text-[12.5px] italic', mutedClass)}>
          No event source is wired to this machine yet, so nothing is recorded here.
        </Text>
      ) : (
        <View className="gap-0">
          {shown.map((event, index) => (
            <Hoverable
              key={event.id}
              className="flex-row gap-3 px-2 py-2"
              style={({ hovered }) => ({
                marginHorizontal: -8,
                borderRadius: radius.sm,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: hairline,
                backgroundColor: hovered ? palette.hoverSurface : undefined,
              })}
            >
              <Text className={cn('w-10 font-mono text-[11.5px] tabular-nums', mutedClass)}>{timeLabel(event.at)}</Text>

              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 4, backgroundColor: kindHex[event.kind] }} />

              <View className="flex-1">
                <Text numberOfLines={1} className={cn('font-body text-[12.5px]', inkClass)}>
                  {event.summary}
                </Text>
                {event.detail ? (
                  <Text numberOfLines={1} className={cn('font-mono text-[10.5px]', mutedClass)}>
                    {event.detail}
                  </Text>
                ) : null}
              </View>

              <Text style={{ color: kindHex[event.kind] }} className="font-mono text-[9.5px] font-bold tracking-wider">
                {KIND_LABEL[event.kind]}
              </Text>
            </Hoverable>
          ))}
        </View>
      )}
    </View>
  );
}
