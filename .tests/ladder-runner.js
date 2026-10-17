#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LAYERS = [
  ['L1 import',        'l1-import.test.js', 'every new file loads on its own'],
  ['L2 each function', 'l2-units.test.js',  'each function alone, incl. red-team edges'],
  ['L3 whole module',  'l3-module.test.js', 'the functions working together'],
  ['L4 whole POC',     'l4-e2e.test.js',    'the POC end to end, as a user reaches it'],
];

function runLayer(dir, file) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return { status: 'na' };

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST')));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', full], {
    stdio: 'pipe', encoding: 'utf8', env,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/^# pass (\d+)/m) || [])[1];
  const fail = (out.match(/^# fail (\d+)/m) || [])[1];
  const todo = (out.match(/^# todo (\d+)/m) || [])[1];
  const skip = (out.match(/^# skipped (\d+)/m) || [])[1];
  return {
    status: r.status === 0 ? 'pass' : 'fail',
    pass: +(pass || 0), fail: +(fail || 0),
    todo: +(todo || 0), skip: +(skip || 0),
    out,
  };
}

function runFeature(dir) {
  console.log(`\n── ${dir}`);
  let ok = true;
  const totals = { pass: 0, fail: 0, todo: 0, skip: 0 };
  for (const [name, file, proves] of LAYERS) {
    const r = runLayer(dir, file);
    if (r.status === 'na') {
      console.log(`   ${name.padEnd(17)} N/A  — no ${file} (nothing at this layer)`);
      continue;
    }
    for (const k of ['pass', 'fail', 'todo', 'skip']) totals[k] += r[k];
    if (r.status === 'pass') {
      const extra = [r.todo ? `${r.todo} todo` : '', r.skip ? `${r.skip} skipped` : '']
        .filter(Boolean).join(', ');
      console.log(`   ${name.padEnd(17)} ok   ${r.pass} passed${extra ? ` (${extra})` : ''}  — ${proves}`);
    } else {
      console.log(`   ${name.padEnd(17)} FAIL ${r.fail} failed, ${r.pass} passed`);
      console.log(r.out.split('\n').filter(l => /^not ok|Error|AssertionError|expected|actual/.test(l))
        .slice(0, 12).map(l => '      ' + l.trim()).join('\n'));
      console.log(`\n   stopping: fix the lowest failing layer first, never jump up.`);
      ok = false;
      break;
    }
  }
  if (totals.skip) console.log(`   note: ${totals.skip} skipped test(s) are UNVERIFIED, not passing.`);
  return ok;
}

function main() {
  const arg = process.argv[2];
  let dirs = [];
  if (arg) {
    if (!fs.existsSync(arg)) { console.error(`ladder: no such directory: ${arg}`); process.exit(2); }
    dirs = [arg];
  } else {
    const visionRoot = path.join(__dirname, 'vision-ide');
    const legacyRoot = path.join(__dirname, 'gitdiagram-1s');
    if (fs.existsSync(visionRoot)) {
      dirs = [visionRoot];
    } else if (fs.existsSync(legacyRoot)) {
      dirs = [legacyRoot];
    } else {
      console.log('ladder: no .tests/vision-ide directory.');
      process.exit(0);
    }
  }
  let allOk = true;
  for (const d of dirs) if (!runFeature(d)) { allOk = false; break; }
  console.log(allOk ? '\nladder: green\n' : '\nladder: RED\n');
  process.exit(allOk ? 0 : 1);
}

main();
