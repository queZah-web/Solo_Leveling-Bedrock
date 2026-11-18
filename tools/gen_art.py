#!/usr/bin/env python3
"""Phase 7 art: detailed 32x32 weapon sprites and 64x64 shaded mob skins with
extra model parts (ears, tusks, shoulder pads, hood, cape...).

Runs after gen_mobs.py (it overwrites the placeholder art).
  python3 tools/gen_art.py
"""
import json
import math
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
ITEMS = os.path.join(RP, "textures", "items", "sl")
MOBS = os.path.join(RP, "textures", "sl", "mobs")
SHADOW_TEX = os.path.join(RP, "textures", "sl", "entity")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def mul(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3])


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def outline(img, col=(14, 10, 20, 255)):
    """1px dark outline around opaque pixels (classic pixel-art look)."""
    px = img.load()
    w, h = img.size
    out = img.copy()
    po = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 200:
                    po[x, y] = col
                    break
    return out


# ================================================================ weapons (32x32)
def weapon(name, blade_len, width_fn, blade_hi, blade_mid, blade_lo, edge, guard, grip, pommel, gem=None,
           fuller=None, glow=None, curve=0.0, extra=None):
    """Blade along the diagonal (handle bottom-left, tip top-right)."""
    S = 32
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    ax = (1 / math.sqrt(2), -1 / math.sqrt(2))  # axis toward the tip
    pe = (1 / math.sqrt(2), 1 / math.sqrt(2))  # perpendicular
    gx, gy = 8.5, 23.5  # guard center
    for y in range(S):
        for x in range(S):
            vx, vy = x + 0.5 - gx, y + 0.5 - gy
            t = vx * ax[0] + vy * ax[1]
            s = vx * pe[0] + vy * pe[1]
            s -= curve * (t / blade_len) ** 2 * blade_len * 0.18 if t > 0 else 0
            if 0.6 < t <= blade_len:
                w = width_fn(t / blade_len)
                if abs(s) <= w:
                    k = s / max(w, 0.01)
                    if abs(s) > w - 0.9:
                        col = edge
                    elif fuller and abs(s) < fuller and t < blade_len * 0.75:
                        col = blade_lo
                    elif k < 0:
                        col = mix(blade_hi, blade_mid, (k + 1) * 0.6)
                    else:
                        col = mix(blade_mid, blade_lo, k)
                    px[x, y] = col + (255,)
            # guard: a bar across the axis
            elif -1.6 <= t <= 0.6 and abs(s) <= 6.0:
                col = mix(mul(guard, 1.3), mul(guard, 0.65), (s + 6.0) / 12.0)
                if abs(s) > 4.8:
                    col = mul(guard, 1.5)
                px[x, y] = col + (255,)
            # grip: wrapped
            elif -7.0 <= t < -1.6 and abs(s) <= 1.7:
                band = int((t + 7.0) * 1.2) % 2
                px[x, y] = (mul(grip, 1.2) if band else mul(grip, 0.8)) + (255,)
            # pommel
            elif -9.6 <= t < -7.0 and abs(s) <= 2.4:
                px[x, y] = mix(mul(pommel, 1.35), mul(pommel, 0.65), (t + 9.6) / 2.6) + (255,)
    if gem:
        for (x, y) in ((8, 23), (9, 23), (8, 24), (9, 24), (7, 23), (9, 22)):
            px[x, y] = gem + (255,)
        px[8, 23] = mul(gem, 1.7) + (255,)
    if extra:
        extra(px)
    img = outline(img)
    if glow:
        # soft aura behind the sprite
        aura = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        pa = aura.load()
        src = img.load()
        for y in range(S):
            for x in range(S):
                if src[x, y][3]:
                    continue
                near = sum(1 for dx in (-2, -1, 1, 2) for dy in (-2, -1, 1, 2)
                           if 0 <= x + dx < S and 0 <= y + dy < S and src[x + dx, y + dy][3] > 200)
                if near:
                    pa[x, y] = glow + (min(150, near * 18),)
        aura.alpha_composite(img)
        img = aura
    img.save(os.path.join(ITEMS, f"{name}.png"))


def venom_drips(px):
    for (x, y) in ((20, 13), (20, 14), (24, 9), (24, 10), (24, 11), (16, 17)):
        if px[x, y][3] == 0:
            px[x, y] = (120, 255, 90, 255)


def runes(px):
    for i, (x, y) in enumerate(((14, 18), (16, 16), (18, 14), (20, 12), (22, 10), (24, 8), (26, 6))):
        if px[x, y][3]:
            px[x, y] = (255, 80, 60, 255) if i % 2 == 0 else (255, 170, 80, 255)


def frost(px):
    for (x, y) in ((22, 7), (25, 9), (19, 12), (27, 5)):
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            if 0 <= x + dx < 32 and 0 <= y + dy < 32 and px[x + dx, y + dy][3] == 0:
                px[x + dx, y + dy] = (210, 245, 255, 255) if (dx, dy) == (0, 0) else (150, 220, 255, 200)


def weapons():
    os.makedirs(ITEMS, exist_ok=True)
    # Kasaka's Venom Fang: curved ivory fang, venom-green edge
    weapon("kasaka_fang", 19, lambda u: 3.6 * (1 - u) ** 0.75 + 0.4,
           (248, 244, 222), (218, 208, 172), (150, 140, 108), (140, 235, 90),
           guard=(50, 100, 45), grip=(64, 46, 30), pommel=(60, 125, 50), gem=(120, 255, 90), curve=1.3, extra=venom_drips)
    # Knight Killer: straight steel dagger with fuller, red gem
    weapon("knight_killer", 19, lambda u: 3.2 * (1 - u * 0.55) if u < 0.8 else 3.2 * 0.56 * (1 - u) / 0.2,
           (248, 250, 255), (192, 200, 214), (108, 116, 134), (255, 255, 255),
           guard=(48, 48, 58), grip=(38, 32, 42), pommel=(165, 165, 180), gem=(230, 30, 40), fuller=0.9)
    # Baruka's Dagger: ice-blue crystal blade with frost
    weapon("baruka_dagger", 20, lambda u: 4.0 * (1 - u) ** 0.65 + 0.3,
           (232, 250, 255), (140, 205, 245), (58, 118, 200), (255, 255, 255),
           guard=(200, 215, 235), grip=(230, 235, 245), pommel=(120, 190, 240), gem=(90, 220, 255), extra=frost)
    # Demon King's Dagger: black serrated blade, violet edge glow
    weapon("demon_king_dagger", 19, lambda u: (3.6 + (0.9 if int(u * 9) % 2 else 0)) * (1 - u) ** 0.55 + 0.3,
           (115, 72, 155), (46, 26, 66), (20, 10, 30), (215, 125, 255),
           guard=(95, 20, 42), grip=(32, 16, 26), pommel=(125, 30, 62), gem=(255, 40, 80), glow=(170, 60, 255))
    # Demon King's Longsword: long black blade, red runes, crimson aura
    weapon("demon_king_longsword", 23, lambda u: 3.4 * (1 - u * 0.4) if u < 0.86 else 3.4 * 0.6 * (1 - u) / 0.14,
           (98, 88, 104), (42, 33, 47), (15, 10, 20), (255, 92, 72),
           guard=(115, 20, 26), grip=(36, 20, 20), pommel=(145, 25, 30), gem=(255, 60, 40), fuller=1.0,
           glow=(255, 50, 40), extra=runes)


# ================================================================ potions / box / key (32x32)
def potion(name, liquid, glow=False):
    S = 32
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    cx, cy, r = 15.5, 20, 9
    for y in range(S):
        for x in range(S):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r:
                # glass sphere with liquid (lower 70%), highlight top-left
                if y >= cy - r * 0.4:
                    k = 1.15 - (y - (cy - r)) / (2 * r) * 0.6
                    col = mul(liquid, k)
                    if d > r - 1.2:
                        col = mul(liquid, 0.6)
                else:
                    col = (200, 225, 240) if d < r - 1.2 else (150, 175, 195)
                px[x, y] = col + (255 if y >= cy - r * 0.4 else 170,)
    for y in range(4, 12):  # neck
        for x in range(13, 19):
            px[x, y] = ((205, 228, 240, 190) if x not in (13, 18) else (150, 175, 195, 255))
    for y in range(1, 5):  # cork
        for x in range(12, 20):
            px[x, y] = mul((150, 105, 60), 1.2 if y < 3 else 0.85) + (255,)
    for (x, y) in ((11, 15), (11, 16), (12, 14), (10, 17)):  # glare
        px[x, y] = (255, 255, 255, 255)
    for (x, y) in ((18, 22), (14, 25), (20, 19)):  # bubbles
        px[x, y] = mul(liquid, 1.6) + (255,)
    img = outline(img)
    if glow:
        base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        pb = base.load()
        for y in range(S):
            for x in range(S):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if r < d < r + 4:
                    pb[x, y] = liquid + (int(110 * (1 - (d - r) / 4)),)
        base.alpha_composite(img)
        img = base
    img.save(os.path.join(ITEMS, f"{name}.png"))


def random_box():
    S = 32
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    for y in range(10, 29):
        for x in range(5, 27):
            px[x, y] = mix((130, 70, 200), (70, 30, 120), (y - 10) / 19) + (255,)
    for y in range(6, 12):  # lid
        for x in range(3, 29):
            px[x, y] = mix((170, 110, 240), (110, 60, 180), (y - 6) / 6) + (255,)
    for y in range(6, 29):  # ribbon
        for x in range(14, 18):
            px[x, y] = ((255, 225, 110) if x in (14, 15) else (220, 170, 60)) + (255,)
    for x in range(3, 29):
        px[x, 11] = (60, 25, 100, 255)
    q = ["0110", "1001", "0001", "0010", "0010", "0000", "0010"]
    for j, row in enumerate(q):
        for i, ch in enumerate(row):
            if ch == "1":
                for dx in (0, 1):
                    px[7 + i * 1 + dx, 15 + j * 1] = (255, 255, 255, 255)
    for x, y in ((4, 7), (5, 7), (4, 8)):
        px[x, y] = (235, 200, 255, 255)
    img = outline(img)
    img.save(os.path.join(ITEMS, "random_box.png"))


def dungeon_key():
    S = 32
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    cx, cy = 9.5, 9.5
    for y in range(S):
        for x in range(S):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if 3.0 <= d <= 6.5:
                px[x, y] = mix((170, 235, 255), (40, 120, 200), (d - 3) / 3.5) + (255,)
            if d < 3.0:
                px[x, y] = (60, 200, 255, 160)
    for i in range(14):  # shaft
        x, y = 13 + i, 13 + i
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            if x + dx < S and y + dy < S:
                px[x + dx, y + dy] = ((200, 245, 255) if dx == 0 and dy == 0 else (70, 150, 220)) + (255,)
    for (x, y) in ((23, 23), (24, 22), (25, 21), (26, 26), (27, 25), (28, 24)):  # teeth
        px[x, y] = (120, 210, 255, 255)
    img = outline(img)
    img.save(os.path.join(ITEMS, "dungeon_key.png"))


def items():
    potion("healing_elixir", (230, 40, 60))
    potion("mana_potion", (50, 110, 255))
    potion("fatigue_potion", (70, 220, 110))
    potion("elixir_of_life", (255, 200, 50), glow=True)
    random_box()
    dungeon_key()


# ================================================================ mobs (64x64 skins + models)
def faces(ox, oy, w, h, d):
    """Bedrock box UV faces of a cube."""
    return {
        "top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d),
        "right": (ox, oy + d, d, h), "front": (ox + d, oy + d, w, h),
        "left": (ox + d + w, oy + d, d, h), "back": (ox + 2 * d + w, oy + d, w, h),
    }


SHADE = {"front": 1.0, "back": 0.82, "right": 0.9, "left": 0.9, "top": 1.15, "bottom": 0.7}


def paint(px, rnd, box, color_fn, noise=10):
    """Fill a cube's faces: colour from color_fn(face, x, y, w, h), shaded by face and height."""
    for face, (fx, fy, fw, fh) in faces(*box).items():
        for x in range(fw):
            for y in range(fh):
                c = color_fn(face, x, y, fw, fh)
                if c is None:
                    continue
                k = SHADE[face]
                if face in ("front", "back", "left", "right"):
                    k *= 1.06 - 0.16 * (y / max(1, fh - 1))
                n = rnd.randint(-noise, noise)
                px[fx + x, fy + y] = tuple(max(0, min(255, int(v * k) + n)) for v in c[:3]) + (255,)


def face_map(px, ox, oy, rows, pal):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in pal:
                px[ox + i, oy + j] = pal[ch] + (255,)


# --- each mob: texture painter + geometry -----------------------------------
def goblin_tex():
    rnd = random.Random("goblin")
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()
    skin, skin_d = (105, 160, 60), (70, 115, 40)
    tunic, rope = (120, 82, 48), (175, 145, 90)
    paint(px, rnd, (0, 0, 8, 8, 8), lambda f, x, y, w, h: mix(skin, skin_d, 0.3) if f == "top" else skin)
    fx, fy = 8, 8
    face_map(px, fx, fy, [
        "........",
        "........",
        ".bb..bb.",
        ".YP..PY.",
        "........",
        "........",
        ".mTmmTm.",
        "..mmmm..",
    ], {"b": (45, 70, 25), "Y": (255, 220, 50), "P": (20, 10, 5), "m": (60, 25, 20), "T": (240, 235, 200)})
    # body: ragged tunic, rope belt, ragged hem
    def body(f, x, y, w, h):
        if y == 6:
            return rope
        if y > 9 and (x + y) % 3 == 0:
            return None if f == "front" else tunic
        return tunic if y < 10 else mix(tunic, (90, 60, 35), 0.5)
    paint(px, rnd, (16, 16, 8, 12, 4), lambda f, x, y, w, h: body(f, x, y, w, h) or skin)
    def arm(f, x, y, w, h):
        if y < 3:
            return tunic
        if 8 <= y <= 9:
            return (95, 65, 40)  # leather bracer
        return skin
    paint(px, rnd, (40, 16, 4, 12, 4), arm)
    paint(px, rnd, (32, 48, 4, 12, 4), arm)
    def leg(f, x, y, w, h):
        if y < 3:
            return mix(tunic, (90, 60, 35), 0.5)
        if y >= 10:
            return (70, 50, 35)  # foot wraps
        if 6 <= y <= 7:
            return (130, 110, 80)
        return skin
    paint(px, rnd, (0, 16, 4, 12, 4), leg)
    paint(px, rnd, (16, 48, 4, 12, 4), leg)
    # extras in the free hat area: ears (32,0)/(40,0), nose (48,0), loincloth (32,8)
    paint(px, rnd, (32, 0, 3, 4, 1), lambda f, x, y, w, h: skin_d if y == 0 else skin)
    paint(px, rnd, (40, 0, 3, 4, 1), lambda f, x, y, w, h: skin_d if y == 0 else skin)
    paint(px, rnd, (48, 0, 2, 2, 2), lambda f, x, y, w, h: mix(skin, skin_d, 0.4))
    paint(px, rnd, (32, 8, 6, 6, 1), lambda f, x, y, w, h: tunic if (x + y) % 4 else (95, 65, 38))
    return img


def orc_tex():
    rnd = random.Random("orc")
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()
    skin, skin_d = (118, 138, 78), (80, 98, 52)
    iron, iron_d = (120, 126, 138), (70, 74, 86)
    leather = (92, 62, 40)
    paint(px, rnd, (0, 0, 8, 8, 8), lambda f, x, y, w, h: skin_d if f == "top" else skin)
    face_map(px, 8, 8, [
        "........",
        "dddddddd",
        ".RR..RR.",
        "........",
        "...nn...",
        "........",
        ".mmmmmm.",
        "........",
    ], {"d": (55, 70, 35), "R": (255, 60, 30), "n": (90, 110, 60), "m": (45, 25, 20)})
    def body(f, x, y, w, h):
        if f in ("front", "back") and y < 8:
            if y in (0, 7) or x in (0, w - 1):
                return iron_d
            if (x, y) in ((2, 2), (5, 2), (2, 5), (5, 5)):
                return (200, 205, 215)  # rivets
            return iron
        if y == 8:
            return (60, 40, 25)
        if y == 9 and x == 3:
            return (200, 170, 60)  # buckle
        return leather if y > 8 else iron
    paint(px, rnd, (16, 16, 8, 12, 4), body)
    def arm(f, x, y, w, h):
        if 7 <= y <= 9:
            return leather
        return skin
    paint(px, rnd, (40, 16, 4, 12, 4), arm)
    paint(px, rnd, (32, 48, 4, 12, 4), arm)
    def leg(f, x, y, w, h):
        if y >= 9:
            return iron_d if y < 11 else (50, 40, 35)
        return leather
    paint(px, rnd, (0, 16, 4, 12, 4), leg)
    paint(px, rnd, (16, 48, 4, 12, 4), leg)
    # extras: tusks (56,0)/(60,0), brow (32,0), shoulder pads (16,32)
    paint(px, rnd, (56, 0, 1, 2, 1), lambda f, x, y, w, h: (245, 238, 215))
    paint(px, rnd, (60, 0, 1, 2, 1), lambda f, x, y, w, h: (245, 238, 215))
    paint(px, rnd, (32, 0, 8, 1, 2), lambda f, x, y, w, h: (60, 75, 38))
    paint(px, rnd, (16, 32, 5, 3, 6), lambda f, x, y, w, h: iron_d if y == 0 else iron)
    return img


def elf_tex():
    rnd = random.Random("ice_elf")
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()
    skin = (232, 240, 250)
    hair = (245, 250, 255)
    robe, robe_d = (238, 244, 252), (190, 205, 225)
    trim, trim_d = (70, 140, 225), (40, 90, 170)
    silver = (200, 210, 225)
    def head(f, x, y, w, h):
        if f in ("top", "back") or (f in ("left", "right") and y < 5) or (f == "front" and y < 2):
            return hair
        return skin
    paint(px, rnd, (0, 0, 8, 8, 8), head, noise=5)
    face_map(px, 8, 8, [
        "hhhhhhhh",
        "h......h",
        ".ss..ss.",
        ".CW..WC.",
        "........",
        "........",
        "...pp...",
        "........",
    ], {"h": hair, "s": (170, 185, 205), "C": (60, 230, 255), "W": (255, 255, 255), "p": (200, 150, 170)})
    # hood (hat layer at 32,0): blue with silver trim, open face
    def hood(f, x, y, w, h):
        if f == "front":
            return trim_d if (y == 0 or x in (0, w - 1)) else None
        if f == "bottom":
            return None
        return trim if (x + y) % 5 else trim_d
    paint(px, rnd, (32, 0, 8, 8, 8), hood, noise=4)
    def body(f, x, y, w, h):
        if f == "front" and x in (3, 4):
            return trim
        if y in (5, 6):
            return silver if y == 5 else trim_d
        return robe if y < 5 else mix(robe, robe_d, y / h)
    paint(px, rnd, (16, 16, 8, 12, 4), body, noise=5)
    def arm(f, x, y, w, h):
        if y >= 10:
            return skin
        if y == 9:
            return trim
        return robe
    paint(px, rnd, (40, 16, 4, 12, 4), arm, noise=5)
    paint(px, rnd, (32, 48, 4, 12, 4), arm, noise=5)
    def leg(f, x, y, w, h):
        if y >= 9:
            return trim_d  # boots
        return robe_d
    paint(px, rnd, (0, 16, 4, 12, 4), leg, noise=5)
    paint(px, rnd, (16, 48, 4, 12, 4), leg, noise=5)
    # extras: cape (16,32) and long ears (56,16)/(56,20)
    def cape(f, x, y, w, h):
        if f in ("front", "back"):
            if y == 0:
                return silver
            return trim if x % 3 else trim_d
        return trim_d
    paint(px, rnd, (16, 32, 8, 14, 1), cape, noise=4)
    paint(px, rnd, (56, 16, 3, 1, 1), lambda f, x, y, w, h: skin)
    paint(px, rnd, (56, 20, 3, 1, 1), lambda f, x, y, w, h: skin)
    return img


def cube(origin, size, uv, mirror=False, inflate=0, rotation=None, pivot=None):
    c = {"origin": origin, "size": size, "uv": uv}
    if mirror:
        c["mirror"] = True
    if inflate:
        c["inflate"] = inflate
    if rotation:
        c["rotation"] = rotation
        c["pivot"] = pivot
    return c


def humanoid64(ident, head_extra=(), body_extra=(), arm_r_extra=(), arm_l_extra=()):
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": ident, "texture_width": 64, "texture_height": 64,
                            "visible_bounds_width": 3, "visible_bounds_height": 3.5, "visible_bounds_offset": [0, 1.5, 0]},
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "waist", "parent": "root", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "waist", "pivot": [0, 24, 0], "cubes": [cube([-4, 12, -2], [8, 12, 4], [16, 16]), *body_extra]},
                {"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [cube([-4, 24, -4], [8, 8, 8], [0, 0]), *head_extra]},
                {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0], "cubes": [cube([-8, 12, -2], [4, 12, 4], [40, 16]), *arm_r_extra]},
                {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
                {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0], "cubes": [cube([4, 12, -2], [4, 12, 4], [32, 48]), *arm_l_extra]},
                {"name": "leftItem", "parent": "leftArm", "pivot": [6, 15, 1]},
                {"name": "rightLeg", "parent": "root", "pivot": [-1.9, 12, 0], "cubes": [cube([-3.9, 0, -2], [4, 12, 4], [0, 16])]},
                {"name": "leftLeg", "parent": "root", "pivot": [1.9, 12, 0], "cubes": [cube([-0.1, 0, -2], [4, 12, 4], [16, 48])]},
            ],
        }],
    }


GEOS = {
    "goblin": humanoid64(
        "geometry.sl.goblin",
        head_extra=[
            cube([-7, 27, -1], [3, 4, 1], [32, 0], rotation=[0, 0, 25], pivot=[-4, 28, 0]),  # right ear
            cube([4, 27, -1], [3, 4, 1], [40, 0], rotation=[0, 0, -25], pivot=[4, 28, 0]),  # left ear
            cube([-1, 26, -6], [2, 2, 2], [48, 0]),  # nose
        ],
        body_extra=[cube([-3, 9, -2.6], [6, 6, 1], [32, 8])],  # loincloth flap
    ),
    "orc": humanoid64(
        "geometry.sl.orc",
        head_extra=[
            cube([-3, 25, -4.6], [1, 2, 1], [56, 0]),  # tusks
            cube([2, 25, -4.6], [1, 2, 1], [60, 0]),
            cube([-4, 30, -4.8], [8, 1, 2], [32, 0]),  # heavy brow
        ],
        arm_r_extra=[cube([-9, 21, -3], [5, 3, 6], [16, 32])],  # shoulder pads
        arm_l_extra=[cube([4, 21, -3], [5, 3, 6], [16, 32], mirror=True)],
    ),
    "ice_elf": humanoid64(
        "geometry.sl.ice_elf",
        head_extra=[
            cube([-4, 24, -4], [8, 8, 8], [32, 0], inflate=0.5),  # hood
            cube([-7, 28, 0], [3, 1, 1], [56, 16], rotation=[0, 0, 20], pivot=[-4, 28, 0]),  # long ears
            cube([4, 28, 0], [3, 1, 1], [56, 20], rotation=[0, 0, -20], pivot=[4, 28, 0]),
        ],
        body_extra=[cube([-4, 9, 2.1], [8, 14, 1], [16, 32], rotation=[8, 0, 0], pivot=[0, 23, 2])],  # cape
    ),
}


def shadowize(img):
    out = img.copy()
    px = out.load()
    for x in range(out.width):
        for y in range(out.height):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            px[x, y] = (int(22 + 70 * lum), int(10 + 34 * lum), int(48 + 120 * lum), a)
    for (x, y) in ((9, 11), (10, 11), (13, 11), (14, 11)):
        px[x, y] = (120, 235, 255, 255)
    return out


def mob_clients():
    for mid in GEOS:
        anim = {"walk": "animation.sl.humanoid.walk", "look": "animation.sl.look_at_target"}
        write(os.path.join(RP, "entity", "mobs", f"{mid}.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": f"sl:{mid}", "materials": {"default": "entity_alphatest"},
            "textures": {"default": f"textures/sl/mobs/{mid}"}, "geometry": {"default": f"geometry.sl.{mid}"},
            "animations": anim, "scripts": {"animate": list(anim)}, "render_controllers": ["controller.render.sl_mob"],
            "enable_attachables": True, "spawn_egg": {"base_color": "#1a2a1a", "overlay_color": "#55ff88"},
        }}})
        write(os.path.join(RP, "entity", "shadows", f"{mid}.entity.json"), {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": f"sl:shadow_{mid}", "materials": {"default": "entity_alphatest"},
            "textures": {"default": f"textures/sl/entity/shadow_{mid}"}, "geometry": {"default": f"geometry.sl.{mid}"},
            "animations": anim, "scripts": {"animate": list(anim)}, "render_controllers": ["controller.render.sl_shadow_custom"],
            "enable_attachables": True,
        }}})


def mobs():
    os.makedirs(MOBS, exist_ok=True)
    for mid, fn in (("goblin", goblin_tex), ("orc", orc_tex), ("ice_elf", elf_tex)):
        img = fn()
        img.save(os.path.join(MOBS, f"{mid}.png"))
        shadowize(img).save(os.path.join(SHADOW_TEX, f"shadow_{mid}.png"))
        write(os.path.join(RP, "models", "entity", f"sl_{mid}.geo.json"), GEOS[mid])
    mob_clients()


# ================================================================ crafting materials (32x32)
def sprite(name, draw):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw(img.load())
    img = outline(img)
    img.save(os.path.join(ITEMS, f"{name}.png"))


def blob(px, cx, cy, rx, ry, hi, mid, lo, cond=None):
    for y in range(32):
        for x in range(32):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d <= 1 and (cond is None or cond(x, y)):
                k = (dx + dy) * 0.5 + 0.5  # light from top-left
                px[x, y] = (mix(hi, mid, k * 1.4) if k < 0.7 else mix(mid, lo, (k - 0.7) / 0.6)) + (255,)


def horn(px, base, tip, hi, length=20, w0=4.5, curve=0.5):
    for i in range(length * 4):
        t = i / (length * 4)
        x = 8 + t * (length - 2) + math.sin(t * math.pi) * 2
        y = 26 - t * (length - 2) + (t ** 2) * curve * 10
        w = w0 * (1 - t) + 0.6
        for yy in range(int(y - w), int(y + w) + 1):
            for xx in range(int(x - w), int(x + w) + 1):
                if 0 <= xx < 32 and 0 <= yy < 32 and math.hypot(xx - x, yy - y) <= w:
                    side = (xx - x) - (yy - y)
                    c = mix(base, tip, t)
                    px[xx, yy] = (mix(c, hi, 0.5) if side < -w * 0.4 else mul(c, 0.8) if side > w * 0.4 else c) + (255,)


def crystal(px, hi, mid, lo, glow=None):
    pts = [(16, 3), (24, 12), (21, 28), (11, 28), (8, 12)]
    poly = Image.new("L", (32, 32), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(poly).polygon(pts, fill=255)
    m = poly.load()
    for y in range(32):
        for x in range(32):
            if m[x, y]:
                px[x, y] = (hi if x < 16 and y < 16 else mid if x < 16 else lo if y > 18 else mix(mid, lo, 0.5)) + (255,)
    for y in range(5, 26):
        px[16, y] = mul(hi, 1.1) + (255,)
    for (x, y) in ((12, 10), (12, 11), (13, 9)):
        px[x, y] = (255, 255, 255, 255)


def materials():
    sprite("goblin_fang", lambda px: horn(px, (230, 222, 190), (250, 248, 235), (255, 255, 255), length=18, w0=3.6, curve=0.8))
    sprite("orc_tusk", lambda px: horn(px, (215, 200, 160), (250, 244, 225), (255, 255, 250), length=22, w0=5.0, curve=0.3))
    sprite("demon_horn", lambda px: horn(px, (40, 20, 30), (200, 40, 40), (120, 70, 90), length=22, w0=5.0, curve=1.0))
    sprite("frost_essence", lambda px: crystal(px, (235, 250, 255), (140, 210, 250), (60, 130, 210)))
    sprite("mana_crystal", lambda px: crystal(px, (200, 230, 255), (80, 140, 255), (40, 60, 180)))
    sprite("venom_gland", lambda px: blob(px, 16, 17, 10, 9, (190, 255, 120), (90, 190, 60), (30, 90, 30)))

    def core(px):
        blob(px, 16, 16, 11, 11, (255, 140, 120), (180, 20, 30), (40, 0, 10))
        blob(px, 16, 16, 5, 5, (255, 240, 200), (255, 120, 60), (200, 30, 20))
        for a in range(0, 360, 45):
            x = int(16 + math.cos(math.radians(a)) * 13)
            y = int(16 + math.sin(math.radians(a)) * 13)
            if 0 <= x < 32 and 0 <= y < 32:
                px[x, y] = (255, 80, 60, 255)
    sprite("demon_core", core)


def main():
    weapons()
    items()
    materials()
    mobs()
    print("art generated: 5 weapons, 6 items, 3 mobs (+ shadows)")


if __name__ == "__main__":
    main()
