// Dungeon architecture: big halls with pillars, hanging lanterns, carpets and
// statues; side corridors to treasure rooms; lava pits and cobwebs; a throne
// hall for the boss with a caged treasure vault.
//
// Layout along +x:  [start] - [hall 1] - ... - [hall N] - [BOSS]
// Halls 1..N have a side corridor (alternating north/south) to a treasure room.
// Doors are iron bars: they open when the hall is cleared.

/** Per-rank materials. */
export const THEMES = [
  { floor: "stone_bricks", floor2: "mossy_stone_bricks", border: "chiseled_stone_bricks", wall: "stone_bricks", stripe: "cracked_stone_bricks",
    pillar: "polished_andesite", cap: "chiseled_stone_bricks", light: "glowstone", lantern: "lantern", carpet: "green_carpet", ceil: "stone_bricks",
    moss: "moss_block", mossc: "moss_carpet", plant: ["azalea", "flowering_azalea"], leaf: "azalea_leaves",
    statue: "andesite", deco: ["bookshelf", "barrel", "cobweb"] },
  { floor: "smooth_sandstone", floor2: "cut_sandstone", border: "chiseled_sandstone", wall: "cut_sandstone", stripe: "chiseled_sandstone",
    pillar: "smooth_sandstone", cap: "chiseled_sandstone", light: "ochre_froglight", lantern: "lantern", carpet: "orange_carpet", ceil: "sandstone",
    moss: "moss_block", mossc: "moss_carpet", plant: ["flowering_azalea", "azalea"], leaf: "flowering_azalea_leaves",
    statue: "smooth_sandstone", deco: ["barrel", "bookshelf", "hay_block"] },
  { floor: "packed_ice", floor2: "polished_diorite", border: "blue_ice", wall: "polished_diorite", stripe: "blue_ice",
    pillar: "packed_ice", cap: "blue_ice", light: "sea_lantern", lantern: "soul_lantern", carpet: "light_blue_carpet", ceil: "polished_diorite",
    moss: "moss_block", mossc: "moss_carpet", plant: ["azalea", "azalea"], leaf: "azalea_leaves",
    statue: "packed_ice", deco: ["barrel", "bookshelf", "powder_snow"] },
  { floor: "nether_bricks", floor2: "red_nether_bricks", border: "chiseled_nether_bricks", wall: "nether_bricks", stripe: "red_nether_bricks",
    pillar: "polished_basalt", cap: "chiseled_nether_bricks", light: "shroomlight", lantern: "lantern", carpet: "red_carpet", ceil: "nether_bricks",
    moss: "warped_nylium", mossc: "moss_carpet", plant: ["warped_roots", "warped_fungus"], leaf: "warped_wart_block",
    statue: "polished_blackstone", deco: ["barrel", "magma", "bookshelf"] },
  { floor: "deepslate_tiles", floor2: "polished_deepslate", border: "chiseled_deepslate", wall: "deepslate_bricks", stripe: "gilded_blackstone",
    pillar: "polished_blackstone", cap: "chiseled_polished_blackstone", light: "pearlescent_froglight", lantern: "soul_lantern", carpet: "black_carpet",
    ceil: "deepslate_tiles", moss: "moss_block", mossc: "moss_carpet", plant: ["flowering_azalea", "azalea"], leaf: "azalea_leaves",
    statue: "polished_blackstone", deco: ["bookshelf", "barrel", "gilded_blackstone"] },
  { floor: "obsidian", floor2: "purpur_block", border: "crying_obsidian", wall: "polished_blackstone_bricks", stripe: "crying_obsidian",
    pillar: "purpur_pillar", cap: "purpur_block", light: "verdant_froglight", lantern: "soul_lantern", carpet: "purple_carpet", ceil: "obsidian",
    moss: "moss_block", mossc: "moss_carpet", plant: ["flowering_azalea", "azalea"], leaf: "flowering_azalea_leaves",
    statue: "obsidian", deco: ["bookshelf", "barrel", "amethyst_block"] },
];
const id = (n) => `minecraft:${n}`;
/** Leaves that never decay. */
const leaf = (n) => (n.endsWith("_leaves") ? { id: id(n), states: { persistent_bit: true } } : id(n));
/** Deterministic noise 0..99 so every build of a dungeon looks the same. */
const noise = (x, z, k = 0) => (((x * 73856093) ^ (z * 19349663) ^ (k * 83492791)) >>> 0) % 100;

export const SPACING = 34;
export const hallHalf = (inst, i) => (i === inst.n - 1 ? 13 : 10);
export const hallHeight = (inst, i) => (i === inst.n - 1 ? 12 : 9);
const TREASURE_HALF = 6;
const SIDE_LEN = 5;

/** Hall centers (x offsets) and branch sides. */
export function layout(base, n) {
  const halls = [];
  for (let i = 0; i < n; i++) {
    const x = i < n - 1 ? i * SPACING : (n - 2) * SPACING + SPACING + 3;
    halls.push({ x: base.x + x, y: base.y, z: base.z });
  }
  const branches = [];
  for (let i = 1; i < n - 1; i++) {
    const side = i % 2 ? -1 : 1;
    const h = halls[i];
    const tz = h.z + side * (10 + 2 + SIDE_LEN + 1 + TREASURE_HALF);
    branches.push({ hall: i, side, room: { x: h.x, y: h.y, z: tz } });
  }
  return { halls, branches };
}

export function boundsOf(base, n) {
  const { halls } = layout(base, n);
  const last = halls[n - 1];
  const zr = 10 + 2 + SIDE_LEN + 1 + TREASURE_HALF * 2 + 3;
  return {
    from: { x: halls[0].x - 12, y: base.y - 3, z: base.z - zr },
    to: { x: last.x + 15, y: base.y + 14, z: base.z + zr },
  };
}

/**
 * Generator of block placements: [x, y, z, blockId | {id, states}].
 * Also fills `chests` with {x, y, z, kind, hall}.
 */
export function* design(inst, base, chests) {
  const T = THEMES[inst.rank];
  const n = inst.n;
  const { halls, branches } = layout(base, n);
  const L = (s) => ({ id: id(T.lantern), states: { hanging: true } });

  // ---------- halls
  for (let i = 0; i < n; i++) {
    const c = halls[i];
    const R = hallHalf(inst, i);
    const H = hallHeight(inst, i);
    const boss = i === n - 1;
    for (let dx = -R - 1; dx <= R + 1; dx++) {
      for (let dz = -R - 1; dz <= R + 1; dz++) {
        const x = c.x + dx;
        const z = c.z + dz;
        const wall = Math.abs(dx) === R + 1 || Math.abs(dz) === R + 1;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        // floor: border ring, checker, emblem in the middle
        let f = (dx + dz) % 2 === 0 ? T.floor : T.floor2;
        if (ring === R || ring === R - 4) f = T.border;
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) f = T.light;
        yield [x, c.y - 1, z, id(wall ? T.wall : f)];
        yield [x, c.y - 2, z, id(T.wall)];
        // ceiling with a grid of lights
        const lamp = !wall && dx % 5 === 0 && dz % 5 === 0;
        yield [x, c.y + H, z, id(lamp ? T.light : T.ceil)];
        if (!wall) continue;
        for (let y = 0; y < H; y++) {
          const along = Math.abs(dx) === R + 1 ? dz : dx;
          const mainDoor = Math.abs(dx) === R + 1 && Math.abs(dz) <= 1 && y <= 3 && ((dx > 0 && i < n - 1) || (dx < 0 && i > 0));
          const sideDoor = Math.abs(dz) === R + 1 && Math.abs(dx) <= 1 && y <= 3 && branches.some((b) => b.hall === i && Math.sign(dz) === b.side);
          if (mainDoor || sideDoor) {
            // exits of monster halls and treasure doors start locked (iron bars)
            if ((mainDoor && dx > 0 && i >= 1) || sideDoor) yield [x, c.y + y, z, id("iron_bars")];
            continue;
          }
          let b = T.wall;
          if (along % 5 === 0) b = T.pillar; // wall pilasters
          if (y === 4 && along % 5 === 0) b = T.light; // wall lamps
          if (y === H - 1 || y === 0) b = T.stripe;
          yield [x, c.y + y, z, id(b)];
        }
      }
    }
    // inner pillars with capitals and hanging lanterns between them
    const P = boss ? 8 : 6;
    for (const [px, pz] of [[-P, -P], [P, -P], [-P, P], [P, P], ...(boss ? [[0, -P], [0, P]] : [])]) {
      for (let y = 0; y < H; y++) yield [c.x + px, c.y + y, c.z + pz, id(y >= H - 2 ? T.cap : T.pillar)];
    }
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) yield [c.x + lx, c.y + H - 1, c.z + lz, L()];
    // carpet runner from door to door
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -1; dz <= 1; dz++) if (!(Math.abs(dx) <= 1 && Math.abs(dz) <= 1)) yield [c.x + dx, c.y, c.z + dz, id(T.carpet)];
    }
    // cobwebs in corners (low ranks), bone piles
    if (!boss && i > 0) {
      for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        if (inst.rank <= 2) yield [c.x + sx * (R - 1), c.y + H - 1, c.z + sz * (R - 1), id("cobweb")];
        yield [c.x + sx * (R - 1), c.y, c.z + sz * (R - 2), id(inst.rank >= 3 ? "bone_block" : T.deco[0])];
      }
    }
    // statues: entrance of the start hall, and lining the boss hall
    if (i === 0) {
      yield* statue(c.x + R - 3, c.y, c.z - 4, T, inst.rank);
      yield* statue(c.x + R - 3, c.y, c.z + 4, T, inst.rank);
    }
    yield* garden(c, R, H, T, boss, i);
    if (boss) {
      for (const sx of [-8, -3, 3]) for (const sz of [-11, 11]) yield* statue(c.x + sx, c.y, c.z + sz, T, inst.rank);
      yield* throne(c.x + R - 3, c.y, c.z, T, chests, i);
    }
  }

  // ---------- corridors (with lava pits on some)
  for (let i = 0; i < n - 1; i++) {
    const a = halls[i];
    const x0 = a.x + hallHalf(inst, i) + 2;
    const x1 = halls[i + 1].x - hallHalf(inst, i + 1) - 2;
    const lava = inst.rank >= 1 && i % 2 === 1;
    for (let x = x0; x <= x1; x++) {
      const mid = Math.abs(x - (x0 + x1) / 2) <= 2;
      for (let dz = -2; dz <= 2; dz++) {
        const z = a.z + dz;
        const pit = lava && mid && Math.abs(dz) <= 1 && !((x + dz) % 2 === 0 && dz === 0);
        yield [x, a.y - 2, z, id(T.wall)];
        yield [x, a.y - 1, z, pit ? id("lava") : id(Math.abs(dz) === 2 ? T.border : T.floor)];
        yield [x, a.y + 5, z, id(dz === 0 && x % 3 === 0 ? T.light : T.ceil)];
        if (Math.abs(dz) === 2) for (let y = 0; y <= 4; y++) yield [x, a.y + y, z, id(y === 2 && x % 4 === 0 ? T.light : T.wall)];
      }
      if (x === x0 || x === x1) for (const dz of [-1, 0, 1]) yield [x, a.y + 4, a.z + dz, id(T.stripe)]; // arches
      // moss creeping along the edges, leaves hanging from the ceiling corners
      for (const dz of [-1, 1]) {
        if (!(lava && mid) && noise(x, a.z + dz, 1) < 35) yield [x, a.y, a.z + dz, id(T.mossc)];
        if (noise(x, a.z + dz, 2) < 45) yield [x, a.y + 4, a.z + dz, leaf(T.leaf)];
      }
    }
  }

  // ---------- branches: side corridor + treasure room
  for (const b of branches) {
    const h = halls[b.hall];
    const zStart = h.z + b.side * (10 + 2);
    for (let k = 0; k < SIDE_LEN; k++) {
      const z = zStart + b.side * k;
      for (let dx = -2; dx <= 2; dx++) {
        const x = h.x + dx;
        yield [x, h.y - 2, z, id(T.wall)];
        yield [x, h.y - 1, z, id(Math.abs(dx) === 2 ? T.border : T.floor2)];
        yield [x, h.y + 5, z, id(T.ceil)];
        if (Math.abs(dx) === 2) for (let y = 0; y <= 4; y++) yield [x, h.y + y, z, id(T.wall)];
      }
    }
    const r = b.room;
    const R = TREASURE_HALF;
    for (let dx = -R - 1; dx <= R + 1; dx++) {
      for (let dz = -R - 1; dz <= R + 1; dz++) {
        const x = r.x + dx;
        const z = r.z + dz;
        const wall = Math.abs(dx) === R + 1 || Math.abs(dz) === R + 1;
        yield [x, r.y - 2, z, id(T.wall)];
        yield [x, r.y - 1, z, id(wall ? T.wall : Math.max(Math.abs(dx), Math.abs(dz)) === R ? T.border : T.floor2)];
        yield [x, r.y + 6, z, id(!wall && dx % 4 === 0 && dz % 4 === 0 ? T.light : T.ceil)];
        if (!wall) continue;
        for (let y = 0; y < 6; y++) {
          const door = dz === -b.side * (R + 1) && Math.abs(dx) <= 1 && y <= 3;
          if (door) continue;
          yield [x, r.y + y, z, id(y === 0 || y === 5 ? T.stripe : T.wall)];
        }
      }
    }
    // treasure: chests on the far wall, shelves and barrels around
    const back = r.z + b.side * (R - 1);
    for (const dx of [-2, 0, 2]) chests.push({ x: r.x + dx, y: r.y, z: back, kind: "treasure", hall: b.hall });
    for (const dx of [-5, -4, 4, 5]) {
      for (let y = 0; y < 3; y++) yield [r.x + dx, r.y + y, back, id(T.deco[y % 2 === 0 ? 0 : 1])];
    }
    for (const dx of [-5, 5]) for (const dz of [-3, 0, 3]) yield [r.x + dx, r.y, r.z + dz, id(T.deco[1])];
    yield [r.x, r.y + 5, r.z, L()];
    // small garden: moss patches, planters by the door, leafy ceiling edge
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const edge = Math.abs(dx) === R || Math.abs(dz) === R;
      if (edge && noise(r.x + dx, r.z + dz, 3) < 50) yield [r.x + dx, r.y + 5, r.z + dz, leaf(T.leaf)];
      if (!edge && Math.abs(dx) <= 3 && Math.abs(dz) <= 3 && noise(r.x + dx, r.z + dz, 4) < 30) yield [r.x + dx, r.y, r.z + dz, id(T.mossc)];
    }
    for (const dx of [-3, 3]) {
      const z = r.z - b.side * (R - 1);
      yield [r.x + dx, r.y, z, id(T.moss)];
      yield [r.x + dx, r.y + 1, z, id(T.plant[0])];
    }
  }
}

/**
 * Greenery and obstacles inside a hall: moss planters with azaleas between the
 * wall pilasters, leaves draped along the top of the walls and around the
 * pillar capitals, moss creeping over the floor, and (in some halls) a fallen
 * column with rubble to fight around.
 */
function* garden(c, R, H, T, boss, i) {
  // planters along the walls (between pilasters, away from the doors)
  for (let a = -R + 1; a <= R - 1; a++) {
    const m = Math.abs(a) % 5;
    if (m !== 2 && m !== 3) continue;
    if (Math.abs(a) <= 2) continue;
    for (const [px, pz] of [[a, -R], [a, R], [-R, a], [R, a]]) {
      const x = c.x + px;
      const z = c.z + pz;
      yield [x, c.y, z, id(T.moss)];
      yield [x, c.y + 1, z, id(T.plant[noise(x, z, 5) % 2])];
    }
  }
  // leaves along the top of the walls
  for (let a = -R; a <= R; a++) {
    for (const [px, pz] of [[a, -R], [a, R], [-R, a], [R, a]]) {
      const x = c.x + px;
      const z = c.z + pz;
      if (noise(x, z, 6) < 70) yield [x, c.y + H - 1, z, leaf(T.leaf)];
      if (noise(x, z, 7) < 30) yield [x, c.y + H - 2, z, leaf(T.leaf)];
    }
  }
  // leaves around the inner pillar tops, moss at their base
  const P = boss ? 8 : 6;
  for (const [px, pz] of [[-P, -P], [P, -P], [-P, P], [P, P]]) {
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      yield [c.x + px + ox, c.y + H - 1, c.z + pz + oz, leaf(T.leaf)];
      if (noise(px + ox, pz + oz, 8 + i) < 50) yield [c.x + px + ox, c.y + H - 2, c.z + pz + oz, leaf(T.leaf)];
    }
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) yield [c.x + px + ox, c.y, c.z + pz + oz, id(T.mossc)];
  }
  // moss creeping over the floor (not on the runner)
  for (let dx = -R + 1; dx <= R - 1; dx++) for (let dz = -R + 1; dz <= R - 1; dz++) {
    if (Math.abs(dz) <= 1) continue;
    if (noise(c.x + dx, c.z + dz, 9) < 12) yield [c.x + dx, c.y, c.z + dz, id(T.mossc)];
  }
  // obstacle: a fallen column with rubble in every second monster hall
  if (!boss && i > 0 && i % 2 === 0) {
    const z = c.z + fallenZ(i);
    for (let dx = -5; dx <= 1; dx++) yield [c.x + dx, c.y, z, id(T.pillar)];
    yield [c.x + 2, c.y, z, id(T.cap)];
    for (const [rx, rz] of [[-6, 1], [3, -1], [-2, 1], [0, -1]]) yield [c.x + rx, c.y, z + rz, id(T.stripe)];
    yield [c.x - 3, c.y + 1, z, id(T.mossc)];
    yield [c.x - 1, c.y + 1, z, id(T.plant[0])];
  }
}
/** z offset of the fallen column in hall i (0 = none). */
export const fallenZ = (i) => (i > 0 && i % 2 === 0 ? (i % 4 === 0 ? 4 : -4) : 0);

/** A knight statue on a pedestal (with a sword-like end rod). */
function* statue(x, y, z, T, rank) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) yield [x + dx, y, z + dz, id(T.border)];
  yield [x, y + 1, z, id(T.statue)];
  yield [x, y + 2, z, id(T.statue)];
  for (const dz of [-1, 0, 1]) yield [x, y + 3, z + dz, id(T.statue)];
  yield [x, y + 4, z, id(rank >= 4 ? "wither_skeleton_skull" : "skeleton_skull")];
  yield [x - 1, y + 1, z + 1, id("end_rod")];
}

/** Boss throne + caged treasure vault beside it. */
function* throne(x, y, z, T, chests, hall) {
  for (let dx = -1; dx <= 2; dx++) for (let dz = -3; dz <= 3; dz++) yield [x + dx, y, z + dz, id(T.border)];
  for (let dz = -1; dz <= 1; dz++) for (let h = 1; h <= 4; h++) yield [x + 2, y + h, z + dz, id(T.pillar)];
  yield [x + 1, y + 1, z, id(T.cap)];
  yield [x + 1, y + 2, z - 1, id(T.stripe)];
  yield [x + 1, y + 2, z + 1, id(T.stripe)];
  yield [x + 2, y + 5, z, id("gold_block")];
  for (const side of [-1, 1]) {
    const cz = z + side * 6;
    chests.push({ x: x + 1, y: y + 1, z: cz, kind: "boss", hall });
    for (let dx = 0; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
      yield [x + dx, y, cz + dz, id("gold_block")];
      if (!(dx === 1 && dz === 0)) for (let h = 1; h <= 2; h++) yield [x + dx, y + h, cz + dz, id("iron_bars")];
    }
    yield [x + 1, y + 2, cz, id("iron_bars")];
  }
}

/** Positions of the iron-bar doors to open when a hall is cleared. */
export function doorsOf(inst, base, i) {
  const { halls, branches } = layout(base, inst.n);
  const c = halls[i];
  const R = hallHalf(inst, i);
  const out = [];
  for (let dz = -1; dz <= 1; dz++) for (let y = 0; y <= 3; y++) out.push({ x: c.x + R + 1, y: c.y + y, z: c.z + dz });
  for (const b of branches.filter((b) => b.hall === i)) {
    for (let dx = -1; dx <= 1; dx++) for (let y = 0; y <= 3; y++) out.push({ x: c.x + dx, y: c.y + y, z: c.z + b.side * (R + 1) });
  }
  return out;
}

/** The iron cages around the boss vault. */
export function vaultBars(inst, base) {
  const { halls } = layout(base, inst.n);
  const c = halls[inst.n - 1];
  const x = c.x + hallHalf(inst, inst.n - 1) - 3;
  const out = [];
  for (const side of [-1, 1]) {
    const cz = c.z + side * 6;
    for (let dx = 0; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) for (let h = 1; h <= 2; h++) {
      if (!(dx === 1 && dz === 0 && h === 1)) out.push({ x: x + dx, y: c.y + h, z: cz + dz });
    }
  }
  return out;
}
