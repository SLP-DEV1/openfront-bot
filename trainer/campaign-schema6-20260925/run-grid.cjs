'use strict';
// Schema-6 candidate grid: §10 objectives (S6-A..E) x §12 archs (24/40 hidden).
// Fixed seed + held-out split so every candidate is comparable. kindBias
// (lambda) mirrors the v5 recipe so the SCHEMA change is the variable under test.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = 'C:/Users/SPK/Desktop/openfront';
const CAM = 'trainer/campaign-schema6-20260925';
const EPOCH = 150;
const SEED = 1337;
const SPLITPCT = 21;
const LAMBDA = 0;
const RU_WEIGHT = 0.25;
const HARDNEG_BOOST = 2.0;
const variants = ['A', 'B', 'C', 'D', 'E'];
const archs = ['38x24x2-tanh', '38x40x2-tanh'];
const results = [];
for (const v of variants) {
  for (const a of archs) {
    const tag = `${v}_${a.replace(/[^a-z0-9]/gi, '')}`;
    const out = `${CAM}/models/${tag}`;
    const args = ['trainer/train-v6.cjs', '--variant', v, '--arch', a,
      '--dataset', `${CAM}/dataset.json`, '--out', out,
      '--epoch', String(EPOCH), '--splitPct', String(SPLITPCT),
      '--seed', String(SEED), '--lambda', String(LAMBDA),
      '--ruWeight', String(RU_WEIGHT), '--hardNegBoost', String(HARDNEG_BOOST)];
    const t0 = Date.now();
    execFileSync(process.execPath, args, { stdio: 'pipe', cwd: ROOT });
    const model = JSON.parse(fs.readFileSync(path.join(ROOT, out, 'model.json'), 'utf8'));
    const m = model.training.metrics;
    results.push({ candidate: tag, variant: v, arch: a, seed: SEED, epoch: EPOCH,
      valRankLoss: m.valRankLoss, decisionAccuracy: m.decisionAccuracy,
      flipToLowerRate: m.flipToLowerRate, flipToHigherRate: m.flipToHigherRate,
      hardNegativeAccuracy: m.hardNegativeAccuracy,
      crossCandidateSpread: m.crossCandidateSpread,
      kindSelection: m.kindSelectionDistribution,
      trainWallMs: Date.now() - t0 });
    process.stdout.write(`${tag} val=${m.valRankLoss.toFixed(4)} flL=${m.flipToLowerRate.toFixed(4)} acc=${m.decisionAccuracy.toFixed(3)} hn=${m.hardNegativeAccuracy.toFixed(3)}\n`);
  }
}
fs.writeFileSync(path.join(ROOT, CAM, 'candidate-comparison.json'), JSON.stringify({
  grid: results, epoch: EPOCH, seed: SEED, splitPct: SPLITPCT, lambda: LAMBDA,
  ruWeight: RU_WEIGHT, hardNegBoost: HARDNEG_BOOST,
  note: 'v6 schema-6 candidate grid: 5 objectives (S6-A..E) x 2 archs. kindBias (lambda) mirrors the v5 recipe so the schema change is the variable under test.'
}, null, 2));
process.stdout.write(`wrote candidate-comparison.json (n=${results.length})\n`);
