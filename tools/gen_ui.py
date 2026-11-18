#!/usr/bin/env python3
"""Generates the JSON UI files that re-skin server forms into the System UI.

Run from the repository root:  python3 tools/gen_ui.py

How it works
------------
The behavior pack shows normal ActionFormData forms. When a form title starts
with a layout marker (e.g. "sl:profile|"), ui/server_form.json hides the vanilla
form and shows our custom screen (namespace "sl_ui") instead.

Every form button has a fixed meaning per layout (its index). Each index is
placed at a fixed position in the layout with "collection_index". Button text
and icon path carry the data (labels, bar textures...). Buttons the player
should not click (bars, header) are simply never drawn as buttons.

Common indices for every System layout:
    0 = close, 1..5 = tabs, 6 = header (name / level / xp bar)
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "packs", "SoloLeveling_RP", "ui")
T = "textures/sl/ui/"

LAYOUTS = ["sl:profile|", "sl:list|", "sl:vault|"]
# The form factory gives long_form no size, so percentages at the top level
# resolve to 0. The window therefore uses a fixed size that fits phones.
SCREEN_SIZE = [392, 206]
COL = "form_buttons"

CYAN = [0.45, 0.92, 1.0]
PURPLE = [0.82, 0.45, 1.0]
WHITE = [1.0, 1.0, 1.0]
GREY = [0.7, 0.78, 0.85]


# ---------------------------------------------------------------- helpers
def contains(prop, marker):
    return f"(not (({prop} - '{marker}') = {prop}))"


def title_stripped():
    expr = "#title_text"
    for m in LAYOUTS:
        expr = f"({expr} - '{m}')"
    return expr


def btn_text_binding():
    return {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": COL}


def btn_tex_binding():
    return {
        "binding_name": "#form_button_texture",
        "binding_name_override": "#texture",
        "binding_type": "collection",
        "binding_collection_name": COL,
    }


def label(text, color=WHITE, font=None, scale=None, **extra):
    d = {"type": "label", "text": text, "color": color, "shadow": True}
    if font:
        d["font_type"] = font
    if scale:
        d["font_scale_factor"] = scale
    d.update(extra)
    return d


def bound_label(color=WHITE, **extra):
    d = label("#form_button_text", color, **extra)
    d["bindings"] = [btn_text_binding()]
    return d


def bound_image(**extra):
    d = {"type": "image", "bindings": [btn_tex_binding()]}
    d.update(extra)
    return d


def button(tex, tex_hover, tex_pressed):
    """A real clickable form button that fills its parent."""
    return {
        "type": "button",
        "size": ["100%", "100%"],
        "layer": 1,
        "sound_name": "random.click",
        "sound_volume": 1.0,
        "default_control": "default",
        "hover_control": "hover",
        "pressed_control": "pressed",
        "$pressed_button_name": "button.form_button_click",
        "button_mappings": [
            {"from_button_id": "button.menu_select", "to_button_id": "$pressed_button_name", "mapping_type": "pressed"},
            {"from_button_id": "button.menu_ok", "to_button_id": "$pressed_button_name", "mapping_type": "focused"},
        ],
        "bindings": [{"binding_type": "collection_details", "binding_collection_name": COL}],
        "controls": [
            {"default": {"type": "image", "texture": T + tex}},
            {"hover": {"type": "image", "texture": T + tex_hover}},
            {"pressed": {"type": "image", "texture": T + tex_pressed}},
        ],
    }


def slot(idx, size, controls):
    """Panel bound to form button #idx. The index is set on the wrapper and on
    every child, so collection bindings resolve no matter how deep they are."""
    for child in controls:
        for d in child.values():
            d["collection_index"] = idx
    return {"type": "panel", "size": size, "collection_name": COL, "collection_index": idx, "controls": controls}


def gap(w, h):
    return {"type": "panel", "size": [w, h]}


def inner_panel(size, controls, pad=4):
    return {
        "type": "panel",
        "size": size,
        "controls": [
            {"bg": {"type": "image", "texture": T + "inner", "size": ["100%", "100%"], "layer": 1}},
            {
                "content": {
                    "type": "stack_panel",
                    "orientation": "vertical",
                    "size": [f"100% - {pad * 2}px", f"100% - {pad * 2}px"],
                    "layer": 2,
                    "controls": controls,
                }
            },
        ],
    }


def section_title(text, color=CYAN):
    return {
        "type": "panel",
        "size": ["100%", 12],
        "controls": [{"t": label(text, color, font="MinecraftTen", scale=0.9, anchor_from="left_middle", anchor_to="left_middle")}],
    }


# ---------------------------------------------------------------- elements
def tab(idx, width):
    return slot(idx, [width, 16], [
        {"btn": button("tab", "tab_hover", "btn_pressed")},
        {"active": bound_image(size=["100%", "100%"], layer=2)},
        {"txt": bound_label(WHITE, layer=3, font_scale_factor=0.85)},
    ])


def close_btn(idx):
    return slot(idx, [62, 16], [
        {"btn": button("close", "close_hover", "btn_pressed")},
        {"txt": bound_label(WHITE, layer=3, font_scale_factor=0.85)},
    ])


def action_btn(idx, height=18):
    return slot(idx, ["100%", height], [
        {"btn": button("btn", "btn_hover", "btn_pressed")},
        {"txt": bound_label(WHITE, layer=3)},
    ])


def stat_row(idx):
    return slot(idx, ["100%", 18], [
        {"btn": button("btn", "btn_hover", "btn_pressed")},
        {"txt": bound_label(WHITE, layer=3, anchor_from="left_middle", anchor_to="left_middle", offset=[5, 0])},
        {"plus": bound_image(size=[9, 9], layer=3, anchor_from="right_middle", anchor_to="right_middle", offset=[-5, 0])},
    ])


def bar(idx, height=17):
    """Display only: label on top, progress bar texture below."""
    s = slot(idx, ["100%", height], [
        {"txt": bound_label(WHITE, font_scale_factor=0.8, anchor_from="top_left", anchor_to="top_left", layer=6)},
        {"bar": bound_image(size=["100%", 5], anchor_from="bottom_left", anchor_to="bottom_left", layer=6)},
    ])
    s["layer"] = 5
    return s


def header():
    title_row = {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["fill", "100%"],
        "controls": [
            {"sys": label("THE SYSTEM", PURPLE, font="MinecraftTen", size=["default", "default"], anchor_from="left_middle", anchor_to="left_middle")},
            {"dot": label("  •  ", WHITE, size=["default", "default"])},
            {
                "title": {
                    **label("#sl_title", CYAN, font="MinecraftTen", size=["default", "default"]),
                    "bindings": [
                        {"binding_name": "#title_text"},
                        {"binding_type": "view", "source_property_name": title_stripped(), "target_property_name": "#sl_title"},
                    ],
                }
            },
        ],
    }
    hunter = slot(6, [150, 22], [
        {"txt": bound_label(WHITE, font_scale_factor=0.85, anchor_from="top_right", anchor_to="top_right", offset=[0, 2])},
        {"bar": bound_image(size=["100%", 5], anchor_from="bottom_right", anchor_to="bottom_right", offset=[0, -2])},
    ])
    return {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["100%", 22],
        "controls": [{"title_row": title_row}, {"hunter": hunter}],
    }


def tabs_row():
    ctrls = []
    for i in range(1, 6):
        ctrls.append({f"tab{i}": tab(i, 56)})
        ctrls.append({f"g{i}": gap(2, 16)})
    ctrls.append({"fill": gap("fill", 16)})
    ctrls.append({"close": close_btn(0)})
    return {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", 16], "controls": ctrls}


def body_text():
    return {
        "type": "label",
        "text": "#form_text",
        "color": WHITE,
        "shadow": True,
        "size": ["100%", "default"],
        "font_scale_factor": 0.9,
        "bindings": [{"binding_name": "#form_text"}],
    }


# ---------------------------------------------------------------- layouts
def profile_content():
    """sl:profile| -- 7..11 stats, 12 hp, 13 mp, 14 fatigue, 15 allocate."""
    doll = {
        "type": "panel",
        "size": ["100%", "fill"],
        "clips_children": True,
        "layer": 1,
        "controls": [
            {
                # Renders the local player, so every hunter sees their own skin.
                "player": {
                    "type": "custom",
                    "renderer": "live_player_renderer",
                    "size": [30, 52],
                    "offset": [0, -2],
                    "property_bag": {"#look_at_cursor": True},
                    "layer": 1,
                }
            }
        ],
    }
    left = inner_panel(["34%", "100%"], [
        {"t": section_title("HUNTER")},
        {"doll": doll},
        {"hp": bar(12)},
        {"g1": gap("100%", 2)},
        {"mp": bar(13)},
        {"g2": gap("100%", 2)},
        {"fat": bar(14)},
    ])
    mid_ctrls = [{"t": section_title("STATS")}]
    for n, idx in enumerate(range(7, 12)):
        mid_ctrls.append({f"s{idx}": stat_row(idx)})
        mid_ctrls.append({f"g{idx}": gap("100%", 3)})
    mid_ctrls.append({"fill": gap("100%", "fill")})
    mid_ctrls.append({"alloc": action_btn(15)})
    mid = inner_panel(["33%", "100%"], mid_ctrls)
    right = inner_panel(["fill", "100%"], [
        {"t": section_title("STATUS", PURPLE)},
        {"body": body_text()},
    ])
    return {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["100%", "100%"],
        "controls": [{"left": left}, {"g1": gap(4, "100%")}, {"mid": mid}, {"g2": gap(4, "100%")}, {"right": right}],
    }


def list_item():
    return {
        "type": "panel",
        "size": ["100%", 22],
        "bindings": [
            btn_text_binding(),
            {"binding_type": "view", "source_property_name": contains("#form_button_text", "sl:l|"), "target_property_name": "#visible"},
        ],
        "controls": [
            {
                "inner": {
                    "type": "panel",
                    "size": ["100%", 20],
                    "anchor_from": "top_middle",
                    "anchor_to": "top_middle",
                    "controls": [
                        {"btn": button("btn", "btn_hover", "btn_pressed")},
                        {"icon": bound_image(size=[14, 14], layer=3, anchor_from="left_middle", anchor_to="left_middle", offset=[4, 0])},
                        {
                            "txt": {
                                **label("#sl_btn_text", WHITE, layer=3),
                                "bindings": [
                                    btn_text_binding(),
                                    {"binding_type": "view", "source_property_name": "(#form_button_text - 'sl:l|')", "target_property_name": "#sl_btn_text"},
                                ],
                            }
                        },
                    ],
                }
            }
        ],
    }


def list_content():
    """sl:list| -- body text left, every button whose text starts with sl:l| on the right."""
    stack = {
        "type": "stack_panel",
        "orientation": "vertical",
        "size": ["100%", "100%c"],
        "factory": {"name": "buttons", "control_name": "sl_ui.list_item"},
        "collection_name": COL,
        "bindings": [{"binding_name": "#form_button_length", "binding_name_override": "#collection_length"}],
    }
    left = inner_panel(["45%", "100%"], [{"t": section_title("INFO", PURPLE)}, {"body": body_text()}])
    right = inner_panel(["fill", "100%"], [{"t": section_title("OPTIONS")}, {"list": stack}])
    return {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["100%", "100%"],
        "controls": [{"left": left}, {"g": gap(4, "100%")}, {"right": right}],
    }


# ---------------------------------------------------------------- vault layout
# sl:vault| indices:
#   7,8 sub-tabs (VAULT / BAG)   9 capacity label   10 prev  11 page label  12 next
#   13 filter  14 sort  15 stack  16 primary action  17 secondary action  18 discard
#   19 selected item icon        20..64 grid cells (9 x 5)
GRID_START, GRID_COLS, GRID_ROWS, CELL = 20, 9, 5, 20


def plain_label(idx, size, color=WHITE, scale=0.85, align="center"):
    anchor = {"center": "center", "left": "left_middle", "right": "right_middle"}[align]
    return slot(idx, size, [{"txt": bound_label(color, font_scale_factor=scale, anchor_from=anchor, anchor_to=anchor)}])


def small_btn(idx, size, red=False):
    tex = ("close", "close_hover", "btn_pressed") if red else ("btn", "btn_hover", "btn_pressed")
    return slot(idx, size, [
        {"btn": button(*tex)},
        {"txt": bound_label(WHITE, layer=3, font_scale_factor=0.8)},
    ])


def sub_tab(idx, size):
    return slot(idx, size, [
        {"btn": button("tab", "tab_hover", "btn_pressed")},
        {"active": bound_image(size=["100%", "100%"], layer=2)},
        {"txt": bound_label(WHITE, layer=3, font_scale_factor=0.8)},
    ])


def grid_cell(idx):
    """Item slot: '*' in the text marks the selected slot, the rest is the count."""
    sel_vis = {"binding_type": "view", "source_property_name": contains("#form_button_text", "*"), "target_property_name": "#visible"}
    return slot(idx, [CELL, CELL], [
        {"btn": button("slot", "slot_hover", "slot_sel")},
        {"sel": {"type": "image", "texture": T + "slot_sel", "size": ["100%", "100%"], "layer": 2,
                 "bindings": [btn_text_binding(), sel_vis]}},
        {"icon": bound_image(size=[15, 15], layer=3)},
        {"count": {
            **label("#sl_count", WHITE, layer=4, font_scale_factor=0.65,
                    anchor_from="bottom_right", anchor_to="bottom_right", offset=[0, 1]),
            "bindings": [
                btn_text_binding(),
                {"binding_type": "view", "source_property_name": "(#form_button_text - '*')", "target_property_name": "#sl_count"},
            ],
        }},
    ])


def row(name, ctrls, height):
    return {name: {"type": "stack_panel", "orientation": "horizontal", "size": ["100%", height], "controls": ctrls}}


def vault_content():
    grid_rows = []
    for r in range(GRID_ROWS):
        cells = [{f"c{GRID_START + r * GRID_COLS + c}": grid_cell(GRID_START + r * GRID_COLS + c)} for c in range(GRID_COLS)]
        grid_rows.append({f"r{r}": {"type": "stack_panel", "orientation": "horizontal",
                                    "size": [CELL * GRID_COLS, CELL], "controls": cells}})
    left = {
        "type": "stack_panel",
        "orientation": "vertical",
        "size": [CELL * GRID_COLS, "100%"],
        "controls": [
            row("subtabs", [{"t7": sub_tab(7, ["50% - 1px", 16])}, {"g": gap(2, 16)}, {"t8": sub_tab(8, ["fill", 16])}], 16),
            {"g1": gap("100%", 3)},
            {"grid": {"type": "stack_panel", "orientation": "vertical", "size": [CELL * GRID_COLS, CELL * GRID_ROWS], "controls": grid_rows}},
            {"g2": gap("100%", 3)},
            row("pager", [{"prev": small_btn(10, [34, 15])}, {"page": plain_label(11, ["fill", 15], CYAN)}, {"next": small_btn(12, [34, 15])}], 15),
        ],
    }
    icon_box = slot(19, [26, 26], [
        {"bg": {"type": "image", "texture": T + "slot", "size": ["100%", "100%"], "layer": 1}},
        {"icon": bound_image(size=[20, 20], layer=2)},
    ])
    details = {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["100%", "fill"],
        "controls": [
            {"icon": {"type": "panel", "size": [26, "100%"], "controls": [
                {"box": {**icon_box, "anchor_from": "top_left", "anchor_to": "top_left"}}]}},
            {"g": gap(4, "100%")},
            {"body": {"type": "panel", "size": ["fill", "100%"], "controls": [
                {"txt": {**body_text(), "anchor_from": "top_left", "anchor_to": "top_left", "font_scale_factor": 0.8}}]}},
        ],
    }
    right = inner_panel(["fill", "100%"], [
        {"cap": plain_label(9, ["100%", 12], PURPLE, 0.85, "left")},
        {"g0": gap("100%", 2)},
        {"details": details},
        {"g1": gap("100%", 2)},
        {"a16": small_btn(16, ["100%", 16])},
        {"g2": gap("100%", 2)},
        row("r2", [{"a17": small_btn(17, ["50% - 1px", 16])}, {"g": gap(2, 16)}, {"a18": small_btn(18, ["fill", 16], red=True)}], 16),
        {"g3": gap("100%", 2)},
        row("r3", [{"a13": small_btn(13, ["34%", 16])}, {"g": gap(2, 16)}, {"a14": small_btn(14, ["32%", 16])},
                   {"g2": gap(2, 16)}, {"a15": small_btn(15, ["fill", 16])}], 16),
    ])
    return {
        "type": "stack_panel",
        "orientation": "horizontal",
        "size": ["100%", "100%"],
        "controls": [{"left": left}, {"g": gap(5, "100%")}, {"right": right}],
    }


def visible_if_title(marker):
    return [
        {"binding_name": "#title_text"},
        {"binding_type": "view", "source_property_name": contains("#title_text", marker), "target_property_name": "#visible"},
    ]


def screen():
    content = {
        "type": "panel",
        "size": ["100%", "fill"],
        "collection_name": COL,
        "controls": [
            {"profile@sl_ui.profile_content": {"bindings": visible_if_title("sl:profile|")}},
            {"list@sl_ui.list_content": {"bindings": visible_if_title("sl:list|")}},
            {"vault@sl_ui.vault_content": {"bindings": visible_if_title("sl:vault|")}},
        ],
    }
    return {
        "type": "panel",
        "size": SCREEN_SIZE,
        "collection_name": COL,
        "controls": [
            {"bg": {"type": "image", "texture": T + "frame", "size": ["100%", "100%"], "layer": 1}},
            {
                "body": {
                    "type": "stack_panel",
                    "orientation": "vertical",
                    "size": ["100% - 14px", "100% - 14px"],
                    "layer": 2,
                    "collection_name": COL,
                    "controls": [
                        {"header": header()},
                        {"tabs": tabs_row()},
                        {"sep": gap("100%", 4)},
                        {"content": content},
                    ],
                }
            },
        ],
    }


def server_form_override():
    """Overrides vanilla long_form: vanilla form when no marker, System screen otherwise."""
    no_marker = f"((#title_text - 'sl:') = #title_text)"
    has_marker = f"(not ((#title_text - 'sl:') = #title_text))"
    return {
        "namespace": "server_form",
        "long_form": {
            "type": "panel",
            "size": SCREEN_SIZE,
            "controls": [
                {
                    "vanilla": {
                        "type": "panel",
                        "size": [225, 200],
                        "bindings": [
                            {"binding_name": "#title_text"},
                            {"binding_type": "view", "source_property_name": no_marker, "target_property_name": "#visible"},
                        ],
                        "controls": [
                            {
                                "long_form@common_dialogs.main_panel_no_buttons": {
                                    "$title_panel": "common_dialogs.standard_title_label",
                                    "$title_size": ["100% - 14px", 10],
                                    "size": [225, 200],
                                    "$text_name": "#title_text",
                                    "$title_text_binding_type": "none",
                                    "$child_control": "server_form.long_form_panel",
                                    "layer": 2,
                                }
                            }
                        ],
                    }
                },
                {
                    "sl_system@sl_ui.screen": {
                        "bindings": [
                            {"binding_name": "#title_text"},
                            {"binding_type": "view", "source_property_name": has_marker, "target_property_name": "#visible"},
                        ]
                    }
                },
            ],
        },
    }


def add_collection_name(node):
    """Recursively give every panel / stack_panel the form_buttons collection."""
    if isinstance(node, dict):
        if node.get("type") in ("panel", "stack_panel") and "factory" not in node:
            node.setdefault("collection_name", COL)
        if "factory" in node:
            return
        for v in node.values():
            add_collection_name(v)
    elif isinstance(node, list):
        for v in node:
            add_collection_name(v)


def main():
    os.makedirs(UI_DIR, exist_ok=True)
    sl_ui = {
        "namespace": "sl_ui",
        "screen": screen(),
        "profile_content": profile_content(),
        "list_content": list_content(),
        "vault_content": vault_content(),
        "list_item": list_item(),
    }
    for key in ("screen", "profile_content", "list_content", "vault_content"):
        add_collection_name(sl_ui[key])
    with open(os.path.join(UI_DIR, "sl_ui.json"), "w") as f:
        json.dump(sl_ui, f, indent=2, ensure_ascii=False)
    with open(os.path.join(UI_DIR, "server_form.json"), "w") as f:
        json.dump(server_form_override(), f, indent=2, ensure_ascii=False)
    with open(os.path.join(UI_DIR, "_ui_defs.json"), "w") as f:
        json.dump({"ui_defs": ["ui/sl_ui.json"]}, f, indent=2)
    print("ui generated")


if __name__ == "__main__":
    main()
