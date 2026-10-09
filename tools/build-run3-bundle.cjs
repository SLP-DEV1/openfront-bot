#!/usr/bin/env node
'use strict';
// Deterministic Run3 live bundle. This script never changes the trained model.
// Usage: node tools/build-run3-bundle.cjs --check (default)
//        node tools/build-run3-bundle.cjs --write (explicit regeneration)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'OpenFront_Solo_AggroBot.user.js');
const bundlePath = path.join(root, 'OpenFront_AggroBot_Impossible_Run3.user.js');
const championPath = path.join(root,
  'trainer/run3-champion.json');
const marker = 'const NEURAL_BUNDLED_MODEL = null;';
const sourceDescription = '// @description  OpenFront autopilot for Singleplayer, Public and Private games; economy, combat, nukes, defense and diplomacy.';

function renderBundle(source, champion) {
  if (typeof source !== 'string' || !champion || champion.schema !== 4 ||
      champion.arch !== '24x24x16-tanh' || !Array.isArray(champion.weights) ||
      champion.weights.length !== 1000 ||
      !champion.weights.every(v => Number.isFinite(v) && Math.abs(v) <= 5))
    throw Error('Invalid source or reviewed schema-4 champion');
  if (source.split(marker).length !== 2 ||
      source.split('// @name         OpenFront Solo AggroBot').length !== 2 ||
      source.split(sourceDescription).length !== 2)
    throw Error('Source header or model marker changed: update generator explicitly');
  const version = source.match(/^\/\/ @version\s+([0-9]+\.[0-9]+\.[0-9]+)\s*$/m)?.[1];
  const runtimeVersion = source.match(/const VERSION = '([^']+)'/ )?.[1];
  if (!version || version !== runtimeVersion)
    throw Error('Userscript header and VERSION must agree');
  return source.replace(marker,
      'const NEURAL_BUNDLED_MODEL = ' + JSON.stringify(champion) + ';')
    .replace('// @name         OpenFront Solo AggroBot',
      '// @name         OpenFront AggroBot Impossible Run3 Neural')
    .replace(sourceDescription,
      '// @description  AggroBot ' + version +
      ' with bundled Impossible Run3 schema-4 champion (experimental); no external Brain or Qwen.');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function main(argv = process.argv.slice(2)) {
  const mode = argv.length ? argv[0] : '--check';
  if (!['--check', '--write'].includes(mode) || argv.length > 1) {
    console.error('Usage: node tools/build-run3-bundle.cjs [--check|--write]');
    process.exitCode = 2;
    return;
  }
  // Normalize line endings: canonical source is LF, but git autocrlf checks
  // out CRLF on Windows, so the bundle must be independent of working-tree EOL.
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
  const championBytes = fs.readFileSync(championPath);
  const champion = JSON.parse(championBytes.toString('utf8'));
  const expected = renderBundle(source, champion);
  const current = fs.readFileSync(bundlePath, 'utf8').replace(/\r\n/g, '\n');
  const meta = {botVersion:source.match(/const VERSION = '([^']+)'/)?.[1],
    championSha256:sha256(championBytes),
    sourceSha256:sha256(source),bundleSha256:sha256(expected)};
  if (mode === '--write') {
    if (current !== expected) fs.writeFileSync(bundlePath, expected);
    console.log('RUN3_BUNDLE ' + JSON.stringify({...meta,
      action:current === expected ? 'unchanged' : 'written'}));
    return;
  }
  if (current !== expected) {
    console.error('RUN3_BUNDLE_MISMATCH ' + JSON.stringify(meta));
    console.error('Regenerate explicitly with: node tools/build-run3-bundle.cjs --write');
    process.exitCode = 1;
    return;
  }
  console.log('RUN3_BUNDLE_PASS ' + JSON.stringify(meta));
}
if (require.main === module) main();
module.exports = {renderBundle, sha256};
