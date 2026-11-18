#!/usr/bin/env python3
"""Skill icons (32x32 pixel symbols): packs/SoloLeveling_RP/textures/sl/skills/<id>.png"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packs", "SoloLeveling_RP", "textures", "sl", "skills")
EYE = (120, 235, 255, 255)


def base(col):
    im = Image.new("RGBA", (32, 32), (8, 10, 24, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 31, 31], outline=col)
    d.rectangle([1, 1, 30, 30], outline=tuple(int(c * 0.5) for c in col[:3]) + (255,))
    return im, d


def main():
    os.makedirs(OUT, exist_ok=True)
    icons = {}
    im, d = base((90, 255, 140, 255))
    d.polygon([(18, 4), (9, 18), (15, 18), (12, 28), (23, 13), (17, 13), (20, 4)], fill=(150, 255, 180, 255))
    icons["sprint"] = im
    im, d = base((255, 80, 90, 255))
    d.polygon([(25, 5), (27, 7), (12, 22), (10, 20)], fill=(230, 230, 240, 255))
    d.rectangle([7, 21, 11, 25], fill=(120, 60, 40, 255))
    d.line([(6, 18), (14, 26)], fill=(200, 170, 60, 255), width=2)
    icons["dagger_rush"] = im
    im, d = base((200, 30, 40, 255))
    d.ellipse([6, 10, 26, 22], fill=(120, 10, 20, 255))
    d.ellipse([12, 11, 20, 21], fill=(255, 60, 60, 255))
    d.ellipse([14, 13, 18, 19], fill=(20, 0, 0, 255))
    icons["bloodlust"] = im
    im, d = base((140, 140, 160, 255))
    d.ellipse([9, 5, 23, 19], fill=(60, 60, 80, 255))
    d.polygon([(9, 13), (23, 13), (26, 28), (6, 28)], fill=(60, 60, 80, 255))
    d.rectangle([12, 10, 14, 12], fill=EYE)
    d.rectangle([18, 10, 20, 12], fill=EYE)
    icons["stealth"] = im
    im, d = base((80, 200, 255, 255))
    d.rectangle([11, 14, 21, 26], fill=(90, 180, 230, 255))
    for x in (11, 14, 17, 20):
        d.rectangle([x, 6, x + 1, 15], fill=(90, 180, 230, 255))
    d.rectangle([7, 16, 10, 20], fill=(90, 180, 230, 255))
    icons["rulers_authority"] = im
    im, d = base((180, 90, 255, 255))
    d.polygon([(6, 12), (14, 6), (14, 10), (24, 10), (24, 14), (14, 14), (14, 18)], fill=(200, 140, 255, 255))
    d.polygon([(26, 20), (18, 26), (18, 22), (8, 22), (8, 18), (18, 18), (18, 14)], fill=EYE)
    icons["shadow_exchange"] = im
    im, d = base((255, 170, 40, 255))
    d.polygon([(4, 20), (10, 8), (16, 14), (22, 6), (28, 20), (22, 16), (16, 24), (10, 16)], fill=(255, 150, 40, 255))
    d.rectangle([12, 12, 13, 13], fill=(255, 255, 120, 255))
    d.rectangle([19, 10, 20, 11], fill=(255, 255, 120, 255))
    icons["dragons_fear"] = im
    im, d = base((230, 120, 255, 255))
    d.polygon([(6, 22), (6, 10), (11, 16), (16, 6), (21, 16), (26, 10), (26, 22)], fill=(210, 110, 255, 255))
    d.rectangle([6, 22, 26, 26], fill=(170, 80, 230, 255))
    d.rectangle([15, 12, 17, 14], fill=EYE)
    icons["monarchs_domain"] = im
    for k, v in icons.items():
        v.save(os.path.join(OUT, f"{k}.png"))
    print(f"{len(icons)} skill icons generated")


if __name__ == "__main__":
    main()
