/**
 * Mapping an instrument by tapping its pad.
 *
 * The board's original and only way to declare a connection was to add a card
 * and drag its trail endpoint onto a pad. The pads were drawn only while an
 * endpoint was already in the air, so the affordance was invisible until
 * after you had committed to using it: you had to know the pads were there in
 * order to find out that they were there.
 *
 * Two things are checked. `createCardForConnector` is pure and is exercised
 * against every pad of every template that has artwork — it is what decides
 * where a tapped pad's card lands and what it is wired to. The render
 * condition is checked against source, because "the pads are visible for the
 * whole of configure mode" is a condition in JSX and re-gating it on `wiring`
 * is a one-word edit that would restore the old behaviour silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MACHINE_TEMPLATES } from '../../../../lib/machines';
import { artworkSizeForTemplate, connectorsForTemplate } from '../machineConnectors';
import { createCardForConnector, hasDefaultLayout } from '../templateDefaultLayouts';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const REFERENCE_RECT = { x: 384, y: 186.53, width: 832, height: 526.93 };

const withPads = (MACHINE_TEMPLATES as readonly string[]).filter(
  (template) => connectorsForTemplate(template).length > 0,
);

console.log('--- every pad on every template can be mapped by tapping it ---');
ok('templates with instrument pads were found', withPads.length > 0, `${withPads.length} templates`);

let totalPads = 0;
let placedByTemplate = 0;
for (const template of withPads) {
  const connectors = connectorsForTemplate(template);
  totalPads += connectors.length;

  const placements = connectors.map((connector) => ({
    connector,
    placed: createCardForConnector(template, connector.code, REFERENCE_RECT),
  }));
  const placed = placements.filter((entry) => entry.placed !== null);
  placedByTemplate += placed.length;

  // Templates with a default layout should place every one of their pads; the
  // caller's fallback is for pads a template lays no card out for, and should
  // stay the exception rather than the norm.
  if (hasDefaultLayout(template)) {
    ok(`${template}: every pad has a template placement`,
      placed.length === connectors.length,
      `${placed.length}/${connectors.length}`);
  }

  const wrongPad = placed.filter((entry) => entry.placed!.trail.startMachinePointCode !== entry.connector.code);
  ok(`${template}: each card is wired to the pad that was tapped`, wrongPad.length === 0,
    wrongPad.map((entry) => entry.connector.code).join(', ') || `${placed.length} checked`);

  const unattached = placed.filter((entry) => entry.placed!.trail.endBoxId !== entry.placed!.box.id);
  ok(`${template}: each trail is attached to its own card`, unattached.length === 0);

  const ids = placed.map((entry) => entry.placed!.box.id);
  ok(`${template}: card ids are unique`, new Set(ids).size === ids.length);

  const noCode = placed.filter((entry) => entry.placed!.box.templatePointCode !== entry.connector.code);
  ok(`${template}: each card records which instrument it is`, noCode.length === 0);

  // The trail has to reach the pad. Its machine end is the first point, and it
  // must land on the pad's own position in the machine rect.
  const artwork = artworkSizeForTemplate(template);
  const offPad = placed.filter((entry) => {
    const expected = {
      x: REFERENCE_RECT.x + entry.connector.rx * REFERENCE_RECT.width,
      y: REFERENCE_RECT.y + entry.connector.ry * REFERENCE_RECT.height,
    };
    const actual = entry.placed!.trail.points[0];
    return Math.abs(actual.x - expected.x) > 0.5 || Math.abs(actual.y - expected.y) > 0.5;
  });
  ok(`${template}: the trail starts on the pad it names`, offPad.length === 0,
    offPad.length ? offPad.map((entry) => entry.connector.code).join(', ') : `${artwork.width}x${artwork.height} frame`);

  const empty = placed.filter((entry) => entry.placed!.trail.points.length < 2);
  ok(`${template}: every trail has both ends`, empty.length === 0);
}

console.log('\n--- across every template ---');
ok('every pad of a template with a default layout is placeable',
  placedByTemplate > 0, `${placedByTemplate} of ${totalPads} pads placed from templates`);
ok('an unknown pad returns null rather than a wrong card',
  createCardForConnector('Twin Screw Extruder', 'NOT-A-REAL-PAD', REFERENCE_RECT) === null);
ok('an unknown template returns null',
  createCardForConnector('Not A Machine', 'TS-P3', REFERENCE_RECT) === null);

console.log('\n--- the pads are visible for the whole of configure mode ---');

const board = readFileSync(join(process.cwd(), 'components/console/machine/TrailBoard.tsx'), 'utf8');

// The old condition. Its return would make the pads invisible again.
ok('pad visibility is no longer gated on an endpoint being dragged',
  !board.includes('connectors.length > 0 && (wiring || flashedConnector)'),
  'that gate is what made the pads invisible until you were already wiring');
ok('pads render whenever the board is editable',
  board.includes('{!readOnly && machineRect && connectors.length > 0 && ('));
ok('a pad is pressable', board.includes('onPress={() => mapConnector(connector)}'));
ok('the pad layer lets presses through to the pads',
  board.includes('<View pointerEvents="box-none"'),
  'a "none" layer would draw the pads and swallow every tap');
ok('a pad is not a press target while an endpoint is being dragged',
  board.includes("pointerEvents: wiring ? 'none' : 'auto',"),
  'otherwise the Pressable swallows the drag and breaks the magnet');
// In the style, not the prop: react-native-web deprecated the prop form and
// newer versions ignore it, which would silently hand the pad the drag.
ok('and that is expressed in the style rather than the deprecated prop',
  !board.includes("pointerEvents={wiring ?"));
ok('pads carry a spoken name saying whether they are mapped',
  board.includes('— mapped. Select its card.') && board.includes('— not mapped. Map this instrument.'));
ok('a small pad is given a larger touch target', board.includes('hitSlop={12}'));

console.log('\n--- every pad reads as a connection point ---');

// The colour used to be driven by `analyzerTag`, which answers "does a
// commissioned model read this?" — a different question from "is there an
// instrument here?". Thirteen of the fifteen instrumented machines carry no
// analyzer tags at all, so every unwired pad on them rendered grey: 184 dots
// that did not read as connection points, on exactly the machines where
// nothing was mapped yet.
ok('pad colour does not depend on whether a model reads the pad',
  !board.includes('wired || connector.analyzerTag'),
  'analyzerTag answers a different question and must not pick the colour');
ok('every pad is the accent colour unless it is refusing a drop',
  board.includes('const colour = rejects ? palette.critical : palette.accent;'));

// Which means the count that matters is how many machines show green pads.
const instrumented = withPads.length;
ok('every instrumented template shows its pads in the accent colour',
  instrumented === 15, `${instrumented} templates, ${totalPads} pads`);

// State is carried by weight, not by a second hue, so it survives greyscale.
ok('state is carried by fill weight rather than another colour',
  board.includes("wired === 'live' ? 0.34") && board.includes('wired ? 0.18'));

console.log('\n--- hovering a pad says what it is ---');

// A pad is a small dot on a drawing. On the Solvent Extractor there are
// twenty and five of them are "pump N vibration"; which one the pointer is
// over, what it expects and whether it is already mapped are otherwise
// things you have to map it to discover.
ok('a pad reports hover', board.includes('onHoverIn={() => setHoveredConnector(connector.code)}'));
ok('and clears it only for itself',
  board.includes("setHoveredConnector((current) => (current === connector.code ? null : current))"),
  'clearing unconditionally would blank the card when the pointer crosses between pads');
ok('there is one detail card, not one per pad',
  (board.match(/hoveredConnector && !wiring/g) ?? []).length === 1,
  'twenty hidden cards is twenty things to lay out for the one that might show');
ok('the card names the instrument and its code',
  board.includes('{connector.label}') && board.includes('{connector.code}'));
ok('it says what the point expects', board.includes('Expects {connectorExpectation(connector)}'));
ok('it says whether the point is mapped, and to what',
  board.includes('`Mapped to ${channel.code}') && board.includes("'Not mapped — tap to map'"));
ok('it is clamped to the placeable area',
  board.includes('(stageBounds?.maxX ?? 1600) - CARD - 8'),
  'a pad near an edge must not put its own description off-screen');
ok('it cannot sit between the pointer and the pad it describes',
  board.includes("pointerEvents: 'none',"),
  'react-native-web deprecated the prop form, so the style has to carry it');
ok('the card is hidden while an endpoint is being dragged',
  board.includes('hoveredConnector && !wiring'));

console.log('\n--- tapping the same pad twice does not make two cards ---');
ok('an already-wired pad selects its card instead of adding another',
  board.includes('if (existing) {') && board.includes('setSelectedId(boxId ?? existing.id)'),
  'two cards on one instrument would make the connector state ambiguous');
ok('a new card opens its channel picker',
  board.includes('setAutoPickerBoxId(') && board.includes('autoOpenPicker={autoPickerBoxId === box.id}'),
  'the tap means "map this point", so the question is already asked');

const mappable = readFileSync(join(process.cwd(), 'components/console/machine/MappableBox.tsx'), 'utf8');
ok('the picker opens at mount only, not on every render',
  mappable.includes('useState(() => Boolean(autoOpenPicker))'),
  'reacting to the prop would reopen a picker the operator had closed');

console.log(failures === 0 ? '\nconnector mapping: all checks passed' : `\nconnector mapping: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
