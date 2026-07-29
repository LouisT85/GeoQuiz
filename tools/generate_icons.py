#!/usr/bin/env python3
"""Génère les icônes PWA (assets/icons/) : fond sombre du thème + emoji 🌍.

Nécessite Pillow et la police Noto Color Emoji (bitmaps 128 px, rendus
uniquement à la taille 109 — d'où le redimensionnement).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "icons"
FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
EMOJI_SIZE = 109  # seule taille acceptée par les bitmaps de Noto Color Emoji
BG = (11, 18, 32)       # --bg du thème (#0b1220)
HALO = (22, 35, 61)     # halo central (#16233d)


def emoji_image(char: str) -> Image.Image:
    font = ImageFont.truetype(FONT, EMOJI_SIZE)
    img = Image.new("RGBA", (EMOJI_SIZE * 2, EMOJI_SIZE * 2), (0, 0, 0, 0))
    ImageDraw.Draw(img).text(
        (EMOJI_SIZE, EMOJI_SIZE), char, font=font, embedded_color=True, anchor="mm"
    )
    return img.crop(img.getbbox())


def make_icon(size: int, emoji_ratio: float, path: Path, emoji: Image.Image):
    """Fond plein (compatible « maskable ») avec halo radial et emoji centré."""
    icon = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(icon)
    # Halo : cercles concentriques interpolés entre HALO et BG.
    for i in range(60, 0, -1):
        r = size * 0.62 * i / 60
        f = 1 - i / 60
        color = tuple(round(h + (b - h) * f) for h, b in zip(HALO, BG))
        draw.ellipse(
            [size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=color
        )
    e = emoji.resize((round(size * emoji_ratio),) * 2, Image.LANCZOS)
    icon.paste(e, ((size - e.width) // 2, (size - e.height) // 2), e)
    icon.convert("RGB").save(path, optimize=True)
    print(f"{path.relative_to(ROOT)} ({size}×{size})")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    emoji = emoji_image("🌍")
    # Ratio 0.62 : l'emoji reste dans la zone sûre des icônes « maskable ».
    make_icon(512, 0.62, OUT / "icon-512.png", emoji)
    make_icon(192, 0.62, OUT / "icon-192.png", emoji)
    make_icon(180, 0.70, OUT / "apple-touch-icon.png", emoji)


if __name__ == "__main__":
    main()
