#!/usr/bin/env python3
"""Gate bosses with custom models: Beru (S-rank) and Igris (A-rank).
Hostile mobs with a boss bar. Their shadows (ARISE) become the named shadows.
  python3 tools/gen_bosses.py   (after gen_beru.py and gen_igris.py)
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")

BOSSES = {
    # id: hp, damage, speed, (w, h), boss bar name
    "boss_beru": (320, 16, 0.32, (0.9, 3.0), "Beru, the Ant King"),
    "boss_igris": (240, 13, 0.3, (0.8, 2.8), "Igris the Bloodred"),
}


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def behavior(bid, hp, dmg, speed, size, name):
    return {"format_version": "1.21.100", "minecraft:entity": {
        "description": {"identifier": f"sl:{bid}", "is_spawnable": False, "is_summonable": True},
        "components": {
            "minecraft:type_family": {"family": ["sl_boss_mob", "monster", "mob"]},
            "minecraft:health": {"value": hp, "max": hp},
            "minecraft:attack": {"damage": dmg},
            "minecraft:movement": {"value": speed},
            "minecraft:movement.basic": {},
            "minecraft:jump.static": {},
            "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_damage_blocks": True},
            "minecraft:collision_box": {"width": size[0], "height": size[1]},
            "minecraft:physics": {},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:knockback_resistance": {"value": 0.9},
            "minecraft:fire_immune": True,
            "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": -1},
            "minecraft:persistent": {},
            "minecraft:nameable": {"always_show": True},
            "minecraft:follow_range": {"value": 32, "max": 48},
            "minecraft:boss": {"should_darken_sky": False, "hud_range": 40, "name": name},
            "minecraft:damage_sensor": {"triggers": [{"cause": "fall", "deals_damage": "no"}]},
            "minecraft:equipment": {"table": "loot_tables/sl/empty.json"},
            "minecraft:behavior.float": {"priority": 0},
            "minecraft:behavior.hurt_by_target": {"priority": 1},
            "minecraft:behavior.nearest_attackable_target": {
                "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 32,
                "entity_types": [
                    {"filters": {"test": "is_family", "subject": "other", "value": "player"}, "max_dist": 32},
                    {"filters": {"test": "is_family", "subject": "other", "value": "sl_shadow"}, "max_dist": 24},
                ],
            },
            "minecraft:behavior.melee_attack": {"priority": 3, "speed_multiplier": 1.25, "track_target": True},
            "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.8},
            "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 12},
        },
    }}


def main():
    for bid, (hp, dmg, speed, size, name) in BOSSES.items():
        write(os.path.join(BP, "entities", "bosses", f"{bid}.json"), behavior(bid, hp, dmg, speed, size, name))
    # Beru boss: same look as the shadow Beru
    beru = json.load(open(os.path.join(RP, "entity", "shadows", "warden.entity.json")))
    beru["minecraft:client_entity"]["description"]["identifier"] = "sl:boss_beru"
    write(os.path.join(RP, "entity", "boss_beru.entity.json"), beru)
    print("bosses generated")


if __name__ == "__main__":
    main()
