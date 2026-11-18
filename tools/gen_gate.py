#!/usr/bin/env python3
"""Gate (portal) entity: geometry, swirl textures (blue / red), animation,
client + behavior definitions.  python3 tools/gen_gate.py"""
import json
import math
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
S = 40  # disc size in pixels (2.5 blocks)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def swirl(inner, outer, rim, arms=5, twist=9.0, phase=0.0):
    """Circular swirl on transparent background (S x S)."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    c = (S - 1) / 2
    for y in range(S):
        for x in range(S):
            dx, dy = (x - c) / c, (y - c) / c
            r = math.hypot(dx, dy)
            if r > 1.0:
                continue
            a = math.atan2(dy, dx)
            v = 0.5 + 0.5 * math.sin(arms * a + twist * r + phase)
            if r > 0.88:
                col, alpha = rim, 255
            else:
                t = r / 0.88
                base = [inner[i] * (1 - t) + outer[i] * t for i in range(3)]
                k = 0.55 + 0.45 * v
                col = tuple(int(min(255, b * k + (40 if v > 0.85 else 0))) for b in base)
                alpha = 255 if v > 0.25 or r < 0.3 else 0
            img.putpixel((x, y), col + (alpha,) if len(col) == 3 else col)
    return img


def texture(inner, outer, rim, name):
    # Box UV for a 40x40x1 cube: front face at (1,1), back face at (42,1).
    tex = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
    a = swirl(inner, outer, rim)
    tex.paste(a, (1, 1))
    tex.paste(a, (42, 1))
    path = os.path.join(RP, "textures", "sl", "entity", f"{name}.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tex.save(path)


GEO = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {"identifier": "geometry.sl.gate", "texture_width": 128, "texture_height": 64,
                        "visible_bounds_width": 4, "visible_bounds_height": 4, "visible_bounds_offset": [0, 1.5, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "swirl", "parent": "root", "pivot": [0, 26, 0],
             "cubes": [{"origin": [-20, 6, -0.5], "size": [S, S, 1], "uv": [0, 0]}]},
        ],
    }],
}

ANIM = {
    "format_version": "1.8.0",
    "animations": {
        "animation.sl.gate.spin": {"loop": True, "bones": {"swirl": {"rotation": [0, 0, "query.life_time * 80.0"]}}},
    },
}


def client(ident, tex):
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": ident,
            "materials": {"default": "entity_emissive_alpha"},
            "textures": {"default": f"textures/sl/entity/{tex}"},
            "geometry": {"default": "geometry.sl.gate"},
            "animations": {"spin": "animation.sl.gate.spin"},
            "scripts": {"animate": ["spin"]},
            "render_controllers": ["controller.render.sl_gate"],
        }},
    }


RC = {
    "format_version": "1.8.0",
    "render_controllers": {"controller.render.sl_gate": {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"], "ignore_lighting": True,
    }},
}


def behavior(ident):
    return {
        "format_version": "1.21.100",
        "minecraft:entity": {
            "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True},
            "components": {
                "minecraft:type_family": {"family": ["sl_gate", "inanimate"]},
                "minecraft:health": {"value": 1000, "max": 1000},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:collision_box": {"width": 1.6, "height": 3.0},
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
            "events": {"sl:noop": {}},
        },
    }


def main():
    texture((230, 250, 255), (30, 90, 230), (150, 230, 255), "gate_blue")
    texture((255, 230, 220), (200, 20, 30), (255, 120, 90), "gate_red")
    write(os.path.join(RP, "models", "entity", "sl_gate.geo.json"), GEO)
    write(os.path.join(RP, "animations", "sl_gate.animation.json"), ANIM)
    write(os.path.join(RP, "render_controllers", "sl_gate.render_controllers.json"), RC)
    write(os.path.join(RP, "entity", "gate_blue.entity.json"), client("sl:gate_blue", "gate_blue"))
    write(os.path.join(RP, "entity", "gate_red.entity.json"), client("sl:gate_red", "gate_red"))
    write(os.path.join(BP, "entities", "gate_blue.json"), behavior("sl:gate_blue"))
    write(os.path.join(BP, "entities", "gate_red.json"), behavior("sl:gate_red"))
    print("gate generated")


if __name__ == "__main__":
    main()
