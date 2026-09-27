#!/usr/bin/env node
// Parse every SQL statement in a repo with the real PostgreSQL grammar, so a
// syntax error surfaces here instead of at a cold start.
//
//   npm i pg-query-emscripten      # libpg_query compiled to wasm; no native build
//   node check-sql.mjs src/server/db.ts supabase/migrations/*.sql
//
// What it reads:
//   .sql            the whole file
//   anything else   every backtick template literal that looks like SQL
//
// Two passes, because they catch different things. The SQL grammar validates the
// statements. A procedural body inside DO ... $$ ... $$ or CREATE FUNCTION is,
// to that grammar, just a string literal -- so `END LOOP` spelled wrongly parses
// clean and fails at runtime. The second pass hands those bodies to the plpgsql
// parser.
//
// Exit code is 0 when everything parses, 1 otherwise, so it drops into CI.
//
// Two limitations worth knowing:
//   * A template literal with an interpolated SQL FRAGMENT (`VALUES ${rows}`)
//     cannot be parsed, because the fragment is not in the file. Those are
//     reported and can be ignored; an interpolated IDENTIFIER is substituted and
//     parses fine.
//   * This is a syntax check, not a semantic one. It does not know whether a
//     column exists.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Module from 'pg-query-emscripten';

const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMENT|DO|TRUNCATE|GRANT|REVOKE|VACUUM|ANALYZE)\b/i;

function sqlLiteralsFrom(source) {
  const out = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const body = m[1];
    if (!SQL_KEYWORDS.test(body)) continue;
    out.push({
      // An interpolated identifier becomes a legal one so the statement parses.
      sql: body.replace(/\$\{[^}]*\}/g, 'interpolated_ident'),
      interpolated: /\$\{/.test(body),
      line: source.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

// psql meta-commands are not SQL and would fail the parser.
function stripPsqlMeta(source) {
  return source
    .split('\n')
    .map((line) => (/^\s*\\/.test(line) ? '' : line))
    .join('\n');
}

// A DO block is rewrapped as a function, which is the form the plpgsql parser takes.
function proceduralBodies(sql) {
  const bodies = [];
  const re = /DO\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1\s*;?/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    bodies.push(`CREATE FUNCTION wrapped_check() RETURNS void AS $wrap$${m[2]}$wrap$ LANGUAGE plpgsql;`);
  }
  if (bodies.length === 0 && /LANGUAGE\s+plpgsql/i.test(sql) && /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(sql)) {
    bodies.push(sql);
  }
  return bodies;
}

// The wasm build degrades after a few hundred parses and does not survive a
// plpgsql parse at all, so the instance is replaced whenever a call throws.
let parser = await new Module();

async function parse(sql, plpgsql = false) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return plpgsql ? parser.parsePlpgsql(sql) : parser.parse(sql);
    } catch {
      parser = await new Module();
    }
  }
  return { error: { message: 'the parser could not be run on this statement', cursorpos: 0 } };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node check-sql.mjs <file> [file...]');
  process.exit(2);
}

const deferred = [];
let checked = 0;
let failed = 0;
let skipped = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const chunks = path.extname(file) === '.sql'
    ? [{ sql: stripPsqlMeta(raw), interpolated: false, line: 1 }]
    : sqlLiteralsFrom(raw);

  for (const { sql, interpolated, line } of chunks) {
    checked += 1;
    const result = await parse(sql);
    if (result.error) {
      if (interpolated) {
        skipped += 1;
        console.log(`skip ${file}:${line}  interpolated SQL fragment, cannot be parsed standalone`);
      } else {
        failed += 1;
        console.log(`FAIL ${file}:${line}  ${result.error.message} (offset ${result.error.cursorpos})`);
        console.log('     ' + sql.trim().split('\n').slice(0, 3).join('\n     '));
      }
      continue;
    }
    for (const body of proceduralBodies(sql)) deferred.push({ file, line, body });
  }
  console.log(`${path.basename(file)}: ${chunks.length} statement group(s)`);
}

for (const { file, line, body } of deferred) {
  parser = await new Module();
  const result = await parse(body, true);
  if (result.error) {
    failed += 1;
    console.log(`FAIL(plpgsql) ${file}:${line}  ${result.error.message} (offset ${result.error.cursorpos})`);
  }
}

console.log(`\n${checked} SQL statements, ${deferred.length} plpgsql bodies, ${failed} failed, ${skipped} skipped`);
process.exit(failed === 0 ? 0 : 1);
