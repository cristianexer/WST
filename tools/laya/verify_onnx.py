#!/usr/bin/env python3
"""Compare a full Laya ONNX export with its pinned PyTorch source on one typed choice."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from export_to_onnx import MAX_CANDIDATES, load_pinned_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/laya"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
        import torch
        from transformers import AutoTokenizer
        from laya.common import build_sequence
    except ImportError as error:
        raise SystemExit("Install tools/laya/requirements-export.txt before verifying.") from error

    manifest = json.loads((args.artifact / "manifest.json").read_text())
    model, config, source_dir = load_pinned_model(
        args.cache_dir,
        allow_download=False,
        precision=manifest.get("precision", "fp32"),
    )
    tokenizer = AutoTokenizer.from_pretrained(source_dir / "tokenizer")
    graph_path = args.artifact / "laya-decision.verify.onnx"
    digest = hashlib.sha256()
    with graph_path.open("wb") as destination:
        for chunk in manifest["model"]["chunks"]:
            content = (args.artifact / chunk["url"].removeprefix("./")).read_bytes()
            if len(content) != chunk["bytes"] or hashlib.sha256(content).hexdigest() != chunk["sha256"]:
                raise SystemExit(f"Invalid graph chunk {chunk['url']}")
            destination.write(content)
            digest.update(content)
    if digest.hexdigest() != manifest["model"]["sha256"]:
        raise SystemExit("Combined graph digest does not match manifest.")
    session = ort.InferenceSession(str(graph_path), providers=["CPUExecutionProvider"])
    cases = [
        ("SELF hp=700 st=70 meter=0 ground=1 action=idle OTHER hp=700 st=70 action=idle DIST_MM=900", ["idle", "advance", "light"]),
        ("SELF hp=350 st=20 meter=0 ground=1 action=idle OTHER hp=800 st=70 action=heavy DIST_MM=550", ["guard_high", "guard_low", "retreat", "parry"]),
        ("SELF hp=950 st=100 meter=100 ground=1 action=idle OTHER hp=300 st=10 action=guard_high DIST_MM=450", ["light", "low", "throw", "special_papers"]),
        ("SELF hp=850 st=80 meter=20 ground=1 action=advance OTHER hp=850 st=80 action=jump DIST_MM=1100", ["advance", "dash_forward", "anti_air", "guard_high"]),
        ("SELF hp=600 st=45 meter=40 ground=1 action=retreat OTHER hp=650 st=60 action=low DIST_MM=500", ["guard_high", "guard_low", "retreat", "light", "overhead"]),
        ("SELF hp=1000 st=100 meter=0 ground=1 action=idle OTHER hp=1000 st=100 action=idle DIST_MM=1600", ["advance", "dash_forward", "jump", "idle"]),
    ]
    differences: list[float] = []
    mismatches = 0
    for index, (state, choices) in enumerate(cases, start=1):
        question = {
            "t": "choice",
            "ins": "Select the next legal combat action for SELF using observed state only.",
            "crit": {choice: choice.replace("_", " ") for choice in choices},
        }
        max_length = manifest["maxLength"]
        sequence, markers = build_sequence(tokenizer, state, question, max_length, manifest["headMaxLength"])
        if len(sequence) > max_length:
            raise SystemExit(f"Probe {index} exceeds the artifact's static token length.")
        inputs = padded_inputs(sequence, markers, max_length, tokenizer.pad_token_id, np)
        with torch.no_grad():
            reference, _ = model(
                torch.from_numpy(inputs["input_ids"]),
                torch.from_numpy(inputs["attention_mask"]),
                torch.from_numpy(inputs["marker_pos"]),
                torch.from_numpy(inputs["marker_mask"]),
                torch.from_numpy(inputs["qtype"]),
            )
        expected = reference.cpu().numpy()[0, : len(markers)]
        actual = session.run([manifest["logitsOutput"]], inputs)[0][0, : len(markers)]
        difference = float(np.max(np.abs(expected - actual)))
        differences.append(difference)
        expected_choice = choices[int(expected.argmax())]
        actual_choice = choices[int(actual.argmax())]
        same_choice = expected_choice == actual_choice
        mismatches += int(not same_choice)
        print(f"case {index}: max logit delta={difference:.7g}; PyTorch={expected_choice}; ONNX={actual_choice}; argmax={'match' if same_choice else 'MISMATCH'}")
    graph_path.unlink()
    print(f"maximum absolute logits difference: {max(differences):.7g}")
    if mismatches:
        print(f"{mismatches} of {len(cases)} typed-choice argmax results changed after quantization.", file=sys.stderr)
        return 1
    if manifest.get("precision") in {"int8", "int4"}:
        print("Quantized ONNX preserves the typed-choice argmax on all probe states; logits are intentionally not bit-identical.")
    elif max(differences) > 2e-3:
        print("ONNX output differs from the pinned PyTorch Laya model beyond tolerance.", file=sys.stderr)
        return 1
    else:
        print("ONNX export matches the pinned PyTorch Laya typed-choice logits within tolerance.")
    return 0


def padded_inputs(sequence, markers, max_length, pad_token_id, np):
    input_ids = np.full((1, max_length), pad_token_id, dtype=np.int64)
    attention_mask = np.zeros((1, max_length), dtype=np.int64)
    marker_pos = np.zeros((1, MAX_CANDIDATES), dtype=np.int64)
    marker_mask = np.zeros((1, MAX_CANDIDATES), dtype=np.bool_)
    input_ids[0, : len(sequence)] = sequence
    attention_mask[0, : len(sequence)] = 1
    marker_pos[0, : len(markers)] = markers
    marker_mask[0, : len(markers)] = True
    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "marker_pos": marker_pos,
        "marker_mask": marker_mask,
        "qtype": np.asarray([0], dtype=np.int64),
    }


if __name__ == "__main__":
    sys.exit(main())
