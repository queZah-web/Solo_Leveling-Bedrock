#!/usr/bin/env python3
"""Beru (shadow of the Warden): a custom model inspired by the Shadow Monarch
look - black body with glowing violet veins, a crown of tentacles, back aura
tendrils, claws and a spinning rune circle. All motion is client-side.

  python3 tools/gen_beru.py
"""
import json
import math
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
TEX = os.path.join(RP, "textures", "sl", "entity", "shadow_beru.png")
TW = TH = 128

BLACK = (12, 8, 18)
DARK = (26, 16, 38)
VEIN = (170, 70, 255)
GLOW = (240, 180, 255)
EYE = (255, 235, 255)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------- geometry
def cube(origin, size, uv, mirror=False, inflate=0, rotation=None, pivot=None):
    c = {"origin": origin, "size": size, "uv": uv}
    if mirror:
        c["mirror"] = True
    if inflate:
        c["inflate"] = inflate
    if rotation:
        c["rotation"], c["pivot"] = rotation, pivot
    return c


UV = {
    "head": (0, 0), "body": (0, 20), "arm": (40, 20), "leg": (60, 20), "pad": (40, 0), "claw": (66, 0),
    "spike": (72, 0), "spike_tip": (82, 0), "tA": (88, 0), "tB": (102, 0), "tC": (112, 0), "core": (0, 46),
}

bones = [
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "rightLeg", "parent": "root", "pivot": [-3, 18, 0], "cubes": [cube([-5.5, 0, -2.5], [5, 18, 5], UV["leg"])]},
    {"name": "leftLeg", "parent": "root", "pivot": [3, 18, 0], "cubes": [cube([0.5, 0, -2.5], [5, 18, 5], UV["leg"], mirror=True)]},
    {"name": "waist", "parent": "root", "pivot": [0, 18, 0]},
    {"name": "body", "parent": "waist", "pivot": [0, 18, 0], "locators": {"aura": [0, 28, 4]}, "cubes": [
        cube([-5, 18, -3], [10, 16, 6], UV["body"]),
        cube([-2, 25, -3.6], [4, 4, 1], UV["core"]),
    ]},
    {"name": "head", "parent": "body", "pivot": [0, 34, 0], "cubes": [cube([-4, 34, -4], [8, 9, 8], UV["head"])]},
]

# Crown of tentacles: 8 thin 3-segment tentacles around the top of the head
CROWN = []
for i, (x, z, outz, back) in enumerate([(-3.5, -2.5, 40, -5), (3.5, -2.5, -40, -5), (-3.5, 1, 55, 20), (3.5, 1, -55, 20),
                                        (-1.5, 3.5, 20, 40), (1.5, 3.5, -20, 40), (-2.5, -0.5, 15, 8), (2.5, -0.5, -15, 8)]):
    name = f"crown{i}"
    CROWN.append(name)
    sx = -1 if x < 0 else 1
    bones.append({"name": name, "parent": "head", "pivot": [x, 42.5, z], "rotation": [-back, 0, outz],
                  "cubes": [cube([x - 0.75, 42.5, z - 0.75], [1.5, 6, 1.5], UV["spike"])]})
    bones.append({"name": f"{name}_b", "parent": name, "pivot": [x, 48.5, z], "rotation": [-15, 0, -sx * 30],
                  "cubes": [cube([x - 0.5, 48.5, z - 0.5], [1, 6, 1], UV["spike_tip"])]})
    bones.append({"name": f"{name}_c", "parent": f"{name}_b", "pivot": [x, 54.5, z], "rotation": [-20, 0, -sx * 45],
                  "cubes": [cube([x - 0.5, 54.5, z - 0.5], [1, 5, 1], UV["spike_tip"])]})

# Arms: shoulder pads with spikes, claws
for side, sx in (("right", -1), ("left", 1)):
    m = side == "left"
    ax = 5 if m else -9
    bones.append({"name": f"{side}Arm", "parent": "body", "pivot": [sx * 6, 32, 0], "cubes": [
        cube([ax, 16, -2], [4, 16, 4], UV["arm"], mirror=m),
        cube([sx * 8 - 3, 30, -3], [6, 4, 6], UV["pad"], mirror=m),
        cube([sx * 8 - 1, 34, -1], [2, 5, 2], UV["spike"], rotation=[0, 0, sx * -25], pivot=[sx * 8, 34, 0]),
        *[cube([ax + k * 1.5, 13, -1.5 + (k % 2)], [1, 3, 1], UV["claw"]) for k in range(3)],
    ]})
    bones.append({"name": f"{side}Item", "parent": f"{side}Arm", "pivot": [sx * 7, 15, 1]})

# Back aura tendrils (3 segments)
BACK = []
for i, (sx, y, outz, up) in enumerate([(-1, 32, 55, 10), (-1, 28, 80, -10), (-1, 24, 105, -30),
                                        (1, 32, 55, 10), (1, 28, 80, -10), (1, 24, 105, -30)]):
    x = sx * 2.5
    name = f"tendril{i}"
    BACK.append(name)
    bones.append({"name": name, "parent": "body", "pivot": [x, y, 3], "rotation": [-25 + up * 0.3, sx * -15, sx * -outz],
                  "cubes": [cube([x - 1.5, y, 1.5], [3, 10, 3], UV["tA"])]})
    bones.append({"name": f"{name}_b", "parent": name, "pivot": [x, y + 10, 3], "rotation": [-10, 0, sx * 35],
                  "cubes": [cube([x - 1, y + 10, 2], [2, 9, 2], UV["tB"])]})
    bones.append({"name": f"{name}_c", "parent": f"{name}_b", "pivot": [x, y + 19, 3], "rotation": [-10, 0, sx * 45],
                  "cubes": [cube([x - 0.5, y + 19, 2.5], [1, 8, 1], UV["tC"])]})

# Rune circle on the ground (flat, per-face UV)
ring_face = {"uv": [0, 64], "uv_size": [64, 64]}
bones.append({"name": "ring", "parent": "root", "pivot": [0, 0, 0],
              "cubes": [{"origin": [-24, 0.15, -24], "size": [48, 0, 48], "uv": {"up": ring_face, "down": ring_face}}]})

GEO = {"format_version": "1.16.0", "minecraft:geometry": [{
    "description": {"identifier": "geometry.sl.beru", "texture_width": TW, "texture_height": TH,
                    "visible_bounds_width": 6, "visible_bounds_height": 5, "visible_bounds_offset": [0, 2, 0]},
    "bones": bones,
}]}

# ---------------------------------------------------------------- animations
SWING = "(math.cos(query.modified_distance_moved * 38.17) * 45.0 * query.modified_move_speed)"
idle = {"ring": {"rotation": [0, "query.life_time * 25.0", 0]}}
for i, n in enumerate(CROWN):
    idle[n] = {"rotation": [f"math.sin(query.life_time * 80.0 + {i * 45}) * 5.0", 0, f"math.cos(query.life_time * 70.0 + {i * 30}) * 5.0"]}
    idle[f"{n}_b"] = {"rotation": [f"math.sin(query.life_time * 100.0 + {i * 60}) * 9.0", 0, f"math.cos(query.life_time * 90.0 + {i * 20}) * 8.0"]}
    idle[f"{n}_c"] = {"rotation": [f"math.sin(query.life_time * 130.0 + {i * 70}) * 14.0", 0, 0]}
for i, n in enumerate(BACK):
    idle[n] = {"rotation": [f"math.sin(query.life_time * 60.0 + {i * 50}) * 8.0", 0, f"math.sin(query.life_time * 50.0 + {i * 35}) * 10.0"]}
    idle[f"{n}_b"] = {"rotation": [0, 0, f"math.sin(query.life_time * 75.0 + {i * 40}) * 14.0"]}
    idle[f"{n}_c"] = {"rotation": [0, 0, f"math.sin(query.life_time * 95.0 + {i * 70}) * 20.0"]}
ANIM = {"format_version": "1.8.0", "animations": {
    "animation.sl.beru.idle": {"loop": True, "bones": idle},
    "animation.sl.beru.walk": {"loop": True, "bones": {
        "rightLeg": {"rotation": [SWING, 0, 0]}, "leftLeg": {"rotation": ["-" + SWING, 0, 0]},
        "rightArm": {"rotation": ["-" + SWING + " * 0.7", 0, 0]}, "leftArm": {"rotation": [SWING + " * 0.7", 0, 0]},
    }},
    "animation.sl.beru.aura": {"loop": True, "animation_length": 0.5,
                               "particle_effects": {"0.0": {"effect": "aura", "locator": "aura"}}},
}}

CLIENT = {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
    "identifier": "sl:shadow_warden",
    "materials": {"default": "entity_alphatest"},
    "textures": {"default": "textures/sl/entity/shadow_beru"},
    "geometry": {"default": "geometry.sl.beru"},
    "particle_effects": {"aura": "minecraft:dragon_breath_trail"},
    "animations": {"idle": "animation.sl.beru.idle", "walk": "animation.sl.beru.walk",
                   "look": "animation.sl.look_at_target", "aura": "animation.sl.beru.aura"},
    "scripts": {"animate": ["idle", "walk", "look", "aura"]},
    "render_controllers": ["controller.render.sl_shadow_custom"],
    "enable_attachables": True,
}}}


# ---------------------------------------------------------------- texture
def faces(ox, oy, w, h, d):
    return {"top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d), "right": (ox, oy + d, d, h),
            "front": (ox + d, oy + d, w, h), "left": (ox + d + w, oy + d, d, h), "back": (ox + 2 * d + w, oy + d, w, h)}


def armor(px, rnd, box, veins=2, seams=True):
    """Black armour plates with thin seams and a few connected glowing veins."""
    for face, (fx, fy, fw, fh) in faces(*box).items():
        for x in range(fw):
            for y in range(fh):
                n = rnd.randint(-3, 3)
                c = BLACK
                if seams and (y % 5 == 4 or (face in ("front", "back") and x == fw // 2 and fw > 4)):
                    c = (34, 20, 50)
                px[fx + x, fy + y] = tuple(max(0, v + n) for v in c) + (255,)
        if face in ("top", "bottom"):
            continue
        for _ in range(veins if face in ("front", "back") else 1):
            x, y = rnd.randrange(fw), 0
            while y < fh:
                if 0 <= x < fw:
                    px[fx + x, fy + y] = (GLOW if rnd.random() < 0.2 else VEIN) + (255,)
                y += 1
                if rnd.random() < 0.45:
                    x = max(0, min(fw - 1, x + rnd.choice((-1, 1))))


def tendril(px, rnd, box, dark=False):
    """Tentacle segment: dark core with violet edges (dark) or glowing violet (aura)."""
    for face, (fx, fy, fw, fh) in faces(*box).items():
        for x in range(fw):
            for y in range(fh):
                t = 1 - y / max(1, fh - 1)  # top = toward the tip
                if dark:
                    edge = x == 0 or x == fw - 1
                    c = VEIN if edge else (20, 10, 30)
                    if t > 0.75:
                        c = GLOW if edge else VEIN
                else:
                    c = tuple(int(DARK[i] + (VEIN[i] - DARK[i]) * (0.45 + 0.55 * t)) for i in range(3))
                    if x == 0 or (fw > 1 and x == fw - 1):
                        c = tuple(int(v * 0.65) for v in c)
                    if t > 0.85:
                        c = GLOW
                px[fx + x, fy + y] = tuple(c) + (255,)


def texture():
    rnd = random.Random("beru")
    img = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    px = img.load()
    armor(px, rnd, (*UV["head"], 8, 9, 8), veins=0, seams=False)
    armor(px, rnd, (*UV["body"], 10, 16, 6), veins=2)
    armor(px, rnd, (*UV["arm"], 4, 16, 4), veins=1)
    armor(px, rnd, (*UV["leg"], 5, 18, 5), veins=1)
    armor(px, rnd, (*UV["pad"], 6, 4, 6), veins=1)
    armor(px, rnd, (*UV["claw"], 1, 3, 1), veins=0, seams=False)
    for face, (cx, cy, cw, ch) in faces(*UV["claw"], 1, 3, 1).items():  # violet claw tips
        px[cx, cy + ch - 1] = VEIN + (255,)
    tendril(px, rnd, (*UV["spike"], 2, 7, 2), dark=True)
    tendril(px, rnd, (*UV["spike_tip"], 1, 6, 1), dark=True)
    tendril(px, rnd, (*UV["tA"], 3, 10, 3))
    tendril(px, rnd, (*UV["tB"], 2, 9, 2))
    tendril(px, rnd, (*UV["tC"], 1, 8, 1))
    # face: slanted glowing eyes + a V-shaped visor line
    fx, fy = UV["head"][0] + 8, UV["head"][1] + 8
    # two separate, angled eyes (inner corners lower) with a violet glow under them
    for (x, y) in ((0, 3), (1, 3), (1, 4), (2, 4), (7, 3), (6, 3), (6, 4), (5, 4)):
        px[fx + x, fy + y] = EYE + (255,)
    for (x, y) in ((0, 4), (2, 5), (7, 4), (5, 5)):
        px[fx + x, fy + y] = VEIN + (255,)
    # mask ridge down the middle of the face
    for y in range(0, 3):
        px[fx + 3, fy + y] = (40, 24, 60, 255)
        px[fx + 4, fy + y] = (40, 24, 60, 255)
    for (x, y) in ((3, 7), (4, 7), (3, 8), (4, 8)):
        px[fx + x, fy + y] = (60, 30, 90, 255)
    # chest: glowing core diamond on the body front + core cube
    bx, by = UV["body"][0] + 6, UV["body"][1] + 6
    # chest sigil: an inverted V of veins around a glowing core
    for k in range(5):
        px[bx + 4 - k, by + 2 + k] = VEIN + (255,)
        px[bx + 5 + k, by + 2 + k] = VEIN + (255,)
    for (x, y) in ((4, 3), (5, 3), (3, 4), (4, 4), (5, 4), (6, 4), (4, 5), (5, 5), (4, 2), (5, 2), (4, 6), (5, 6)):
        px[bx + x, by + y] = GLOW + (255,)
    # knee gems on both legs (leg front face)
    lx, ly = UV["leg"][0] + 5, UV["leg"][1] + 5
    for (x, y) in ((2, 6), (1, 7), (2, 7), (3, 7), (2, 8), (2, 12), (1, 13), (3, 13), (2, 14)):
        px[lx + x, ly + y] = (GLOW if (x, y) in ((2, 7), (2, 13)) else VEIN) + (255,)
    for face, (cx, cy, cw, ch) in faces(*UV["core"], 4, 4, 1).items():
        for x in range(cw):
            for y in range(ch):
                px[cx + x, cy + y] = (GLOW if (x + y) % 2 == 0 else VEIN) + (255,)
    # rune circle (64x64 at 0,64)
    rx, ry = 0, 64
    for y in range(64):
        for x in range(64):
            r = math.hypot(x - 31.5, y - 31.5)
            a = math.degrees(math.atan2(y - 31.5, x - 31.5))
            if 27 <= r <= 31 or (r <= 31 and 25.2 <= r <= 26 and int(a) % 6 < 3):
                px[rx + x, ry + y] = (VEIN if r < 30 else GLOW) + (255,)
            elif 20 <= r <= 21 and int(a / 30) % 2 == 0:
                px[rx + x, ry + y] = VEIN + (255,)
            elif r < 25 and (int(a) % 45 == 0) and r > 12:
                px[rx + x, ry + y] = (120, 50, 200, 255)
    os.makedirs(os.path.dirname(TEX), exist_ok=True)
    img.save(TEX)
    # portrait for the army UI (face crop)
    face = img.crop((fx, fy - 2, fx + 8, fy + 9)).resize((22, 30), Image.NEAREST)
    port = Image.new("RGBA", (32, 32), (6, 4, 16, 255))
    port.alpha_composite(face, (5, 1))
    port.save(os.path.join(RP, "textures", "sl", "shadows", "warden.png"))


def main():
    texture()
    write(os.path.join(RP, "models", "entity", "sl_beru.geo.json"), GEO)
    write(os.path.join(RP, "animations", "sl_beru.animation.json"), ANIM)
    write(os.path.join(RP, "entity", "shadows", "warden.entity.json"), CLIENT)
    print(f"beru generated ({len(bones)} bones)")


if __name__ == "__main__":
    main()
