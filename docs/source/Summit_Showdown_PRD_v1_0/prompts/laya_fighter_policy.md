# Laya fighter policy brief

This is a specification for a typed decision policy, not a conversational system prompt. Never ask the model to impersonate a real leader. The renderer selects an avatar; the policy sees anonymous combat state.

## Decision objective
Choose a useful next action from the supplied candidate set in a fair, unranked arcade fight. Improve the damage exchange, spacing and resource position while obeying the actual mechanics. The input is delayed, incomplete observation; there is no access to current player buttons or future actions. The policy is free to choose an imperfect action. Do not compensate with an undisclosed perfect-reacting controller.

## Upstream interface mapping
The verified Laya README demonstrates `laya.load(...)`, then `agent.predict(state, questions)`, with a typed choice question consisting of `type`, `instructions` and `criteria`. Pin and inspect the installed SDK before implementing the adapter; the normalised response schema in this pack is not the raw SDK response. Do not fabricate missing probability fields. Source: https://github.com/NandhaKishorM/laya

Proposed action-question text:

> Select the next legal combat action for SELF using only the observed state and action history. Preserve the chance to win the round through useful spacing, defence, attacks and resource use. Return a typed choice from the supplied criteria. The state is delayed; do not assume access to unobserved player inputs.

Criteria are generated server-side from the immutable V1 action vocabulary and filtered legality, with concise semantic descriptions. Names, countries, real political opinions and personality claims are never added.

## Observation serialisation
The wire schema includes correlation and security metadata. Only the compact observation and criteria are encoded for the model. Use a stable field order, integer/fixed-point values, explicit categorical phase labels and at most eight historical public actions. For example:

```text
SELF hp=690 st=66 meter=100 ground=1 phase=neutral facing=+1
OTHER hp=740 st=52 meter=46 ground=1 action=heavy phase=startup
DIST_MM=920 WALL_SELF=4200 WALL_OTHER=8880 SELF_CAN_ACT=1
HISTORY=heavy,retreat,heavy,guard_high,heavy
```

This is an illustrative state, not a model trace. Verify actual tokenizer length for every selected checkpoint configuration. Reject an over-budget state or reduce documented history fields; never silently truncate the current action or candidate meaning. Keep at most 16 candidates. Log the full legal set, the exposed candidate set and every pruning reason.

## Policy selection and score handling
Start evaluation with deterministic argmax. Any later sampling uses a seeded stream, a frozen temperature policy and logs both the distribution and selected action. Score distributions describe policy preferences, not estimated political competence or a guaranteed probability of winning. Calibration, where used, is fitted only on held-out validation data.

## Runtime boundary
The engine rechecks round, epoch, request, deadline and action legality. A policy cannot bypass attack recovery, change damage, teleport, access secrets or control the camera. A late answer cannot undo a hit. Human inputs remain local and responsive. Repeated failures yield an explicit pause or labelled baseline practice.

## Required experiment report
Compare base and specialised Laya, no-history ablation, a conventional learned policy and fixed heuristic opponents using anonymous meshes. Publish test split, seed handling, observation delay, schedule, candidate policy, model/tokenizer revisions, latency decomposition and confidence intervals. Include unsuccessful results. A fit-to-domain claim requires a real training run and a released/evaluated checkpoint.
