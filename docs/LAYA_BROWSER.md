# Laya in the browser

WST has no inference service, API key, or server fallback. It runs the complete
pinned Laya typed-choice decision graph in the visitor's browser with
`onnxruntime-web`. A failed Laya load stays unavailable; practice mode is a
separately selected baseline controller and is never relabelled as Laya.

## Pinned upstream checkpoint

The shipped graph is an export of the English Laya root checkpoint:

- Hub repository: [`convaiinnovations/laya`](https://huggingface.co/convaiinnovations/laya)
- Hub revision: `1c5edc17a7acd8701df6fc341c0d179f1c62c982`
- Laya source revision: [`42626c348753fbb17572a813127df2278a1ec527`](https://github.com/NandhaKishorM/laya/tree/42626c348753fbb17572a813127df2278a1ec527)
- Source safetensors: 842,609,210 bytes and 421,293,830 parameters
- Upstream decision limits: 512 state tokens, a 192-token typed-question head,
  and up to 16 scored marker choices

The Hub contains PyTorch safetensors and tokenizer files, not a ready-made ONNX
model. The source `DecisionModel` combines ModernBERT, question-type embedding,
the transformer decision head, marker gather/mask, and scorer. Exporting only
the encoder would not be Laya. See the [upstream source](https://github.com/NandhaKishorM/laya)
and [pinned Hub tree](https://huggingface.co/convaiinnovations/laya/tree/1c5edc17a7acd8701df6fc341c0d179f1c62c982).

## Published artifact and browser requirement

`apps/web/public/models/laya/manifest.json` is the only shipped Laya artifact.
It contains a complete 320-token static export of that `DecisionModel`. The upstream Apache-2.0 license and a conversion notice ship alongside the graph:


- 412,706,114-byte self-contained ONNX graph, split into 17 files no larger
  than 24 MiB
- Weight-only INT4 `com.microsoft::MatMulNBits` for 120 constant matrix
  multiplications, with FP32 activations and the unquantized parts retained
- `matmul-nbits-int4-symmetric-block128` recorded in the manifest
- Pinned tokenizer, source revision, input/output names, temperature buckets,
  each part SHA-256, and a SHA-256 for the reassembled graph

WST's bounded public observation and all sixteen candidate descriptions fit in
the exported 320-token state length; `buildSequence()` rejects an over-budget
request instead of shortening state or candidate text. This is a static export
length, not an alternate model or a truncated prompt.

The artifact requires WebGPU. In the tested Chromium browser, the same INT4
graph under WebAssembly produced non-finite logits after 6.8 seconds. WST
therefore initializes `onnxruntime-web/webgpu` strictly, without a misleading
WASM fallback. Browsers without a usable WebGPU worker report Laya unavailable
and can explicitly choose baseline practice.

The WebGPU entry point must use ORT 1.30's matching
`ort-wasm-simd-threaded.asyncify.mjs` and `.wasm` assets. The `.jsep` pair is a
different build variant and fails initialization because it lacks the binding
expected by the WebGPU entry point. ORT's built-in WASM proxy is disabled for
this provider; a dedicated WST module worker owns the tokenizer, session, and
model execution so rendering does not wait for inference.

The current production build is about 640 MiB, below GitHub Pages' 1 GB
published-site limit and its 100 MiB individual-file limit. The latter is why
the graph is chunked. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Integrity, progress, cancellation, and readiness

The manifest is fetched relative to the deployed base URL. Model parts download
sequentially and report cumulative bytes, each part is verified, then the
reassembled graph is verified before ORT session creation. The request URL for
each part includes its manifest SHA-256 as a query parameter. That makes the
browser cache content-addressed: after a deployment changes a model part at the
same static pathname, cached bytes from the old artifact cannot be combined
with the new manifest.

`LayaWorkerController` resolves the manifest URL on the main thread, sends the
absolute URL to its dedicated worker, relays progress and `CheckpointInfo`, and
permits at most one decision at a time. Disposal, abort, or worker error
terminates the worker and rejects pending work. Late messages are ignored by
epoch and request ID. ORT itself has no cancellation primitive for an already
running graph; worker termination is the authoritative cancellation boundary.

Ready means a full typed-choice decision completed. During `load()`, the worker
runs a fixed public warm-up observation through the graph before setting
`checkpoint.ready`. Warm-up is bounded to 30 seconds by default. The measured
end-to-end decision time is reported as `checkpoint.lastLatencyMs`; no match is
allowed to present Laya as ready before this succeeds.

On the development Chromium test host after model caching, the full 320-token
graph produced finite Laya decisions with these measurements:

| Path | Warm-up decision | Total cached load + warm-up |
| --- | ---: | ---: |
| Direct WebGPU diagnostic | 552.1 ms | 2,672 ms |
| Dedicated WebGPU worker | 550.0 ms | 1,903 ms |

Those measurements are host-specific. The scheduler uses the recorded timing
for its tactical cadence instead of claiming a fixed high-frequency model rate.

## Reproducible export and parity

The export needs the explicitly opted-in 842.6 MB checkpoint transfer only when
the pinned checkpoint is absent from the cache:

```sh
python -m venv .venv-laya
. .venv-laya/bin/activate
pip install -r tools/laya/requirements-export.txt
python tools/laya/export_to_onnx.py \
  --output apps/web/public/models/laya \
  --cache-dir .cache/laya \
  --download --overwrite --precision int4 --max-length 320
python tools/laya/verify_onnx.py \
  --artifact apps/web/public/models/laya \
  --cache-dir .cache/laya
```

The exporter emits the complete upstream typed-choice path, quantizes only
constant matrix weights with ORT's block-128 symmetric `MatMulNBits` converter,
then inlines external data before splitting the model for static hosting. The
verifier reconstructs the graph in a temporary file, validates every digest,
and compares six public typed-choice probes against pinned PyTorch Laya.

The shipped INT4 graph selected the same action in all six probes. Its maximum
observed absolute logit difference was `2.026981`; quantized logits are not
bit-identical and the result is a conversion parity check, not a claim of
fighter-specific quality or calibrated action probability.

## Prompt and score contract

The adapter serializes only the delayed public `MatchObservation`: health,
stamina, meter, positions-derived distance, visible action/phase, wall distance,
round/timer, and up to eight completed public actions. It excludes delegate
identity, input queues, keyboard state, hidden randomness, and future simulation
state.

Each request contains two to sixteen legal actions. Candidate order is stable;
the model's returned logits map only to that in-memory ordered legal set. The
prompt uses opaque `option_n` labels. Character signature IDs normalize to
`signature` and carry compact public mechanics, so leader names do not enter the
policy text while the exact internal action remains available to the combat
engine.

The compact state additionally supplies each fighter's public altitude, visible
action age and ability to act. Health and stamina are percentages of their
public maxima, so varying fighter statistics do not mislead the policy. Each
selected signature is represented only by neutral public mechanics (kind and
reach), never its internal ID or title. This lets a Laya proposal distinguish an
airborne opponent, a committed visible attack, and the likely space occupied by
a signature while preserving the identity boundary. The pinned tokenizer is
regression-tested with eight long normalized history entries and every possible
selected signature: the largest full 16-option request consumes 311 of the
320 static tokens. Requests that exceed the fixed context still fail rather
than silently losing state.

Visible scores are typed-choice softmax preferences using the pinned upstream
temperature bucket for the actual candidate count. They are not calibrated win
probabilities and do not claim combat competence from a checkpoint WST has not
trained or evaluated for fighting.

## Measured combat-policy limitation

Laya's English root model is an authentic general typed-decision checkpoint,
but it has not been trained or evaluated on WST combat decisions. This is a
material product limitation, not a loading or rendering issue.

`tools/laya/probe_choice_behavior.py` uses the same upstream typed-choice
sequence layout and current compact browser-state fields, then runs the pinned
PyTorch source alongside the published INT4 graph. It is a diagnostic, not an
end-to-end browser test; the TypeScript tokenizer test exercises every selected
signature across full 16-choice requests:

```sh
OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  python tools/laya/probe_choice_behavior.py \
  --artifact apps/web/public/models/laya --cache-dir .cache/laya
```

On the shipped root model, the current opaque 16-option prompt selected
`idle` in far and close neutral probes when idle was the first option. Moving
idle to the final option changed the neutral choice to `guard_high`. A low
threat was the sole small probe where the pinned source selected an applicable
guard; the INT4 graph selected idle in that case. Compact semantic labels and
natural-language state prose did not create reliable reaching, attacking, or
defensive choices. The source and its INT4 export therefore have verified graph
integrity and limited conversion parity, but neither has validated fighting
quality.

The official `laya-typed-decisions` checkpoint was also evaluated locally at
revision `f9ab0b228f0fc0f14d873dbc99038f135c2da1b2`. It is an Apache-2.0,
842,609,220-byte Laya checkpoint trained only for four synthetic business
workflows. It retained idle-at-neutral and option-position behavior in this
combat probe, so WST does not substitute it for the pinned root checkpoint.

## Explicit hybrid combat control

WST therefore presents Laya as an **experimental hybrid opponent**, rather
than a self-sufficient fighting policy. The game runs a synchronous
`CombatDirector` on delayed public observations at its local combat cadence.
The director has no keyboard state, private engine data, future simulation
state, or identity data.

Each genuine Laya reply is kept as one proposal, tied to its observed tick and
round. Before it can execute, the director checks the fresh public
observation: it must still be legal, within the move's public reach, and
appropriate to a visible situation. For example, an out-of-range punch is
rejected, anti-air requires a reachable airborne opponent, and a guard must
match a nearby visible threat. The proposal expires after 120 simulation ticks,
at a round boundary, or after one review, so a delayed model answer cannot
repeat through several exchanges.

When the proposal passes those checks, the applied action has
`origin: "model"` and AI Cam identifies it as an accepted Laya suggestion.
Otherwise the director chooses a legal `origin: "combat"` action with an
explicit reason: close distance, use a reachable varied strike or throw, block
the visible height, spend a full-meter shield or counter signature against a
damaging visible threat, anti-air, use a reachable air kick, conserve stamina,
or avoid retreating farther into a wall. Startup jump, shield, counter, and
other non-damaging actions do not create a threat by themselves. AI Cam shows
the real model proposal, executed action, origin, reason, and current public
context separately. This local combat layer is not relabeled as Laya, and the
separately selected baseline practice controller remains labelled baseline.

Candidate rotation and score post-processing still do not conceal the model's
behavior. A future trained Laya combat checkpoint would need held-out WST
combat evaluation, browser-export parity, and a new pinned manifest before it
could replace the hybrid policy.

ORT's expected mixed-provider placement messages are warning severity. Before
creating the Laya session WST sets the documented `ort.env.logLevel = "error"`
and each session's supported `logSeverityLevel: 3` option: ORT session options
otherwise default to warning independently of the environment. Those settings
suppress benign warnings while retaining ORT errors and fatals. WST does not
patch or filter browser console methods.

## Nonblocking recovery

A model decision that exceeds 30 seconds, or repeated unusable replies for that
interval, starts bounded worker recovery. Combat keeps running on the explicitly
labelled local combat controller. The HUD reports reconnection and AI Cam exposes
the failure; neither the clock nor player input is paused for model recovery.

Recovery terminates the old inference worker, rejects its pending query and
creates a fresh worker with the same pinned artifact and verified warm-up. At
most two automatic attempts are made per match. If both fail, the HUD reports
Laya unavailable and offers a manual retry while combat continues. A pause or
round change invalidates stale advice without allowing overlapping model queries.
