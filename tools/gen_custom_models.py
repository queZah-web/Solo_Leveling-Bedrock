#!/usr/bin/env python3
"""Custom models for shadows whose vanilla definitions don't render on
custom entities in recent versions (zombie, creeper).

Everything is our own: geometry, animations, a pre-shadowed texture with
glowing eyes, and the client entity. Nothing references vanilla zombie or
creeper resources.

  python3 tools/gen_custom_models.py <dir with vanilla entity textures (zombie.png, creeper.png)>
"""
import json
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")

EYE = (120, 235, 255, 255)
EYE_EDGE = (40, 150, 220, 255)


def shadow_texture(src, eyes, mouth=()):
    """Dark-purple 'shadow' version of a mob texture, with glowing eyes."""
    img = Image.open(src).convert("RGBA")
    px = img.load()
    for x in range(img.width):
        for y in range(img.height):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            px[x, y] = (int(22 + 70 * lum), int(10 + 34 * lum), int(48 + 120 * lum), 255)
    for (x, y) in mouth:
        px[x, y] = (8, 4, 18, 255)
    for (x, y) in eyes:
        px[x, y] = EYE
    return img


# ---------------------------------------------------------------- geometry
def cube(origin, size, uv, mirror=False, inflate=0):
    c = {"origin": origin, "size": size, "uv": uv}
    if mirror:
        c["mirror"] = True
    if inflate:
        c["inflate"] = inflate
    return c


def humanoid_geo(ident):
    """Classic 64x32 humanoid (zombie layout). Bone names match vanilla so
    armor and held items attach correctly."""
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": ident, "texture_width": 64, "texture_height": 32,
                "visible_bounds_width": 2, "visible_bounds_height": 3, "visible_bounds_offset": [0, 1.5, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "waist", "parent": "root", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "waist", "pivot": [0, 24, 0], "cubes": [cube([-4, 12, -2], [8, 12, 4], [16, 16])]},
                {"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [cube([-4, 24, -4], [8, 8, 8], [0, 0])]},
                {"name": "hat", "parent": "head", "pivot": [0, 24, 0], "cubes": [cube([-4, 24, -4], [8, 8, 8], [32, 0], inflate=0.5)]},
                {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0], "cubes": [cube([-8, 12, -2], [4, 12, 4], [40, 16])]},
                {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
                {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0], "cubes": [cube([4, 12, -2], [4, 12, 4], [40, 16], mirror=True)]},
                {"name": "leftItem", "parent": "leftArm", "pivot": [6, 15, 1]},
                {"name": "rightLeg", "parent": "root", "pivot": [-1.9, 12, 0], "cubes": [cube([-3.9, 0, -2], [4, 12, 4], [0, 16])]},
                {"name": "leftLeg", "parent": "root", "pivot": [1.9, 12, 0], "cubes": [cube([-0.1, 0, -2], [4, 12, 4], [0, 16], mirror=True)]},
            ],
        }],
    }


def creeper_geo(ident):
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": ident, "texture_width": 64, "texture_height": 32,
                "visible_bounds_width": 2, "visible_bounds_height": 2.5, "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "body", "parent": "root", "pivot": [0, 6, 0], "cubes": [cube([-4, 6, -2], [8, 12, 4], [16, 16])]},
                {"name": "head", "parent": "body", "pivot": [0, 18, 0], "cubes": [cube([-4, 18, -4], [8, 8, 8], [0, 0])]},
                {"name": "leg0", "parent": "root", "pivot": [-2, 6, 4], "cubes": [cube([-4, 0, 2], [4, 6, 4], [0, 16])]},
                {"name": "leg1", "parent": "root", "pivot": [2, 6, 4], "cubes": [cube([0, 0, 2], [4, 6, 4], [0, 16])]},
                {"name": "leg2", "parent": "root", "pivot": [-2, 6, -4], "cubes": [cube([-4, 0, -6], [4, 6, 4], [0, 16])]},
                {"name": "leg3", "parent": "root", "pivot": [2, 6, -4], "cubes": [cube([0, 0, -6], [4, 6, 4], [0, 16])]},
            ],
        }],
    }


# ---------------------------------------------------------------- animations
SWING = "math.cos(query.modified_distance_moved * 38.17) * 70.0 * query.modified_move_speed"
ANIMATIONS = {
    "format_version": "1.8.0",
    "animations": {
        "animation.sl.look_at_target": {
            "loop": True,
            "bones": {"head": {"rotation": ["query.target_x_rotation", "query.target_y_rotation", 0.0]}},
        },
        "animation.sl.zombie.move": {
            "loop": True,
            "bones": {
                # Zombie pose: arms forward with a slow sway.
                "rightArm": {"rotation": ["-90.0 + math.sin(query.life_time * 120.0) * 4.0", "-5.0", 0.0]},
                "leftArm": {"rotation": ["-90.0 - math.sin(query.life_time * 120.0) * 4.0", "5.0", 0.0]},
                "rightLeg": {"rotation": [SWING, 0.0, 0.0]},
                "leftLeg": {"rotation": ["-" + SWING, 0.0, 0.0]},
            },
        },
        "animation.sl.creeper.legs": {
            "loop": True,
            "bones": {
                "leg0": {"rotation": [SWING, 0.0, 0.0]},
                "leg3": {"rotation": [SWING, 0.0, 0.0]},
                "leg1": {"rotation": ["-" + SWING, 0.0, 0.0]},
                "leg2": {"rotation": ["-" + SWING, 0.0, 0.0]},
            },
        },
    },
}

RENDER = {
    "format_version": "1.8.0",
    "render_controllers": {
        "controller.render.sl_shadow_custom": {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Texture.default"],
            "ignore_lighting": True,
            "is_hurt_color": {"r": "0.5", "g": "0.2", "b": "1.0", "a": "0.5"},
        }
    },
}


def client(sid, geo, anims):
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": f"sl:shadow_{sid}",
                "materials": {"default": "entity_alphatest"},
                "textures": {"default": f"textures/sl/entity/shadow_{sid}"},
                "geometry": {"default": geo},
                "animations": {k: v for k, v in anims},
                "scripts": {"animate": [k for k, _ in anims]},
                "render_controllers": ["controller.render.sl_shadow_custom"],
                "enable_attachables": True,
            }
        },
    }


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def main(tex_dir):
    # Zombie: eyes on the face (x 8..15, y 8..15 of the head).
    zombie = shadow_texture(os.path.join(tex_dir, "zombie.png"), eyes=[(9, 12), (10, 12), (13, 12), (14, 12)])
    # Creeper: two eyes and the mouth.
    creeper = shadow_texture(
        os.path.join(tex_dir, "creeper.png"),
        eyes=[(9, 10), (10, 10), (9, 11), (10, 11), (13, 10), (14, 10), (13, 11), (14, 11)],
        mouth=[(11, 12), (12, 12), (10, 13), (11, 13), (12, 13), (13, 13), (10, 14), (13, 14), (10, 15), (13, 15)],
    )
    os.makedirs(os.path.join(RP, "textures", "sl", "entity"), exist_ok=True)
    zombie.save(os.path.join(RP, "textures", "sl", "entity", "shadow_zombie.png"))
    creeper.save(os.path.join(RP, "textures", "sl", "entity", "shadow_creeper.png"))

    write(os.path.join(RP, "models", "entity", "sl_shadow_zombie.geo.json"), humanoid_geo("geometry.sl.shadow_zombie"))
    write(os.path.join(RP, "models", "entity", "sl_shadow_creeper.geo.json"), creeper_geo("geometry.sl.shadow_creeper"))
    write(os.path.join(RP, "animations", "sl_shadow.animation.json"), ANIMATIONS)
    write(os.path.join(RP, "render_controllers", "sl_shadow_custom.render_controllers.json"), RENDER)
    write(os.path.join(RP, "entity", "shadows", "zombie.entity.json"), client(
        "zombie", "geometry.sl.shadow_zombie", [("move", "animation.sl.zombie.move"), ("look", "animation.sl.look_at_target")]))
    write(os.path.join(RP, "entity", "shadows", "creeper.entity.json"), client(
        "creeper", "geometry.sl.shadow_creeper", [("legs", "animation.sl.creeper.legs"), ("look", "animation.sl.look_at_target")]))
    print("custom shadow models generated (zombie, creeper)")


if __name__ == "__main__":
    main(sys.argv[1])
