#!/usr/bin/env python3
"""Data-driven model kit: one consistent Solo Leveling style for every shadow
and dungeon monster.

Archetypes (knight, beast, arachnid, golem, wraith) are built from
parameters; UVs are packed automatically; textures are painted per part style
(armour plates, skin, glowing veins, cape, blade...) from a palette. Each
model gets client animations (walk / idle / attack / sway).

  python3 tools/gen_models.py
Outputs: RP models/entity/m_*.geo.json, textures/sl/models/*.png,
animations/sl_models.animation.json, client entities, and BP dungeon mobs.
"""
import json
import math
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
TEXDIR = os.path.join(RP, "textures", "sl", "models")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ================================================================ palettes
SHADOW = dict(base=(14, 12, 26), dark=(6, 5, 12), trim=(44, 40, 86), vein=(90, 120, 255), glow=(190, 215, 255),
              eye=(150, 240, 255), skin=(22, 18, 38), cloth=(18, 14, 34), metal=(30, 30, 52), blade=(120, 150, 255))
PAL = {
    "shadow": SHADOW,
    "tank_shadow": {**SHADOW, "vein": (110, 170, 255), "glow": (220, 240, 255)},
    "soldier": dict(base=(96, 92, 88), dark=(50, 46, 44), trim=(150, 140, 120), vein=(120, 200, 90), glow=(200, 255, 170),
                    eye=(160, 255, 120), skin=(90, 110, 80), cloth=(70, 50, 40), metal=(120, 120, 130), blade=(200, 205, 215)),
    "archer": dict(base=(200, 196, 180), dark=(120, 114, 100), trim=(70, 60, 50), vein=(150, 150, 140), glow=(255, 240, 200),
                   eye=(255, 120, 60), skin=(220, 214, 196), cloth=(60, 50, 40), metal=(110, 100, 90), blade=(200, 200, 210)),
    "spider": dict(base=(40, 30, 34), dark=(20, 14, 16), trim=(90, 30, 40), vein=(200, 40, 60), glow=(255, 120, 130),
                   eye=(255, 40, 60), skin=(50, 36, 40), cloth=(30, 20, 24), metal=(70, 60, 64), blade=(230, 220, 200)),
    "hound": dict(base=(44, 20, 18), dark=(20, 8, 8), trim=(120, 40, 20), vein=(255, 110, 30), glow=(255, 210, 90),
                  eye=(255, 230, 80), skin=(60, 24, 20), cloth=(30, 10, 8), metal=(80, 40, 30), blade=(255, 160, 60)),
    "ice_bear": dict(base=(225, 236, 245), dark=(150, 175, 200), trim=(110, 170, 230), vein=(120, 200, 255), glow=(230, 250, 255),
                     eye=(60, 180, 255), skin=(210, 225, 240), cloth=(90, 140, 200), metal=(170, 210, 240), blade=(200, 240, 255)),
    "knight": dict(base=(120, 16, 26), dark=(60, 6, 12), trim=(230, 70, 80), vein=(255, 120, 130), glow=(255, 200, 205),
                   eye=(255, 240, 240), skin=(80, 20, 24), cloth=(40, 6, 10), metal=(140, 30, 40), blade=(255, 140, 80)),
    "mage": dict(base=(40, 20, 60), dark=(20, 8, 30), trim=(200, 160, 60), vein=(170, 90, 255), glow=(240, 200, 255),
                 eye=(255, 200, 80), skin=(60, 50, 70), cloth=(55, 25, 80), metal=(200, 160, 60), blade=(190, 120, 255)),
    "ant": dict(base=(36, 24, 16), dark=(16, 10, 6), trim=(120, 70, 30), vein=(255, 150, 40), glow=(255, 220, 120),
                eye=(255, 60, 40), skin=(50, 32, 20), cloth=(30, 18, 10), metal=(90, 60, 30), blade=(220, 200, 160)),
    "iron": {**SHADOW, "vein": (140, 160, 255), "metal": (34, 34, 60)},
}


# ================================================================ model builder
class Model:
    def __init__(self, name, pal):
        self.name, self.pal = name, PAL[pal]
        self.bones, self.parts = [], []  # parts: (box, style, extra)
        self.anim_bones = {}  # bone -> role

    def bone(self, name, parent=None, pivot=(0, 0, 0), rotation=None, role=None, locators=None):
        b = {"name": name, "pivot": list(pivot)}
        if parent:
            b["parent"] = parent
        if rotation:
            b["rotation"] = list(rotation)
        if locators:
            b["locators"] = locators
        b["cubes"] = []
        self.bones.append(b)
        if role:
            self.anim_bones[name] = role
        return b

    def cube(self, bone, origin, size, style, mirror=False, rotation=None, pivot=None, inflate=0, face=None):
        c = {"origin": [round(v, 3) for v in origin], "size": [round(v, 3) for v in size]}
        if mirror:
            c["mirror"] = True
        if inflate:
            c["inflate"] = inflate
        if rotation:
            c["rotation"], c["pivot"] = list(rotation), list(pivot)
        bone["cubes"].append(c)
        self.parts.append((c, style, face))
        return c

    # ------------------------------------------------------------ uv packing + painting
    def finish(self):
        # Shelf packing of box-UV footprints into a 128 or 256 texture.
        items = []
        for c, style, face in self.parts:
            w, h, d = (max(1, math.ceil(v)) for v in c["size"])
            items.append((2 * (w + d), d + h, c, style, face, (w, h, d)))
        for size in (128, 256):
            x = y = row = 0
            ok = True
            place = []
            for fw, fh, c, style, face, whd in sorted(items, key=lambda t: -t[1]):
                if x + fw > size:
                    x, y, row = 0, y + row, 0
                if y + fh > size:
                    ok = False
                    break
                place.append((x, y, c, style, face, whd))
                x += fw
                row = max(row, fh)
            if ok:
                break
        self.size = size
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        px = img.load()
        rnd = random.Random(self.name)
        for x, y, c, style, face, whd in place:
            c["uv"] = [x, y]
            paint(px, rnd, (x, y, *whd), style, self.pal, face)
        self.img = img

    def geometry(self):
        return {"format_version": "1.12.0", "minecraft:geometry": [{
            "description": {"identifier": f"geometry.sl.m_{self.name}", "texture_width": self.size, "texture_height": self.size,
                            "visible_bounds_width": 6, "visible_bounds_height": 6, "visible_bounds_offset": [0, 2.5, 0]},
            "bones": self.bones,
        }]}


def faces(ox, oy, w, h, d):
    return {"top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d), "right": (ox, oy + d, d, h),
            "front": (ox + d, oy + d, w, h), "left": (ox + d + w, oy + d, d, h), "back": (ox + 2 * d + w, oy + d, w, h)}


def put(px, x, y, c):
    px[x, y] = tuple(max(0, min(255, int(v))) for v in c[:3]) + (255,)


def paint(px, rnd, box, style, P, face_kind):
    ox, oy, w, h, d = box
    for face, (fx, fy, fw, fh) in faces(ox, oy, w, h, d).items():
        shade = {"top": 1.15, "bottom": 0.7, "front": 1.0, "back": 0.85, "left": 0.92, "right": 0.92}[face]
        for x in range(fw):
            for y in range(fh):
                n = rnd.randint(-4, 4)
                if style == "armor":
                    c = P["base"]
                    if y % 6 == 5:
                        c = P["dark"]
                    if y == 0 and face != "bottom":
                        c = P["trim"]
                elif style == "metal":
                    c = P["metal"] if y % 5 else P["dark"]
                    if y == 0:
                        c = P["trim"]
                elif style == "skin":
                    c = P["skin"]
                elif style == "cloth":
                    c = P["cloth"] if (x + y) % 7 else P["dark"]
                    if y == fh - 1:
                        c = P["trim"]
                elif style == "fur":
                    c = P["base"] if (x * 3 + y * 5) % 9 else P["dark"]
                    if face == "top":
                        c = tuple(v * 1.08 for v in P["base"])
                elif style == "glow":
                    t = y / max(1, fh - 1)
                    c = tuple(P["glow"][i] * (1 - t) + P["vein"][i] * t for i in range(3))
                    shade = 1.0
                elif style == "spike":
                    t = y / max(1, fh - 1)
                    c = tuple(P["glow"][i] * (1 - t) + P["trim"][i] * t for i in range(3))
                    shade = 1.0
                elif style == "blade":
                    c = P["glow"] if (face in ("front", "back") and x == fw // 2) else P["blade"]
                    shade = 1.0
                elif style == "dark":
                    c = P["dark"]
                else:
                    c = P["base"]
                put(px, fx + x, fy + y, tuple(v * shade + n for v in c))
        # glowing veins on armour / skin / fur
        if style in ("armor", "skin", "fur", "metal") and face in ("front", "back", "left", "right") and fh >= 6:
            for _ in range(1 if fw < 6 else 2):
                vx = rnd.randrange(fw)
                for vy in range(fh):
                    if rnd.random() < 0.8:
                        put(px, fx + vx, fy + vy, P["vein"] if rnd.random() < 0.8 else P["glow"])
                    if rnd.random() < 0.4:
                        vx = max(0, min(fw - 1, vx + rnd.choice((-1, 1))))
    # faces with eyes
    if face_kind:
        fx, fy, fw, fh = faces(ox, oy, w, h, d)["front"]
        E, V = P["eye"], P["vein"]
        cx = fw // 2
        ey = max(1, int(fh * 0.4))
        if face_kind == "visor":
            for x in range(fw):
                put(px, fx + x, fy + ey, P["dark"])
            for dx in (-2, 1):
                put(px, fx + cx + dx, fy + ey, E)
                put(px, fx + cx + dx + 1, fy + ey, E)
        elif face_kind == "slant":
            for (x, y) in ((cx - 3, ey - 1), (cx - 2, ey), (cx - 1, ey), (cx + 2, ey - 1), (cx + 1, ey), (cx, ey)):
                if 0 <= x < fw and 0 <= y < fh:
                    put(px, fx + x, fy + y, E)
        elif face_kind == "beast":
            for (x, y) in ((cx - 2, ey), (cx + 1, ey)):
                put(px, fx + x, fy + y, E)
                put(px, fx + x, fy + y + 1, V)
            for x in range(cx - 2, cx + 2):
                put(px, fx + x, fy + fh - 2, P["glow"])  # teeth
        elif face_kind == "multi":
            for (x, y) in ((cx - 2, ey), (cx + 1, ey), (cx - 1, ey - 1), (cx, ey - 1), (cx - 3, ey + 1), (cx + 2, ey + 1)):
                if 0 <= x < fw:
                    put(px, fx + x, fy + y, E)
        elif face_kind == "hood":
            for x in range(1, fw - 1):
                for y in range(1, fh - 1):
                    put(px, fx + x, fy + y, (4, 3, 8))
            put(px, fx + cx - 2, fy + ey, E)
            put(px, fx + cx + 1, fy + ey, E)


# ================================================================ archetypes
def knight(name, pal, scale=1.0, helm="visor", crest=False, horns=False, ears=None, tusks=False, hood=False,
           pads=2, cape=False, weapon=None, skirt=True, body_style="armor", mandibles=False):
    """Humanoid soldier. weapon: sword | axe | bow | staff | spear | None."""
    m = Model(name, pal)
    s = scale
    root = m.bone("root")
    m.cube(m.bone("rightLeg", "root", (-2.5 * s, 14 * s, 0), role="legR"), (-4.5 * s, 0, -2 * s), (4 * s, 14 * s, 4 * s), "armor")
    m.cube(m.bone("leftLeg", "root", (2.5 * s, 14 * s, 0), role="legL"), (0.5 * s, 0, -2 * s), (4 * s, 14 * s, 4 * s), "armor", mirror=True)
    m.bone("waist", "root", (0, 14 * s, 0))
    body = m.bone("body", "waist", (0, 14 * s, 0), locators={"aura": [0, 22 * s, 0]})
    m.cube(body, (-4.5 * s, 14 * s, -2.5 * s), (9 * s, 13 * s, 5 * s), body_style)
    if skirt:
        m.cube(body, (-5 * s, 10 * s, -3 * s), (10 * s, 5 * s, 6 * s), "cloth" if hood else "armor")
    head = m.bone("head", "body", (0, 27 * s, 0), role="head")
    m.cube(head, (-4 * s, 27 * s, -4 * s), (8 * s, 8 * s, 8 * s), "armor" if not hood else "cloth",
           face="hood" if hood else helm)
    if crest:
        m.cube(head, (-0.5 * s, 34 * s, -3.5 * s), (1 * s, 6 * s, 7 * s), "spike", rotation=(-15, 0, 0), pivot=(0, 34 * s, 0))
    if horns:
        for sx in (-1, 1):
            m.cube(head, (sx * 4 * s - 0.75 * s, 33 * s, -1 * s), (1.5 * s, 7 * s, 1.5 * s), "spike",
                   rotation=(-20, 0, -sx * 35), pivot=(sx * 4 * s, 33 * s, 0))
    if ears:
        for sx in (-1, 1):
            m.cube(head, (sx * 4 * s + (0 if sx > 0 else -ears * s), 31 * s, -0.5 * s), (ears * s, 1.5 * s, 1 * s), "skin",
                   rotation=(0, 0, -sx * 20), pivot=(sx * 4 * s, 31 * s, 0))
    if tusks:
        for sx in (-1, 1):
            m.cube(head, (sx * 2 * s - 0.5 * s, 28 * s, -4.6 * s), (1 * s, 2.5 * s, 1 * s), "spike")
    if mandibles:
        for sx in (-1, 1):
            m.cube(head, (sx * 2.5 * s - 0.5 * s, 25.5 * s, -6 * s), (1 * s, 1 * s, 4 * s), "spike",
                   rotation=(0, sx * 25, 0), pivot=(sx * 2.5 * s, 26 * s, -4 * s))
            m.cube(head, (sx * 2 * s - 0.5 * s, 35 * s, -2 * s), (1 * s, 6 * s, 1 * s), "glow",
                   rotation=(-30, 0, -sx * 25), pivot=(sx * 2 * s, 35 * s, -1.5 * s))  # antennae
    for side, sx in (("right", -1), ("left", 1)):
        arm = m.bone(f"{side}Arm", "body", (sx * 5.5 * s, 25 * s, 0), role="armR" if sx < 0 else "armL")
        m.cube(arm, ((-8.5 if sx < 0 else 4.5) * s, 13 * s, -2 * s), (4 * s, 13 * s, 4 * s), "armor", mirror=sx > 0)
        if pads:
            m.cube(arm, ((sx * 7 - 3) * s, 23.5 * s, -3 * s), (6 * s, 4 * s, 6 * s), "metal", mirror=sx > 0)
            for k in range(pads):
                ang = 30 + k * 30
                m.cube(arm, (sx * 7.5 * s - 0.5 * s, 27 * s, -0.5 * s + (k - pads / 2) * s), (1 * s, 5 * s, 1 * s), "spike",
                       rotation=(0, 0, -sx * ang), pivot=(sx * 7.5 * s, 27 * s, 0))
        m.bone(f"{side}Item", f"{side}Arm", (sx * 6.5 * s, 13 * s, 1 * s))
    if cape:
        c = m.bone("cape", "body", (0, 26.5 * s, 2.5 * s), rotation=(6, 0, 0), role="cape")
        m.cube(c, (-4.5 * s, 6 * s, 2.5 * s), (9 * s, 20.5 * s, 1 * s), "cloth")
    if weapon:
        wb = m.bone("weapon", "rightArm", (-6.5 * s, 13 * s, 0), rotation=(-30, 0, 0), locators={"tip": [-6.5 * s, -6 * s, 0]})
        if weapon in ("sword", "spear"):
            L = 22 if weapon == "sword" else 26
            m.cube(wb, (-7 * s, 13 * s, -0.5 * s), (1 * s, 4 * s, 1 * s), "dark")
            if weapon == "sword":
                m.cube(wb, (-9 * s, 12 * s, -1 * s), (5 * s, 1 * s, 2 * s), "metal")
            m.cube(wb, (-7.5 * s, (12 - L) * s, -0.5 * s), (2 * s, L * s, 1 * s), "blade")
        elif weapon == "axe":
            m.cube(wb, (-7 * s, -2 * s, -0.5 * s), (1 * s, 19 * s, 1 * s), "dark")
            m.cube(wb, (-7.5 * s, -4 * s, -4.5 * s), (2 * s, 7 * s, 5 * s), "blade")
        elif weapon == "staff":
            m.cube(wb, (-7 * s, -6 * s, -0.5 * s), (1 * s, 26 * s, 1 * s), "dark")
            m.cube(wb, (-8 * s, -9 * s, -1.5 * s), (3 * s, 3 * s, 3 * s), "glow")
        elif weapon == "bow":
            m.cube(wb, (-7 * s, 2 * s, -4 * s), (1 * s, 1 * s, 8 * s), "dark")
    return m


def beast(name, pal, length=22, height=12, width=12, leg=10, head=(10, 9, 10), snout=4, horns=False, ears=True,
          mane=0, tail=True, back_spikes=0, claws=True):
    m = Model(name, pal)
    m.bone("root")
    by = leg + height / 2
    body = m.bone("body", "root", (0, by, 0), locators={"aura": [0, leg + height, 0]})
    m.cube(body, (-width / 2, leg, -length / 2), (width, height, length), "fur")
    for i in range(back_spikes):
        z = -length / 2 + 3 + i * (length - 6) / max(1, back_spikes - 1)
        m.cube(body, (-1, leg + height, z - 1), (2, 6 - abs(i - back_spikes / 2) * 0.6, 2), "spike",
               rotation=(-25, 0, 0), pivot=(0, leg + height, z))
    for i in range(mane):
        a = -60 + i * 120 / max(1, mane - 1)
        m.cube(body, (-0.75, leg + height - 1, -length / 2 + 2), (1.5, 6, 1.5), "spike", rotation=(-50, 0, a),
               pivot=(0, leg + height - 1, -length / 2 + 2))
    hw, hh, hd = head
    hb = m.bone("head", "body", (0, leg + height - 2, -length / 2), role="head")
    m.cube(hb, (-hw / 2, leg + height - 4, -length / 2 - hd + 2), (hw, hh, hd), "fur", face="beast")
    m.cube(hb, (-hw / 4, leg + height - 4, -length / 2 - hd + 2 - snout), (hw / 2, hh / 2, snout), "fur")
    if ears:
        for sx in (-1, 1):
            m.cube(hb, (sx * hw / 3 - 1, leg + height + hh - 4, -length / 2 - hd / 2), (2, 3, 1), "fur")
    if horns:
        for sx in (-1, 1):
            m.cube(hb, (sx * hw / 2 - 1, leg + height + hh - 5, -length / 2 - hd / 2), (2, 7, 2), "spike",
                   rotation=(-35, 0, -sx * 30), pivot=(sx * hw / 2, leg + height + hh - 5, -length / 2 - hd / 2))
    for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        lb = m.bone(f"leg{i}", "body", (sx * (width / 2 - 2.5), leg, sz * (length / 2 - 3.5)), role="legF" if (i in (0, 3)) else "legB")
        m.cube(lb, (sx * (width / 2 - 2.5) - 2.5, 0, sz * (length / 2 - 3.5) - 2.5), (5, leg, 5), "fur", mirror=sx > 0)
        if claws:
            m.cube(lb, (sx * (width / 2 - 2.5) - 2, 0, sz * (length / 2 - 3.5) - 3.5), (4, 1, 1), "spike")
    if tail:
        t = m.bone("tail", "body", (0, leg + height - 2, length / 2), rotation=(40, 0, 0), role="tail")
        m.cube(t, (-1.5, leg + height - 2, length / 2), (3, 3, 8), "fur")
    return m


def arachnid(name, pal, body=(12, 8, 14), abdomen=(14, 11, 16), leg=11, spikes=4):
    m = Model(name, pal)
    m.bone("root")
    bw, bh, bd = body
    aw, ah, ad = abdomen
    y = 6
    tb = m.bone("body", "root", (0, y + bh / 2, 0), locators={"aura": [0, y + bh, 0]})
    m.cube(tb, (-bw / 2, y, -bd / 2), (bw, bh, bd), "armor")
    m.cube(tb, (-aw / 2, y + 1, bd / 2), (aw, ah, ad), "armor")
    for i in range(spikes):
        m.cube(tb, (-1 + (i % 2) * 2 - 1, y + 1 + ah, bd / 2 + 2 + i * (ad - 4) / spikes), (1.5, 5, 1.5), "spike",
               rotation=(-20, 0, (-1) ** i * 20), pivot=(0, y + 1 + ah, bd / 2 + 2 + i * (ad - 4) / spikes))
    hb = m.bone("head", "body", (0, y + bh / 2, -bd / 2), role="head")
    m.cube(hb, (-4, y + 1, -bd / 2 - 7), (8, 7, 7), "armor", face="multi")
    for sx in (-1, 1):
        m.cube(hb, (sx * 2 - 0.5, y, -bd / 2 - 9), (1, 3, 2), "spike")
    for i in range(8):
        sx = -1 if i < 4 else 1
        k = i % 4
        z = -bd / 2 + 2 + k * (bd - 4) / 3
        lb = m.bone(f"leg{i}", "body", (sx * bw / 2, y + bh / 2, z), rotation=(0, sx * (50 - k * 33), -sx * 28),
                    role="legF" if (i + k) % 2 else "legB")
        m.cube(lb, (sx * bw / 2 + (0 if sx > 0 else -leg), y + bh / 2 - 1, z - 1), (leg, 2, 2), "armor")
        tip = m.bone(f"leg{i}_tip", f"leg{i}", (sx * (bw / 2 + leg), y + bh / 2, z), rotation=(0, 0, sx * 80))
        m.cube(tip, (sx * (bw / 2 + leg) + (0 if sx > 0 else -leg), y + bh / 2 - 1, z - 0.75), (leg, 1.5, 1.5), "spike")
    return m


def golem(name, pal, axe=True):
    """Iron: a massive armoured knight (~3.5 blocks)."""
    m = Model(name, pal)
    m.bone("root")
    for side, sx in (("rightLeg", -1), ("leftLeg", 1)):
        lb = m.bone(side, "root", (sx * 4, 20, 0), role="legR" if sx < 0 else "legL")
        m.cube(lb, (sx * 4 - 3.5, 0, -3.5), (7, 20, 7), "metal", mirror=sx > 0)
        m.cube(lb, (sx * 4 - 4, 9, -4.5), (8, 5, 2), "armor", mirror=sx > 0)  # knee guard
    m.bone("waist", "root", (0, 20, 0))
    body = m.bone("body", "waist", (0, 20, 0), locators={"aura": [0, 40, 0]})
    m.cube(body, (-9, 20, -5.5), (18, 20, 11), "armor")
    m.cube(body, (-8, 15, -5), (16, 6, 10), "metal")
    m.cube(body, (-3, 31, -6.5), (6, 6, 1), "glow")  # chest core
    head = m.bone("head", "body", (0, 40, -1), role="head")
    m.cube(head, (-5, 40, -6), (10, 10, 10), "metal", face="visor")
    for sx in (-1, 1):  # great horns
        m.cube(head, (sx * 5 - 1, 46, -2), (2, 9, 2), "spike", rotation=(-25, 0, -sx * 40), pivot=(sx * 5, 46, -1))
    for side, sx in (("right", -1), ("left", 1)):
        arm = m.bone(f"{side}Arm", "body", (sx * 11, 37, 0), role="armR" if sx < 0 else "armL")
        m.cube(arm, (sx * 11 - 3.5, 14, -3.5), (7, 23, 7), "metal", mirror=sx > 0)
        m.cube(arm, (sx * 11 - 5.5, 33, -5.5), (11, 6, 11), "armor", mirror=sx > 0)  # pauldron
        for k in range(3):
            m.cube(arm, (sx * 12 - 1, 39, -3 + k * 3), (2, 7, 2), "spike", rotation=(0, 0, -sx * (20 + k * 15)), pivot=(sx * 12, 39, 0))
        m.cube(arm, (sx * 11 - 4, 10, -4), (8, 5, 8), "armor", mirror=sx > 0)  # gauntlet
        m.bone(f"{side}Item", f"{side}Arm", (sx * 11, 12, 1))
    if axe:
        ax = m.bone("weapon", "rightArm", (-11, 12, 0), rotation=(-20, 0, 0))
        m.cube(ax, (-11.5, -14, -0.5), (1.5, 30, 1.5), "dark")
        m.cube(ax, (-12, -16, -9), (2.5, 11, 8), "blade")  # huge axe head
    return m


def wraith(name, pal):
    m = Model(name, pal)
    m.bone("root")
    for side, sx in (("rightLeg", -1), ("leftLeg", 1)):
        m.cube(m.bone(side, "root", (sx * 2, 26, 0), role="legR" if sx < 0 else "legL"), (sx * 2 - 1.5, 0, -1.5), (3, 26, 3), "armor")
    m.bone("waist", "root", (0, 26, 0))
    body = m.bone("body", "waist", (0, 26, 0), locators={"aura": [0, 36, 0]})
    m.cube(body, (-4, 26, -2), (8, 14, 4), "armor")
    m.cube(body, (-5, 16, -3), (10, 12, 6), "cloth")  # tattered robe
    head = m.bone("head", "body", (0, 40, 0), role="head")
    m.cube(head, (-4, 40, -4), (8, 8, 8), "armor", face="slant")
    for sx in (-1, 1):
        m.cube(head, (sx * 3.5 - 0.75, 47, -1), (1.5, 8, 1.5), "spike", rotation=(-15, 0, -sx * 25), pivot=(sx * 3.5, 47, 0))
    for side, sx in (("right", -1), ("left", 1)):
        arm = m.bone(f"{side}Arm", "body", (sx * 5, 38, 0), role="armR" if sx < 0 else "armL")
        m.cube(arm, (sx * 5 - 1.5, 10, -1.5), (3, 28, 3), "armor")
        for k in range(3):
            m.cube(arm, (sx * 5 - 1.5 + k, 7, -1.5), (1, 3, 1), "spike")
        m.bone(f"{side}Item", f"{side}Arm", (sx * 5, 10, 1))
    return m


# ================================================================ animations
def animation_for(m):
    SW = "(math.cos(query.modified_distance_moved * 38.17) * {a} * query.modified_move_speed)"
    walk, idle, attack = {}, {}, {}
    for b, role in m.anim_bones.items():
        if role == "legR":
            walk[b] = {"rotation": [SW.format(a=50), 0, 0]}
        elif role == "legL":
            walk[b] = {"rotation": ["-" + SW.format(a=50), 0, 0]}
        elif role == "legF":
            walk[b] = {"rotation": [SW.format(a=40), 0, 0]}
        elif role == "legB":
            walk[b] = {"rotation": ["-" + SW.format(a=40), 0, 0]}
        elif role == "armR":
            walk[b] = {"rotation": ["-" + SW.format(a=35), 0, 0]}
            attack[b] = {"rotation": ["-110.0 * math.sin(variable.attack_time * 180.0)", 0, 0]}
        elif role == "armL":
            walk[b] = {"rotation": [SW.format(a=35), 0, 0]}
        elif role == "cape":
            idle[b] = {"rotation": ["math.sin(query.life_time * 90.0) * 4.0 + query.modified_move_speed * 25.0", 0, 0]}
        elif role == "tail":
            idle[b] = {"rotation": [0, "math.sin(query.life_time * 120.0) * 15.0", 0]}
        elif role == "head":
            pass
    return {
        f"animation.sl.m_{m.name}.walk": {"loop": True, "bones": walk},
        f"animation.sl.m_{m.name}.idle": {"loop": True, "bones": idle or {"root": {"position": [0, 0, 0]}}},
        f"animation.sl.m_{m.name}.attack": {"loop": True, "bones": attack or {"root": {"position": [0, 0, 0]}}},
    }


def client(identifier, m, particles=None):
    anims = {"walk": f"animation.sl.m_{m.name}.walk", "idle": f"animation.sl.m_{m.name}.idle",
             "attack": f"animation.sl.m_{m.name}.attack", "look": "animation.sl.look_at_target"}
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": identifier,
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": f"textures/sl/models/{m.name}"},
        "geometry": {"default": f"geometry.sl.m_{m.name}"},
        "animations": anims,
        "scripts": {"animate": ["walk", "idle", "look", {"attack": "variable.attack_time > 0.0"}]},
        "render_controllers": ["controller.render.sl_shadow_custom"],
        "enable_attachables": True,
        **({"spawn_egg": {"base_color": "#20101a", "overlay_color": "#ff5566"}} if not identifier.startswith("sl:shadow_") else {}),
    }}}


# ================================================================ catalogue
def models():
    M = {}
    # --- shadows (black + blue-violet veins) ---
    M["shadow_soldier"] = knight("shadow_soldier", "shadow", helm="visor", pads=1, skirt=True)
    M["shadow_husk"] = knight("shadow_husk", "shadow", helm="slant", hood=True, pads=0, cape=True)
    M["shadow_drowned"] = knight("shadow_drowned", "shadow", helm="visor", crest=True, pads=1)
    M["shadow_archer"] = knight("shadow_archer", "shadow", hood=True, pads=1, cape=True, skirt=True)
    M["shadow_frost_archer"] = knight("shadow_frost_archer", "shadow", hood=True, pads=2, cape=True)
    M["shadow_executioner"] = knight("shadow_executioner", "shadow", hood=True, pads=3, horns=True)
    M["shadow_goblin"] = knight("shadow_goblin", "shadow", scale=0.75, helm="slant", ears=4, pads=0)
    M["shadow_orc"] = knight("shadow_orc", "shadow", scale=1.15, helm="slant", tusks=True, pads=3, horns=True)
    M["shadow_ice_elf"] = knight("shadow_ice_elf", "shadow", hood=True, ears=4, pads=1, cape=True)
    M["shadow_spider"] = arachnid("shadow_spider", "shadow")
    M["shadow_wolf"] = beast("shadow_wolf", "shadow", length=18, height=8, width=8, leg=8, head=(7, 6, 7), snout=4,
                             mane=5, back_spikes=4)
    M["tank"] = beast("tank", "tank_shadow", length=30, height=18, width=20, leg=13, head=(13, 12, 12), snout=5,
                      ears=True, mane=7, back_spikes=6, tail=False)
    M["iron"] = golem("iron", "iron")
    M["shadow_stalker"] = wraith("shadow_stalker", "shadow")
    # --- dungeon monsters (rank colours) ---
    M["dg_soldier"] = knight("dg_soldier", "soldier", helm="slant", pads=1, weapon="sword", body_style="skin")
    M["dg_archer"] = knight("dg_archer", "archer", hood=True, pads=0, cape=True, weapon="bow")
    M["dg_spider"] = arachnid("dg_spider", "spider")
    M["dg_hound"] = beast("dg_hound", "hound", length=20, height=9, width=9, leg=9, head=(8, 7, 8), snout=4,
                          mane=6, back_spikes=5, horns=True)
    M["dg_ice_bear"] = beast("dg_ice_bear", "ice_bear", length=24, height=14, width=16, leg=11, head=(11, 10, 10), snout=4,
                             mane=5, back_spikes=5, tail=False)
    M["dg_knight"] = knight("dg_knight", "knight", crest=True, pads=3, cape=True, weapon="sword")
    M["dg_mage"] = knight("dg_mage", "mage", hood=True, pads=1, cape=True, weapon="staff", horns=True)
    M["dg_ant"] = knight("dg_ant", "ant", scale=1.05, helm="multi", mandibles=True, pads=2, weapon="spear")
    for m in M.values():
        m.finish()
    return M


# shadow type -> model used by its shadow entity
SHADOW_MODELS = {
    "zombie": "shadow_soldier", "husk": "shadow_husk", "drowned": "shadow_drowned", "skeleton": "shadow_archer",
    "stray": "shadow_frost_archer", "vindicator": "shadow_executioner", "goblin": "shadow_goblin", "orc": "shadow_orc",
    "ice_elf": "shadow_ice_elf", "spider": "shadow_spider", "wolf": "shadow_wolf", "ravager": "tank", "iron_golem": "iron",
    "enderman": "shadow_stalker",
}

# dungeon monsters: id -> (model, hp, damage, speed, (w, h), ranged projectile or None, families)
DUNGEON = {
    "dg_soldier": ("dg_soldier", 22, 4, 0.27, (0.6, 1.9), None, ["undead"]),
    "dg_archer": ("dg_archer", 20, 3, 0.27, (0.6, 1.9), "minecraft:arrow", ["undead"]),
    "dg_spider": ("dg_spider", 26, 4, 0.33, (1.4, 1.0), None, ["arthropod"]),
    "dg_hound": ("dg_hound", 30, 6, 0.36, (0.9, 1.1), None, []),
    "dg_ice_bear": ("dg_ice_bear", 60, 9, 0.28, (1.4, 1.6), None, []),
    "dg_knight": ("dg_knight", 50, 9, 0.28, (0.6, 2.1), None, ["undead"]),
    "dg_mage": ("dg_mage", 34, 3, 0.26, (0.6, 2.0), "minecraft:small_fireball", []),
    "dg_ant": ("dg_ant", 45, 10, 0.32, (0.7, 2.2), None, ["arthropod"]),
}


def dungeon_behavior(did, model, hp, dmg, speed, size, proj, fam):
    c = {
        "minecraft:type_family": {"family": [did, "monster", "mob", *fam]},
        "minecraft:health": {"value": hp, "max": hp},
        "minecraft:attack": {"damage": dmg},
        "minecraft:movement": {"value": speed},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_damage_blocks": True},
        "minecraft:collision_box": {"width": size[0], "height": size[1]},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:breathable": {"breathes_air": True, "suffocate_time": 0, "total_supply": 15},
        "minecraft:nameable": {},
        "minecraft:fire_immune": True,
        "minecraft:despawn": {"despawn_from_distance": {}},
        "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 8 : 0"},
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.nearest_attackable_target": {
            "priority": 2, "must_see": True, "reselect_targets": True, "within_radius": 24,
            "entity_types": [
                {"filters": {"test": "is_family", "subject": "other", "value": "player"}, "max_dist": 24},
                {"filters": {"test": "is_family", "subject": "other", "value": "sl_shadow"}, "max_dist": 16},
            ],
        },
        "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.9},
        "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 8},
    }
    if proj:
        c["minecraft:shooter"] = {"def": proj}
        c["minecraft:behavior.ranged_attack"] = {"priority": 3, "attack_interval_min": 1.5, "attack_interval_max": 2.5, "attack_radius": 16}
    else:
        c["minecraft:behavior.melee_attack"] = {"priority": 3, "speed_multiplier": 1.2, "track_target": True}
    return {"format_version": "1.21.100", "minecraft:entity": {
        "description": {"identifier": f"sl:{did}", "is_spawnable": False, "is_summonable": True}, "components": c}}


def main():
    M = models()
    os.makedirs(TEXDIR, exist_ok=True)
    anims = {}
    for name, m in M.items():
        m.img.save(os.path.join(TEXDIR, f"{name}.png"))
        write(os.path.join(RP, "models", "entity", f"m_{name}.geo.json"), m.geometry())
        anims.update(animation_for(m))
    write(os.path.join(RP, "animations", "sl_models.animation.json"), {"format_version": "1.8.0", "animations": anims})
    for stype, mname in SHADOW_MODELS.items():
        write(os.path.join(RP, "entity", "shadows", f"{stype}.entity.json"), client(f"sl:shadow_{stype}", M[mname]))
    names = []
    for did, (mname, hp, dmg, speed, size, proj, fam) in DUNGEON.items():
        write(os.path.join(BP, "entities", "dungeon", f"{did}.json"), dungeon_behavior(did, mname, hp, dmg, speed, size, proj, fam))
        write(os.path.join(RP, "entity", "dungeon", f"{did}.entity.json"), client(f"sl:{did}", M[mname]))
        names.append(did)
    lang = os.path.join(RP, "texts", "en_US.lang")
    lines = [l for l in open(lang).read().splitlines() if l and not l.startswith("entity.sl:dg_")]
    labels = {"dg_soldier": "Undead Soldier", "dg_archer": "Bone Archer", "dg_spider": "Giant Spider", "dg_hound": "Hellhound",
              "dg_ice_bear": "Ice Bear", "dg_knight": "Red Knight", "dg_mage": "Dark Mage", "dg_ant": "Ant Soldier"}
    for did in names:
        lines.append(f"entity.sl:{did}.name={labels[did]}")
    open(lang, "w").write("\n".join(lines) + "\n")
    print(f"{len(M)} models, {len(SHADOW_MODELS)} shadow skins, {len(DUNGEON)} dungeon monsters")


if __name__ == "__main__":
    main()
