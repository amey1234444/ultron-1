#!/usr/bin/env node
// Check that a directory of migrations can be replayed against an EMPTY database
// in filename order.
//
//   node check-replay-order.mjs supabase/migrations
//
// Why this exists: as soon as anything replays the whole directory on startup --
// a bootstrap script, a service that has no separate migration step, a CI job
// that builds a throwaway database -- filename order becomes execution order, and
// a file that references a table created by a LATER file aborts the replay. The
// failure only appears on a fresh database, so it survives indefinitely in an
// environment that was built incrementally.
//
// It tracks which tables exist after each file and reports any statement that
// touches one that does not exist yet. Statements guarded by `to_regclass(...)`
// are treated as safe, because that is the idiom for "act only if it is there".
//
// This is a static check on statement text, not a parser. Expect to read its
// output rather than trust it blindly; it is calibrated to catch the ordering
// class of bug, and it does.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node check-replay-order.mjs <migrations-dir>');
  process.exit(2);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const exists = new Set();
let problems = 0;

// Split on semicolons that are not inside a dollar-quoted block or a string.
function statements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let tag = null;
  let quote = false;
  while (i < sql.length) {
    if (tag) {
      if (sql.startsWith(tag, i)) { buf += tag; i += tag.length; tag = null; continue; }
    } else if (quote) {
      if (sql[i] === "'") quote = false;
    } else {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { tag = m[0]; buf += tag; i += tag.length; continue; }
      if (sql[i] === "'") quote = true;
      else if (sql[i] === '-' && sql[i + 1] === '-') {
        const nl = sql.indexOf('\n', i);
        i = nl === -1 ? sql.length : nl;
        continue;
      } else if (sql[i] === ';') { out.push(buf); buf = ''; i += 1; continue; }
    }
    buf += sql[i];
    i += 1;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');

  for (const stmt of statements(sql)) {
    const guarded = /to_regclass/i.test(stmt);

    // String literals are blanked first: a table name mentioned inside a COMMENT
    // is prose, not a reference. `IS DISTINCT FROM` is neutralised for the same
    // reason -- the FROM there does not introduce a relation.
    const scannable = stmt
      .replace(/'(?:[^']|'')*'/g, "''")
      .replace(/\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/gi, 'IS_DISTINCT');

    // Anything this statement requires to already exist.
    const required = new Set();
    for (const re of [
      /\bALTER TABLE\s+(?:IF EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
      /\bCREATE (?:UNIQUE )?INDEX(?: CONCURRENTLY)?(?: IF NOT EXISTS)?\s+"?[a-z_][a-z0-9_]*"?\s+ON\s+"?([a-z_][a-z0-9_]*)"?/gi,
      /\bINSERT INTO\s+"?([a-z_][a-z0-9_]*)"?/gi,
      /\bUPDATE\s+"?([a-z_][a-z0-9_]*)"?\s+SET\b/gi,
      /\bDELETE FROM\s+"?([a-z_][a-z0-9_]*)"?/gi,
      /\bCOMMENT ON (?:TABLE|VIEW)\s+"?([a-z_][a-z0-9_]*)"?/gi,
      /\bCOMMENT ON COLUMN\s+"?([a-z_][a-z0-9_]*)"?\./gi,
      /\bREFERENCES\s+"?([a-z_][a-z0-9_]*)"?\s*\(/gi,
      // Not followed by '(': that would be a function call, not a relation.
      /\bFROM\s+"?([a-z_][a-z0-9_]*)"?(?!\s*\()/gi,
    ]) {
      for (const m of scannable.matchAll(re)) required.add(m[1].toLowerCase());
    }

    // Anything it creates. Recorded after the requirement check, so a
    // self-referencing CREATE TABLE is not flagged against itself.
    const created = [...scannable.matchAll(/\bCREATE TABLE(?: IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)]
      .map((m) => m[1].toLowerCase());
    for (const t of created) required.delete(t);

    for (const t of required) {
      if (exists.has(t)) continue;
      // information_schema / pg_catalog and SQL keywords that follow FROM.
      if (/^(pg_|information_schema)/.test(t)) continue;
      if (['select', 'values', 'dual', 'only', 'lateral'].includes(t)) continue;
      if (guarded) continue;
      problems += 1;
      console.log(`${file}: needs "${t}", which no earlier file creates`);
      console.log(`  ${stmt.split('\n')[0].slice(0, 100)}`);
    }

    for (const t of created) exists.add(t);
    for (const m of scannable.matchAll(/\bCREATE (?:OR REPLACE )?VIEW\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
      exists.add(m[1].toLowerCase());
    }
  }
}

console.log(`\n${files.length} files, ${exists.size} tables/views created, ${problems} ordering problem(s)`);
process.exit(problems === 0 ? 0 : 1);
