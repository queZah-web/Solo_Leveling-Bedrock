#!/usr/bin/env python3
"""Phase 6 content: monsters (goblin, orc, ice elf), weapons and System items.

Generates textures (pixel art), behavior/client entities, spawn rules, loot
tables, item definitions, the item atlas and names.
  python3 tools/gen_mobs.py
"""
import json
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "packs", "SoloLeveling_RP")
BP = os.path.join(ROOT, "packs", "SoloLeveling_BP")
MOB_TEX = os.path.join(RP, "textures", "sl", "mobs")
ITEM_TEX = os.path.join(RP, "textures", "items", "sl")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------- mob textures (64x32 humanoid)
def noisy(c, rnd, amt=14):
    return tuple(max(0, min(255, v + rnd.randint(-amt, amt))) for v in c) + (255,)


def paint_box(px, rnd, ox, oy, w, h, d, color_fn):
    """Fill every face of a box-UV region with color_fn(face, x, y)."""
    faces = {
        "top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d),
        "right": (ox, oy + d, d, h), "front": (ox + d, oy + d, w, h),
        "left": (ox + d + w, oy + d, d, h), "back": (ox + d + w + d, oy + d, w, h),
    }
    for face, (fx, fy, fw, fh) in faces.items():
        for x in range(fw):
            for y in range(fh):
                px[fx + x, fy + y] = noisy(color_fn(face, x, y, fw, fh), rnd)
    return faces


def mob_texture(name, skin, cloth, cloth2, eye, extra=None):
    rnd = random.Random(name)
    img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    px = img.load()
    hair = extra.get("hair") if extra else None
    # head
    def head(face, x, y, w, h):
        if hair and (face in ("top", "back") or (face in ("right", "left", "front") and y < 2)):
            return hair
        return skin
    faces = paint_box(px, rnd, 0, 0, 8, 8, 8, head)
    fx, fy = faces["front"][0], faces["front"][1]
    for ex in (1, 5):
        px[fx + ex, fy + 4] = eye + (255,)
        px[fx + ex + 1, fy + 4] = eye + (255,)
        px[fx + ex, fy + 3] = tuple(int(c * 0.5) for c in skin) + (255,)  # brow
        px[fx + ex + 1, fy + 3] = tuple(int(c * 0.5) for c in skin) + (255,)
    for mx in range(2, 6):
        px[fx + mx, fy + 6] = (40, 20, 20, 255)
    if extra and extra.get("tusks"):
        px[fx + 2, fy + 5] = (240, 235, 210, 255)
        px[fx + 5, fy + 5] = (240, 235, 210, 255)
    if extra and extra.get("nose"):
        px[fx + 3, fy + 5] = tuple(int(c * 0.8) for c in skin) + (255,)
        px[fx + 4, fy + 5] = tuple(int(c * 0.8) for c in skin) + (255,)
    # body: clothes with a belt
    paint_box(px, rnd, 16, 16, 8, 12, 4, lambda f, x, y, w, h: (60, 40, 25) if y == 7 else cloth if y < 8 else cloth2)
    # arms: skin with cloth sleeves
    paint_box(px, rnd, 40, 16, 4, 12, 4, lambda f, x, y, w, h: cloth if y < 4 else skin)
    # legs
    paint_box(px, rnd, 0, 16, 4, 12, 4, lambda f, x, y, w, h: cloth2 if y < 6 else (55, 40, 30) if y > 9 else skin)
    os.makedirs(MOB_TEX, exist_ok=True)
    img.save(os.path.join(MOB_TEX, f"{name}.png"))


MOBS = {
    # id: texture args, stats, behaviour
    "goblin": dict(
        tex=dict(skin=(95, 150, 60), cloth=(110, 80, 50), cloth2=(80, 60, 40), eye=(255, 220, 40), extra={"nose": True}),
        hp=16, dmg=3, speed=0.32, scale=0.75, size=(0.5, 1.4), ranged=False, family="goblin",
        gear="minecraft:stone_sword", xp=6, weight=10,
        loot=[["minecraft:gold_nugget", 1, 4, 1.0], ["minecraft:leather", 0, 1, 0.5], ["minecraft:emerald", 1, 1, 0.08]],
    ),
    "orc": dict(
        tex=dict(skin=(110, 130, 70), cloth=(80, 85, 95), cloth2=(60, 50, 45), eye=(230, 40, 30), extra={"tusks": True}),
        hp=40, dmg=7, speed=0.25, scale=1.2, size=(0.8, 2.3), ranged=False, family="orc",
        gear="minecraft:iron_axe", xp=15, weight=5,
        loot=[["minecraft:iron_ingot", 1, 3, 0.8], ["minecraft:leather", 1, 3, 0.8], ["minecraft:gold_ingot", 1, 1, 0.15]],
    ),
    "ice_elf": dict(
        tex=dict(skin=(225, 238, 248), cloth=(70, 130, 210), cloth2=(230, 240, 255), eye=(60, 230, 255), extra={"hair": (245, 250, 255)}),
        hp=28, dmg=4, speed=0.3, scale=1.0, size=(0.6, 1.95), ranged=True, family="ice_elf",
        gear="minecraft:bow", xp=12, weight=4,
        loot=[["minecraft:arrow", 2, 6, 1.0], ["minecraft:packed_ice", 1, 2, 0.5], ["minecraft:diamond", 1, 1, 0.05]],
    ),
}


def mob_behavior(mid, m):
    c = {
        "minecraft:type_family": {"family": [m["family"], "monster", "mob"]},
        "minecraft:health": {"value": m["hp"], "max": m["hp"]},
        "minecraft:attack": {"damage": m["dmg"]},
        "minecraft:movement": {"value": m["speed"]},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_damage_blocks": True, "can_open_doors": True},
        "minecraft:collision_box": {"width": m["size"][0], "height": m["size"][1]},
        "minecraft:scale": {"value": m["scale"]},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:breathable": {"breathes_air": True, "suffocate_time": 0, "total_supply": 15},
        "minecraft:nameable": {},
        "minecraft:despawn": {"despawn_from_distance": {}},
        "minecraft:experience_reward": {"on_death": f"query.last_hit_by_player ? {m['xp']} : 0"},
        "minecraft:loot": {"table": f"loot_tables/sl/{mid}.json"},
        "minecraft:equipment": {"table": f"loot_tables/sl/{mid}_gear.json"},
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.nearest_attackable_target": {
            "priority": 2, "must_see": True, "reselect_targets": True, "within_radius": 24,
            "entity_types": [
                {"filters": {"test": "is_family", "subject": "other", "value": "player"}, "max_dist": 24},
                {"filters": {"test": "is_family", "subject": "other", "value": "sl_shadow"}, "max_dist": 16},
                {"filters": {"test": "is_family", "subject": "other", "value": "villager"}, "max_dist": 16},
            ],
        },
        "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.9},
        "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 8},
        "minecraft:behavior.random_look_around": {"priority": 8},
    }
    if m["ranged"]:
        c["minecraft:shooter"] = {"def": "minecraft:arrow"}
        c["minecraft:behavior.ranged_attack"] = {"priority": 3, "attack_interval_min": 1.2, "attack_interval_max": 2.2, "attack_radius": 16}
    else:
        c["minecraft:behavior.melee_attack"] = {"priority": 3, "speed_multiplier": 1.2, "track_target": True}
    return {"format_version": "1.21.100", "minecraft:entity": {
        "description": {"identifier": f"sl:{mid}", "is_spawnable": True, "is_summonable": True},
        "components": c,
    }}


def mob_client(mid):
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": f"sl:{mid}",
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": f"textures/sl/mobs/{mid}"},
        "geometry": {"default": "geometry.sl.shadow_zombie"},  # our 64x32 humanoid model
        "animations": {"walk": "animation.sl.humanoid.walk", "look": "animation.sl.look_at_target"},
        "scripts": {"animate": ["walk", "look"]},
        "render_controllers": ["controller.render.sl_mob"],
        "enable_attachables": True,
        "spawn_egg": {"base_color": "#1a2a1a", "overlay_color": "#55ff88"},
    }}}


def spawn_rules(mid, m):
    biomes = {"ice_elf": {"any_of": [{"test": "has_biome_tag", "value": "frozen"}, {"test": "has_biome_tag", "value": "cold"}]}}
    cond = {
        "minecraft:spawns_on_surface": {},
        "minecraft:spawns_underground": {},
        "minecraft:brightness_filter": {"min": 0, "max": 7, "adjust_for_weather": True},
        "minecraft:difficulty_filter": {"min": "easy", "max": "hard"},
        "minecraft:weight": {"default": m["weight"]},
        "minecraft:herd": {"min_size": 1, "max_size": 3 if mid == "goblin" else 1},
        "minecraft:biome_filter": biomes.get(mid, {"test": "has_biome_tag", "value": "monster"}),
    }
    return {"format_version": "1.8.0", "minecraft:spawn_rules": {
        "description": {"identifier": f"sl:{mid}", "population_control": "monster"}, "conditions": [cond]}}


def loot(entries):
    return {"pools": [{"rolls": 1, "entries": [{"type": "item", "name": n, "weight": 1, "functions": [
        {"function": "set_count", "count": {"min": a, "max": b}}]}], "conditions": [
        {"condition": "random_chance", "chance": ch}]} for n, a, b, ch in entries]}


def gear(item):
    return {"pools": [{"rolls": 1, "entries": [{"type": "item", "name": item, "weight": 1}]}]}


# ---------------------------------------------------------------- items
WEAPONS = {
    "kasaka_fang": ("Kasaka's Venom Fang", 6, (120, 200, 90), (40, 90, 30)),
    "knight_killer": ("Knight Killer", 7, (200, 210, 225), (90, 95, 110)),
    "baruka_dagger": ("Baruka's Dagger", 9, (150, 220, 255), (40, 90, 160)),
    "demon_king_dagger": ("Demon King's Dagger", 11, (200, 60, 255), (60, 10, 90)),
    "demon_king_longsword": ("Demon King's Longsword", 13, (255, 70, 70), (80, 10, 20)),
}
CONSUMABLES = {
    "healing_elixir": ("Healing Elixir", (235, 50, 70)),
    "mana_potion": ("Mana Potion", (60, 120, 255)),
    "fatigue_potion": ("Fatigue Recovery Potion", (90, 230, 120)),
    "elixir_of_life": ("Elixir of Life", (255, 210, 60)),
}
USABLES = {
    "random_box": "Random Box",
    "dungeon_key": "Instant Dungeon Key",
}


def blade_icon(name, blade, dark, long=False):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    n = 12 if long else 9
    for i in range(n):
        x, y = 14 - i, 1 + i
        d.point((x, y), fill=blade + (255,))
        d.point((x - 1, y), fill=dark + (255,))
        if long:
            d.point((x, y + 1), fill=dark + (255,))
    hx, hy = 14 - n, 1 + n
    d.line([(hx - 2, hy - 2), (hx + 2, hy + 2)], fill=(200, 170, 60, 255))  # guard
    d.line([(hx, hy), (hx - 3, hy + 3)], fill=(90, 50, 30, 255), width=2)  # grip
    img.save(os.path.join(ITEM_TEX, f"{name}.png"))


def bottle_icon(name, col):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([6, 1, 9, 3], fill=(150, 110, 70, 255))
    d.rectangle([6, 4, 9, 5], fill=(210, 230, 240, 200))
    d.ellipse([3, 5, 12, 14], fill=col + (255,), outline=(220, 240, 255, 255))
    d.point((5, 8), fill=(255, 255, 255, 255))
    d.point((5, 9), fill=(255, 255, 255, 255))
    img.save(os.path.join(ITEM_TEX, f"{name}.png"))


def box_icon():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([2, 5, 13, 14], fill=(90, 40, 140, 255), outline=(200, 140, 255, 255))
    d.rectangle([1, 3, 14, 6], fill=(120, 60, 180, 255), outline=(200, 140, 255, 255))
    d.rectangle([7, 3, 8, 14], fill=(255, 210, 80, 255))
    d.text((5, 6), "?", fill=(255, 255, 255, 255))
    img.save(os.path.join(ITEM_TEX, "random_box.png"))


def key_icon():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([1, 1, 7, 7], outline=(120, 220, 255, 255), width=2)
    d.line([(6, 6), (14, 14)], fill=(120, 220, 255, 255), width=2)
    d.line([(11, 11), (13, 9)], fill=(120, 220, 255, 255), width=2)
    d.line([(13, 13), (15, 11)], fill=(120, 220, 255, 255), width=1)
    img.save(os.path.join(ITEM_TEX, "dungeon_key.png"))


def weapon_item(iid, dmg):
    return {"format_version": "1.21.100", "minecraft:item": {
        "description": {"identifier": f"sl:{iid}", "menu_category": {"category": "equipment"}},
        "components": {
            "minecraft:icon": f"sl_{iid}",
            "minecraft:display_name": {"value": f"item.sl:{iid}.name"},
            "minecraft:max_stack_size": 1,
            "minecraft:hand_equipped": True,
            "minecraft:damage": dmg,
            "minecraft:enchantable": {"slot": "sword", "value": 15},
            "minecraft:rarity": "epic" if "demon" in iid else "rare",
            "minecraft:tags": {"tags": ["minecraft:is_sword", "sl:weapon"]},
        },
    }}


def consumable_item(iid):
    return {"format_version": "1.21.100", "minecraft:item": {
        "description": {"identifier": f"sl:{iid}", "menu_category": {"category": "items"}},
        "components": {
            "minecraft:icon": f"sl_{iid}",
            "minecraft:display_name": {"value": f"item.sl:{iid}.name"},
            "minecraft:max_stack_size": 16,
            "minecraft:food": {"nutrition": 0, "saturation_modifier": 0, "can_always_eat": True},
            "minecraft:use_modifiers": {"use_duration": 1.0, "movement_modifier": 0.6},
            "minecraft:use_animation": "drink",
            "minecraft:rarity": "rare",
        },
    }}


def usable_item(iid):
    return {"format_version": "1.21.100", "minecraft:item": {
        "description": {"identifier": f"sl:{iid}", "menu_category": {"category": "items"}},
        "components": {
            "minecraft:icon": f"sl_{iid}",
            "minecraft:display_name": {"value": f"item.sl:{iid}.name"},
            "minecraft:max_stack_size": 16,
            "minecraft:glint": iid == "dungeon_key",
            "minecraft:rarity": "epic",
        },
    }}


def main():
    os.makedirs(ITEM_TEX, exist_ok=True)
    for mid, m in MOBS.items():
        mob_texture(mid, **m["tex"])
        write(os.path.join(BP, "entities", "mobs", f"{mid}.json"), mob_behavior(mid, m))
        write(os.path.join(RP, "entity", "mobs", f"{mid}.entity.json"), mob_client(mid))
        write(os.path.join(BP, "spawn_rules", f"{mid}.json"), spawn_rules(mid, m))
        write(os.path.join(BP, "loot_tables", "sl", f"{mid}.json"), loot(m["loot"]))
        write(os.path.join(BP, "loot_tables", "sl", f"{mid}_gear.json"), gear(m["gear"]))
    write(os.path.join(RP, "render_controllers", "sl_mob.render_controllers.json"), {
        "format_version": "1.8.0",
        "render_controllers": {"controller.render.sl_mob": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
            "is_hurt_color": {"r": "1.0", "g": "0.2", "b": "0.2", "a": "0.5"},
        }},
    })
    names = {}
    for iid, (name, dmg, blade, dark) in WEAPONS.items():
        blade_icon(iid, blade, dark, long="longsword" in iid)
        write(os.path.join(BP, "items", f"{iid}.json"), weapon_item(iid, dmg))
        names[iid] = name
    for iid, (name, col) in CONSUMABLES.items():
        bottle_icon(iid, col)
        write(os.path.join(BP, "items", f"{iid}.json"), consumable_item(iid))
        names[iid] = name
    box_icon()
    key_icon()
    for iid, name in USABLES.items():
        write(os.path.join(BP, "items", f"{iid}.json"), usable_item(iid))
        names[iid] = name
    # item atlas
    atlas_path = os.path.join(RP, "textures", "item_texture.json")
    atlas = json.load(open(atlas_path))
    for iid in names:
        atlas["texture_data"][f"sl_{iid}"] = {"textures": f"textures/items/sl/{iid}"}
    write(atlas_path, atlas)
    # names (+ mob names for spawn eggs / death messages)
    lang_path = os.path.join(RP, "texts", "en_US.lang")
    lines = [l for l in open(lang_path).read().splitlines() if l and not l.startswith(("item.sl:", "entity.sl:", "item.spawn_egg.entity.sl:"))]
    lines.insert(0, "item.sl:system_gem.name=§5System Gem")
    colors = {"kasaka": "§a", "knight": "§f", "baruka": "§b", "demon": "§5", "healing": "§c", "mana": "§9", "fatigue": "§a", "elixir": "§6",
              "random": "§d", "dungeon": "§b"}
    for iid, name in names.items():
        col = next((v for k, v in colors.items() if iid.startswith(k)), "§f")
        lines.append(f"item.sl:{iid}.name={col}{name}")
    for mid, label in (("goblin", "Goblin"), ("orc", "Orc"), ("ice_elf", "Ice Elf")):
        lines.append(f"entity.sl:{mid}.name={label}")
        lines.append(f"item.spawn_egg.entity.sl:{mid}.name={label} Spawn Egg")
    with open(lang_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{len(MOBS)} mobs, {len(names)} items generated")


if __name__ == "__main__":
    main()
