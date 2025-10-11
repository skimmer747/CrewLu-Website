#!/usr/bin/env python3
import argparse
import os
import shutil
from pathlib import Path

from PIL import Image


def human_size(num_bytes: int) -> str:
    step = 1024.0
    for unit in ["B", "KB", "MB", "GB"]:
        if num_bytes < step:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= step
    return f"{num_bytes:.2f} TB"


def optimize_png(
    source_path: Path,
    max_width: int = 1200,
    max_colors: int = 256,
) -> None:
    if not source_path.exists():
        raise FileNotFoundError(f"File not found: {source_path}")

    original_size = source_path.stat().st_size
    backup_path = source_path.with_suffix(".bak.png")

    # Create a backup copy before modifying
    shutil.copy2(source_path, backup_path)

    with Image.open(source_path) as image:
        image = image.convert("RGBA")

        # Resize if wider than target
        width, height = image.size
        if width > max_width:
            new_height = int(height * (max_width / float(width)))
            image = image.resize((max_width, new_height), Image.LANCZOS)

        # Quantize to reduce colors while keeping sharp UI look.
        # For RGBA, Pillow only supports FASTOCTREE (2) or LIBIMAGEQUANT (3).
        # Use FASTOCTREE to avoid external lib dependency.
        quantized = image.quantize(colors=max_colors, method=Image.FASTOCTREE)

        # Save with maximum compression level
        quantized.save(source_path, format="PNG", optimize=True, compress_level=9)

    new_size = source_path.stat().st_size

    print(
        f"Optimized {source_path.name}: {human_size(original_size)} -> {human_size(new_size)} "
        f"({'smaller' if new_size < original_size else 'larger or equal'})"
    )
    print(f"Backup saved to: {backup_path}")


def optimize_to_target_size(
    source_path: Path,
    target_bytes: int,
    tolerance: float = 0.10,
    min_scale: float = 0.3,
    compress_level: int = 6,
) -> None:
    if not source_path.exists():
        raise FileNotFoundError(f"File not found: {source_path}")

    original_size = source_path.stat().st_size
    backup_path = source_path.with_suffix(".bak.png")

    # Backup if not already present
    if not backup_path.exists():
        shutil.copy2(source_path, backup_path)

    with Image.open(source_path) as image:
        image = image.convert("RGBA")
        original_w, original_h = image.size

        lo, hi = min_scale, 1.0
        best_tmp: Path | None = None
        best_diff = float("inf")

        while hi - lo > 0.01:
            scale = (lo + hi) / 2.0
            w = max(1, int(original_w * scale))
            h = max(1, int(original_h * scale))
            resized = image.resize((w, h), Image.LANCZOS)

            tmp = source_path.with_suffix(".tmp.png")
            resized.save(tmp, format="PNG", optimize=True, compress_level=compress_level)

            sz = tmp.stat().st_size
            diff = abs(sz - target_bytes)
            if diff < best_diff:
                best_diff = diff
                best_tmp = tmp
            if abs(sz - target_bytes) <= target_bytes * tolerance:
                best_tmp = tmp
                break
            if sz > target_bytes:
                hi = scale
            else:
                lo = scale

        if best_tmp is None:
            raise RuntimeError("Failed to compute optimal size")

        Path(source_path).write_bytes(Path(best_tmp).read_bytes())
        Path(best_tmp).unlink(missing_ok=True)

    new_size = source_path.stat().st_size
    print(
        f"Target-optimized {source_path.name}: {human_size(original_size)} -> {human_size(new_size)}"
    )
    print(f"Backup preserved at: {backup_path}")

def main() -> None:
    parser = argparse.ArgumentParser(description="Optimize a PNG file for web use.")
    parser.add_argument("path", type=str, help="Path to PNG file to optimize")
    parser.add_argument("--max-width", type=int, default=1200, help="Maximum width in pixels")
    parser.add_argument(
        "--max-colors", type=int, default=256, help="Maximum colors for palette quantization"
    )
    parser.add_argument("--target-mb", type=float, default=0.0, help="Target output size in MB")

    args = parser.parse_args()
    if args.target_mb and args.target_mb > 0:
        optimize_to_target_size(Path(args.path), target_bytes=int(args.target_mb * 1024 * 1024))
    else:
        optimize_png(Path(args.path), max_width=args.max_width, max_colors=args.max_colors)


if __name__ == "__main__":
    main()


