/**
 * Connectivity — where every number physically comes from.
 *
 * The Analyzer could always say what a parameter reads and what was concluded
 * from it. It could not answer the question asked first on a commissioning
 * visit: *which terminal is this wired to*. This tab walks the whole chain —
 * parameter → gateway → rack → slot → channel → tag — for every mapped point,
 * with the live value and freshness at the end of it, so a silent reading can be
 * traced to the box it should be arriving from without leaving the screen.
 *
 * All of it is joined in `lib/analysis/connectivity.ts` from structures the
 * workspace already holds. Nothing on this screen is invented.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import {
  buildTopology,
  relativeAge,
  summariseConnections,
  type ConnectionQuality,
  type ParameterConnection,
} from '../../../../lib/analysis/connectivity';
import { alpha, Badge, consolePalette, StatusDot, variantStyle, type Variant } from '../../../ui';
import { EmptyNote, ExpandableRow, Fact, FilterChips, Node, SearchField, Section, SummaryStrip } from './AnalyzerParts';

const QUALITY_VARIANT: Record<ConnectionQuality, Variant> = {
  good: 'success',
  warning: 'warning',
  bad: 'destructive',
  offline: 'muted',
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: 'Good',
  warning: 'Stale',
  bad: 'Bad',
  offline: 'Offline',
};

type StateFilter = 'all' | 'connected' | 'unmapped' | 'offline';

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

/**
 * The connection path for one parameter, as a chain of nodes.
 *
 * Drawn rather than written out as a sentence: the point of this panel is that
 * the chain has a shape, and that a break in it is at one specific link.
 */
function ConnectionPath({ row }: { row: ParameterConnection }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const tone = variantStyle(palette, QUALITY_VARIANT[row.quality]).accent;

  const steps: { label: string; value: string; tone?: string }[] = [
    { label: 'Gateway', value: row.gatewayName, tone: row.gatewayOnline ? palette.accent : palette.neutral },
    { label: 'Rack', value: row.rackName, tone: row.rackOnline ? palette.accent : palette.neutral },
    { label: 'Slot', value: `S-${String(row.slot).padStart(2, '0')}` },
    { label: 'Channel', value: row.channelId },
    { label: 'Input', value: row.inputId },
    { label: 'Tag', value: row.tag ?? 'unmapped', tone: row.tag ? tone : palette.neutral },
  ];

  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <View key={step.label} className="flex-row items-center gap-1.5">
          {index > 0 ? <MaterialCommunityIcons name="chevron-right" size={13} color={palette.inkFaint} /> : null}
          <Node label={step.label} value={step.value} tone={step.tone} palette={palette} />
        </View>
      ))}
    </View>
  );
}

/**
 * The acquisition tree, one branch per gateway.
 *
 * Kept to three levels and no lines: the purpose is traceability — which
 * channels hang off which rack off which gateway — not a wiring diagram.
 */
function Topology({ rows }: { rows: ParameterConnection[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const tree = useMemo(() => buildTopology(rows), [rows]);

  return (
    <View className="gap-2.5">
      {tree.map((gateway) => (
        <View
          key={gateway.gatewayName}
          className="gap-2 rounded-lg border px-3 py-2.5"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <View className="flex-row items-center gap-2">
            <StatusDot variant={gateway.online ? 'success' : 'muted'} size={6} />
            <Text className="font-mono text-[11px]" style={{ color: palette.ink }}>
              {gateway.gatewayName}
            </Text>
            <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
              {gateway.gatewayId}
            </Text>
            <View className="min-w-0 flex-1" />
            <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
              {gateway.racks.length} rack{gateway.racks.length === 1 ? '' : 's'}
            </Text>
          </View>

          {gateway.racks.map((rack) => (
            <View key={rack.rackName} className="gap-1.5 pl-3" style={{ borderLeftWidth: 1, borderLeftColor: palette.line }}>
              <View className="flex-row items-center gap-2">
                <StatusDot variant={rack.online ? 'success' : 'muted'} size={5} />
                <Text className="font-mono text-[10.5px]" style={{ color: palette.inkMuted }}>
                  {rack.rackName}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {rack.channels.map((channel) => {
                  const tone = variantStyle(palette, QUALITY_VARIANT[channel.quality]).accent;
                  return (
                    <View
                      key={channel.parameterId}
                      className="flex-row items-center gap-1.5 rounded-md border px-2 py-[3px]"
                      style={{ borderColor: alpha(tone, 0.35), backgroundColor: palette.panel }}
                      accessibilityLabel={`${channel.channelId}, ${channel.parameter}, ${QUALITY_LABEL[channel.quality]}`}
                    >
                      <View style={{ width: 4.5, height: 4.5, borderRadius: 5, backgroundColor: tone }} />
                      <Text className="font-mono text-[9.5px]" style={{ color: palette.ink }}>
                        {channel.channelId}
                      </Text>
                      <Text className="font-mono text-[9.5px]" style={{ color: palette.inkFaint }}>
                        {channel.tag ?? '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ConnectivityTab({ connections }: { connections: ParameterConnection[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const tabular = width >= 1180;

  const [query, setQuery] = useState('');
  const [state, setState] = useState<StateFilter>('all');
  const [gateway, setGateway] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showTopology, setShowTopology] = useState(false);

  const summary = useMemo(() => summariseConnections(connections), [connections]);

  const gatewayOptions = useMemo(() => {
    const names = [...new Set(connections.map((row) => row.gatewayName))];
    return [
      { value: 'all', label: 'All gateways', count: connections.length },
      ...names.map((name) => ({
        value: name,
        label: name,
        count: connections.filter((row) => row.gatewayName === name).length,
      })),
    ];
  }, [connections]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return connections.filter((row) => {
      if (state !== 'all' && row.state !== state) return false;
      if (gateway !== 'all' && row.gatewayName !== gateway) return false;
      if (!needle) return true;
      return (
        row.parameter.toLowerCase().includes(needle) ||
        (row.tag ?? '').toLowerCase().includes(needle) ||
        row.gatewayName.toLowerCase().includes(needle) ||
        row.rackName.toLowerCase().includes(needle) ||
        row.channelId.toLowerCase().includes(needle) ||
        row.channelCode.toLowerCase().includes(needle)
      );
    });
  }, [connections, gateway, query, state]);

  if (connections.length === 0) {
    return (
      <Section
        title="Connectivity"
        eyebrow="Acquisition chain"
        meta="Where every parameter is physically connected, from the machine drawing down to the terminal."
      >
        <EmptyNote>
          No saved connection exists for this machine. Link boxes to rack channels in Design mode and save the canvas
          before the acquisition chain can be traced.
        </EmptyNote>
      </Section>
    );
  }

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'params', label: 'Parameters', value: String(summary.total) },
          { key: 'connected', label: 'Connected', value: String(summary.connected), variant: 'success' },
          { key: 'offline', label: 'Silent', value: String(summary.offline), variant: summary.offline > 0 ? 'warning' : 'muted' },
          { key: 'unmapped', label: 'Unmapped', value: String(summary.unmapped), variant: summary.unmapped > 0 ? 'warning' : 'muted' },
          { key: 'gateways', label: 'Gateways', value: String(summary.gateways) },
          { key: 'racks', label: 'Racks', value: String(summary.racks) },
        ]}
      />

      <Section
        title="Parameter routing"
        eyebrow="Parameter → gateway → rack → channel"
        meta="Open a row to trace the whole chain and see the terminal it lands on."
        padded={false}
        actions={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search parameters…" width={190} />
            <FilterChips
              label="Filter parameters by gateway"
              value={gateway}
              onChange={setGateway}
              options={gatewayOptions}
            />
            <FilterChips
              label="Filter parameters by connection state"
              value={state}
              onChange={setState}
              options={[
                { value: 'all', label: 'All', count: summary.total },
                { value: 'connected', label: 'Connected', count: summary.connected, variant: 'success' },
                { value: 'offline', label: 'Silent', count: summary.offline, variant: 'warning' },
                { value: 'unmapped', label: 'Unmapped', count: summary.unmapped, variant: 'muted' },
              ]}
            />
          </>
        }
        footnote="Gateway, rack and channel identities come from the device hierarchy; values and freshness come from the live measurement frames. Nothing on this table is generated."
      >
        {tabular ? (
          <View
            className="flex-row items-center gap-3 px-3 py-1.5"
            style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
          >
            {[
              { key: 'param', label: 'Parameter', flex: 2.2, align: 'left' as const },
              { key: 'tag', label: 'Tag', flex: 0.8, align: 'left' as const },
              { key: 'gw', label: 'Gateway', flex: 1.3, align: 'left' as const },
              { key: 'rack', label: 'Rack', flex: 1.3, align: 'left' as const },
              { key: 'ch', label: 'Channel', flex: 0.9, align: 'left' as const },
              { key: 'signal', label: 'Signal', flex: 1.1, align: 'left' as const },
              { key: 'value', label: 'Current', flex: 1, align: 'right' as const },
              { key: 'quality', label: 'Quality', flex: 0.9, align: 'left' as const },
              { key: 'seen', label: 'Last update', flex: 1, align: 'left' as const },
            ].map((column) => (
              <Text
                key={column.key}
                numberOfLines={1}
                className="font-mono text-[8.5px] uppercase tracking-[0.15em]"
                style={{ color: palette.inkFaint, flex: column.flex, textAlign: column.align }}
              >
                {column.label}
              </Text>
            ))}
          </View>
        ) : null}

        {rows.length === 0 ? (
          <EmptyNote>No parameter matches the current filter.</EmptyNote>
        ) : (
          rows.map((row, index) => {
            const variant = QUALITY_VARIANT[row.quality];
            const style = variantStyle(palette, variant);
            const open = openId === row.parameterId;
            return (
              <ExpandableRow
                key={row.parameterId}
                first={index === 0}
                expanded={open}
                onToggle={() => setOpenId(open ? null : row.parameterId)}
                accessibilityLabel={`${row.parameter}, ${row.gatewayName}, ${row.rackName}, ${row.channelId}, ${QUALITY_LABEL[row.quality]}`}
                tone={row.quality === 'bad' ? style.accent : undefined}
                summary={
                  tabular ? (
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0 flex-row items-center gap-1.5" style={{ flex: 2.2 }}>
                        <StatusDot variant={variant} size={6} />
                        <Text className="min-w-0 flex-1 font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {row.parameter}
                        </Text>
                      </View>
                      <Text className="font-mono text-[11px]" style={{ flex: 0.8, color: row.tag ? palette.ink : palette.inkFaint }} numberOfLines={1}>
                        {row.tag ?? '—'}
                      </Text>
                      <Text className="font-mono text-[10.5px]" style={{ flex: 1.3, color: palette.inkMuted }} numberOfLines={1}>
                        {row.gatewayName}
                      </Text>
                      <Text className="font-mono text-[10.5px]" style={{ flex: 1.3, color: palette.inkMuted }} numberOfLines={1}>
                        {row.rackName}
                      </Text>
                      <Text className="font-mono text-[10.5px]" style={{ flex: 0.9, color: palette.ink }} numberOfLines={1}>
                        {row.channelId}
                      </Text>
                      <Text className="font-mono text-[10px]" style={{ flex: 1.1, color: palette.inkMuted }} numberOfLines={1}>
                        {row.signalType}
                      </Text>
                      <Text
                        className="font-mono text-[11.5px]"
                        style={{ flex: 1, textAlign: 'right', color: palette.ink, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {formatNumber(row.value)}
                        <Text className="text-[9.5px]" style={{ color: palette.inkFaint }}>
                          {row.unit ? ` ${row.unit}` : ''}
                        </Text>
                      </Text>
                      <View style={{ flex: 0.9 }}>
                        <Badge variant={variant}>{QUALITY_LABEL[row.quality]}</Badge>
                      </View>
                      <Text className="font-mono text-[10px]" style={{ flex: 1, color: palette.inkMuted }} numberOfLines={1}>
                        {relativeAge(row.lastUpdatedAt)}
                      </Text>
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      <View className="flex-row items-center gap-2">
                        <StatusDot variant={variant} size={6} />
                        <Text className="min-w-0 flex-1 font-body text-[12.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {row.parameter}
                        </Text>
                        <Badge variant={variant}>{QUALITY_LABEL[row.quality]}</Badge>
                      </View>
                      <View className="flex-row flex-wrap gap-x-5 gap-y-1">
                        <Fact label="Tag" value={row.tag ?? '—'} width={70} />
                        <Fact label="Gateway" value={row.gatewayName} mono={false} width={130} />
                        <Fact label="Rack" value={row.rackName} mono={false} width={120} />
                        <Fact label="Channel" value={row.channelId} width={78} />
                        <Fact label="Current" value={`${formatNumber(row.value)} ${row.unit}`.trim()} width={100} />
                      </View>
                    </View>
                  )
                }
                detail={
                  <View className="gap-2.5 pt-2">
                    <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                      Connection path
                    </Text>
                    <ConnectionPath row={row} />

                    <View className="flex-row flex-wrap gap-x-6 gap-y-1.5 pt-0.5">
                      <Fact label="Card" value={row.cardType} mono={false} width={150} />
                      <Fact label="Signal" value={row.signalType} mono={false} width={120} />
                      <Fact label="Data type" value={row.dataType} mono={false} width={150} />
                      <Fact label="Rack code" value={row.channelCode} width={90} />
                      <Fact label="Gateway id" value={row.gatewayId} width={130} />
                      <Fact label="Rack id" value={row.rackId} width={110} />
                      <Fact label="Quality" value={QUALITY_LABEL[row.quality]} mono={false} width={90} />
                      <Fact label="Last update" value={relativeAge(row.lastUpdatedAt)} mono={false} width={120} />
                    </View>

                    {row.note ? (
                      <Text className="font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
                        {row.note}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })
        )}
      </Section>

      <Section
        title="Acquisition topology"
        eyebrow="Traceability"
        meta="Which channels hang off which rack, off which gateway."
        actions={
          <FilterChips
            label="Show or hide the topology"
            value={showTopology ? 'show' : 'hide'}
            onChange={(value) => setShowTopology(value === 'show')}
            options={[
              { value: 'hide', label: 'Hidden' },
              { value: 'show', label: 'Shown' },
            ]}
          />
        }
      >
        {showTopology ? (
          <Topology rows={connections} />
        ) : (
          <EmptyNote>The tree is hidden. Show it to trace a gateway branch end to end.</EmptyNote>
        )}
      </Section>
    </View>
  );
}
