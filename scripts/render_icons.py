"""Render the original SuperCollision dial artwork to iOS and PWA icon sizes."""
from pathlib import Path
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
svg = ROOT / "app-icon.svg"
for filename, size in (
    ("apple-touch-icon.png", 180),
    ("app-icon-192.png", 192),
    ("app-icon-512.png", 512),
):
    cairosvg.svg2png(url=str(svg), write_to=str(ROOT / filename),
                    output_width=size, output_height=size)
    print(f"Rendered {filename}: {size}x{size}")
