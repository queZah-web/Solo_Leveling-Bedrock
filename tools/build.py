#!/usr/bin/env python3
"""Regenerates textures + UI and packages dist/SoloLeveling.mcaddon (+ .mcpack files).

Run from the repository root:  python3 tools/build.py
"""
import json
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "packs")
DIST = os.path.join(ROOT, "dist")
BP, RP = "SoloLeveling_BP", "SoloLeveling_RP"


def run(script):
    subprocess.check_call([sys.executable, os.path.join(ROOT, "tools", script)])


def check_json():
    for base, _, files in os.walk(PACKS):
        for f in files:
            if f.endswith(".json"):
                with open(os.path.join(base, f)) as fh:
                    json.load(fh)


def add_pack(zf, pack, prefix):
    src = os.path.join(PACKS, pack)
    for base, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(base, f)
            zf.write(full, os.path.join(prefix, os.path.relpath(full, src)))


def main():
    run("check_early.py")
    run("gen_textures.py")
    run("gen_ui.py")
    run("gen_skill_icons.py")
    run("gen_gate.py")
    run("gen_mobs.py")
    run("gen_art.py")
    run("gen_beru.py")
    run("gen_igris.py")
    run("gen_bosses.py")  # detailed art, overwrites gen_mobs placeholders
    check_json()
    os.makedirs(DIST, exist_ok=True)
    with zipfile.ZipFile(os.path.join(DIST, "SoloLeveling.mcaddon"), "w", zipfile.ZIP_DEFLATED) as zf:
        add_pack(zf, BP, BP)
        add_pack(zf, RP, RP)
    for pack in (BP, RP):
        with zipfile.ZipFile(os.path.join(DIST, pack + ".mcpack"), "w", zipfile.ZIP_DEFLATED) as zf:
            add_pack(zf, pack, "")
    print("built:", ", ".join(sorted(os.listdir(DIST))))


if __name__ == "__main__":
    main()
