#!/usr/bin/env python3
"""Shadow portraits: crops each vanilla mob's face and turns it into a
"shadow" (purple-black body, glowing cyan highlights).

  python3 tools/gen_shadow_art.py <dir with vanilla entity textures>

Output: packs/SoloLeveling_RP/textures/sl/shadows/<type>.png
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packs", "SoloLeveling_RP", "textures", "sl", "shadows")

# type -> (texture file, (x, y, w, h) of the face on the texture, texture uv size)
FACES = {
    "zombie": ("zombie", (8, 8, 8, 8), 64),
    "husk": ("husk", (8, 8, 8, 8), 64),
    "drowned": ("drowned", (8, 8, 8, 8), 64),
    "skeleton": ("skeleton", (8, 8, 8, 8), 64),
    "stray": ("stray", (8, 8, 8, 8), 64),
    "wither_skeleton": ("wither_skeleton", (8, 8, 8, 8), 64),
    "spider": ("spider", (40, 12, 8, 8), 64),
    "enderman": ("enderman", (8, 8, 8, 8), 64),
    "vindicator": ("vindicator", (8, 8, 8, 10), 64),
    "iron_golem": ("iron_golem", (8, 8, 8, 10), 128),
    "wolf": ("wolf", (4, 4, 6, 6), 64),
    "ravager": ("ravager", (16, 16, 16, 20), 128),
    "warden": ("warden", (10, 42, 16, 16), 128),
}


# Glowing eye pixels (in face-crop coordinates, before upscaling).
HUMAN_EYES = [(1, 4), (2, 4), (5, 4), (6, 4)]
EYES = {
    "zombie": HUMAN_EYES, "husk": HUMAN_EYES, "drowned": HUMAN_EYES,
    "skeleton": [(1, 4), (2, 4), (5, 4), (6, 4)], "stray": [(1, 4), (2, 4), (5, 4), (6, 4)],
    "wither_skeleton": [(1, 4), (2, 4), (5, 4), (6, 4)],
    "vindicator": [(1, 5), (2, 5), (5, 5), (6, 5)],
    "wolf": [(1, 2), (4, 2)],
    "iron_golem": [(1, 4), (2, 4), (5, 4), (6, 4)],
    "ravager": [(3, 8), (4, 8), (11, 8), (12, 8)],
    "warden": [(3, 6), (4, 6), (5, 6), (10, 6), (11, 6), (12, 6)],
}
EYE = (110, 230, 255, 255)


def shadowize(img, kind, scale):
    img = img.convert("RGBA")
    px = img.load()
    for x in range(img.width):
        for y in range(img.height):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (6, 4, 16, 255)
                continue
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            sat = max(r, g, b) - min(r, g, b)
            if kind not in EYES and sat > 110 and lum > 50:
                px[x, y] = EYE  # coloured eyes (spider, enderman, golem...)
            else:
                t = (lum / 255) ** 1.3
                px[x, y] = (int(8 + 46 * t), int(5 + 22 * t), int(20 + 80 * t), 255)
    for (ex, ey) in EYES.get(kind, []):
        for dx in range(int(scale)):
            for dy in range(int(scale)):
                X, Y = int(ex * scale) + dx, int(ey * scale) + dy
                if X < img.width and Y < img.height:
                    px[X, Y] = EYE
    return img


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for kind, (name, (x, y, w, h), uv) in FACES.items():
        path = next((os.path.join(src, name + e) for e in (".png", ".tga") if os.path.exists(os.path.join(src, name + e))), None)
        tex = Image.open(path).convert("RGBA")
        s = tex.width / uv  # texture may be higher-res than its uv size
        face = tex.crop((int(x * s), int(y * s), int((x + w) * s), int((y + h) * s)))
        face = shadowize(face, kind, s)
        side = max(face.width, face.height)
        sq = Image.new("RGBA", (side, side), (6, 4, 16, 255))
        sq.paste(face, ((side - face.width) // 2, (side - face.height) // 2))
        sq.resize((32, 32), Image.NEAREST).save(os.path.join(OUT, kind + ".png"))
    print(f"{len(FACES)} portraits generated")


if __name__ == "__main__":
    main(sys.argv[1])
