#!/usr/bin/env python3
"""Generates the shadow soldier entities (behavior + client definitions).

Each shadow reuses the vanilla mob's model and animations, rendered with a
dark "shadow" overlay. Behaviour: follows its owner, protects them, and
attacks monsters.

  python3 tools/gen_shadows.py <dir with vanilla client entity json files>
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")

# id: (base health, melee damage, speed, (width, height), ranged)
SHADOWS = {
    "zombie": (24, 4, 0.25, (0.6, 1.9), False),
    "husk": (26, 4, 0.25, (0.6, 1.9), False),
    "drowned": (24, 4, 0.25, (0.6, 1.9), False),
    "skeleton": (22, 3, 0.25, (0.6, 1.99), True),
    "stray": (22, 3, 0.25, (0.6, 1.99), True),
    "wither_skeleton": (30, 7, 0.27, (0.7, 2.4), False),
    "spider": (20, 3, 0.32, (1.4, 0.9), False),
    "enderman": (40, 7, 0.32, (0.6, 2.9), False),
    "vindicator": (28, 8, 0.3, (0.6, 1.9), False),
    "iron_golem": (100, 14, 0.25, (1.4, 2.9), False),
    "wolf": (20, 4, 0.35, (0.6, 0.85), False),
    "ravager": (100, 12, 0.3, (1.95, 2.2), False),
    "warden": (300, 30, 0.3, (0.9, 2.9), False),
}


def load(path):
    text = open(path, encoding="utf-8-sig").read()
    return json.loads(re.sub(r"^\s*//.*$", "", text, flags=re.M))


def not_shadow_or_owner():
    return [
        {"test": "is_family", "subject": "other", "value": "monster"},
        {"test": "is_family", "subject": "other", "operator": "!=", "value": "sl_shadow"},
    ]


def behavior(sid, hp, dmg, speed, size, ranged):
    c = {
        "minecraft:type_family": {"family": ["sl_shadow", "mob"]},
        "minecraft:health": {"value": hp, "max": hp},
        "minecraft:attack": {"damage": dmg},
        "minecraft:movement": {"value": speed},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:collision_box": {"width": size[0], "height": size[1]},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": -1},
        "minecraft:fire_immune": True,
        "minecraft:knockback_resistance": {"value": 0.4},
        "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
        "minecraft:persistent": {},
        "minecraft:tameable": {"probability": 0, "tame_items": "minecraft:barrier"},
        "minecraft:is_tamed": {},
        "minecraft:follow_range": {"value": 24, "max": 32},
        "minecraft:damage_sensor": {
            "triggers": [
                {"on_damage": {"filters": {"test": "is_family", "subject": "other", "value": "sl_shadow"}}, "deals_damage": "no"},
                {"cause": "fall", "deals_damage": "no"},
                {"cause": "suffocation", "deals_damage": "no"},
                {"cause": "drowning", "deals_damage": "no"},
                {"cause": "fire", "deals_damage": "no"},
                {"cause": "fire_tick", "deals_damage": "no"},
            ]
        },
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.owner_hurt_by_target": {"priority": 1},
        "minecraft:behavior.owner_hurt_target": {"priority": 2},
        "minecraft:behavior.hurt_by_target": {
            "priority": 2,
            "entity_types": {"filters": {"all_of": [
                {"test": "is_family", "subject": "other", "operator": "!=", "value": "player"},
                {"test": "is_family", "subject": "other", "operator": "!=", "value": "sl_shadow"},
            ]}},
        },
        "minecraft:behavior.nearest_attackable_target": {
            "priority": 3,
            "must_see": True,
            "reselect_targets": True,
            "within_radius": 16,
            "entity_types": [{"filters": {"all_of": not_shadow_or_owner()}, "max_dist": 16}],
        },
        "minecraft:behavior.follow_owner": {"priority": 4, "speed_multiplier": 1.25, "start_distance": 7, "stop_distance": 3},
        "minecraft:behavior.random_stroll": {"priority": 7, "speed_multiplier": 0.8},
        "minecraft:behavior.look_at_player": {"priority": 8, "look_distance": 8},
        "minecraft:behavior.random_look_around": {"priority": 9},
    }
    if sid == "spider":
        c["minecraft:navigation.climb"] = {"can_path_over_water": True, "avoid_damage_blocks": True}
    else:
        c["minecraft:navigation.walk"] = {"can_path_over_water": True, "avoid_damage_blocks": True, "can_open_doors": True, "can_float": True}
    if ranged:
        c["minecraft:shooter"] = {"def": "minecraft:arrow"}
        c["minecraft:behavior.ranged_attack"] = {"priority": 3, "attack_interval_min": 1.0, "attack_interval_max": 2.0, "attack_radius": 15.0}
    else:
        c["minecraft:behavior.melee_attack"] = {"priority": 3, "speed_multiplier": 1.3, "track_target": True}
    return {
        "format_version": "1.21.100",
        "minecraft:entity": {
            "description": {"identifier": f"sl:shadow_{sid}", "is_spawnable": False, "is_summonable": True},
            "components": c,
        },
    }


def client(sid, vanilla_dir):
    src = load(os.path.join(vanilla_dir, f"{sid}.entity.json"))
    fmt = src.get("format_version", "1.10.0")
    d = src["minecraft:client_entity"]["description"]
    mats = d.get("materials", {})
    out = {
        "identifier": f"sl:shadow_{sid}",
        "materials": {"default": mats.get("default") or next(iter(mats.values()), "entity_alphatest")},
        "textures": {"default": d["textures"]["default"]},
        "geometry": {"default": d["geometry"]["default"]},
        "render_controllers": ["controller.render.sl_shadow"],
    }
    for k in ("min_engine_version", "scripts", "animations", "animation_controllers", "enable_attachables",
              "sound_effects", "particle_effects"):
        if k in d:
            out[k] = d[k]
    return {"format_version": fmt, "minecraft:client_entity": {"description": out}}


def main(vanilla_dir):
    os.makedirs(os.path.join(BP, "entities", "shadows"), exist_ok=True)
    os.makedirs(os.path.join(RP, "entity", "shadows"), exist_ok=True)
    os.makedirs(os.path.join(RP, "render_controllers"), exist_ok=True)
    for sid, (hp, dmg, speed, size, ranged) in SHADOWS.items():
        with open(os.path.join(BP, "entities", "shadows", f"{sid}.json"), "w") as f:
            json.dump(behavior(sid, hp, dmg, speed, size, ranged), f, indent=2)
        with open(os.path.join(RP, "entity", "shadows", f"{sid}.entity.json"), "w") as f:
            json.dump(client(sid, vanilla_dir), f, indent=2)
    rc = {
        "format_version": "1.8.0",
        "render_controllers": {
            "controller.render.sl_shadow": {
                "geometry": "Geometry.default",
                "materials": [{"*": "Material.default"}],
                "textures": ["Texture.default"],
                "overlay_color": {"r": "0.04", "g": "0.0", "b": "0.12", "a": "0.8"},
                "is_hurt_color": {"r": "0.5", "g": "0.2", "b": "1.0", "a": "0.5"},
            }
        },
    }
    with open(os.path.join(RP, "render_controllers", "sl_shadow.render_controllers.json"), "w") as f:
        json.dump(rc, f, indent=2)
    print(f"{len(SHADOWS)} shadow entities generated")


if __name__ == "__main__":
    main(sys.argv[1])
