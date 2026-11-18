#!/usr/bin/env python3
"""Igris the Bloodred: crimson knight with glowing trims, crystal spikes on
the shoulders and back, crested helmet, long cape and a burning greatsword.
Used by the shadow Wither Skeleton (Igris) and the A-rank gate boss.

  python3 tools/gen_igris.py
"""
import json
import math
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
TEX = os.path.join(RP, "textures", "sl", "entity", "igris.png")
TW = TH = 128

RED = (128, 14, 26)
RED_D = (72, 6, 14)
TRIM = (235, 64, 76)
GLOW = (255, 190, 200)
WHITE = (255, 238, 240)
CAPE = (44, 6, 12)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


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
    "head": (0, 0), "crest": (32, 0), "body": (0, 20), "skirt": (0, 44), "arm": (40, 20), "pad": (56, 0),
    "leg": (60, 20), "spike": (84, 0), "spike_big": (88, 0), "cape": (80, 20), "blade": (104, 20),
    "guard": (104, 0), "hilt": (112, 8), "knee": (0, 60),
}

bones = [
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "rightLeg", "parent": "root", "pivot": [-3, 18, 0], "cubes": [
        cube([-5.5, 0, -2.5], [5, 18, 5], UV["leg"]), cube([-6, 8, -3.2], [6, 4, 2], UV["knee"])]},
    {"name": "leftLeg", "parent": "root", "pivot": [3, 18, 0], "cubes": [
        cube([0.5, 0, -2.5], [5, 18, 5], UV["leg"], mirror=True), cube([0, 8, -3.2], [6, 4, 2], UV["knee"], mirror=True)]},
    {"name": "waist", "parent": "root", "pivot": [0, 18, 0]},
    {"name": "body", "parent": "waist", "pivot": [0, 18, 0], "locators": {"aura": [0, 30, 0]}, "cubes": [
        cube([-5, 18, -3], [10, 16, 6], UV["body"]),
        cube([-5.5, 13, -3.5], [11, 6, 7], UV["skirt"]),
    ]},
    {"name": "head", "parent": "body", "pivot": [0, 34, 0], "cubes": [
        cube([-4, 34, -4], [8, 9, 8], UV["head"]),
        cube([-0.5, 42, -3.5], [1, 7, 8], UV["crest"], rotation=[-15, 0, 0], pivot=[0, 42, 0]),
        cube([-4.3, 33.7, -4.3], [8.6, 3, 8.6], UV["skirt"]),  # helmet rim
    ]},
    {"name": "cape", "parent": "body", "pivot": [0, 33, 3], "rotation": [8, 0, 0],
     "cubes": [cube([-5, 11, 3], [10, 22, 1], UV["cape"])]},
]

# Crystal spikes: collar, shoulders and back
SPIKES = []
def spike(parent, name, pivot, rot, big=False):
    SPIKES.append(name)
    size = [2, 9, 2] if big else [1, 7, 1]
    o = [pivot[0] - size[0] / 2, pivot[1], pivot[2] - size[2] / 2]
    bones.append({"name": name, "parent": parent, "pivot": pivot, "rotation": rot,
                  "cubes": [cube(o, size, UV["spike_big" if big else "spike"])]})

for i, a in enumerate((-60, -30, 0, 30, 60)):  # collar fan on the chest
    spike("body", f"collar{i}", [a / 20, 33, -3], [-70 + abs(a) * 0.3, 0, -a], big=False)
for i, (x, rz, rx) in enumerate(((-3, 35, -35), (3, -35, -35), (-1.5, 15, -55), (1.5, -15, -55))):  # back crystals
    spike("body", f"back{i}", [x, 30, 3], [rx, 0, rz], big=True)

for side, sx in (("right", -1), ("left", 1)):
    m = side == "left"
    ax = 5 if m else -9
    arm = {"name": f"{side}Arm", "parent": "body", "pivot": [sx * 6, 32, 0], "cubes": [
        cube([ax, 17, -2], [4, 15, 4], UV["arm"], mirror=m),
        cube([sx * 8 - 3.5, 29, -3.5], [7, 5, 7], UV["pad"], mirror=m),
    ]}
    bones.append(arm)
    for k, (rz, rx, big) in enumerate(((60, 0, True), (35, -25, False), (35, 25, False), (85, 10, False), (15, 0, True))):
        spike(f"{side}Arm", f"{side}_pad{k}", [sx * 9, 33, 0], [rx, 0, -sx * rz], big=big)
    bones.append({"name": f"{side}Item", "parent": f"{side}Arm", "pivot": [sx * 7, 15, 1]})

# Burning greatsword in the right hand, tip toward the ground in front
bones.append({"name": "sword", "parent": "rightArm", "pivot": [-7, 16, 0], "rotation": [-35, 0, 0],
              "locators": {"sword_tip": [-7, -8, 0]}, "cubes": [
    cube([-7.5, 16, -0.5], [1, 5, 1], UV["hilt"]),
    cube([-10, 14.5, -1], [6, 1.5, 2], UV["guard"]),
    cube([-8.5, -14, -0.5], [3, 28.5, 1], UV["blade"]),
    cube([-8, -16, -0.5], [2, 2, 1], UV["blade"]),  # tip
]})

GEO = {"format_version": "1.16.0", "minecraft:geometry": [{
    "description": {"identifier": "geometry.sl.igris", "texture_width": TW, "texture_height": TH,
                    "visible_bounds_width": 5, "visible_bounds_height": 5, "visible_bounds_offset": [0, 2, 0]},
    "bones": bones,
}]}

SWING = "(math.cos(query.modified_distance_moved * 38.17) * 40.0 * query.modified_move_speed)"
idle = {"cape": {"rotation": ["math.sin(query.life_time * 90.0) * 4.0 + query.modified_move_speed * 25.0", 0, 0]}}
for i, n in enumerate(SPIKES):
    idle[n] = {"scale": f"1.0 + math.sin(query.life_time * 120.0 + {i * 37}) * 0.06"}
ANIM = {"format_version": "1.8.0", "animations": {
    "animation.sl.igris.idle": {"loop": True, "bones": idle},
    "animation.sl.igris.walk": {"loop": True, "bones": {
        "rightLeg": {"rotation": [SWING, 0, 0]}, "leftLeg": {"rotation": ["-" + SWING, 0, 0]},
        "leftArm": {"rotation": [SWING + " * 0.8", 0, 0]}, "rightArm": {"rotation": ["-" + SWING + " * 0.3", 0, 0]},
    }},
    "animation.sl.igris.attack": {"loop": True, "bones": {
        "rightArm": {"rotation": ["-110.0 * math.sin(variable.attack_time * 180.0)", 0, 0]}}},
    "animation.sl.igris.aura": {"loop": True, "animation_length": 0.4,
                                "particle_effects": {"0.0": [{"effect": "flame", "locator": "sword_tip"}, {"effect": "aura", "locator": "aura"}]}},
}}


def client(identifier, rc):
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": identifier,
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": "textures/sl/entity/igris"},
        "geometry": {"default": "geometry.sl.igris"},
        "particle_effects": {"flame": "minecraft:basic_flame_particle", "aura": "minecraft:redstone_ore_dust_particle"},
        "animations": {"idle": "animation.sl.igris.idle", "walk": "animation.sl.igris.walk", "look": "animation.sl.look_at_target",
                       "attack": "animation.sl.igris.attack", "aura": "animation.sl.igris.aura"},
        "scripts": {"animate": ["idle", "walk", "look", {"attack": "variable.attack_time > 0.0"}, "aura"]},
        "render_controllers": [rc],
        "enable_attachables": True,
    }}}


# ---------------------------------------------------------------- texture
def faces(ox, oy, w, h, d):
    return {"top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d), "right": (ox, oy + d, d, h),
            "front": (ox + d, oy + d, w, h), "left": (ox + d + w, oy + d, d, h), "back": (ox + 2 * d + w, oy + d, w, h)}


def armor(px, rnd, box, trims=True, base=RED):
    for face, (fx, fy, fw, fh) in faces(*box).items():
        for x in range(fw):
            for y in range(fh):
                c = base
                if y % 6 == 5:
                    c = RED_D  # plate seam
                if trims and y == 0 and face != "bottom":
                    c = TRIM  # bright edge at the top of each part
                if face == "top" and trims:
                    c = TRIM if (x in (0, fw - 1) or y in (0, fh - 1)) else base
                n = rnd.randint(-4, 4)
                px[fx + x, fy + y] = tuple(max(0, min(255, v + n)) for v in c) + (255,)
        if trims and face in ("front", "back") and fw >= 4 and fh >= 8:
            for y in (2, fh - 3):  # a few glowing rivets
                px[fx + 1, fy + y] = GLOW + (255,)
                px[fx + fw - 2, fy + y] = GLOW + (255,)


def gradient(px, box, a, b):
    for face, (fx, fy, fw, fh) in faces(*box).items():
        for x in range(fw):
            for y in range(fh):
                t = y / max(1, fh - 1)
                px[fx + x, fy + y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def texture():
    rnd = random.Random("igris")
    img = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    px = img.load()
    armor(px, rnd, (*UV["head"], 8, 9, 8))
    armor(px, rnd, (*UV["crest"], 2, 6, 8), trims=False, base=(170, 24, 36))
    armor(px, rnd, (*UV["body"], 10, 16, 6))
    armor(px, rnd, (*UV["skirt"], 11, 6, 7))
    armor(px, rnd, (*UV["arm"], 4, 15, 4))
    armor(px, rnd, (*UV["pad"], 7, 5, 7))
    armor(px, rnd, (*UV["leg"], 5, 18, 5))
    armor(px, rnd, (*UV["knee"], 6, 4, 2))
    gradient(px, (*UV["spike"], 1, 7, 1), WHITE, (255, 90, 110))
    gradient(px, (*UV["spike_big"], 2, 9, 2), WHITE, (240, 70, 90))
    gradient(px, (*UV["cape"], 10, 22, 1), CAPE, (20, 2, 6))
    for face, (fx, fy, fw, fh) in faces(*UV["cape"], 10, 22, 1).items():  # red cape border
        for y in range(fh):
            px[fx, fy + y] = TRIM + (255,)
            px[fx + fw - 1, fy + y] = TRIM + (255,)
    # sword: white-hot core, orange-red edges
    for face, (fx, fy, fw, fh) in faces(*UV["blade"], 3, 29, 1).items():
        for x in range(fw):
            for y in range(fh):
                core = face in ("front", "back") and x == 1
                c = (255, 240, 190) if core else (255, 120, 50)
                if y > fh - 3:
                    c = (255, 255, 230)
                px[fx + x, fy + y] = c + (255,)
    gradient(px, (*UV["guard"], 6, 2, 2), (255, 190, 90), (200, 80, 30))
    gradient(px, (*UV["hilt"], 1, 5, 1), (60, 10, 16), (30, 4, 8))
    # helmet face: dark visor slit, glowing eyes, white crest line
    fx, fy = UV["head"][0] + 8, UV["head"][1] + 8
    for x in range(8):
        px[fx + x, fy + 4] = (36, 0, 6, 255)
        px[fx + x, fy + 5] = (54, 2, 10, 255)
    for (x, y) in ((1, 4), (2, 4), (5, 4), (6, 4)):
        px[fx + x, fy + y] = WHITE + (255,)
    for y in range(0, 4):
        px[fx + 3, fy + y] = GLOW + (255,)
        px[fx + 4, fy + y] = WHITE + (255,)
    for (x, y) in ((1, 7), (2, 8), (5, 8), (6, 7), (3, 6), (4, 6)):
        px[fx + x, fy + y] = TRIM + (255,)
    # chest: white V emblem
    bx, by = UV["body"][0] + 6, UV["body"][1] + 6
    for k in range(5):
        px[bx + k, by + 1 + k] = WHITE + (255,)
        px[bx + 9 - k, by + 1 + k] = WHITE + (255,)
    for (x, y) in ((4, 7), (5, 7), (4, 8), (5, 8), (4, 9), (5, 9)):
        px[bx + x, by + y] = GLOW + (255,)
    os.makedirs(os.path.dirname(TEX), exist_ok=True)
    img.save(TEX)
    face = img.crop((fx, fy, fx + 8, fy + 9)).resize((24, 27), Image.NEAREST)
    port = Image.new("RGBA", (32, 32), (16, 2, 6, 255))
    port.alpha_composite(face, (4, 3))
    port.save(os.path.join(RP, "textures", "sl", "shadows", "wither_skeleton.png"))


def main():
    texture()
    write(os.path.join(RP, "models", "entity", "sl_igris.geo.json"), GEO)
    write(os.path.join(RP, "animations", "sl_igris.animation.json"), ANIM)
    write(os.path.join(RP, "entity", "shadows", "wither_skeleton.entity.json"), client("sl:shadow_wither_skeleton", "controller.render.sl_shadow_custom"))
    write(os.path.join(RP, "entity", "boss_igris.entity.json"), client("sl:boss_igris", "controller.render.sl_shadow_custom"))
    print(f"igris generated ({len(bones)} bones)")


if __name__ == "__main__":
    main()
