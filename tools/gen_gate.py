#!/usr/bin/env python3
"""Gate entity (one type, colour variants): a 7-block vortex of three spinning
layers and a pulsing core, with an opening animation. All motion is done by
client animations, so gates cost the server nothing.

  python3 tools/gen_gate.py
"""
import json
import math
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
T = 64  # texture size of one layer

# variant index -> (name, inner, outer, rim)
COLORS = [
    ("blue", (230, 250, 255), (30, 90, 230), (150, 230, 255)),
    ("green", (230, 255, 235), (20, 170, 70), (150, 255, 170)),
    ("pink", (255, 235, 250), (215, 60, 170), (255, 160, 225)),
    ("red", (255, 235, 220), (220, 30, 30), (255, 130, 100)),
    ("crimson", (255, 170, 150), (100, 0, 12), (210, 20, 35)),
]


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def layer(inner, outer, rim, arms, twist, phase, cut, rim_w):
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    c = (T - 1) / 2
    for y in range(T):
        for x in range(T):
            dx, dy = (x - c) / c, (y - c) / c
            r = math.hypot(dx, dy)
            if r > 1.0:
                continue
            a = math.atan2(dy, dx)
            v = 0.5 + 0.5 * math.sin(arms * a + twist * r + phase)
            if rim_w and r > 1 - rim_w:
                k = (r - (1 - rim_w)) / rim_w
                col = tuple(int(rim[i] * (1 - 0.4 * k)) for i in range(3))
                img.putpixel((x, y), col + (255,))
                continue
            t = min(1.0, r)
            base = [inner[i] * (1 - t) + outer[i] * t for i in range(3)]
            k = 0.5 + 0.5 * v
            col = tuple(int(min(255, base[i] * k + (60 if v > 0.88 else 0))) for i in range(3))
            if v > cut or r < 0.18:
                img.putpixel((x, y), col + (255,))
    return img


def core(inner, outer):
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    c = (T - 1) / 2
    for y in range(T):
        for x in range(T):
            r = math.hypot((x - c) / c, (y - c) / c)
            if r > 1.0:
                continue
            t = r ** 1.5
            col = tuple(int(255 * (1 - t) + inner[i] * t * 0.6 + outer[i] * t * 0.4) for i in range(3))
            if r < 0.75 or (x + y) % 2 == 0:
                img.putpixel((x, y), col + (255,))
    return img


def sheet(inner, outer, rim):
    """3 layers side by side: outer swirl, mid swirl, core."""
    s = Image.new("RGBA", (T * 3, T), (0, 0, 0, 0))
    s.paste(layer(inner, outer, rim, 5, 9.0, 0.0, 0.22, 0.09), (0, 0))
    s.paste(layer(inner, outer, rim, 3, -7.0, 1.4, 0.45, 0.0), (T, 0))
    s.paste(core(inner, outer), (T * 2, 0))
    return s


def disc(name, size, z, layer_index):
    uv = [layer_index * T, 0]
    face = {"uv": uv, "uv_size": [T, T]}
    return {
        "name": name, "parent": "root", "pivot": [0, 64, z + 0.5],
        "cubes": [{"origin": [-size / 2, 64 - size / 2, z], "size": [size, size, 1], "uv": {"north": face, "south": face}}],
    }


GEO = {
    "format_version": "1.16.0",
    "minecraft:geometry": [{
        "description": {"identifier": "geometry.sl.gate", "texture_width": T * 3, "texture_height": T,
                        "visible_bounds_width": 9, "visible_bounds_height": 9, "visible_bounds_offset": [0, 4, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            disc("outer", 112, -0.5, 0),
            disc("mid", 86, -1.5, 1),
            disc("core", 38, -2.5, 2),
        ],
    }],
}

ANIM = {
    "format_version": "1.8.0",
    "animations": {
        "animation.sl.gate.idle": {
            "loop": True,
            "bones": {
                # Opening: grows over the first 3 seconds of its life.
                "root": {"scale": "math.min(1.0, query.life_time / 3.0) * (1.0 + math.sin(query.life_time * 40.0) * 0.015)"},
                "outer": {"rotation": [0, 0, "query.life_time * 35.0"]},
                "mid": {"rotation": [0, 0, "-query.life_time * 70.0"]},
                "core": {"rotation": [0, 0, "query.life_time * 120.0"],
                         "scale": "0.9 + math.sin(query.life_time * 160.0) * 0.12"},
            },
        },
    },
}


def client():
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": "sl:gate",
            "materials": {"default": "entity_emissive_alpha"},
            "textures": {name: f"textures/sl/entity/gate_{name}" for name, *_ in COLORS},
            "geometry": {"default": "geometry.sl.gate"},
            "animations": {"idle": "animation.sl.gate.idle"},
            "scripts": {"animate": ["idle"]},
            "render_controllers": ["controller.render.sl_gate"],
        }},
    }


RC = {
    "format_version": "1.8.0",
    "render_controllers": {"controller.render.sl_gate": {
        "arrays": {"textures": {"Array.colors": [f"Texture.{name}" for name, *_ in COLORS]}},
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.colors[query.variant]"],
        "ignore_lighting": True,
    }},
}


def behavior():
    groups = {f"sl:color_{i}": {"minecraft:variant": {"value": i}} for i in range(len(COLORS))}
    # Small gates are the exits inside dungeons.
    groups["sl:small"] = {"minecraft:scale": {"value": 0.4}, "minecraft:collision_box": {"width": 1.2, "height": 3.0}}
    events = {f"sl:color_{i}": {"add": {"component_groups": [f"sl:color_{i}"]}} for i in range(len(COLORS))}
    events["sl:small"] = {"add": {"component_groups": ["sl:small"]}}
    events["sl:noop"] = {}
    return {
        "format_version": "1.21.100",
        "minecraft:entity": {
            "description": {"identifier": "sl:gate", "is_spawnable": False, "is_summonable": True},
            "component_groups": groups,
            "components": {
                "minecraft:type_family": {"family": ["sl_gate", "inanimate"]},
                "minecraft:variant": {"value": 0},
                "minecraft:health": {"value": 1000, "max": 1000},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:collision_box": {"width": 3.0, "height": 7.0},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1},
                "minecraft:persistent": {},
                "minecraft:fire_immune": True,
                "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": -1},
                "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
                "minecraft:interact": {"interactions": [{
                    "interact_text": "action.interact.sl_gate",
                    "on_interact": {"event": "sl:noop", "target": "self"},
                }]},
            },
            "events": events,
        },
    }


def icons():
    """32x32 UI icons per colour."""
    out = os.path.join(RP, "textures", "sl", "gates")
    os.makedirs(out, exist_ok=True)
    for name, inner, outer, rim in COLORS:
        bg = Image.new("RGBA", (32, 32), (8, 10, 24, 255))
        sw = layer(inner, outer, rim, 5, 9.0, 0.0, 0.22, 0.12).resize((28, 28), Image.NEAREST)
        bg.alpha_composite(sw, (2, 2))
        bg.save(os.path.join(out, f"{name}.png"))


def main():
    tex_dir = os.path.join(RP, "textures", "sl", "entity")
    os.makedirs(tex_dir, exist_ok=True)
    for name, inner, outer, rim in COLORS:
        sheet(inner, outer, rim).save(os.path.join(tex_dir, f"gate_{name}.png"))
    for old in ("gate_blue_inner.png", "gate_red_inner.png"):
        p = os.path.join(tex_dir, old)
        if os.path.exists(p):
            os.remove(p)
    for old in (os.path.join(RP, "entity", "gate_blue.entity.json"), os.path.join(RP, "entity", "gate_red.entity.json"),
                os.path.join(BP, "entities", "gate_blue.json"), os.path.join(BP, "entities", "gate_red.json")):
        if os.path.exists(old):
            os.remove(old)
    write(os.path.join(RP, "models", "entity", "sl_gate.geo.json"), GEO)
    write(os.path.join(RP, "animations", "sl_gate.animation.json"), ANIM)
    write(os.path.join(RP, "render_controllers", "sl_gate.render_controllers.json"), RC)
    write(os.path.join(RP, "entity", "gate.entity.json"), client())
    write(os.path.join(BP, "entities", "gate.json"), behavior())
    icons()
    print("gate generated (5 colours)")


if __name__ == "__main__":
    main()
