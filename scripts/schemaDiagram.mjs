/**
 * The database diagram in the README, generated from the schema itself.
 *
 * A diagram drawn by hand in a tool and exported as a PNG is correct on the
 * day it is exported. This repository creates its tables in code —
 * `src/server/db.ts` and `src/server/mlPersistence.ts` are the only places a
 * table comes into existence — so the diagram is read from there and written
 * into the README between markers. `npm run check:schema-diagram` fails when
 * the two disagree, which is what stops a column arriving without the picture
 * following it.
 *
 * Mermaid rather than an image: GitHub renders it inline, so there is no
 * binary to regenerate, no asset to forget, and the diff on a schema change
 * shows which relationship moved rather than that some bytes did.
 *
 *   node scripts/schemaDiagram.mjs          rewrite the README
 *   node scripts/schemaDiagram.mjs --check  fail if it is out of date
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCES = ['src/server/db.ts', 'src/server/mlPersistence.ts'];
const README = 'README.md';
const AML = 'docs/schema.azimutt.aml';
const BEGIN = '<!-- schema:begin -->';
const END = '<!-- schema:end -->';

/** Where a table sits in the system, by name. Order is the reading order. */
const AREAS = [
  ['Asset hierarchy', (t) => t.startsWith('studio_')],
  ['Live telemetry', (t) => /^(gateways|racks|rack_|measurement_|gateway_|command_|alarm|ingest_)/.test(t)],
  ['Analysis and ML', (t) => t.startsWith('ml_') || t.startsWith('analysis_')],
  ['SAP integration', (t) => t.startsWith('sap_')],
  ['Accounts and access', (t) => /^(users|sessions|password_|login_|email_|captcha)/.test(t)],
];

function areaOf(table) {
  for (const [name, match] of AREAS) if (match(table)) return name;
  return 'Other';
}

/** Every CREATE TABLE in the sources, with its columns and foreign keys. */
function readSchema() {
  const tables = new Map();
  for (const path of SOURCES) {
    const source = readFileSync(path, 'utf8');

    for (const match of source.matchAll(
      // The closing paren ends the statement whether a semicolon follows
      // it or the template literal simply closes — both spellings are in
      // use, and matching only the first silently dropped six ML tables.
      /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)\s*(?:;|`)/g,
    )) {
      const [, name, body] = match;
      const columns = [];
      for (const raw of body.split('\n')) {
        const line = raw.trim().replace(/,$/, '');
        if (!line || line.startsWith('--')) continue;
        // Table-level constraints are not columns.
        if (/^(UNIQUE|PRIMARY KEY|FOREIGN KEY|CHECK|CONSTRAINT)\b/i.test(line)) continue;
        const column = /^(\w+)\s+(.+)$/.exec(line);
        if (!column) continue;
        const [, field, rest] = column;
        const reference = /REFERENCES\s+(\w+)\s*\((\w+)\)/i.exec(rest);
        columns.push({
          field,
          type: rest.split(/\s+/)[0].replace(/,$/, ''),
          primary: /PRIMARY KEY/i.test(rest),
          required: /NOT NULL/i.test(rest),
          references: reference ? { table: reference[1], column: reference[2] } : null,
        });
      }
      tables.set(name, { name, columns, source: path });
    }

    // Columns added after the fact are columns too. A table that gained
    // workspace_id in a migration has it in the database and would not have
    // it here.
    for (const match of source.matchAll(
      /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+([A-Z]+(?:\([^)]*\))?)/gi,
    )) {
      const [, name, field, type] = match;
      const table = tables.get(name);
      if (!table || table.columns.some((column) => column.field === field)) continue;
      table.columns.push({ field, type, primary: false, required: false, references: null });
    }
  }
  return tables;
}

function mermaid(tables) {
  const links = [];
  for (const table of tables.values()) {
    for (const column of table.columns) {
      if (column.references && tables.has(column.references.table)) {
        links.push({ from: table.name, to: column.references.table, column: column.field, required: column.required });
      }
    }
  }
  // Only tables that take part in a relationship. Fifty-seven boxes with no
  // lines between most of them is a picture of nothing; the inventory below
  // lists the rest.
  const involved = new Set(links.flatMap((link) => [link.from, link.to]));

  const lines = ['erDiagram'];
  for (const name of [...involved].sort()) {
    const table = tables.get(name);
    // Keys only. Every column of every table is the inventory's job.
    const keys = table.columns.filter((column) => column.primary || column.references);
    lines.push(`  ${name} {`);
    for (const column of keys) {
      const note = column.primary ? 'PK' : 'FK';
      lines.push(`    ${column.type.toLowerCase()} ${column.field} ${note}`);
    }
    if (keys.length === 0) lines.push('    text _ ""');
    lines.push('  }');
  }
  for (const link of [...links].sort((a, b) => `${a.to}${a.from}`.localeCompare(`${b.to}${b.from}`))) {
    // A required foreign key is a child that cannot exist alone.
    const cardinality = link.required ? '||--o{' : '||--o|';
    lines.push(`  ${link.to} ${cardinality} ${link.from} : "${link.column}"`);
  }
  return lines.join('\n');
}

function inventory(tables) {
  const grouped = new Map();
  for (const table of tables.values()) {
    const area = areaOf(table.name);
    grouped.set(area, [...(grouped.get(area) ?? []), table]);
  }
  const order = [...AREAS.map(([name]) => name), 'Other'];
  const lines = [];
  for (const area of order) {
    const entries = (grouped.get(area) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) continue;
    lines.push(`**${area}** — ${entries.length} table${entries.length === 1 ? '' : 's'}`);
    lines.push('');
    for (const table of entries) {
      const keys = table.columns.filter((column) => column.references).length;
      lines.push(
        `- \`${table.name}\` · ${table.columns.length} columns` +
        (keys > 0 ? ` · ${keys} foreign key${keys === 1 ? '' : 's'}` : ''),
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * The same schema as Azimutt Markup Language.
 *
 * Azimutt is the tool asked for and this is the file it opens: import
 * `docs/schema.azimutt.aml` and it lays the tables out, follows the
 * relations and lets you explore them. What it is not is a picture checked
 * into the repository — an exported PNG is correct on the day it is
 * exported, and this schema is created in code, so the file Azimutt reads is
 * generated from that code and regenerated when it changes.
 *
 * The README keeps the Mermaid diagram because GitHub renders it inline and
 * this one needs a tool to open. They come from the same parse, so they
 * cannot disagree.
 */
function aml(tables) {
  const lines = [
    '# ULTRON database schema, for Azimutt (https://azimutt.app).',
    '#',
    '# Generated by `npm run schema:diagram` from ' + SOURCES.join(' and ') + '.',
    '# Do not edit: `npm run check:schema-diagram` fails when this and the',
    '# schema disagree. Open it with Azimutt > New project > Import > AML.',
    '',
  ];
  for (const table of [...tables.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(table.name);
    for (const column of table.columns) {
      const parts = [`  ${column.field}`, column.type.toLowerCase()];
      if (column.primary) parts.push('pk');
      else if (column.required) parts.push('nullable=false');
      if (column.references && tables.has(column.references.table)) {
        parts.push(`-> ${column.references.table}(${column.references.column})`);
      }
      lines.push(parts.join(' '));
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function render(tables) {
  const relationships = [...tables.values()].reduce(
    (total, table) => total + table.columns.filter((c) => c.references && tables.has(c.references.table)).length,
    0,
  );
  return [
    BEGIN,
    '',
    `_Generated from ${SOURCES.map((s) => `\`${s}\``).join(' and ')} by \`npm run schema:diagram\`._`,
    '_To explore it interactively, import [`docs/schema.azimutt.aml`](docs/schema.azimutt.aml) into [Azimutt](https://azimutt.app)._',
    `_${tables.size} tables, ${relationships} foreign keys. \`npm run check:schema-diagram\` fails when this is out of date._`,
    '',
    '```mermaid',
    mermaid(tables),
    '```',
    '',
    '<details>',
    '<summary>Every table, by area</summary>',
    '',
    inventory(tables),
    '',
    '</details>',
    '',
    END,
  ].join('\n');
}

const tables = readSchema();
if (tables.size === 0) {
  console.error('No CREATE TABLE statements were found. The parser and the schema have diverged.');
  process.exit(1);
}

const readme = readFileSync(README, 'utf8');
const begin = readme.indexOf(BEGIN);
const end = readme.indexOf(END);
if (begin < 0 || end < 0) {
  console.error(`${README} has no ${BEGIN} / ${END} markers to write between.`);
  process.exit(1);
}

const next = readme.slice(0, begin) + render(tables) + readme.slice(end + END.length);
const nextAml = aml(tables);
const currentAml = existsSync(AML) ? readFileSync(AML, 'utf8') : '';

if (process.argv.includes('--check')) {
  const stale = [next !== readme && README, nextAml !== currentAml && AML].filter(Boolean);
  if (stale.length > 0) {
    console.error(
      `The schema changed and ${stale.join(' and ')} did not.\n` +
      'Run `npm run schema:diagram`.',
    );
    process.exit(1);
  }
  console.log(`schema diagram: up to date — ${tables.size} tables in ${README} and ${AML}`);
} else {
  writeFileSync(README, next);
  writeFileSync(AML, nextAml);
  console.log(`schema diagram: wrote ${tables.size} tables into ${README} and ${AML}`);
}
