// Verification harness for the Twin Screw Extruder template.
//
// Same discipline as `__machine-qa.tsx` and `__sse-demo-qa.tsx`: nothing here is
// a mock. The pads, the connectors, the default layout and the analysis all come
// from the shipped modules, so what this page shows is what the console does.
//
//   /__tse-qa?state=idle|linked|live|mixed&labels=on|off&width=<px>
//
// The reference-image overlay is a development alignment aid only. It draws a
// PNG *behind* the SVG at adjustable opacity so artwork proportions can be
// checked against the source drawing. The production machine is always the
// vector SVG; the raster is never the rendered machine. Drop a file at
// `public/references/twin-screw-extruder-reference.png` to use it — the control
// is inert when the file is absent.
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useColorScheme } from 'nativewind';

import { TwinScrewExtruder } from '../../components/console/machine/TwinScrewExtruder';
import { connectorsForTemplate } from '../../components/console/machine/machineConnectors';
import { createTemplateDefaultLayout } from '../../components/console/machine/templateDefaultLayouts';
import { buildTwinScrewExtruderArtwork } from '../../components/console/machine/twinScrewArtwork';
import type { MeasurementPadState } from '../../components/console/machine/MeasurementPad';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../lib/twinScrewExtruderPoints';
import { analyseTwinScrew, THRESHOLD_RULES, type TagSample } from '../../lib/analysis/twinScrew';

const REFERENCE_IMAGE = '/references/twin-screw-extruder-reference.png';

/** The parts of the machine the registry hangs measurement points off. */
const MACHINE_PARTS = [
  'motor',
  'motor-coupling',
  'gearbox',
  'gearbox-output',
  'main-hopper',
  'barrel',
  'upper-screw',
  'lower-screw',
  'side-feeder',
  'vent',
  'die',
];

/**
 * What the drawing actually contains.
 *
 * Read off the shipped artwork rather than restated here, so this panel can
 * only ever describe the machine the console renders. A dangling `url(#…)` is
 * called out because it is the one fault in an SVG that changes what you see
 * depending on which renderer opened it, and shows up in no diff.
 */
const ARTWORK = (() => {
  const svg = buildTwinScrewExtruderArtwork();
  const referenced = new Set(Array.from(svg.matchAll(/url\(#([^)]+)\)/g), (m) => m[1]));
  const declared = new Set(Array.from(svg.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
  return {
    elements: (svg.match(/<(?!\/|\?|!)/g) ?? []).length,
    parts: MACHINE_PARTS.map((id) => (declared.has(id) ? id : `${id} MISSING`)),
    dangling: [...referenced].filter((id) => !declared.has(id)),
  };
})();

type PadMode = 'idle' | 'linked' | 'live' | 'mixed';

function padStates(mode: PadMode): Record<string, MeasurementPadState> {
  const out: Record<string, MeasurementPadState> = {};
  TWIN_SCREW_POINT_REGISTRY.forEach((point, index) => {
    out[point.code] =
      mode === 'mixed' ? (['idle', 'linked', 'live'] as const)[index % 3] : (mode as MeasurementPadState);
  });
  return out;
}

/** A representative sample set, so the analysis panel shows real output. */
const SAMPLES: TagSample[] = [
  { tag: 'TS-V1', label: 'Motor Drive-End Vibration', value: 2.1, unit: 'mm/s', history: [2.0, 2.1, 2.05, 2.11, 2.09, 2.12, 2.08, 2.1], reporting: true },
  { tag: 'TS-V4', label: 'Gearbox Output-1 Vibration', value: 1.2, unit: 'g', reporting: true },
  { tag: 'TS-TZ2', label: 'Barrel Temperature Zone 2', value: 190, unit: 'degC', history: [190, 190, 190, 190, 190, 190, 190, 190], reporting: true },
  { tag: 'TS-P1', label: 'Intermediate Melt Pressure 1', value: null, unit: 'MPa', reporting: false },
  { tag: 'TS-P2', label: 'Intermediate Melt Pressure 2', value: 5, unit: 'degC', reporting: true },
  { tag: 'TS-S1', label: 'Screw A Speed', value: 300, unit: 'rpm', reporting: true },
  { tag: 'TS-S2', label: 'Screw B Speed', value: 288, unit: 'rpm', reporting: true },
  { tag: 'TS-P3', label: 'Screen Inlet Melt Pressure', value: 9, unit: 'MPa', reporting: true },
  { tag: 'TS-P4', label: 'Screen Outlet Melt Pressure', value: 7, unit: 'MPa', reporting: true },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: 2, opacity: 0.6, marginBottom: 8 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export default function TwinScrewQaPage() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [mode, setMode] = useState<PadMode>('mixed');
  const [labels, setLabels] = useState(true);
  const [width, setWidth] = useState(1440);
  const [overlay, setOverlay] = useState(0);
  const [showCodes, setShowCodes] = useState(false);

  const states = useMemo(() => padStates(mode), [mode]);
  const connectors = useMemo(() => connectorsForTemplate('Twin Screw Extruder'), []);
  const layout = useMemo(() => createTemplateDefaultLayout('Twin Screw Extruder', [], null), []);
  const analysis = useMemo(() => analyseTwinScrew(SAMPLES), []);

  const dark = colorScheme === 'dark';
  const fg = dark ? '#E7E9EC' : '#1A1D21';
  const bg = dark ? '#0B0D10' : '#FFFFFF';
  const mono = { fontFamily: 'monospace', fontSize: 11, color: fg } as const;

  const button = (text: string, active: boolean, onPress: () => void) => (
    <Text
      key={text}
      onPress={onPress}
      style={{
        ...mono,
        paddingVertical: 4,
        paddingHorizontal: 10,
        marginRight: 6,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: active ? '#16c84a' : dark ? '#333' : '#CCC',
        backgroundColor: active ? 'rgba(22,200,74,0.12)' : 'transparent',
      }}
    >
      {text}
    </Text>
  );

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ padding: 24 }}>
      <Text style={{ ...mono, fontSize: 16, marginBottom: 4 }}>Twin Screw Extruder — template QA</Text>
      <Text style={{ ...mono, opacity: 0.6, marginBottom: 16 }}>
        viewBox {TWIN_SCREW_ARTWORK_WIDTH}x{TWIN_SCREW_ARTWORK_HEIGHT} · {TWIN_SCREW_POINT_REGISTRY.length} registry points ·{' '}
        {ARTWORK.elements} drawn elements · {ARTWORK.parts.length} named parts
      </Text>

      <Section title="Pad state">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(['idle', 'linked', 'live', 'mixed'] as PadMode[]).map((m) => button(m, mode === m, () => setMode(m)))}
        </View>
      </Section>

      <Section title="Display">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {button(labels ? 'labels on' : 'labels off', labels, () => setLabels((v) => !v))}
          {button(dark ? 'dark' : 'light', dark, () => setColorScheme(dark ? 'light' : 'dark'))}
          {button(showCodes ? 'codes on' : 'codes off', showCodes, () => setShowCodes((v) => !v))}
        </View>
      </Section>

      <Section title="Container width">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[1440, 1024, 768, 390].map((w) => button(`${w}px`, width === w, () => setWidth(w)))}
        </View>
      </Section>

      <Section title="Reference overlay (development alignment aid only)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[0, 0.25, 0.5, 0.75].map((o) => button(`${Math.round(o * 100)}%`, overlay === o, () => setOverlay(o)))}
        </View>
        <Text style={{ ...mono, opacity: 0.55 }}>
          Draws {REFERENCE_IMAGE} behind the SVG. The production machine is always the vector drawing; the raster is never
          shipped as the rendered machine.
        </Text>
      </Section>

      <View style={{ width, borderWidth: 1, borderColor: dark ? '#222' : '#DDD', marginBottom: 24 }}>
        <View style={{ position: 'relative' }}>
          {overlay > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={REFERENCE_IMAGE}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: overlay, objectFit: 'contain' }}
            />
          )}
          <TwinScrewExtruder connectorState={states} showPartLabels={labels} showBackground />
          {showCodes && (
            <View style={{ position: 'absolute', inset: 0 }} pointerEvents="none">
              {TWIN_SCREW_POINT_REGISTRY.map((point) => (
                <Text
                  key={point.code}
                  style={{
                    position: 'absolute',
                    left: `${(point.x / TWIN_SCREW_ARTWORK_WIDTH) * 100}%`,
                    top: `${(point.y / TWIN_SCREW_ARTWORK_HEIGHT) * 100}%`,
                    fontFamily: 'monospace',
                    fontSize: 8,
                    color: '#16c84a',
                    transform: [{ translateX: 8 }, { translateY: -4 }],
                  }}
                >
                  {point.code}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>

      <Section title={`Registry (${TWIN_SCREW_POINT_REGISTRY.length})`}>
        {TWIN_SCREW_POINT_REGISTRY.map((point) => {
          const connector = connectors.find((c) => c.code === point.code);
          return (
            <View key={point.code} style={{ flexDirection: 'row', paddingVertical: 2 }}>
              <Text style={{ ...mono, width: 170 }}>{point.code}</Text>
              <Text style={{ ...mono, width: 90 }}>{point.analyzerTag}</Text>
              <Text style={{ ...mono, width: 110 }}>{point.kind}</Text>
              <Text style={{ ...mono, width: 140 }}>{point.component}</Text>
              <Text style={{ ...mono, width: 110 }}>{point.modelStatus}</Text>
              <Text style={{ ...mono, width: 130 }}>
                {connector ? `${connector.rx.toFixed(3)}, ${connector.ry.toFixed(3)}` : 'NO CONNECTOR'}
              </Text>
              <Text style={{ ...mono, flex: 1, opacity: 0.55 }}>{point.analyzerNote ?? ''}</Text>
            </View>
          );
        })}
      </Section>

      <Section title="Artwork">
        <Text style={mono}>{ARTWORK.parts.join(' · ')}</Text>
        <Text style={{ ...mono, opacity: 0.55, marginTop: 4 }}>
          {ARTWORK.dangling.length === 0
            ? 'every paint, clip and filter reference resolves'
            : `DANGLING REFERENCES: ${ARTWORK.dangling.join(', ')}`}
        </Text>
      </Section>

      <Section title={`Default layout (${layout.trails.length} trails, ${layout.boxes.length} cards)`}>
        {layout.boxes.slice(0, 6).map((box) => (
          <Text key={box.id} style={mono}>
            {box.templatePointCode} · {box.label} · ({Math.round(box.x)}, {Math.round(box.y)})
          </Text>
        ))}
        <Text style={{ ...mono, opacity: 0.55 }}>…and {layout.boxes.length - 6} more</Text>
      </Section>

      <Section title={`Analysis — findings (${analysis.findings.length})`}>
        {analysis.findings.map((finding) => (
          <View key={`${finding.ruleId}-${finding.evidence.join()}`} style={{ paddingVertical: 3 }}>
            <Text style={mono}>
              [{finding.status}] {finding.name} · {finding.part} · {finding.evidence.join(', ')}
            </Text>
            <Text style={{ ...mono, opacity: 0.6 }}>{finding.detail}</Text>
          </View>
        ))}
      </Section>

      <Section title="Analysis — derived values">
        {analysis.derived.map((value) => (
          <Text key={value.id} style={mono}>
            {value.label}: {value.value === null ? 'unavailable' : `${value.value.toFixed(2)} ${value.unit}`}
            {value.derivedFrom.length ? ` (from ${value.derivedFrom.join(' + ')})` : ` — ${value.unavailableReason}`}
          </Text>
        ))}
      </Section>

      <Section title={`Analysis — rules awaiting commissioning (${THRESHOLD_RULES.length})`}>
        {analysis.pending.map((rule) => (
          <View key={rule.ruleId} style={{ paddingVertical: 3 }}>
            <Text style={mono}>
              [{rule.status}] {rule.name} · {rule.part}
            </Text>
            <Text style={{ ...mono, opacity: 0.6 }}>requires: {rule.requires}</Text>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}
