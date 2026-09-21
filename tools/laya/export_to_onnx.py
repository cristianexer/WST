#!/usr/bin/env python3
"""Export the pinned *full* Laya typed-choice model to a browser ONNX graph.

This deliberately downloads nothing until --download is supplied. The upstream
checkpoint's model.safetensors is 842,609,210 bytes; read docs/LAYA_BROWSER.md
before running it. The script is not an alternate policy or a conversion of only
ModernBERT: it exports Laya's encoder, typed decision head, and marker scoring.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

MODEL_REPOSITORY = "convaiinnovations/laya"
MODEL_REVISION = "1c5edc17a7acd8701df6fc341c0d179f1c62c982"
SOURCE_REVISION = "42626c348753fbb17572a813127df2278a1ec527"
MAX_LENGTH = 512
HEAD_MAX_LENGTH = 192
MAX_CANDIDATES = 16
CHUNK_BYTES = 24 * 1024 * 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Empty/new static artifact directory.")
    parser.add_argument("--overwrite", action="store_true", help="Replace a prior artifact directory created by this tool.")
    parser.add_argument(
        "--precision",
        choices=("int4", "int8", "fp16", "fp32"),
        default="int4",
        help="Graph weight precision. int4 uses ORT MatMulNBits for the browser WebGPU path.",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        choices=(320, 512),
        default=512,
        help="Static token length. 320 preserves WST's complete bounded public request; 512 is the upstream maximum.",
    )
    parser.add_argument(
        "--quantization",
        choices=("qint8", "quint8"),
        default="qint8",
        help="Dynamic-weight INT8 format. Used only when --precision int8 is selected.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Permit the explicit 842.6 MB pinned upstream checkpoint download if it is not cached.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(".cache/laya"),
        help="Hugging Face cache location. Kept outside the static output by default.",
    )
    return parser.parse_args()


def require_dependencies() -> tuple[Any, Any, Any, Any]:
    try:
        import onnx
        import torch
        from huggingface_hub import snapshot_download
        from safetensors.torch import load_file
    except ImportError as error:
        raise SystemExit(
            "Missing export dependencies. Create a virtual environment and install "
            "tools/laya/requirements-export.txt before exporting."
        ) from error
    return torch, onnx, snapshot_download, load_file


def load_pinned_model(cache_dir: Path, allow_download: bool, precision: str = "fp16") -> tuple[Any, dict[str, Any], Path]:
    torch, _, snapshot_download, load_file = require_dependencies()
    allow_patterns = [
        "model.safetensors",
        "rl_agent_config.json",
        "encoder/config.json",
        "tokenizer/tokenizer.json",
        "tokenizer/tokenizer_config.json",
    ]
    try:
        model_dir = Path(
            snapshot_download(
                MODEL_REPOSITORY,
                revision=MODEL_REVISION,
                cache_dir=cache_dir,
                allow_patterns=allow_patterns,
                local_files_only=not allow_download,
            )
        )
    except Exception as error:
        if not allow_download:
            raise SystemExit(
                "The pinned Laya checkpoint is not present in the cache. Re-run with --download "
                "only after accepting the 842.6 MB transfer."
            ) from error
        raise

    config_path = model_dir / "rl_agent_config.json"
    weights_path = model_dir / "model.safetensors"
    encoder_dir = model_dir / "encoder"
    if not config_path.is_file() or not weights_path.is_file() or not encoder_dir.is_dir():
        raise SystemExit("The cached repository is incomplete for the pinned Laya root checkpoint.")

    config = json.loads(config_path.read_text())
    expected = {"encoder", "head_layers", "max_len", "head_max_len", "temperature"}
    missing = expected.difference(config)
    if missing:
        raise SystemExit(f"Pinned Laya config is incompatible; missing {sorted(missing)}.")
    if config["max_len"] != MAX_LENGTH or config["head_max_len"] != HEAD_MAX_LENGTH:
        raise SystemExit("Pinned Laya context values changed; update the browser protocol deliberately.")

    # This is the project architecture itself, pinned by requirements-export.txt.
    from laya.common import build_model

    model = build_model(config, encoder_dir=str(encoder_dir))
    weights = load_file(str(weights_path))
    model.load_state_dict(weights, strict=True)
    if precision == "fp16":
        model.half()
        # Laya's act head uses explicitly float32 features. It is retained on the
        # source model for parity but excluded from the browser choice-only graph.
        model.act_head.float()
    model.eval()
    return model, config, model_dir


def export_graph(model: Any, output_file: Path, max_length: int) -> None:
    torch, onnx, _, _ = require_dependencies()

    class ChoiceGraph(torch.nn.Module):
        def __init__(self, decision_model: Any) -> None:
            super().__init__()
            self.decision_model = decision_model

        def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
            # This is the `DecisionModel.forward` choice-logit path copied exactly
            # through marker masking. The separate act head cannot affect logits.
            h = self.decision_model.encoder(
                input_ids=input_ids,
                attention_mask=attention_mask,
            ).last_hidden_state
            h = h + self.decision_model.type_emb(qtype)[:, None, :]
            if self.decision_model.head is not None:
                pad = ~attention_mask.bool()
                for layer in self.decision_model.head.layers:
                    h = layer(h, src_key_padding_mask=pad)
            idx = marker_pos.clamp(min=0)[:, :, None].expand(-1, -1, h.size(-1))
            markers = torch.gather(h, 1, idx)
            logits = self.decision_model.scorer(markers).squeeze(-1).float()
            logits = logits.masked_fill(~marker_mask, -1e4)
            return logits

    graph = ChoiceGraph(model)
    # ModernBERT's PyTorch SDPA trace fixes its attention reshape at export length.
    # Browser requests are therefore explicitly padded to these static shapes.
    dummy_inputs = (
        torch.full((1, max_length), 50283, dtype=torch.long),
        torch.ones((1, max_length), dtype=torch.long),
        torch.zeros((1, MAX_CANDIDATES), dtype=torch.long),
        torch.ones((1, MAX_CANDIDATES), dtype=torch.bool),
        torch.zeros((1,), dtype=torch.long),
    )
    output_file.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        graph,
        dummy_inputs,
        str(output_file),
        input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
        output_names=["logits"],
        opset_version=17,
        do_constant_folding=True,
    )
    onnx.checker.check_model(str(output_file))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def split_graph(graph: Path, output_dir: Path) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    with graph.open("rb") as source:
        index = 0
        while block := source.read(CHUNK_BYTES):
            name = f"laya-decision.onnx.part{index:03d}"
            destination = output_dir / name
            destination.write_bytes(block)
            chunks.append({"url": f"./{name}", "bytes": len(block), "sha256": sha256(destination)})
            index += 1
    graph.unlink()
    return chunks


def write_static_bundle(
    output_dir: Path,
    source_dir: Path,
    config: dict[str, Any],
    precision: str,
    quantization: str,
    max_length: int,
) -> None:
    tokenizer_source = source_dir / "tokenizer"
    tokenizer_output = output_dir / "tokenizer"
    if tokenizer_output.exists():
        shutil.rmtree(tokenizer_output)
    shutil.copytree(tokenizer_source, tokenizer_output)

    graph = output_dir / "laya-decision.onnx"
    chunks = split_graph(graph, output_dir)
    combined_hash = hashlib.sha256()
    for chunk in chunks:
        combined_hash.update((output_dir / chunk["url"].removeprefix("./")).read_bytes())
    manifest = {
        "format": "wst-laya-decision-onnx-v1",
        "checkpointRepository": MODEL_REPOSITORY,
        "checkpointRevision": MODEL_REVISION,
        "sourceRevision": SOURCE_REVISION,
        "model": {
            "bytes": sum(chunk["bytes"] for chunk in chunks),
            "sha256": combined_hash.hexdigest(),
            "chunks": chunks,
        },
        "tokenizerId": "./tokenizer",
        "tokenizerRevision": MODEL_REVISION,
        "maxLength": max_length,
        "headMaxLength": HEAD_MAX_LENGTH,
        "choiceTemperatures": {
            "choice:2": config["temperature_by_options"]["choice:2"],
            "choice:3-5": config["temperature_by_options"]["choice:3-5"],
            "choice:6-10": config["temperature_by_options"]["choice:6-10"],
            "choice:11+": config["temperature_by_options"]["choice:11+"],
        },
        "precision": precision,
        "quantization": (
            "matmul-nbits-int4-symmetric-block128" if precision == "int4"
            else quantization if precision == "int8"
            else None
        ),
        "inputs": {
            "inputIds": "input_ids",
            "attentionMask": "attention_mask",
            "markerPositions": "marker_pos",
            "markerMask": "marker_mask",
            "questionType": "qtype",
        },
        "logitsOutput": "logits",
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for notice_name in ("LICENSE", "NOTICE"):
        shutil.copyfile(Path(__file__).parent / notice_name, output_dir / notice_name)


def main() -> int:
    args = parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        if not args.overwrite:
            raise SystemExit(f"Refusing to overwrite a non-empty output directory: {args.output}")
        shutil.rmtree(args.output)
    model, config, source_dir = load_pinned_model(args.cache_dir, args.download, args.precision)
    graph_path = args.output / "laya-decision.onnx"
    export_graph(model, graph_path, args.max_length)
    if args.precision == "int8":
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantized = args.output / "laya-decision.int8.onnx"
        weight_type = QuantType.QInt8 if args.quantization == "qint8" else QuantType.QUInt8
        quantize_dynamic(str(graph_path), str(quantized), weight_type=weight_type, per_channel=True)
        graph_path.unlink()
        quantized.rename(graph_path)
    elif args.precision == "int4":
        # This format retains FP32 activations and uses ONNX Runtime's
        # `com.microsoft::MatMulNBits` for the constant matrix weights. ORT Web
        # 1.30 implements that operator on WebGPU; dynamic INT8 MatMulInteger
        # does not provide the same GPU route for this graph.
        _, onnx, _, _ = require_dependencies()
        from onnx.external_data_helper import convert_model_from_external_data
        from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

        quantized = args.output / "laya-decision.int4.external.onnx"
        quantizer = MatMulNBitsQuantizer(
            str(graph_path),
            bits=4,
            block_size=128,
            is_symmetric=True,
            accuracy_level=4,
        )
        quantizer.process()
        # ORT writes external data by design. BrowserController passes a single
        # checked ArrayBuffer to ORT Web, so make the graph self-contained before
        # splitting it into statically-hosted checksum parts.
        quantizer.model.save_model_to_file(str(quantized), True)
        inline = onnx.load(str(quantized), load_external_data=True)
        convert_model_from_external_data(inline)
        graph_path.unlink()
        onnx.save(inline, str(graph_path))
        quantized.unlink()
        quantized.with_suffix(quantized.suffix + ".data").unlink()
    write_static_bundle(args.output, source_dir, config, args.precision, args.quantization, args.max_length)
    print(f"Created verified artifact candidate: {args.output}")
    print("Run tools/laya/verify_onnx.py before wiring its manifest into the browser controller.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
