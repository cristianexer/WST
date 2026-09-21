#!/usr/bin/env python3
"""Derive source-pixel frame rectangles from fighter-atlas alpha masks.

The script is read-only with respect to PNG inputs. It labels 8-connected alpha
components using row runs (so SciPy is not required), finds eight principal body
components, associates smaller visible components with the nearest body, and
writes source-pixel rectangles with a small transparent margin in display order.

It also reports a limitation that a component count alone cannot detect: when
two body bounding rectangles contain one another's opaque pixels, a rectangular
UV crop cannot perfectly isolate both frames without changing the source image.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


DEFAULT_INPUT = Path("apps/web/public/assets/fighters")
DEFAULT_OUTPUT = Path("apps/web/src/game/fighter-atlas-frames.json")
# FighterSprite uses alphaTest=.12. Alpha 31 is the first integer value that
# survives that comparison, so topology and rectangles match visible pixels.
DEFAULT_ALPHA_THRESHOLD = 31
DEFAULT_MARGIN = 2
EXPECTED_FRAMES = 8
PRINCIPAL_AREA_FRACTION = 0.01


@dataclass
class Run:
    y: int
    start: int
    end: int
    node: int


@dataclass
class Component:
    root: int
    area: int
    box: list[int]  # inclusive x_min, y_min, x_max, y_max

    @property
    def center(self) -> tuple[float, float]:
        return ((self.box[0] + self.box[2]) / 2, (self.box[1] + self.box[3]) / 2)


@dataclass
class Analysis:
    width: int
    height: int
    frames: list[dict[str, object]]
    source: Path
    component_count: int
    overlap_diagnostics: list[str]
    strip_count: int


class UnionFind:
    def __init__(self) -> None:
        self.parent: list[int] = []
        self.area: list[int] = []
        self.box: list[list[int]] = []

    def add(self, y: int, start: int, end: int) -> int:
        node = len(self.parent)
        self.parent.append(node)
        self.area.append(end - start + 1)
        self.box.append([start, y, end, y])
        return node

    def find(self, node: int) -> int:
        while self.parent[node] != node:
            self.parent[node] = self.parent[self.parent[node]]
            node = self.parent[node]
        return node

    def union(self, first: int, second: int) -> None:
        first = self.find(first)
        second = self.find(second)
        if first == second:
            return
        if self.area[first] < self.area[second]:
            first, second = second, first
        self.parent[second] = first
        self.area[first] += self.area[second]
        a = self.box[first]
        b = self.box[second]
        self.box[first] = [
            min(a[0], b[0]),
            min(a[1], b[1]),
            max(a[2], b[2]),
            max(a[3], b[3]),
        ]


def row_runs(row: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
    return np.flatnonzero(edges == 1), np.flatnonzero(edges == -1) - 1


def connected_components(mask: np.ndarray) -> tuple[list[Component], list[Run], UnionFind]:
    """Label an alpha mask with 8-connectivity using compact horizontal runs."""
    union_find = UnionFind()
    runs: list[Run] = []
    previous: list[tuple[int, int, int]] = []
    for y, row in enumerate(mask):
        starts, ends = row_runs(row)
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for start_value, end_value in zip(starts.tolist(), ends.tolist(), strict=True):
            start = int(start_value)
            end = int(end_value)
            node = union_find.add(y, start, end)
            runs.append(Run(y, start, end, node))
            current.append((start, end, node))
            while previous_index < len(previous) and previous[previous_index][1] < start - 1:
                previous_index += 1
            candidate = previous_index
            while candidate < len(previous) and previous[candidate][0] <= end + 1:
                union_find.union(node, previous[candidate][2])
                candidate += 1
        previous = current

    components = [
        Component(root, union_find.area[root], union_find.box[root].copy())
        for root in range(len(union_find.parent))
        if union_find.find(root) == root
    ]
    components.sort(key=lambda item: item.area, reverse=True)
    return components, runs, union_find


def box_distance_key(first: list[int], second: list[int]) -> tuple[float, float]:
    """Rank a detached component against a body box.

    Edge distance is decisive: a detached prop inside a body's bounding box
    belongs to that frame even when its centre happens to be nearer another
    row. Centre distance only breaks ties between equally close body boxes.
    """
    dx = max(first[0] - second[2] - 1, second[0] - first[2] - 1, 0)
    dy = max(first[1] - second[3] - 1, second[1] - first[3] - 1, 0)
    first_center = ((first[0] + first[2]) / 2, (first[1] + first[3]) / 2)
    second_center = ((second[0] + second[2]) / 2, (second[1] + second[3]) / 2)
    center_distance = (
        (first_center[0] - second_center[0]) ** 2
        + (first_center[1] - second_center[1]) ** 2
    )
    return float(dx * dx + dy * dy), center_distance


def union_box(target: list[int], other: list[int]) -> None:
    target[0] = min(target[0], other[0])
    target[1] = min(target[1], other[1])
    target[2] = max(target[2], other[2])
    target[3] = max(target[3], other[3])


def order_principals(principals: list[Component]) -> list[Component]:
    by_y = sorted(principals, key=lambda item: (item.center[1], item.center[0]))
    top = sorted(by_y[:4], key=lambda item: item.center[0])
    bottom = sorted(by_y[4:], key=lambda item: item.center[0])
    if len(top) != 4 or len(bottom) != 4:
        raise ValueError("principal components do not form two rows of four")
    if max(item.center[1] for item in top) >= min(item.center[1] for item in bottom):
        raise ValueError("principal component rows are vertically ambiguous")
    return top + bottom


def build_frame_labels(
    shape: tuple[int, int],
    runs: Iterable[Run],
    union_find: UnionFind,
    root_to_frame: dict[int, int],
) -> np.ndarray:
    labels = np.full(shape, -1, dtype=np.int16)
    for run in runs:
        root = union_find.find(run.node)
        frame = root_to_frame[root]
        labels[run.y, run.start : run.end + 1] = frame
    return labels


def diagnose_rectangles(
    boxes: list[list[int]], labels: np.ndarray
) -> tuple[list[str], set[int]]:
    diagnostics: list[str] = []
    contaminated_frames: set[int] = set()
    for frame, box in enumerate(boxes):
        x_min, y_min, x_max, y_max = box
        crop = labels[y_min : y_max + 1, x_min : x_max + 1]
        foreign = crop[(crop >= 0) & (crop != frame)]
        if foreign.size == 0:
            continue
        contaminated_frames.add(frame)
        counts = np.bincount(foreign, minlength=EXPECTED_FRAMES)
        sources = ", ".join(
            f"frame {other}: {int(count)} px"
            for other, count in enumerate(counts)
            if count > 0
        )
        diagnostics.append(f"frame {frame} rectangle contains foreign visible alpha ({sources})")
    return diagnostics, contaminated_frames


def exact_frame_strips(labels: np.ndarray, frame: int) -> list[list[int]]:
    """Losslessly encode one frame's assigned pixels as merged horizontal runs."""
    rows_by_span: dict[tuple[int, int], list[int]] = {}
    for y, row in enumerate(labels):
        starts, ends = row_runs(row == frame)
        for start_value, end_value in zip(starts.tolist(), ends.tolist(), strict=True):
            span = (int(start_value), int(end_value))
            rows_by_span.setdefault(span, []).append(y)

    strips: list[list[int]] = []
    for (start, end), rows in rows_by_span.items():
        first_y = previous_y = rows[0]
        for y in rows[1:]:
            if y != previous_y + 1:
                strips.append(
                    [start, first_y, end - start + 1, previous_y - first_y + 1]
                )
                first_y = y
            previous_y = y
        strips.append([start, first_y, end - start + 1, previous_y - first_y + 1])
    strips.sort(key=lambda strip: (strip[1], strip[0]))
    validate_strips(labels, frame, strips)
    return strips


def validate_strips(
    labels: np.ndarray, frame: int, strips: list[list[int]]
) -> None:
    covered_pixels = 0
    for strip in strips:
        x, y, width, height = strip
        crop = labels[y : y + height, x : x + width]
        if crop.size != width * height or not np.all(crop == frame):
            raise ValueError(f"frame {frame} strip contains transparent or foreign alpha: {strip}")
        covered_pixels += width * height
    expected_pixels = int(np.count_nonzero(labels == frame))
    if covered_pixels != expected_pixels:
        raise ValueError(
            f"frame {frame} strips cover {covered_pixels} pixels; expected {expected_pixels}"
        )


def expand_box(box: list[int], margin: int, width: int, height: int) -> list[int]:
    return [
        max(0, box[0] - margin),
        max(0, box[1] - margin),
        min(width - 1, box[2] + margin),
        min(height - 1, box[3] + margin),
    ]


def analyze(path: Path, alpha_threshold: int, margin: int) -> Analysis:
    with Image.open(path) as image:
        if "A" not in image.getbands():
            raise ValueError(f"{path} has no alpha channel")
        alpha = np.asarray(image.getchannel("A"))
        width, height = image.size
    mask = alpha >= alpha_threshold
    components, runs, union_find = connected_components(mask)
    principal_area = width * height * PRINCIPAL_AREA_FRACTION
    principals = [component for component in components if component.area >= principal_area]
    if len(principals) != EXPECTED_FRAMES:
        largest = ", ".join(str(component.area) for component in components[:12])
        raise ValueError(
            f"{path}: expected {EXPECTED_FRAMES} principal alpha components >= "
            f"{math.ceil(principal_area)} px; found {len(principals)} (largest areas: {largest})"
        )

    ordered = order_principals(principals)
    principal_index = {component.root: frame for frame, component in enumerate(ordered)}
    root_to_frame: dict[int, int] = {}
    principal_boxes = [component.box.copy() for component in ordered]
    boxes = [component.box.copy() for component in ordered]
    for component in components:
        if component.root in principal_index:
            frame = principal_index[component.root]
        else:
            frame = min(
                range(EXPECTED_FRAMES),
                key=lambda index: box_distance_key(component.box, principal_boxes[index]),
            )
            union_box(boxes[frame], component.box)
        root_to_frame[component.root] = frame

    boxes = [expand_box(box, margin, width, height) for box in boxes]
    labels = build_frame_labels(mask.shape, runs, union_find, root_to_frame)
    diagnostics, contaminated_frames = diagnose_rectangles(boxes, labels)
    frames: list[dict[str, object]] = []
    strip_count = 0
    for frame, box in enumerate(boxes):
        frame_data: dict[str, object] = {
            "x": box[0],
            "y": box[1],
            "width": box[2] - box[0] + 1,
            "height": box[3] - box[1] + 1,
        }
        if frame in contaminated_frames:
            strips = exact_frame_strips(labels, frame)
            frame_data["strips"] = strips
            strip_count += len(strips)
        frames.append(frame_data)
    return Analysis(
        width,
        height,
        frames,
        path,
        len(components),
        diagnostics,
        strip_count,
    )


def roster(input_directory: Path) -> list[str]:
    motion_suffix = "-motion.png"
    ids = sorted(
        path.name[: -len(motion_suffix)]
        for path in input_directory.glob(f"*{motion_suffix}")
    )
    if not ids:
        raise ValueError(f"no motion banks found in {input_directory}")
    return ids


def bank_paths(input_directory: Path, fighter_id: str) -> dict[str, Path]:
    preferred_base = input_directory / f"{fighter_id}-base-v2.png"
    return {
        "base": preferred_base if preferred_base.exists() else input_directory / f"{fighter_id}.png",
        "motion": input_directory / f"{fighter_id}-motion.png",
        "combat": input_directory / f"{fighter_id}-combat.png",
    }


def generate(input_directory: Path, output: Path, alpha_threshold: int, margin: int) -> int:
    data: dict[str, dict[str, dict[str, object]]] = {}
    warnings: list[str] = []
    failures: list[str] = []
    analyzed = 0
    preferred_bases = 0
    secondary_components = 0
    emitted_strips = 0
    for fighter_id in roster(input_directory):
        data[fighter_id] = {}
        paths = bank_paths(input_directory, fighter_id)
        if paths["base"].name.endswith("-base-v2.png"):
            preferred_bases += 1
        for bank, path in paths.items():
            if not path.exists():
                failures.append(f"missing {fighter_id} {bank}: {path}")
                continue
            try:
                result = analyze(path, alpha_threshold, margin)
            except ValueError as error:
                failures.append(str(error))
                continue
            analyzed += 1
            secondary_components += result.component_count - EXPECTED_FRAMES
            emitted_strips += result.strip_count
            data[fighter_id][bank] = {
                "file": result.source.name,
                "width": result.width,
                "height": result.height,
                "frames": result.frames,
            }
            warnings.extend(
                f"{fighter_id}/{bank} ({path.name}): {detail}"
                for detail in result.overlap_diagnostics
            )

    if failures:
        print("Atlas analysis failed:", file=sys.stderr)
        for failure in failures:
            print(f"  ERROR {failure}", file=sys.stderr)
        return 1

    output.parent.mkdir(parents=True, exist_ok=True)
    # Strip meshes contain tens of thousands of small tuples; compact JSON
    # keeps the generated source artifact and the module parse cost modest.
    output.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"Wrote {output}: {len(data)} fighters, {analyzed} banks, "
        f"{preferred_bases} preferred base-v2 banks, alpha >= {alpha_threshold}, "
        f"{margin}px margin."
    )
    print(
        f"All {analyzed} banks contain exactly {EXPECTED_FRAMES} principal body components; "
        f"assigned {secondary_components} smaller detached components to their nearest body."
    )
    if warnings:
        print(
            f"Detected {len(warnings)} non-isolating frame rectangles. "
            f"Emitted {emitted_strips} exact strips for those frames; "
            "their padded rectangles retain the complete assigned component but cannot exclude "
            "every neighbouring pixel:"
        )
        for warning in warnings:
            print(f"  WARNING {warning}")
    else:
        print("All 504 frame rectangles isolate their assigned visible alpha.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    parser.add_argument("--margin", type=int, default=DEFAULT_MARGIN)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 1 <= args.alpha_threshold <= 255:
        print("--alpha-threshold must be between 1 and 255", file=sys.stderr)
        return 2
    if args.margin < 0:
        print("--margin must be non-negative", file=sys.stderr)
        return 2
    return generate(args.input, args.output, args.alpha_threshold, args.margin)


if __name__ == "__main__":
    raise SystemExit(main())
