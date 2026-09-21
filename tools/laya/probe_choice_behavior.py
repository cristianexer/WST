#!/usr/bin/env python3
"""Probe pinned Laya choice behavior with the browser-compatible bounded protocol.

This is a diagnostic, not a policy or an end-to-end browser test. It uses
Laya's upstream typed-choice sequence layout and the current compact public
state field names, compares the pinned PyTorch checkpoint with the published
INT4 ONNX graph, and reports how action choice changes when public combat
state, option wording, and option position change. The TypeScript unit test is
the exhaustive 16-choice / all-signature tokenizer budget check.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections.abc import Iterable
from pathlib import Path

from export_to_onnx import MAX_CANDIDATES, load_pinned_model


CURRENT_INSTRUCTIONS = "Choose the best legal action from the delayed public combat state."
EXPLICIT_INSTRUCTIONS = (
    "You are SELF in a 2D fighting game. Choose one legal action now to win the round. "
    "Use only distance, both visible actions and phases, health, stamina, meter, and walls. "
    "Choose an action that reaches, defends, or improves position; hold idle only when it is best."
)

ACTIONS = (
    "idle", "guard_high", "guard_low", "advance", "retreat", "crouch",
    "dash_forward", "dash_back", "jump", "light", "body", "heavy", "low",
    "overhead", "anti_air", "air_kick",
)

SHORT_CRITERIA = {
    "light": "quick high punch", "body": "mid punch follow-up", "heavy": "slow strong mid punch",
    "low": "low kick", "overhead": "slow overhead strike", "anti_air": "rising anti-air strike",
    "air_kick": "airborne overhead kick", "dash_forward": "stamina forward dash",
    "dash_back": "stamina back dash", "jump": "stamina jump", "guard_high": "high and mid guard",
    "guard_low": "low and mid guard", "advance": "walk forward", "retreat": "walk back",
    "crouch": "crouch below highs", "idle": "neutral spacing",
}

EXPLICIT_CRITERIA = {
    "idle": "idle: hold position without attacking, blocking, or moving",
    "guard_high": "guard high: block a high or mid attack while standing",
    "guard_low": "guard low: block a low or mid attack while crouching",
    "advance": "advance: walk toward the opponent to close distance",
    "retreat": "retreat: walk away to create distance",
    "crouch": "crouch: lower hurtbox to avoid a high attack",
    "dash_forward": "dash forward: spend stamina to close a long distance quickly",
    "dash_back": "dash back: spend stamina to escape a close threat quickly",
    "jump": "jump: spend stamina to avoid a low attack or approach through the air",
    "light": "light: fast short-range high punch for a nearby opponent",
    "body": "body: medium-range mid punch that hits a standing guard",
    "heavy": "heavy: slow strong mid punch, unsafe if it misses",
    "low": "low: short-range low kick that beats a standing guard",
    "overhead": "overhead: slow high strike that beats a low guard",
    "anti_air": "anti-air: rising strike for an airborne opponent",
    "air_kick": "air kick: airborne overhead kick for a grounded opponent",
}

STATES = {
    "far-neutral": (
        "SELF hp=80 st=70 m=20 alt=0 phase=neutral action=idle age=0 can=1 sig=k=strike r=1400 "
        "OTHER hp=76 st=56 m=30 alt=0 phase=neutral action=idle age=0 can=1 dist=1500 sig=k=strike r=1400 "
        "wall=6100/6100 round=1 timer=3300 hist=none"
    ),
    "close-neutral": (
        "SELF hp=80 st=70 m=20 alt=0 phase=neutral action=idle age=0 can=1 sig=k=strike r=1400 "
        "OTHER hp=76 st=56 m=30 alt=0 phase=neutral action=idle age=0 can=1 dist=420 sig=k=strike r=1400 "
        "wall=6100/6100 round=1 timer=3300 hist=none"
    ),
    "low-threat": (
        "SELF hp=80 st=70 m=20 alt=0 phase=neutral action=idle age=0 can=1 sig=k=strike r=1400 "
        "OTHER hp=76 st=56 m=30 alt=0 phase=startup action=low age=2 can=1 dist=460 sig=k=strike r=1400 "
        "wall=6100/6100 round=1 timer=3300 hist=low"
    ),
    "air-threat": (
        "SELF hp=80 st=70 m=20 alt=0 phase=neutral action=idle age=0 can=1 sig=k=strike r=1400 "
        "OTHER hp=76 st=56 m=30 alt=500 phase=active action=jump age=8 can=1 dist=700 sig=k=strike r=1400 "
        "wall=6100/6100 round=1 timer=3300 hist=jump"
    ),
}

NATURAL_STATES = {
    "natural-far-neutral": (
        "SELF is in a 2D fighting game. SELF has 800 health, 70 stamina, and 20 meter. "
        "SELF is standing in neutral, faces the opponent, and can act. The opponent has 760 health, "
        "56 stamina, and 30 meter. The opponent is standing idle. The opponent is 1500 millimetres away. "
        "Both fighters have 6100 millimetres to a wall. Round 1 has 3300 ticks remaining."
    ),
    "natural-close-neutral": (
        "SELF is in a 2D fighting game. SELF has 800 health, 70 stamina, and 20 meter. "
        "SELF is standing in neutral, faces the opponent, and can act. The opponent has 760 health, "
        "56 stamina, and 30 meter. The opponent is standing idle. The opponent is 420 millimetres away. "
        "Both fighters have 6100 millimetres to a wall. Round 1 has 3300 ticks remaining."
    ),
    "natural-low-threat": (
        "SELF is in a 2D fighting game. SELF has 800 health, 70 stamina, and 20 meter. "
        "SELF is standing in neutral and can act. The opponent is 460 millimetres away, is starting a "
        "low kick, and is not airborne. Both fighters have room behind them. Round 1 has 3300 ticks remaining."
    ),
    "natural-air-threat": (
        "SELF is in a 2D fighting game. SELF has 800 health, 70 stamina, and 20 meter. "
        "SELF is standing in neutral and can act. The opponent is 700 millimetres away and airborne "
        "during a jump attack. Both fighters have room behind them. Round 1 has 3300 ticks remaining."
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/laya"))
    parser.add_argument("--onnx-only", action="store_true", help="Skip the source-model comparison.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Evaluate a separately downloaded compatible Laya source checkpoint; never publishes it.",
    )
    parser.add_argument("--source-only", action="store_true", help="Skip the published ONNX graph.")
    return parser.parse_args()


def graph_path(artifact: Path, manifest: dict) -> Path:
    path = artifact / "laya-decision.behavior-probe.onnx"
    digest = hashlib.sha256()
    with path.open("wb") as output:
        for chunk in manifest["model"]["chunks"]:
            source = artifact / chunk["url"].removeprefix("./")
            content = source.read_bytes()
            if len(content) != chunk["bytes"] or hashlib.sha256(content).hexdigest() != chunk["sha256"]:
                raise SystemExit(f"Invalid graph chunk: {source}")
            output.write(content)
            digest.update(content)
    if digest.hexdigest() != manifest["model"]["sha256"]:
        raise SystemExit("Published model hash did not match its manifest.")
    return path


def padded_inputs(sequence, markers, maximum, pad_id, np):
    input_ids = np.full((1, maximum), pad_id, dtype=np.int64)
    attention = np.zeros((1, maximum), dtype=np.int64)
    positions = np.zeros((1, MAX_CANDIDATES), dtype=np.int64)
    marker_mask = np.zeros((1, MAX_CANDIDATES), dtype=np.bool_)
    input_ids[0, : len(sequence)] = sequence
    attention[0, : len(sequence)] = 1
    positions[0, : len(markers)] = markers
    marker_mask[0, : len(markers)] = True
    return {
        "input_ids": input_ids,
        "attention_mask": attention,
        "marker_pos": positions,
        "marker_mask": marker_mask,
        "qtype": np.asarray([0], dtype=np.int64),
    }


def questions(order: tuple[str, ...]) -> Iterable[tuple[str, dict]]:
    yield "current opaque options", {
        "t": "choice", "ins": CURRENT_INSTRUCTIONS,
        "crit": {f"option_{index + 1}": SHORT_CRITERIA[action] for index, action in enumerate(order)},
    }
    yield "explicit semantic options", {
        "t": "choice", "ins": EXPLICIT_INSTRUCTIONS,
        "crit": {action: EXPLICIT_CRITERIA[action] for action in order},
    }
    yield "short semantic options", {
        "t": "choice", "ins": CURRENT_INSTRUCTIONS,
        "crit": {action: SHORT_CRITERIA[action] for action in order},
    }


def label(logits, order: tuple[str, ...], temperature: float) -> str:
    raw_index = int(logits.argmax())
    scaled = logits / temperature
    probs = __import__("numpy").exp(scaled - scaled.max())
    probs = probs / probs.sum()
    return f"{order[raw_index]} raw={logits[raw_index]:.4f} p={probs[raw_index]:.4f}"


def load_source_model(source_dir: Path):
    from laya.common import build_model
    from safetensors.torch import load_file

    config_path = source_dir / "rl_agent_config.json"
    weights_path = source_dir / "model.safetensors"
    encoder_dir = source_dir / "encoder"
    if not config_path.is_file() or not weights_path.is_file() or not encoder_dir.is_dir():
        raise SystemExit(f"Source checkpoint is incomplete: {source_dir}")
    model = build_model(json.loads(config_path.read_text()), encoder_dir=str(encoder_dir))
    model.load_state_dict(load_file(str(weights_path)), strict=True)
    model.eval()
    return model


def main() -> int:
    args = parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
        import torch
        from transformers import AutoTokenizer
        from laya.common import build_sequence
    except ImportError as error:
        raise SystemExit("Install tools/laya/requirements-export.txt before probing.") from error

    manifest = json.loads((args.artifact / "manifest.json").read_text())
    maximum, head_maximum = manifest["maxLength"], manifest["headMaxLength"]
    temperature = manifest["choiceTemperatures"]["choice:11+"]
    if args.onnx_only and args.source_only:
        raise SystemExit("Choose at least one model path to probe.")
    onnx_path = None if args.source_only else graph_path(args.artifact, manifest)
    try:
        session = None if args.source_only else ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        model = None
        tokenizer_source = args.artifact / "tokenizer"
        if not args.onnx_only:
            if args.source_dir:
                model = load_source_model(args.source_dir)
                tokenizer_source = args.source_dir / "tokenizer"
            else:
                model, _, source_dir = load_pinned_model(args.cache_dir, allow_download=False, precision="fp32")
                tokenizer_source = source_dir / "tokenizer"
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_source)

        for name, state in {**STATES, **NATURAL_STATES}.items():
            print(f"\n{name}")
            for presentation, order in (
                ("idle-first", ACTIONS),
                ("idle-last", ACTIONS[1:] + ACTIONS[:1]),
            ):
                for style, question in questions(order):
                    sequence, markers = build_sequence(tokenizer, state, question, maximum, head_maximum)
                    inputs = padded_inputs(sequence, markers, maximum, tokenizer.pad_token_id, np)
                    outcomes = []
                    if session is not None:
                        onnx_logits = session.run([manifest["logitsOutput"]], inputs)[0][0, :len(order)]
                        outcomes.append(f"ONNX={label(onnx_logits, order, temperature)}")
                    if model is not None:
                        with torch.no_grad():
                            source_logits, _ = model(
                                torch.from_numpy(inputs["input_ids"]),
                                torch.from_numpy(inputs["attention_mask"]),
                                torch.from_numpy(inputs["marker_pos"]),
                                torch.from_numpy(inputs["marker_mask"]),
                                torch.from_numpy(inputs["qtype"]),
                        )
                        source_values = source_logits.numpy()[0, :len(order)]
                        outcomes.append(f"source={label(source_values, order, temperature)}")
                    print(f"  {presentation}; {style}: {'; '.join(outcomes)}")
    finally:
        if onnx_path is not None:
            onnx_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
