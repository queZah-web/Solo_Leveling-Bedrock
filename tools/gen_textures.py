#!/usr/bin/env python3
"""Generates all procedural textures for the Solo Leveling resource pack.

Run from the repository root:  python3 tools/gen_textures.py
Every PNG under RP/textures/sl/ and the gem item texture is produced here,
so the art style can be tweaked in one place.
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
UI = os.path.join(RP, "textures", "sl", "ui")
BARS = os.path.join(UI, "bars")

CYAN = (64, 224, 255, 255)
CYAN_DIM = (36, 140, 180, 255)
NAVY = (8, 16, 30, 238)
NAVY_2 = (10, 22, 40, 230)
PURPLE = (190, 90, 255, 255)


def save(img, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def nineslice_meta(name, size, base):
    with open(os.path.join(UI, name + ".json"), "w") as f:
        json.dump({"nineslice_size": size, "base_size": base}, f, indent=2)


def framed(w, h, fill, border, glow=None, glow_w=0, border_w=1, notch=0):
    """A rectangle with optional outer glow and a cut top-left/bottom-right corner."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if glow:
        for i in range(glow_w):
            a = int(glow[3] * (i + 1) / (glow_w + 1))
            d.rectangle([i, i, w - 1 - i, h - 1 - i], outline=glow[:3] + (a,))
    o = glow_w
    d.rectangle([o, o, w - 1 - o, h - 1 - o], fill=fill)
    for i in range(border_w):
        d.rectangle([o + i, o + i, w - 1 - o - i, h - 1 - o - i], outline=border)
    if notch:
        # small bright corner accents (sci-fi look)
        for k in range(notch):
            img.putpixel((o + 1 + k, o + 1), (255, 255, 255, 255))
            img.putpixel((o + 1, o + 1 + k), (255, 255, 255, 255))
            img.putpixel((w - 2 - o - k, h - 2 - o), (255, 255, 255, 255))
            img.putpixel((w - 2 - o, h - 2 - o - k), (255, 255, 255, 255))
    return img


def gen_ui():
    os.makedirs(BARS, exist_ok=True)
    # Main window frame: glow + 2px cyan border
    save(framed(32, 32, NAVY, CYAN, glow=(64, 224, 255, 200), glow_w=3, border_w=2, notch=4), UI, "frame.png")
    nineslice_meta("frame", 9, [32, 32])
    # Inner panel
    save(framed(24, 24, NAVY_2, CYAN_DIM, notch=3), UI, "inner.png")
    nineslice_meta("inner", 5, [24, 24])
    # Buttons
    save(framed(24, 16, (14, 40, 64, 240), CYAN), UI, "btn.png")
    save(framed(24, 16, (26, 78, 110, 250), (190, 250, 255, 255)), UI, "btn_hover.png")
    save(framed(24, 16, (6, 26, 44, 250), CYAN_DIM), UI, "btn_pressed.png")
    for n in ("btn", "btn_hover", "btn_pressed"):
        nineslice_meta(n, 4, [24, 16])
    # Close button (red)
    save(framed(24, 16, (60, 14, 22, 240), (255, 80, 100, 255)), UI, "close.png")
    save(framed(24, 16, (100, 22, 34, 250), (255, 180, 190, 255)), UI, "close_hover.png")
    for n in ("close", "close_hover"):
        nineslice_meta(n, 4, [24, 16])
    # Tabs
    save(framed(24, 16, (10, 26, 44, 220), CYAN_DIM), UI, "tab.png")
    save(framed(24, 16, (20, 56, 84, 240), CYAN), UI, "tab_hover.png")
    save(framed(24, 16, (40, 20, 70, 245), PURPLE), UI, "tab_active.png")
    for n in ("tab", "tab_hover", "tab_active"):
        nineslice_meta(n, 4, [24, 16])
    # Slot (for later inventory phases)
    save(framed(18, 18, (6, 14, 26, 235), CYAN_DIM), UI, "slot.png")
    nineslice_meta("slot", 3, [18, 18])
    # Invisible button background (display-only elements)
    save(Image.new("RGBA", (4, 4), (0, 0, 0, 0)), UI, "blank.png")
    # Thin separator line
    sep = Image.new("RGBA", (16, 1), CYAN_DIM)
    save(sep, UI, "line.png")
    # Plus icons
    for name, col in (("plus", (90, 255, 140, 255)), ("plus_off", (80, 90, 100, 255))):
        p = Image.new("RGBA", (9, 9), (0, 0, 0, 0))
        d = ImageDraw.Draw(p)
        d.rectangle([3, 0, 5, 8], fill=col)
        d.rectangle([0, 3, 8, 5], fill=col)
        save(p, UI, name + ".png")

    # Progress bars: 21 frames (0%..100% step 5%) for each colour
    bar_cols = {
        "xp": ((255, 196, 40), (120, 80, 10)),
        "hp": ((235, 50, 60), (110, 20, 26)),
        "mp": ((60, 150, 255), (20, 50, 120)),
        "fatigue": ((255, 140, 40), (110, 60, 16)),
        "stamina": ((70, 220, 90), (20, 90, 30)),
    }
    W, H = 100, 6
    for name, (hi, lo) in bar_cols.items():
        for step in range(21):
            img = Image.new("RGBA", (W, H), (4, 8, 16, 255))
            d = ImageDraw.Draw(img)
            fill_w = round((W - 2) * step / 20)
            if fill_w > 0:
                for x in range(fill_w):
                    t = x / max(1, W - 2)
                    c = tuple(int(lo[i] + (hi[i] - lo[i]) * (0.55 + 0.45 * t)) for i in range(3))
                    d.line([(1 + x, 1), (1 + x, H - 2)], fill=c + (255,))
                d.line([(1, 1), (fill_w, 1)], fill=tuple(min(255, v + 60) for v in hi) + (255,))
            d.rectangle([0, 0, W - 1, H - 1], outline=CYAN_DIM)
            save(img, BARS, f"{name}_{step}.png")


def gen_gem():
    """16x16 black gem with violet glow - the System Gem item."""
    g = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    shape = [
        "......####......",
        ".....#aaaa#.....",
        "....#abbbba#....",
        "...#abccccba#...",
        "..#abccddccba#..",
        ".#abccdeedccba#.",
        "#abccdeffedccba#",
        "#abccdeffedccba#",
        ".#abccdeedccba#.",
        "..#abccddccba#..",
        "...#abccccba#...",
        "....#abbbba#....",
        ".....#aaaa#.....",
        "......#aa#......",
        ".......##.......",
        "................",
    ]
    pal = {
        "#": (120, 40, 200, 255),
        "a": (30, 10, 50, 255),
        "b": (50, 16, 80, 255),
        "c": (20, 8, 34, 255),
        "d": (90, 30, 150, 255),
        "e": (170, 90, 255, 255),
        "f": (230, 200, 255, 255),
    }
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch in pal:
                g.putpixel((x, y), pal[ch])
    save(g, RP, "textures", "items", "sl", "system_gem.png")
    return g


def gen_icons(gem):
    icon = framed(128, 128, (6, 12, 24, 255), CYAN, glow=(64, 224, 255, 220), glow_w=6, border_w=3, notch=10)
    big = gem.resize((80, 80), Image.NEAREST)
    icon.alpha_composite(big, (24, 22))
    save(icon, RP, "pack_icon.png")
    save(icon, BP, "pack_icon.png")


if __name__ == "__main__":
    gen_ui()
    gem = gen_gem()
    gen_icons(gem)
    print("textures generated")
