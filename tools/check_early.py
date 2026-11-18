#!/usr/bin/env python3
"""Fails if a script touches world state at module top level.

Bedrock runs scripts in early-execution mode while the world loads: calls like
world.getDynamicProperty() at the top level throw and stop every module that
loads after it. Run: python3 tools/check_early.py
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "packs", "SoloLeveling_BP", "scripts")
BAD = re.compile(r"\b(world\.(getDynamicProperty|setDynamicProperty|getAllPlayers|getDimension|getEntity|structureManager|getPlayers)|\.runCommand\()")
problems = []
for base, _, files in os.walk(ROOT):
    for f in files:
        if not f.endswith(".js"):
            continue
        path = os.path.join(base, f)
        depth = 0
        for n, line in enumerate(open(path), 1):
            code = re.sub(r"//.*", "", line)
            # Top-level code that calls world APIs directly (function bodies are fine).
            if depth == 0 and BAD.search(code) and "=>" not in code and "function" not in code:
                problems.append(f"{os.path.relpath(path, ROOT)}:{n}: {line.strip()}")
            depth += code.count("{") + code.count("(") - code.count("}") - code.count(")")
if problems:
    print("Top-level world access (breaks loading):")
    print("\n".join(problems))
    sys.exit(1)
print("early-execution check ok")
