#!/usr/bin/env python3
"""Generates packs/SoloLeveling_BP/scripts/vault/icons.js: item id -> icon texture path.

Form buttons can only show textures by path, so every vanilla item id is mapped
to a vanilla texture (items -> item_texture.json, blocks -> blocks.json +
terrain_texture.json). Unknown items fall back to a generic icon at runtime.

Inputs (from Mojang/bedrock-samples and @minecraft/vanilla-data of the target version):
  python3 tools/gen_icons.py <item_texture.json> <terrain_texture.json> <blocks.json> <mojang-item.d.ts>
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packs", "SoloLeveling_BP", "scripts", "vault", "icons.js")

# Item ids whose texture short name differs from the id.
OVERRIDES = {
    "golden_apple": "apple_golden",
    "enchanted_golden_apple": "apple_golden",
    "cooked_beef": "beef_cooked",
    "beef": "beef_raw",
    "cooked_chicken": "chicken_cooked",
    "chicken": "chicken_raw",
    "cooked_porkchop": "porkchop_cooked",
    "porkchop": "porkchop_raw",
    "cooked_mutton": "mutton_cooked",
    "mutton": "mutton_raw",
    "cooked_rabbit": "rabbit_cooked",
    "rabbit": "rabbit_raw",
    "cooked_cod": "fish_cooked",
    "cod": "fish_raw",
    "cooked_salmon": "fish_salmon_cooked",
    "salmon": "fish_salmon_raw",
    "tropical_fish": "fish_clownfish_raw",
    "lodestone_compass": "lodestonecompass_item_00",
    "grass_block": "grass_side_carried",
    "sea_lantern": "sea_lantern",
    "iron_chain": "chain",
    "pufferfish": "fish_pufferfish_raw",
    "golden_carrot": "carrot_golden",
    "baked_potato": "potato_baked",
    "poisonous_potato": "potato_poisonous",
    "glistering_melon_slice": "melon_speckled",
    "melon_slice": "melon",
    "bow": "bow_standby",
    "crossbow": "crossbow_standby",
    "fishing_rod": "fishing_rod_uncast",
    "clock": "clock_item",
    "compass": "compass_item",
    "recovery_compass": "recovery_compass_item",
    "filled_map": "map_filled",
    "empty_map": "map_empty",
    "potion": "potion_bottle_drinkable",
    "splash_potion": "potion_bottle_splash",
    "lingering_potion": "potion_bottle_lingering",
    "glass_bottle": "potion_bottle_empty",
    "experience_bottle": "experience_bottle",
    "water_bucket": "bucket_water",
    "lava_bucket": "bucket_lava",
    "milk_bucket": "bucket_milk",
    "powder_snow_bucket": "bucket_powder_snow",
    "bucket": "bucket_empty",
    "writable_book": "book_writable",
    "written_book": "book_written",
    "enchanted_book": "book_enchanted",
    "book": "book_normal",
    "fire_charge": "fireball",
    "firework_rocket": "fireworks",
    "firework_star": "fireworks_charge",
    "ender_eye": "ender_eye",
    "glow_ink_sac": "dye_powder_glow",
    "ink_sac": "dye_powder_black",
    "bone_meal": "dye_powder_white",
    "cocoa_beans": "dye_powder_brown",
    "lapis_lazuli": "dye_powder_blue",
    "spawn_egg": "spawn_egg",
    "leather_helmet": "leather_helmet",
    "turtle_helmet": "turtle_helmet",
    "wheat_seeds": "seeds_wheat",
    "pumpkin_seeds": "seeds_pumpkin",
    "melon_seeds": "seeds_melon",
    "beetroot_seeds": "seeds_beetroot",
    "rotten_flesh": "rotten_flesh",
    "gold_nugget": "gold_nugget",
    "golden_horse_armor": "gold_horse_armor",
    "iron_horse_armor": "iron_horse_armor",
    "diamond_horse_armor": "diamond_horse_armor",
    "leather_horse_armor": "leather_horse_armor",
    "minecart": "minecart_normal",
    "chest_minecart": "minecart_chest",
    "hopper_minecart": "minecart_hopper",
    "tnt_minecart": "minecart_tnt",
    "command_block_minecart": "minecart_command_block",
    "music_disc_13": "record_13",
    "trident": "trident",
    "redstone": "redstone_dust",
    "glowstone_dust": "glowstone_dust",
    "sugar_cane": "reeds",
    "nether_wart": "nether_wart",
    "brewing_stand": "brewing_stand",
    "cauldron": "cauldron",
    "flower_pot": "flower_pot",
    "item_frame": "item_frame",
    "glow_frame": "glow_item_frame",
    "armor_stand": "armor_stand",
    "chain": "chain",
    "campfire": "campfire",
    "soul_campfire": "soul_campfire",
    "wooden_door": "door_wood",
    "oak_door": "door_wood",
    "iron_door": "door_iron",
    "spruce_door": "door_spruce",
    "birch_door": "door_birch",
    "jungle_door": "door_jungle",
    "acacia_door": "door_acacia",
    "dark_oak_door": "door_darkoak",
    "hopper": "hopper",
    "comparator": "comparator",
    "repeater": "repeater",
    "kelp": "kelp",
    "frame": "item_frame",
    "carrot_on_a_stick": "carrot_on_a_stick",
    "honey_bottle": "honey_bottle",
    "suspicious_stew": "suspicious_stew",
    "rabbit_stew": "rabbit_stew",
    "mushroom_stew": "mushroom_stew",
    "beetroot_soup": "beetroot_soup",
    "chorus_fruit": "chorus_fruit",
    "popped_chorus_fruit": "chorus_fruit_popped",
    "dried_kelp": "dried_kelp",
    "goat_horn": "goat_horn",
    "spyglass": "spyglass",
    "shield": "shield",
    "totem_of_undying": "totem",
    "elytra": "elytra",
    "heart_of_the_sea": "heartofthesea_closed",
    "nautilus_shell": "nautilus",
    "phantom_membrane": "phantom_membrane",
    "scute": "turtle_shell_piece",
    "turtle_scute": "turtle_shell_piece",
    "snowball": "snowball",
    "egg": "egg",
    "ender_pearl": "ender_pearl",
    "blaze_rod": "blaze_rod",
    "blaze_powder": "blaze_powder",
    "magma_cream": "magma_cream",
    "ghast_tear": "ghast_tear",
    "spider_eye": "spider_eye",
    "fermented_spider_eye": "spider_eye_fermented",
    "slime_ball": "slimeball",
    "nether_star": "nether_star",
    "name_tag": "name_tag",
    "lead": "lead",
    "saddle": "saddle",
    "string": "string",
    "feather": "feather",
    "flint": "flint",
    "flint_and_steel": "flint_and_steel",
    "gunpowder": "gunpowder",
    "leather": "leather",
    "rabbit_hide": "rabbit_hide",
    "rabbit_foot": "rabbit_foot",
    "clay_ball": "clay_ball",
    "brick": "brick",
    "nether_brick": "netherbrick",
    "netherite_scrap": "netherite_scrap",
    "quartz": "quartz",
    "prismarine_shard": "prismarine_shard",
    "prismarine_crystals": "prismarine_crystals",
    "stick": "stick",
    "bowl": "bowl",
    "sugar": "sugar",
    "paper": "paper",
    "map": "map_empty",
    "wheat": "wheat",
    "bread": "bread",
    "cookie": "cookie",
    "cake": "cake",
    "pumpkin_pie": "pumpkin_pie",
    "apple": "apple",
    "carrot": "carrot",
    "potato": "potato",
    "beetroot": "beetroot",
    "sweet_berries": "sweet_berries",
    "glow_berries": "glow_berries",
    "honeycomb": "honeycomb",
    "bone": "bone",
    "arrow": "arrow",
    "coal": "coal",
    "charcoal": "charcoal",
    "diamond": "diamond",
    "emerald": "emerald",
    "iron_ingot": "iron_ingot",
    "gold_ingot": "gold_ingot",
    "copper_ingot": "copper_ingot",
    "netherite_ingot": "netherite_ingot",
    "amethyst_shard": "amethyst_shard",
    "raw_iron": "raw_iron",
    "raw_gold": "raw_gold",
    "raw_copper": "raw_copper",
    "iron_nugget": "iron_nugget",
    "echo_shard": "echo_shard",
    "disc_fragment_5": "disc_fragment_5",
    "breeze_rod": "breeze_rod",
    "wind_charge": "wind_charge",
    "mace": "mace",
    "brush": "brush",
}

# Block texture face preference for block items.
FACES = ("side", "north", "south", "east", "west", "up", "down")


def load(path):
    """Mojang JSON files may have a BOM and // comments."""
    text = open(path, encoding="utf-8-sig").read()
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    return json.loads(text)


def first_path(entry):
    """terrain/item texture entry -> path string."""
    tex = entry.get("textures") if isinstance(entry, dict) else entry
    if isinstance(tex, list):
        tex = tex[0]
    if isinstance(tex, dict):
        tex = tex.get("path")
        if isinstance(tex, list):
            tex = tex[0]
        if isinstance(tex, dict):
            tex = tex.get("path")
    if isinstance(tex, dict) and "variations" in tex:
        tex = tex["variations"][0].get("path")
    return tex if isinstance(tex, str) else None


def main(item_tex, terrain_tex, blocks_json, item_dts):
    items = load(item_tex)["texture_data"]
    terrain = load(terrain_tex)["texture_data"]
    blocks = load(blocks_json)
    ids = re.findall(r'= "minecraft:([a-z0-9_]+)"', open(item_dts).read())

    # Every texture path listed anywhere in item_texture.json (arrays included).
    item_paths = set()

    def collect(v):
        if isinstance(v, str):
            item_paths.add(v)
        elif isinstance(v, list):
            for x in v:
                collect(x)
        elif isinstance(v, dict):
            for k in ("textures", "path", "variations"):
                if k in v:
                    collect(v[k])

    for e in items.values():
        collect(e)

    def item_path(short):
        if "textures/items/" + short in item_paths:
            return "textures/items/" + short
        e = items.get(short)
        if e and not isinstance(e.get("textures"), list):
            return first_path(e)
        return None

    def block_path(bid):
        b = blocks.get(bid)
        if not isinstance(b, dict) or "textures" not in b:
            return None
        # "carried" textures are the pre-tinted inventory versions (leaves, grass...)
        t = b.get("carried_textures") or b["textures"]
        short = t if isinstance(t, str) else next((t[f] for f in FACES if f in t), None)
        e = terrain.get(short) if short else None
        return first_path(e) if e else None

    mapping, missing = {}, []
    for iid in ids:
        cands = []
        if iid in OVERRIDES:
            cands.append(("i", OVERRIDES[iid]))
        cands += [("i", iid), ("b", iid)]
        # common naming differences
        for a, b in (("golden_", "gold_"), ("wooden_", "wood_"), ("_slab", ""), ("_planks", "")):
            if a in iid:
                cands.append(("i", iid.replace(a, b)))
        m = re.match(r"(wooden|golden|stone|iron|diamond|netherite|copper|chainmail|leather)_(sword|axe|pickaxe|shovel|hoe|helmet|chestplate|leggings|boots)$", iid)
        if m:
            mat = {"wooden": "wood", "golden": "gold"}.get(m.group(1), m.group(1))
            cands.append(("i", f"{mat}_{m.group(2)}"))
        if iid.endswith("_bucket"):
            base = iid[:-7].replace("tropical_fish", "tropical")
            cands.append(("i", "bucket_" + base))
        if iid.endswith("_harness"):
            cands.append(("i", "harness_" + iid[:-8]))
        if iid.endswith("_sign"):
            base = iid[:-5].replace("dark_oak", "darkoak")
            cands += [("i", "sign_" + base), ("i", base + "_sign"), ("i", "sign")]
        if iid.endswith("_door"):
            cands.append(("i", "door_" + iid[:-5]))
        if iid.endswith("_chest_boat"):
            cands.append(("i", "chest_boat_" + iid[:-11].replace("dark_oak", "darkoak")))
            cands.append(("i", iid))
        elif iid.endswith("_boat"):
            cands.append(("i", "boat_" + iid[:-5].replace("dark_oak", "darkoak")))
        if iid.endswith("_raft"):
            cands.append(("i", iid))
        if iid.endswith("_chest_boat"):
            cands.append(("i", "chest_boat_" + iid[:-11]))
        if iid.endswith("_spawn_egg"):
            cands.append(("i", "spawn_egg"))
        if iid.startswith("music_disc_"):
            cands.append(("i", "record_" + iid[11:]))
        if iid.endswith("_dye"):
            cands.append(("i", "dye_powder_" + iid[:-4].replace("light_gray", "silver")))
        if iid.endswith("_banner_pattern"):
            cands.append(("i", "banner_pattern"))
        if iid.endswith("_sign"):
            cands.append(("i", iid.replace("_sign", "_sign")))
        if iid.endswith("_bundle"):
            cands.append(("i", "bundle"))
        if iid.endswith("_harness"):
            cands.append(("i", "harness"))
        path = None
        for kind, key in cands:
            path = item_path(key) if kind == "i" else block_path(key)
            if path:
                break
        if path:
            mapping[iid] = path
        else:
            missing.append(iid)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write("// GENERATED by tools/gen_icons.py - item id -> vanilla texture path.\n")
        f.write("// prettier-ignore\n")
        f.write("export const ICONS = ")
        json.dump(mapping, f, separators=(",", ":"))
        f.write(";\n")
    print(f"mapped {len(mapping)}/{len(ids)} items; {len(missing)} use the fallback icon")
    return missing


if __name__ == "__main__":
    miss = main(*sys.argv[1:5])
    if "-v" in sys.argv:
        print(" ".join(miss))
