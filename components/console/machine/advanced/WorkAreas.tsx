import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { conditionHexes, CONDITION_LABEL } from '../../../../lib/analysisOverview';
import {
  changePercent,
  EVENT_KIND_LABEL,
  qualityHex,
  QUALITY_LABEL,
  type AnalystEvent,
  type ConditionRow,
  type CorrelationRow,
  type PropagationRow,
} from '../../../../lib/advancedDiagnosis';
import { cn } from '../../../../lib/cn';
import { seriesColour } from './vizTokens';

export function WorkAreaHeader({ step, title, description }: { step: string; title: string; description: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-1.5">
      <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">{step}</Text>
      <Text className={cn('font-heading-medium text-[17px]', inkClass)}>{title}</Text>
      <Text className={cn('font-body text-[11px] leading-[17px]', mutedClass)} style={{ maxWidth: 720 }}>
        {description}
      </Text>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme();
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  return (
    <View className="flex-row items-center gap-2 py-2" style={{ borderBottomWidth: 1, borderBottomColor: hairline }}>
      {children}
    </View>
  );
}

function HeadCell({ label, width, right }: { label: string; width?: number; right?: boolean }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <Text
      style={width ? { width } : undefined}
      className={cn('font-mono text-[8px] uppercase tracking-wider', !width && 'flex-1', right && 'text-right', mutedClass)}
    >
      {label}
    </Text>
  );
}

// --- 01 · Observe -------------------------------------------------------------

// Operating context before anything else. A vibration figure without the speed and
// load it was taken at is not a measurement, it is a number — which is why this
// work area comes first and why the comparison table below insists on
// like-for-like states.
export function MachineWorkArea({
  rows,
  operating,
}: {
  rows: ConditionRow[];
  operating: Array<{ label: string; value: string; note?: string }>;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-4">
      <WorkAreaHeader
        step="01 · OBSERVE"
        title="Machine-wide condition"
        description="Establish the operating state the readings were taken in, then read condition across every domain before isolating a component."
      />

      <View className="flex-row flex-wrap gap-3">
        {operating.map((item) => (
          <View
            key={item.label}
            style={{ flexGrow: 1, flexBasis: 130, minWidth: 120, borderColor: hairline }}
            className="gap-1 rounded-lg border px-3 py-2.5"
          >
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{item.label}</Text>
            <Text className={cn('font-mono text-[14px] tabular-nums', inkClass)}>{item.value}</Text>
            {item.note ? <Text className={cn('font-body text-[9px]', mutedClass)}>{item.note}</Text> : null}
          </View>
        ))}
      </View>

      <View>
        <Text className={cn('mb-1 font-mono text-[9px] tracking-wider', mutedClass)}>CONDITION BY DOMAIN</Text>

        <Row>
          <HeadCell label="Area" />
          <HeadCell label="Health" width={54} right />
          <HeadCell label="Main indicator" width={168} />
          <HeadCell label="Trend" width={112} />
          <HeadCell label="Condition" width={76} />
          <HeadCell label="Data" width={92} />
          <HeadCell label="Changed" width={62} right />
        </Row>

        {rows.map((row) => (
          <Row key={row.area}>
            <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
              {row.area}
            </Text>
            <Text style={{ width: 54 }} className={cn('text-right font-mono text-[11px] tabular-nums', inkClass)}>
              {row.health === null ? '--' : `${row.health}%`}
            </Text>
            <Text numberOfLines={1} style={{ width: 168 }} className={cn('font-mono text-[10px]', mutedClass)}>
              {row.indicator}
            </Text>
            <Text numberOfLines={1} style={{ width: 112 }} className={cn('font-body text-[10px]', mutedClass)}>
              {row.trend}
            </Text>
            <Text style={{ width: 76, color: conditionHex[row.condition] }} className="font-mono text-[9px] font-bold tracking-wider">
              {CONDITION_LABEL[row.condition]}
            </Text>
            <Text style={{ width: 92, color: qualityHex(row.quality, isDark) }} className="font-mono text-[9px] tracking-wider">
              {QUALITY_LABEL[row.quality]}
            </Text>
            <Text style={{ width: 62 }} className={cn('text-right font-mono text-[10px]', mutedClass)}>
              {row.lastChange}
            </Text>
          </Row>
        ))}
      </View>
    </View>
  );
}

// --- 02 · Decompose ----------------------------------------------------------

// Where the energy is strongest, and whether it propagates. Comparing raw
// amplitudes across locations is only meaningful at the same speed and load, which
// is why the baseline column and the change are shown together rather than the
// current value alone.
export function TrainWorkArea({ rows, note }: { rows: PropagationRow[]; note: string }) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const strongest = rows.reduce<PropagationRow | null>((worst, row) => {
    const rowChange = changePercent(row);
    const worstChange = worst ? changePercent(worst) : null;
    if (rowChange === null) return worst;
    return worstChange === null || rowChange > worstChange ? row : worst;
  }, null);

  return (
    <View className="gap-4">
      <WorkAreaHeader
        step="02 · DECOMPOSE"
        title="Fault propagation across the train"
        description="Compare the same measurement at every location in the power path, at comparable speed and load, to find where the abnormality originates."
      />

      <View>
        <Row>
          <HeadCell label="Location" />
          <HeadCell label="Current" width={78} right />
          <HeadCell label="Baseline" width={78} right />
          <HeadCell label="Change" width={76} right />
          <HeadCell label="Role" width={186} />
        </Row>

        {rows.map((row) => {
          const change = changePercent(row);
          const isStrongest = strongest?.location === row.location;
          const tint = conditionHex[row.condition];

          return (
            <Row key={row.location}>
              <View className="flex-1 flex-row items-center gap-2">
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tint }} />
                <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
                  {row.location}
                </Text>
              </View>

              <Text
                style={{ width: 78, color: isStrongest ? tint : undefined }}
                className={cn('text-right font-mono text-[11px] tabular-nums', !isStrongest && inkClass)}
              >
                {row.current.toFixed(2)}
              </Text>
              <Text style={{ width: 78 }} className={cn('text-right font-mono text-[11px] tabular-nums', mutedClass)}>
                {row.baseline === null ? '--' : row.baseline.toFixed(2)}
              </Text>
              <Text
                style={{ width: 76, color: isStrongest ? tint : undefined }}
                className={cn('text-right font-mono text-[11px] font-bold tabular-nums', !isStrongest && mutedClass)}
              >
                {change === null ? '--' : `${change > 0 ? '+' : ''}${Math.round(change)}%`}
              </Text>
              <Text numberOfLines={1} style={{ width: 186 }} className={cn('font-body text-[10px]', mutedClass)}>
                {row.role}
              </Text>
            </Row>
          );
        })}
      </View>

      <Text className={cn('font-body text-[11px] leading-[17px]', inkClass)}>{note}</Text>
    </View>
  );
}

// --- 04 · Correlate ----------------------------------------------------------

// Strength as magnitude with the sign stated in words, and the lag beside it.
//
// Deliberately not a red/green heatmap: correlation polarity is not a machine
// state, and borrowing the status hues for it would make a negative correlation
// look like an alarm. The bar is a single sequential hue; the sign is a label.
export function CorrelationWorkArea({ rows, caveat }: { rows: CorrelationRow[]; caveat: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  return (
    <View className="gap-4">
      <WorkAreaHeader
        step="04 · CORRELATE"
        title="Dependence on speed, load and process"
        description="Test whether the abnormality tracks an operating variable. A strong relationship narrows the mechanism; it does not establish cause."
      />

      <View>
        <Row>
          <HeadCell label="Relationship" />
          <HeadCell label="Strength" width={148} />
          <HeadCell label="Sign" width={62} />
          <HeadCell label="Lag" width={62} right />
          <HeadCell label="Reading" width={190} />
        </Row>

        {rows.map((row) => (
          <Row key={row.pair}>
            <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
              {row.pair}
            </Text>

            <View style={{ width: 148 }} className="flex-row items-center gap-2">
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: track }} className="overflow-hidden">
                <View
                  style={{
                    height: 5,
                    borderRadius: 3,
                    width: `${Math.max(0, Math.min(100, row.strength * 100))}%`,
                    backgroundColor: seriesColour(isDark),
                  }}
                />
              </View>
              <Text className={cn('font-mono text-[10px] tabular-nums', inkClass)}>{row.strength.toFixed(2)}</Text>
            </View>

            <Text style={{ width: 62 }} className={cn('font-mono text-[10px]', mutedClass)}>
              {row.positive ? 'positive' : 'negative'}
            </Text>
            <Text style={{ width: 62 }} className={cn('text-right font-mono text-[10px] tabular-nums', mutedClass)}>
              {row.lagMinutes === null ? '--' : `${row.lagMinutes > 0 ? '+' : ''}${row.lagMinutes}m`}
            </Text>
            <Text numberOfLines={1} style={{ width: 190 }} className={cn('font-body text-[10px]', mutedClass)}>
              {row.interpretation}
            </Text>
          </Row>
        ))}
      </View>

      <Text className={cn('font-body text-[11px] leading-[17px]', mutedClass)}>{caveat}</Text>
    </View>
  );
}

// --- 05 · Compare ------------------------------------------------------------

// Machine events beside diagnostic ones, because the sequence is the argument: a
// signal that worsened before a load change is a different story from one that
// worsened after it.
export function EventsWorkArea({ events }: { events: AnalystEvent[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-4">
      <WorkAreaHeader
        step="05 · COMPARE"
        title="Events and failure evolution"
        description="Line the diagnostic history up against operations, alarms and maintenance, so cause and coincidence can be told apart by order."
      />

      {events.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>
          No event source is wired to this machine, so there is no history to line up against.
        </Text>
      ) : (
        <View>
          <Row>
            <HeadCell label="When" width={104} />
            <HeadCell label="Event" />
            <HeadCell label="Kind" width={96} />
            <HeadCell label="Why it matters" width={228} />
          </Row>

          {events.map((event) => (
            <Row key={event.id}>
              <Text style={{ width: 104 }} className={cn('font-mono text-[10px]', mutedClass)}>
                {event.at}
              </Text>
              <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
                {event.event}
              </Text>
              <Text style={{ width: 96 }} className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>
                {EVENT_KIND_LABEL[event.kind]}
              </Text>
              <Text numberOfLines={1} style={{ width: 228 }} className={cn('font-body text-[10px]', mutedClass)}>
                {event.analystValue}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </View>
  );
}
