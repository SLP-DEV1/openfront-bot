# §2 Error analysis — Schema-5 candidate 16b686d2 (measured)

Source: 108 controller matches, 12633 planning frames
(`trainer/campaign-v5control-20260924/controller-comparison`, 12 scenarios × 9 arms,
engine pin 13b40338). All numbers below are measured, not estimated.
Machine-readable source: `error-analysis.json` (same folder).

Model frames (arms A–G, where the schema-5 model is active): 8838.
Match outcomes at tick-limit adjudication (own land vs enemy land): 45 victory / 63 defeat.

## 1. Which candidates does the model pick wrong?

Model-driven flips (finalChoice != ruleChoice, arms A–G): **1064 frames**
(per arm: A=37, B=177, C=220, D=103, E=39, F=397, G=91; 39 additional frames in
frames-without-binding are excluded). Of these:

- **1051 (98.8%) flipped to a LOWER rule-utility candidate** (hard flips)
- 11 flipped to equal utility, **0 flipped to higher utility**
- Flip destination by kind: **naval 453 (42.6%), invest 381 (35.8%), hold 156 (14.7%),
  expand 35 (3.3%), attack 0**

The model essentially never picks attack as a flip target (0), even though it
scores attack highest when present (mean +0.948 over the 78 frames where attack
is a candidate — and attack is the rule top-1 in all 78 of those frames).

## 2. When does the naval bias appear?

Frames where the model's argmax is naval but the rule top-1 is not (n=1176):

| feature | naval-pref | all frames |
|---|---|---|
| portAccess mean | **0.102** | 0.264 |
| portAccess p50 | 0 | 0 |
| frontCount p50 | 0 | 0 |
| frontCount p90 | 2 | 2 |
| capacityUse p50 | **0.990** | 0.952 |
| tick p50 | 4901 (early-mid) | 6501 |
| landDelta600 p50 | **+181** (vs +70 baseline) | +70 |
| landDelta600 p25 | 0 | 0 |

The model prefers naval exactly when **ports are scarce, there is no active
front, and capacity is saturated** — i.e. when building a fleet has little
obvious payoff. In 25% of those frames own land does not grow at all in the
following 600 ticks. Hard flips to naval (444 frames) show the same pattern and
a **constant rule-utility gap of exactly 8** (p25=p50=p75=p90=8, min 4, max 37) —
a systematic structural difference (naval vs invest rule utilities), not a
state-dependent one. matchLossRate of matches containing naval hard flips: 0.394.

## 3. When does the invest bias appear?

Frames where the model's argmax is invest but rule top-1 is not (n=1518):

| feature | invest-pref | all frames |
|---|---|---|
| tick p50 | **8501 (late)** | 6501 |
| gold p50 | **273500** | 180350 |
| reserve p50 | **937699** | 596958 |
| frontCount mean | 1.04 | 0.58 |
| portAccess mean | 0.43 | 0.26 |

Invest over-preference appears in the **late phase with high gold and high
reserve and active fronts** — exactly when the rule wants to convert economic
surplus into expansion/attack. 381 hard flips to invest; their landDelta600 is
mixed (p50 +1028, p90 +37013), so invest flips are sometimes harmless and
sometimes actively wrong.

## 4. What rule-utility gap is being overridden?

Hard-flip gap = ruleUtility(rule top-1) − ruleUtility(finalChoice):
p50 **8**, p75 23, p90 48, mean 17.7, max 71. By destination kind:
hold p50 **55** (the largest), invest p50 22, expand p50 15, naval p50 8.
The controller's gain-18 mapping acts on these gaps: a flip to hold overrides a
~55-utility deficit (156 frames), while naval flips override a constant ~8
deficit (444 frames).

## 5. Which visible features distinguish right from wrong decisions?

There are **no "right" model flips** (0 higher-utility flips), so the contrast
is hard-flip kind vs kind and vs baseline frames:

| destination | hard flips | landDelta600 p50 | landDelta600 p25 | matchLossRate |
|---|---|---|---|---|
| **expand** | 33 | **−2122** | −2229 | **0.818** |
| naval | 444 | +32 | 0 | 0.394 |
| invest | 381 | +1028 | 0 | — |
| hold | 156 | +1473 | 0 | — |

**Wrong expansions are the most harmful measured flips** (median land loss
−2122 in 600 ticks; 27/33 such frames are in matches that end in defeat),
though rare (33 frames). Naval flips are the most frequent and median-neutral
(+32 land — i.e. time wasted). Baseline all-frame landDelta600 p50 is +70, so
expand flips underperform even passive growth.

## 6. Which candidate kinds have systematically shifted scores?

Mean model score per kind (over all legal candidate rows, arms A–G):

| kind | rows | mean score | p50 | modelPrefRate | ruleRate | ratio |
|---|---|---|---|---|---|---|
| attack | 78 | +0.948 | +0.982 | 0.9% | 0.9% | 1.00 |
| invest | 8838 | −0.114 | −0.736 | **68.4%** | 58.8% | **1.16** |
| naval | 5724 | −0.484 | −0.773 | **22.7%** | 14.1% | **1.61** |
| expand | 474 | −0.844 | −0.999 | 2.7% | 3.2% | 0.84 |
| hold | 8838 | **−0.969** | **−0.999** | **5.3%** | **23.0%** | **0.23** |

Systematic shifts: **naval over-selected (×1.61), invest over-selected (×1.16),
hold strongly under-selected (×0.23)**, expand ≈ neutral. Hold is saturated at
−1 (p50 −0.9989, max ever observed +0.28) — the model almost never allows hold
to win a frame, while the rule top-1 is hold in 23% of frames.

## 7. Feature scale / normalization / calibration issues

- Scores are near-binary: invest and naval are **bimodal** at ≈−0.99 or
  ≈+0.99 (p75 invest +0.984, p90 naval +0.924); hold/expand are pinned near
  −1. The score is a kind+state gate, not a calibrated utility.
- **42.1% of frames give invest and hold the exact same score** — the model
  cannot distinguish them at all.
- Within-frame model score spread: p25 = **0.00039** (25% of frames have
  effectively zero spread — no controller can act), p50 = 1.58, p90 = 1.988
  (saturated at the ±1 tanh boundary). The usable signal mass is bimodal:
  either nothing or saturation.
- In hard-flip frames the model scores the rule top-1 median **−0.769** — i.e.
  when the model overrides the rule, it is actively scoring the rule's pick
  "bad", so the override is a learned preference, not a tie-break artifact.

## 8. Action-kind bias vs game-state learning

Lift = mean model score of a kind when it IS the rule top-1 minus when it is
not (measured per kind):

| kind | asRuleTop1 n | lift |
|---|---|---|
| naval | 1188 | **+1.414** |
| invest | 5190 | **+0.931** |
| expand | 252 | +0.289 |
| hold | 2130 | **−0.041** |
| attack | 78 | n/a (always rule top-1) |

Verdict: **both, kind-specifically.** The model has learned real state
dependence for naval and invest (when the rule's state assessment picks them,
the model scores them far higher: +1.4 / +0.9 lift). But it has **no state
dependence for hold** (lift −0.041): even when the rule top-1 is hold (2130
frames), the model scores hold ≈ −0.9998. The model therefore combines
(a) a learned state gate for invest/naval that **triggers too often**
(1.16× / 1.61× over-selection vs the rule) and (b) a near-constant **hold
prior of −1** that the state never overwrites. The result: whenever the state
gate fires but the rule's more precise utility estimate says "not now", the
model flips to the lower-utility naval/invest candidate (98.8% of flips).

## Consequences for training (§5–§6)

1. The model must be taught **hold/expand discrimination from state**, not
   from kind features (hold and expand share the same all-zero kind encoding
   at feature indices 29–31 — the model cannot separate them via kind at all).
2. **Outcome-aware relabeling** is needed: the executed (observed) row is the
   flipped-to candidate in hard-flip frames; training "chosen > others" on
   those frames reinforces the error. Hard-flip frames with confirmed negative
   `landDelta600` (or match defeat) must be relabeled toward the rule top-1.
3. **Utility alignment** should penalize scoring a candidate above a
   higher-rule-utility candidate when the utility gap is large (hold flips
   override gaps up to 55).
4. **Kind calibration**: the hold prior must be lifted (from −0.999) in frames
   where state indicates safety first (low frontCount, high capacityUse,
   early/mid phase), and naval/invest over-selection must be damped in the
   exact contexts measured in §2/§3 (scarce ports + saturated capacity;
   late phase + high gold/reserve + active front).
5. Expand flips are rare but the costliest (median −2122 land, 82% match loss
   rate) — targeted §4 data must include expansion pressure scenarios.
