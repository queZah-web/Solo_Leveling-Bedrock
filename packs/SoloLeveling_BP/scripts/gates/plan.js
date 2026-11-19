// Dungeon generator: a branching "jungle ruins" cavern.
//
// The dungeon is a grid of cells (CELL x CELL blocks). Rooms grow from the
// start cell into a random tree, a few extra links make loops (several ways
// through), the farthest dead end is the boss, and every other dead end is a
// different kind of ending: treasure vault, armory, library or shrine.
// Monster rooms come in five styles: grove (giant tree), temple, chasm
// (bridges over water), garden (fountain) and ruins (colonnade).
//
// Pure module (no game imports): the same code builds the dungeon in game and
// renders the previews offline. Output is a list of operations:
//   [x, y, z, block]                     one block
//   ["F", x1, y1, z1, x2, y2, z2, block]  a filled box
// block = "name" (minecraft: is implied) or {id, states}.

export const CELL = 36;
/** grid size (cells) and room count per rank E..S */
const GRID = [[5, 4], [5, 5], [6, 5], [6, 6], [7, 6], [7, 7]];
export const ROOM_COUNT = [12, 14, 17, 20, 23, 26];
/** vertical span of a dungeon, relative to its base */
export const Y_LO = -10;
export const Y_HI = 27;

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (rnd, a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------- themes
// Every rank is an overgrown ruin; the stone, wood and glow change with rank.
const THEMES = [
  { stone: ["mossy_stone_bricks", "mossy_stone_bricks", "stone_bricks", "cracked_stone_bricks", "mossy_cobblestone"], trim: "chiseled_stone_bricks",
    floor: ["moss_block", "moss_block", "grass_block", "mossy_stone_bricks", "stone_bricks", "coarse_dirt"], path: ["stone_bricks", "mossy_stone_bricks", "cracked_stone_bricks"],
    log: "jungle_log", plank: "jungle_planks", fence: "jungle_fence", glow: "shroomlight", lamp: "lantern", accent: "prismarine_bricks", accentGlow: "sea_lantern" },
  { stone: ["mossy_stone_bricks", "stone_bricks", "mossy_cobblestone", "cracked_stone_bricks", "andesite"], trim: "chiseled_stone_bricks",
    floor: ["moss_block", "grass_block", "grass_block", "podzol", "mossy_stone_bricks", "coarse_dirt"], path: ["stone_bricks", "mossy_stone_bricks", "polished_andesite"],
    log: "jungle_log", plank: "jungle_planks", fence: "jungle_fence", glow: "shroomlight", lamp: "lantern", accent: "prismarine_bricks", accentGlow: "sea_lantern" },
  { stone: ["mossy_stone_bricks", "stone_bricks", "tuff_bricks", "mossy_cobblestone", "cracked_stone_bricks"], trim: "chiseled_tuff_bricks",
    floor: ["moss_block", "moss_block", "grass_block", "rooted_dirt", "mossy_stone_bricks"], path: ["tuff_bricks", "polished_tuff", "mossy_stone_bricks"],
    log: "oak_log", plank: "spruce_planks", fence: "spruce_fence", glow: "verdant_froglight", lamp: "soul_lantern", accent: "prismarine", accentGlow: "sea_lantern" },
  { stone: ["mossy_stone_bricks", "deepslate_bricks", "mossy_cobblestone", "cracked_deepslate_bricks", "stone_bricks"], trim: "chiseled_deepslate",
    floor: ["moss_block", "moss_block", "grass_block", "podzol", "deepslate_tiles"], path: ["deepslate_tiles", "polished_deepslate", "mossy_stone_bricks"],
    log: "dark_oak_log", plank: "dark_oak_planks", fence: "dark_oak_fence", glow: "shroomlight", lamp: "soul_lantern", accent: "dark_prismarine", accentGlow: "verdant_froglight" },
  { stone: ["mossy_stone_bricks", "deepslate_bricks", "deepslate_tiles", "mossy_cobblestone", "cracked_deepslate_bricks"], trim: "chiseled_deepslate",
    floor: ["moss_block", "moss_block", "grass_block", "deepslate_tiles", "rooted_dirt"], path: ["polished_deepslate", "deepslate_tiles", "mossy_stone_bricks"],
    log: "dark_oak_log", plank: "dark_oak_planks", fence: "dark_oak_fence", glow: "verdant_froglight", lamp: "soul_lantern", accent: "dark_prismarine", accentGlow: "verdant_froglight" },
  { stone: ["polished_blackstone_bricks", "mossy_stone_bricks", "cracked_polished_blackstone_bricks", "mossy_cobblestone", "blackstone"], trim: "chiseled_polished_blackstone",
    floor: ["moss_block", "moss_block", "grass_block", "blackstone", "rooted_dirt"], path: ["polished_blackstone_bricks", "polished_blackstone", "mossy_stone_bricks"],
    log: "dark_oak_log", plank: "crimson_planks", fence: "crimson_fence", glow: "pearlescent_froglight", lamp: "soul_lantern", accent: "crying_obsidian", accentGlow: "verdant_froglight" },
];
export const themeOf = (rank) => THEMES[rank];

const FLOWERS = ["poppy", "blue_orchid", "allium", "azure_bluet", "oxeye_daisy", "cornflower", "lily_of_the_valley", "dandelion"];
const LEAVES = [
  { id: "minecraft:azalea_leaves", states: { persistent_bit: true } },
  { id: "minecraft:azalea_leaves", states: { persistent_bit: true } },
  { id: "minecraft:azalea_leaves_flowered", states: { persistent_bit: true } },
  { id: "minecraft:jungle_leaves", states: { persistent_bit: true } },
];
const log = (name, axis = "y") => ({ id: `minecraft:${name}`, states: { pillar_axis: axis } });
const hanging = (name) => ({ id: `minecraft:${name}`, states: { hanging: true } });

// ---------------------------------------------------------------- plan
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const COMBAT = ["grove", "temple", "chasm", "garden", "ruins"];
const ENDINGS = ["treasure", "armory", "library", "shrine"];
const HEIGHT = { start: 10, boss: 22, grove: 19, temple: 15, chasm: 16, garden: 13, ruins: 13, treasure: 10, armory: 10, library: 10, shrine: 11 };

/**
 * @typedef {{id:number, gx:number, gz:number, cx:number, cy:number, cz:number, R:number, H:number,
 *  kind:string, doors:{dir:number[], to:number}[], dist:number}} Room
 * @typedef {{seed:number, rank:number, base:{x:number,y:number,z:number}, W:number, D:number, rooms:Room[],
 *  links:number[][], order:number[], boss:number, from:{x:number,y:number,z:number}, to:{x:number,y:number,z:number}}} Plan
 */

/** @returns {Plan} */
export function makePlan(seed, rank, base) {
  const rnd = mulberry32(seed);
  const [W, D] = GRID[rank];
  const target = ROOM_COUNT[rank];
  const at = new Map();
  const key = (x, z) => `${x},${z}`;
  /** @type {any[]} */
  const rooms = [{ id: 0, gx: 0, gz: Math.floor(D / 2), links: [] }];
  at.set(key(0, rooms[0].gz), 0);
  const link = (a, b) => {
    rooms[a].links.push(b);
    rooms[b].links.push(a);
  };
  for (let tries = 0; rooms.length < target && tries < 4000; tries++) {
    // grow mostly from the newest rooms (long winding paths), sometimes branch from anywhere
    const from = rnd() < 0.6 ? rooms[rooms.length - 1 - Math.floor(rnd() * Math.min(3, rooms.length))] : pick(rnd, rooms);
    if (from.id === 0 && from.links.length >= 2) continue;
    if (from.links.length >= 3 && rnd() < 0.75) continue;
    for (const [dx, dz] of shuffle(rnd, [...DIRS])) {
      const nx = from.gx + dx;
      const nz = from.gz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || at.has(key(nx, nz))) continue;
      const r = { id: rooms.length, gx: nx, gz: nz, links: [] };
      rooms.push(r);
      at.set(key(nx, nz), r.id);
      link(from.id, r.id);
      break;
    }
  }
  // distances from the start; the farthest dead end holds the boss
  const bfs = () => {
    const dist = rooms.map(() => -1);
    const order = [0];
    dist[0] = 0;
    for (let i = 0; i < order.length; i++) {
      for (const n of rooms[order[i]].links) if (dist[n] < 0) (dist[n] = dist[order[i]] + 1), order.push(n);
    }
    return { dist, order };
  };
  let { dist } = bfs();
  const leaves = rooms.filter((r) => r.id && r.links.length === 1);
  const boss = (leaves.length ? leaves : rooms.slice(1)).reduce((a, b) => (dist[b.id] > dist[a.id] ? b : a)).id;
  // loops between neighbouring corridor rooms: more than one way through
  let loops = Math.floor(target / 5);
  for (const r of shuffle(rnd, [...rooms])) {
    if (loops <= 0) break;
    if (r.id === 0 || r.id === boss || r.links.length < 2) continue;
    for (const [dx, dz] of DIRS) {
      const o = at.get(key(r.gx + dx, r.gz + dz));
      if (o === undefined || o === 0 || o === boss || r.links.includes(o) || rooms[o].links.length < 2) continue;
      if (rnd() < 0.5) {
        link(r.id, o);
        loops--;
        break;
      }
    }
  }
  const bf = bfs();
  dist = bf.dist;
  // kinds
  const endings = shuffle(rnd, [...ENDINGS]);
  const styles = shuffle(rnd, [...COMBAT]);
  let e = 0;
  let s = 0;
  for (const r of rooms) {
    if (r.id === 0) r.kind = "start";
    else if (r.id === boss) r.kind = "boss";
    else if (r.links.length === 1) r.kind = endings[e++ % endings.length];
  }
  for (const r of bf.order.map((i) => rooms[i])) {
    if (r.kind) continue;
    let k = styles[s++ % styles.length];
    for (let t = 0; t < 4 && r.links.some((n) => rooms[n].kind === k); t++) k = styles[s++ % styles.length];
    r.kind = k;
  }
  // size and floor height
  for (const r of rooms) {
    r.R = r.kind === "start" ? 10 : r.kind === "boss" ? 16 : ENDINGS.includes(r.kind) ? 8 + Math.floor(rnd() * 2) : 11 + Math.floor(rnd() * 4);
    r.H = HEIGHT[r.kind];
    r.dy = r.kind === "start" || r.kind === "boss" ? 0 : Math.floor(rnd() * 7) - 3;
  }
  // corridors must stay walkable: limit the height step between linked rooms
  for (let pass = 0; pass < 6; pass++) {
    for (const r of rooms) {
      for (const n of r.links) {
        const o = rooms[n];
        const allow = Math.max(0, CELL - r.R - o.R - 6);
        const diff = o.dy - r.dy;
        if (Math.abs(diff) <= allow) continue;
        const fix = (diff > 0 ? 1 : -1) * (Math.abs(diff) - allow);
        if (o.kind === "start" || o.kind === "boss") r.dy += fix;
        else o.dy -= fix;
      }
    }
  }
  const out = rooms.map((r) => ({
    id: r.id, gx: r.gx, gz: r.gz, kind: r.kind, R: r.R, H: r.H, dist: dist[r.id],
    cx: base.x + r.gx * CELL + CELL / 2, cy: base.y + r.dy, cz: base.z + r.gz * CELL + CELL / 2,
    doors: r.links.map((n) => ({ dir: [rooms[n].gx - r.gx, rooms[n].gz - r.gz], to: n })),
  }));
  const links = [];
  for (const r of rooms) for (const n of r.links) if (r.id < n) links.push([r.id, n]);
  return {
    seed, rank, base, W, D, rooms: out, links, order: bf.order, boss,
    from: { x: base.x, y: base.y + Y_LO, z: base.z },
    to: { x: base.x + W * CELL - 1, y: base.y + Y_HI, z: base.z + D * CELL - 1 },
  };
}

/** The cell a room sits in. */
export const cellBox = (plan, r) => ({
  from: { x: plan.base.x + r.gx * CELL, y: plan.base.y + Y_LO, z: plan.base.z + r.gz * CELL },
  to: { x: plan.base.x + r.gx * CELL + CELL - 1, y: plan.base.y + Y_HI, z: plan.base.z + r.gz * CELL + CELL - 1 },
});

/** Iron-bar plane closing one doorway of a room. */
export function sealOf(r, door) {
  const [dx, dz] = door.dir;
  const out = [];
  const t = r.R + 1;
  for (let w = -2; w <= 2; w++) {
    for (let y = 0; y <= 4; y++) out.push({ x: r.cx + dx * t + (dz ? w : 0), y: r.cy + y, z: r.cz + dz * t + (dx ? w : 0) });
  }
  return out;
}

/** Order in which rooms are built (start first, then outward). */
export const buildOrder = (plan) => plan.order;

// ---------------------------------------------------------------- painter
export class Painter {
  constructor(rnd, T) {
    this.ops = [];
    this.chests = [];
    this.rnd = rnd;
    this.T = T;
  }
  set(x, y, z, b) {
    this.ops.push([x, y, z, b]);
  }
  fill(x1, y1, z1, x2, y2, z2, b) {
    this.ops.push(["F", Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2), b]);
  }
  stone() {
    return pick(this.rnd, this.T.stone);
  }
  leaf() {
    return pick(this.rnd, LEAVES);
  }
  plant() {
    const r = this.rnd();
    if (r < 0.38) return "short_grass";
    if (r < 0.58) return "fern";
    if (r < 0.82) return pick(this.rnd, FLOWERS);
    if (r < 0.94) return "moss_carpet";
    return this.rnd() < 0.5 ? "azalea" : "flowering_azalea";
  }
  /** Glowing vines hanging down from (x, y, z) for len blocks. */
  vines(x, y, z, len) {
    for (let i = 0; i < len; i++) {
      const last = i === len - 1;
      const berries = this.rnd() < 0.55;
      this.set(x, y - i, z, last ? (berries ? "cave_vines_head_with_berries" : "cave_vines") : berries ? "cave_vines_body_with_berries" : "cave_vines");
    }
  }
  /** Leaf blob (sphere-ish), with a glow block in the middle. */
  blob(x, y, z, r, glow = true, squash = 0.7) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -Math.ceil(r * squash); dy <= Math.ceil(r * squash); dy++) for (let dz = -r; dz <= r; dz++) {
      const d = (dx * dx + (dy / squash) * (dy / squash) + dz * dz) / (r * r);
      if (d <= 1 && (d < 0.6 || this.rnd() < 0.75)) this.set(x + dx, y + dy, z + dz, this.leaf());
    }
    if (glow) this.set(x, y, z, this.T.glow);
  }
  /** A post with a lantern on top. */
  post(x, y, z, h = 2) {
    for (let i = 0; i < h; i++) this.set(x, y + i, z, this.T.fence);
    this.set(x, y + h, z, this.T.lamp);
  }
  /** A moss-covered knight statue facing along f = [fx, fz]. */
  statue(x, y, z, f) {
    const s = [-f[1], f[0]]; // side
    const at = (side, h, b) => this.set(x + s[0] * side, y + h, z + s[1] * side, b);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.set(x + a, y, z + b, this.T.trim);
    at(-1, 1, "mossy_stone_bricks");
    at(1, 1, "mossy_stone_bricks");
    at(-1, 2, "stone_bricks");
    at(1, 2, "mossy_stone_bricks");
    for (const side of [-1, 0, 1]) at(side, 3, side ? "mossy_stone_bricks" : this.T.trim);
    for (const side of [-1, 0, 1]) at(side, 4, side ? "stone_bricks" : "mossy_stone_bricks");
    at(-2, 4, "mossy_cobblestone");
    at(2, 4, "mossy_cobblestone");
    at(0, 5, "mossy_stone_bricks");
    at(0, 6, this.rnd() < 0.5 ? "chiseled_stone_bricks" : "mossy_cobblestone");
    // greatsword held point-down
    for (let h = 1; h <= 3; h++) at(2, h, "iron_bars");
    at(2, 0, this.T.trim);
    if (this.rnd() < 0.7) at(-1, 5, this.leaf());
    if (this.rnd() < 0.5) at(1, 5, this.leaf());
  }
  chest(x, y, z, kind) {
    this.chests.push({ x, y, z, kind });
  }
}

// ---------------------------------------------------------------- room shape
function shapeOf(r, rnd) {
  const p = { temple: 4, boss: 5, garden: 3.5, library: 4, armory: 4, treasure: 3, start: 3 }[r.kind] ?? 2.3;
  const a = rnd() * 6.28;
  const b = rnd() * 6.28;
  const wob = r.kind === "boss" || r.kind === "temple" ? 0.06 : 0.14;
  const edgeR = (dx, dz) => {
    const th = Math.atan2(dz, dx);
    return r.R * (1 - wob + wob * (0.5 + 0.5 * Math.sin(3 * th + a) * Math.cos(2 * th + b)));
  };
  const norm = (dx, dz) => Math.pow(Math.pow(Math.abs(dx), p) + Math.pow(Math.abs(dz), p), 1 / p);
  const inside = (dx, dz) => norm(dx, dz) <= edgeR(dx, dz);
  const ceil = (dx, dz) => {
    const k = Math.min(1, norm(dx, dz) / Math.max(1, edgeR(dx, dz)));
    const dome = r.kind === "boss" || r.kind === "temple" || ENDINGS.includes(r.kind) || r.kind === "start" ? 0.25 : 0.45;
    return Math.max(6, Math.round(r.H * (1 - dome * k * k)));
  };
  return { inside, ceil, norm, edgeR };
}

/** cells (dx, dz) of the paved paths from every door to the middle */
function onPath(r, dx, dz, w = 1) {
  if (dx * dx + dz * dz <= 4) return true;
  return r.doors.some(({ dir: [ax, az] }) => {
    const along = dx * ax + dz * az;
    const perp = Math.abs(dx * az - dz * ax);
    return along >= 0 && perp <= w;
  });
}
function inApproach(r, dx, dz, extra = 0) {
  return r.doors.some(({ dir: [ax, az] }) => {
    const along = dx * ax + dz * az;
    const perp = Math.abs(dx * az - dz * ax);
    return along >= 0 && along <= r.R + 3 + extra && perp <= 2;
  });
}

// ---------------------------------------------------------------- rooms
/** All operations for one room and the corridors it owns. */
export function designRoom(plan, r) {
  const rnd = mulberry32((plan.seed ^ Math.imul(r.id + 1, 0x9e3779b1)) >>> 0);
  const T = THEMES[plan.rank];
  const p = new Painter(rnd, T);
  const { inside, ceil } = shapeOf(r, rnd);
  const { cx, cy, cz, R, H } = r;
  const deep = r.kind === "chasm" ? 7 : 3;
  // 1. solid shell, then carve the cave column by column
  p.fill(cx - R - 3, cy - deep - 1, cz - R - 3, cx + R + 3, cy + H + 2, cz + R + 3, T.stone[0]);
  /** @type {Map<string, number>} column -> ceiling height */
  const cols = new Map();
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if (!inside(dx, dz)) continue;
    const h = ceil(dx, dz);
    cols.set(`${dx},${dz}`, h);
    p.fill(cx + dx, cy, cz + dz, cx + dx, cy + h - 1, cz + dz, "air");
  }
  for (const { dir: [ax, az] } of r.doors) {
    for (let t = 0; t <= R + 3; t++) for (let w = -2; w <= 2; w++) {
      const dx = ax * t + (az ? w : 0);
      const dz = az * t + (ax ? w : 0);
      if (!cols.has(`${dx},${dz}`)) cols.set(`${dx},${dz}`, 5);
      p.fill(cx + dx, cy, cz + dz, cx + dx, cy + Math.max(4, (cols.get(`${dx},${dz}`) ?? 5) - 1), cz + dz, "air");
    }
  }
  const isCol = (dx, dz) => cols.has(`${dx},${dz}`);
  // 2. floor, walls, ceiling
  for (const [k, h] of cols) {
    const [dx, dz] = k.split(",").map(Number);
    const x = cx + dx;
    const z = cz + dz;
    const path = onPath(r, dx, dz);
    p.set(x, cy - 1, z, path ? pick(rnd, T.path) : pick(rnd, T.floor));
    p.set(x, cy + h, z, rnd() < 0.035 ? T.accentGlow : rnd() < 0.03 ? T.glow : p.stone());
    for (const [ox, oz] of DIRS) {
      if (isCol(dx + ox, dz + oz) || inApproach(r, dx + ox, dz + oz, 2)) continue;
      const nh = Math.min(h, H);
      for (let y = 0; y < nh; y++) {
        const roll = rnd();
        p.set(x + ox, cy + y, z + oz, roll < 0.12 ? p.leaf() : roll < 0.16 && y === 4 ? T.accentGlow : p.stone());
      }
    }
  }
  // 3. overgrowth: plants on the soil, vines and leaves from the ceiling
  const plantable = (dx, dz) => !onPath(r, dx, dz, 2) && !inApproach(r, dx, dz);
  const reserved = new Set();
  const free = (dx, dz) => isCol(dx, dz) && plantable(dx, dz) && !reserved.has(`${dx},${dz}`);
  const reserve = (dx, dz, rad = 0) => {
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) reserved.add(`${dx + a},${dz + b}`);
  };

  // 4. the room's own style
  const ctx = { plan, r, p, rnd, T, cols, isCol, free, reserve, inside };
  (STYLES[r.kind] ?? STYLES.ruins)(ctx);

  // plants last, only where nothing was built
  for (const [k, h] of cols) {
    const [dx, dz] = k.split(",").map(Number);
    const x = cx + dx;
    const z = cz + dz;
    if (free(dx, dz) && r.kind !== "chasm" && rnd() < 0.42) p.set(x, cy, z, p.plant());
    if (h > 7 && !reserved.has(k) && rnd() < 0.06) p.vines(x, cy + h - 1, z, 2 + Math.floor(rnd() * Math.min(6, h - 5)));
    else if (h > 6 && rnd() < 0.05) p.set(x, cy + h - 1, z, p.leaf());
  }
  // the boss room is sealed until enough of the dungeon is cleared
  if (r.kind === "boss") for (const d of r.doors) for (const b of sealOf(r, d)) p.set(b.x, b.y, b.z, "iron_bars");

  // corridors this room owns (to rooms built after it)
  const rank = new Map(plan.order.map((id, i) => [id, i]));
  for (const d of r.doors) if (rank.get(r.id) < rank.get(d.to)) corridor(plan, r, plan.rooms[d.to], d.dir, p);
  // arches over every doorway
  for (const { dir: [ax, az] } of r.doors) {
    const t = r.R + 2;
    for (let w = -3; w <= 3; w++) {
      const x = cx + ax * t + (az ? w : 0);
      const z = cz + az * t + (ax ? w : 0);
      if (Math.abs(w) === 3) for (let y = 0; y <= 5; y++) p.set(x, cy + y, z, T.trim);
      else p.set(x, cy + 5, z, T.trim);
    }
  }
  return { ops: p.ops, chests: p.chests };
}

// ---------------------------------------------------------------- corridors
function corridor(plan, a, b, [ax, az], p) {
  const T = p.T;
  const rnd = p.rnd;
  const t0 = a.R + 1;
  const t1 = CELL - b.R - 1;
  const n = t1 - t0;
  const bridge = a.cy === b.cy && n >= 9 && rnd() < 0.45;
  const yAt = (t) => {
    const k = Math.min(Math.max(t - t0 - 2, 0), Math.max(1, n - 4)) / Math.max(1, n - 4);
    return Math.round(a.cy + (b.cy - a.cy) * k);
  };
  const at = (t, w) => ({ x: a.cx + ax * t + (az ? w : 0), z: a.cz + az * t + (ax ? w : 0) });
  for (let t = t0; t <= t1; t++) {
    const y = yAt(t);
    const mid = bridge && t > t0 + 2 && t < t1 - 2;
    const half = mid ? 4 : 3;
    // shell + carve
    const s1 = at(t, -half);
    const s2 = at(t, half);
    p.fill(s1.x, y - (bridge ? 7 : 2), s1.z, s2.x, y + 6, s2.z, p.stone());
    const c1 = at(t, -(half - 1));
    const c2 = at(t, half - 1);
    p.fill(c1.x, mid ? y - 5 : y, c1.z, c2.x, y + 4, c2.z, "air");
    for (let w = -(half - 1); w <= half - 1; w++) {
      const c = at(t, w);
      if (mid) {
        // rope bridge over a flooded gap
        p.set(c.x, y - 6, c.z, "mossy_cobblestone");
        p.set(c.x, y - 5, c.z, "water");
        p.set(c.x, y - 4, c.z, "water");
        if (Math.abs(w) <= 1) p.set(c.x, y - 1, c.z, T.plank);
        if (Math.abs(w) === 1 && (t - t0) % 3 === 0) p.set(c.x, y, c.z, T.fence);
      } else {
        p.set(c.x, y - 1, c.z, Math.abs(w) <= 1 ? pick(rnd, T.path) : pick(rnd, T.floor));
        if (Math.abs(w) === 2 && rnd() < 0.3) p.set(c.x, y, c.z, rnd() < 0.5 ? "moss_carpet" : p.plant());
      }
      p.set(c.x, y + 5, c.z, rnd() < 0.06 ? T.accentGlow : p.stone());
    }
    // walls with leaves and lamps
    for (const w of [-half, half]) {
      const c = at(t, w);
      for (let yy = 0; yy <= 4; yy++) if (rnd() < 0.2) p.set(c.x, y + yy, c.z, p.leaf());
      if ((t - t0) % 6 === 3) p.set(c.x, y + 2, c.z, T.accentGlow);
    }
    if ((t - t0) % 5 === 2) {
      const c = at(t, 0);
      p.set(c.x, y + 4, c.z, hanging(T.lamp));
    } else if (rnd() < 0.18) {
      const c = at(t, Math.floor(rnd() * 3) - 1);
      p.vines(c.x, y + 4, c.z, 1 + Math.floor(rnd() * 2));
    }
  }
}

// ---------------------------------------------------------------- styles
/** Hands out free spots (dx, dz) in a ring around the middle. */
function spots(ctx, rMin, rMax, count, rad = 1) {
  const out = [];
  for (let i = 0; i < 300 && out.length < count; i++) {
    const a = ctx.rnd() * Math.PI * 2;
    const d = rMin + ctx.rnd() * (rMax - rMin);
    const dx = Math.round(Math.cos(a) * d);
    const dz = Math.round(Math.sin(a) * d);
    let ok = true;
    for (let x = -rad; x <= rad && ok; x++) for (let z = -rad; z <= rad && ok; z++) if (!ctx.free(dx + x, dz + z)) ok = false;
    if (!ok) continue;
    ctx.reserve(dx, dz, rad);
    out.push([dx, dz]);
  }
  return out;
}
/** Side direction away from doors (for things placed at the back). */
function backDir(r) {
  const used = r.doors.map((d) => d.dir.join());
  return DIRS.find((d) => !used.includes(d.join())) ?? [-r.doors[0].dir[0], -r.doors[0].dir[1]];
}
const towards = (dir) => [-dir[0], -dir[1]];

function tree(ctx, dx, dz, h, crown) {
  const { p, r, T } = ctx;
  const x = r.cx + dx;
  const z = r.cz + dz;
  for (let y = 0; y < h; y++) p.set(x, r.cy + y, z, log(T.log));
  p.blob(x, r.cy + h, z, crown, true);
}
/** small loot cache somewhere along the wall */
function cache(ctx, chance) {
  if (ctx.rnd() > chance) return;
  const [s] = spots(ctx, ctx.r.R - 3, ctx.r.R - 2, 1, 0);
  if (s) ctx.p.chest(ctx.r.cx + s[0], ctx.r.cy, ctx.r.cz + s[1], "cache");
}
/** planter: stone rim, soil, flowers */
function planter(ctx, dx, dz, a = 1) {
  const { p, r, T, rnd } = ctx;
  for (let x = -a; x <= a; x++) for (let z = -a; z <= a; z++) {
    const rim = Math.abs(x) === a || Math.abs(z) === a;
    p.set(r.cx + dx + x, r.cy, r.cz + dz + z, rim ? T.trim : "moss_block");
    if (!rim) p.set(r.cx + dx + x, r.cy + 1, r.cz + dz + z, rnd() < 0.6 ? pick(rnd, FLOWERS) : "azalea");
  }
}
function pool(ctx, dx, dz, rad, fountain = false) {
  const { p, r, T } = ctx;
  const E = Math.ceil(rad + 1.6);
  for (let x = -E; x <= E; x++) for (let z = -E; z <= E; z++) {
    const d = Math.sqrt(x * x + z * z);
    if (d > rad + 0.9) continue;
    const X = r.cx + dx + x;
    const Z = r.cz + dz + z;
    if (d > rad - 0.3) {
      p.set(X, r.cy, Z, T.trim);
      continue;
    }
    p.set(X, r.cy - 3, Z, "mossy_stone_bricks");
    p.set(X, r.cy - 2, Z, "water");
    p.set(X, r.cy - 1, Z, "water");
  }
  // the rim must hold the water: solid ring under it
  for (let x = -E; x <= E; x++) for (let z = -E; z <= E; z++) {
    const d = Math.sqrt(x * x + z * z);
    if (d > rad - 0.3 && d <= rad + 1.6) {
      p.set(r.cx + dx + x, r.cy - 1, r.cz + dz + z, T.trim);
      p.set(r.cx + dx + x, r.cy - 2, r.cz + dz + z, "mossy_stone_bricks");
    }
  }
  if (fountain) {
    for (let y = -1; y <= 2; y++) p.set(r.cx + dx, r.cy + y, r.cz + dz, y === 1 ? T.accentGlow : T.trim);
    p.set(r.cx + dx, r.cy + 3, r.cz + dz, "water");
  }
}
function brokenWall(ctx, dx, dz, len, along) {
  const { p, r, rnd } = ctx;
  for (let i = 0; i < len; i++) {
    const h = 1 + Math.floor(rnd() * 3);
    const x = r.cx + dx + (along ? i : 0);
    const z = r.cz + dz + (along ? 0 : i);
    for (let y = 0; y < h; y++) p.set(x, r.cy + y, z, p.stone());
    if (rnd() < 0.4) p.set(x, r.cy + h, z, p.leaf());
    ctx.reserve(x - r.cx, z - r.cz);
  }
}
function pillar(ctx, dx, dz, h, broken = false) {
  const { p, r, T, rnd } = ctx;
  const x = r.cx + dx;
  const z = r.cz + dz;
  const top = broken ? 2 + Math.floor(rnd() * 3) : h;
  for (let y = 0; y < top; y++) p.set(x, r.cy + y, z, y === 0 || y === top - 1 ? T.trim : p.stone());
  if (!broken) for (const [ox, oz] of DIRS) if (rnd() < 0.7) p.set(x + ox, r.cy + h - 1 - Math.floor(rnd() * 2), z + oz, p.leaf());
  else if (rnd() < 0.6) p.set(x, r.cy + top, z, p.leaf());
  if (broken && rnd() < 0.5) {
    // the fallen top lies next to it
    const [ox, oz] = pick(rnd, DIRS);
    for (let i = 1; i <= 3; i++) {
      if (!ctx.free(dx + ox * i, dz + oz * i)) break;
      p.set(x + ox * i, r.cy, z + oz * i, log(ctx.T.log, ox ? "x" : "z"));
      ctx.reserve(dx + ox * i, dz + oz * i);
    }
  }
}
const colH = (ctx, dx, dz) => ctx.cols.get(`${dx},${dz}`) ?? 6;

const STYLES = {
  start(ctx) {
    const { p, r, T } = ctx;
    const back = backDir(r);
    ctx.reserve(back[0] * 6, back[1] * 6, 2); // the EXIT gate stands here
    // camp: campfire, log benches, supplies
    for (const [fx, fz] of spots(ctx, 4, 6, 1, 2)) {
      p.set(r.cx + fx, r.cy, r.cz + fz, "campfire");
      for (const [ox, oz] of DIRS) p.set(r.cx + fx + ox * 2, r.cy, r.cz + fz + oz * 2, log(T.log, ox ? "z" : "x"));
    }
    for (const [sx, sz] of spots(ctx, 5, r.R - 2, 4, 0)) p.set(r.cx + sx, r.cy, r.cz + sz, ctx.rnd() < 0.5 ? "barrel" : "crafting_table");
    for (const [sx, sz] of spots(ctx, 4, r.R - 2, 4, 0)) p.post(r.cx + sx, r.cy, r.cz + sz);
    for (const s of [-1, 1]) {
      const d = [back[1] * s, back[0] * s];
      p.statue(r.cx + back[0] * 6 + d[0] * 4, r.cy, r.cz + back[1] * 6 + d[1] * 4, towards(back));
      ctx.reserve(back[0] * 6 + d[0] * 4, back[1] * 6 + d[1] * 4, 2);
    }
  },
  grove(ctx) {
    const { p, r, T, rnd } = ctx;
    // giant tree in the middle with roots, branches and a glowing crown
    const h = Math.min(r.H - 6, 13);
    for (let x = 0; x <= 1; x++) for (let z = 0; z <= 1; z++) for (let y = -1; y < h; y++) p.set(r.cx + x, r.cy + y, r.cz + z, log(T.log));
    ctx.reserve(0, 0, 2);
    for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const bx = ox > 0 ? 2 : -1;
      const bz = oz > 0 ? 2 : -1;
      for (let i = 0; i < 3; i++) {
        const rx = bx + (ox > 0 ? i : -i);
        const rz = bz + (oz > 0 ? i : -i);
        p.set(r.cx + rx, r.cy, r.cz + rz, log(T.log, "x"));
        ctx.reserve(rx, rz);
      }
    }
    const top = r.cy + h;
    for (const [ox, oz] of DIRS) {
      const by = r.cy + Math.floor(h * 0.55) + Math.floor(rnd() * 3);
      const len = 4 + Math.floor(rnd() * 2);
      const sx = ox > 0 ? 2 : ox < 0 ? -1 : 0;
      const sz = oz > 0 ? 2 : oz < 0 ? -1 : 0;
      for (let i = 0; i < len; i++) p.set(r.cx + sx + ox * i, by + Math.floor(i / 2), r.cz + sz + oz * i, log(T.log, ox ? "x" : "z"));
      p.blob(r.cx + sx + ox * len, by + Math.floor(len / 2) + 1, r.cz + sz + oz * len, 3, true);
      p.vines(r.cx + sx + ox * len + 1, by + Math.floor(len / 2) - 2, r.cz + sz + oz * len, 3);
    }
    const crown = Math.min(6, Math.floor((r.H - h) / 1.2) + 3);
    p.blob(r.cx, top + 1, r.cz, crown, true, 0.55);
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 2 + rnd() * (crown - 1);
      p.vines(r.cx + Math.round(Math.cos(a) * d), top - 2, r.cz + Math.round(Math.sin(a) * d), 2 + Math.floor(rnd() * 4));
    }
    // ring path around the tree, planters and small trees
    for (let a = 0; a < 64; a++) {
      const x = Math.round(Math.cos((a / 64) * 6.283) * 4);
      const z = Math.round(Math.sin((a / 64) * 6.283) * 4);
      p.set(r.cx + x, r.cy - 1, r.cz + z, pick(rnd, T.path));
      ctx.reserve(x, z);
    }
    for (const [sx, sz] of spots(ctx, 6, r.R - 3, 4, 1)) planter(ctx, sx, sz);
    for (const [sx, sz] of spots(ctx, 7, r.R - 2, 3, 1)) tree(ctx, sx, sz, 3 + Math.floor(rnd() * 2), 2);
    for (const [sx, sz] of spots(ctx, 6, r.R - 2, 2, 2)) pool(ctx, sx, sz, 1.6);
    for (const [sx, sz] of spots(ctx, 5, r.R - 2, 4, 0)) p.post(r.cx + sx, r.cy, r.cz + sz);
    cache(ctx, 0.4);
  },
  temple(ctx) {
    const { p, r, T, rnd } = ctx;
    const a = 4;
    // raised dais with steps, four great pillars and a guardian statue
    for (let x = -a - 1; x <= a + 1; x++) for (let z = -a - 1; z <= a + 1; z++) {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge === a + 1) p.set(r.cx + x, r.cy, r.cz + z, T.trim);
      else {
        p.set(r.cx + x, r.cy, r.cz + z, edge === a ? T.trim : pick(rnd, T.path));
        p.set(r.cx + x, r.cy + 1, r.cz + z, edge === a ? T.trim : pick(rnd, T.path));
      }
    }
    ctx.reserve(0, 0, a + 1);
    for (const [sx, sz] of [[-a, -a], [a, -a], [-a, a], [a, a]]) {
      const h = colH(ctx, sx, sz);
      for (let y = 2; y < h; y++) p.set(r.cx + sx, r.cy + y, r.cz + sz, y === 2 || y === h - 1 ? T.trim : p.stone());
      for (let y = 4; y < h - 1; y += 3) p.set(r.cx + sx, r.cy + y, r.cz + sz, T.accent);
      for (const [ox, oz] of DIRS) for (let y = h - 3; y < h; y++) if (rnd() < 0.6) p.set(r.cx + sx + ox, r.cy + y, r.cz + sz + oz, p.leaf());
      p.vines(r.cx + sx + (sx > 0 ? -1 : 1), r.cy + h - 2, r.cz + sz, 3);
    }
    p.statue(r.cx, r.cy + 2, r.cz, towards(r.doors[0].dir.map((v) => -v)));
    for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) p.set(r.cx + sx, r.cy + 2, r.cz + sz, T.lamp);
    // ruined arches around
    for (const [sx, sz] of spots(ctx, r.R - 4, r.R - 3, 4, 1)) {
      const along = Math.abs(sx) < Math.abs(sz);
      for (const o of [-1, 1]) for (let y = 0; y < 5; y++) p.set(r.cx + sx + (along ? o : 0), r.cy + y, r.cz + sz + (along ? 0 : o), p.stone());
      if (rnd() < 0.7) p.set(r.cx + sx, r.cy + 4, r.cz + sz, T.trim);
      p.set(r.cx + sx, r.cy + 5, r.cz + sz, p.leaf());
    }
    for (const [sx, sz] of spots(ctx, 7, r.R - 2, 2, 2)) pool(ctx, sx, sz, 1.6);
    for (const [sx, sz] of spots(ctx, 6, r.R - 2, 4, 0)) p.post(r.cx + sx, r.cy, r.cz + sz);
    cache(ctx, 0.35);
  },
  chasm(ctx) {
    const { p, r, T, rnd } = ctx;
    // the floor falls into a flooded chasm; bridges cross it to a middle island
    for (const [k] of ctx.cols) {
      const [dx, dz] = k.split(",").map(Number);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 3 || ctx.inside(dx * 1.12, dz * 1.12) === false) continue; // island + ledge by the walls
      const x = r.cx + dx;
      const z = r.cz + dz;
      p.fill(x, r.cy - 6, z, x, r.cy - 1, z, "air");
      p.set(x, r.cy - 7, z, "mossy_stone_bricks");
      p.set(x, r.cy - 6, z, "water");
      p.set(x, r.cy - 5, z, "water");
      const bridge = (Math.abs(dz) <= 2 && Math.abs(dx) > 0) || (Math.abs(dx) <= 2 && Math.abs(dz) > 0);
      if (bridge) {
        const perp = Math.abs(dx) <= 2 && Math.abs(dz) <= 2 ? 0 : Math.abs(dz) <= 2 ? Math.abs(dz) : Math.abs(dx);
        p.set(x, r.cy - 1, z, T.plank);
        if (perp === 2 && (dx + dz) % 3 === 0) p.post(x, r.cy, z, 1);
        else if (perp === 2) p.set(x, r.cy, z, T.fence);
      }
      ctx.reserve(dx, dz);
    }
    // the island
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 10) p.set(r.cx + x, r.cy - 1, r.cz + z, pick(rnd, T.path));
    for (let y = 0; y < 3; y++) p.set(r.cx, r.cy + y, r.cz, y === 2 ? T.accentGlow : T.trim);
    // steps up out of the water in the four corners
    for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      for (let i = 0; i < 5; i++) {
        const d = r.R * 0.5 + i * 0.75;
        const x = Math.round(ox * d * 0.7071);
        const z = Math.round(oz * d * 0.7071);
        if (!ctx.isCol(x, z)) continue;
        p.fill(r.cx + x, r.cy - 6, r.cz + z, r.cx + x, r.cy - 5 + i, r.cz + z, "mossy_cobblestone");
      }
    }
    // long glowing vines into the chasm
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 4 + rnd() * (r.R - 6);
      const x = Math.round(Math.cos(a) * d);
      const z = Math.round(Math.sin(a) * d);
      if (Math.abs(x) <= 2 || Math.abs(z) <= 2) continue;
      const h = colH(ctx, x, z);
      p.vines(r.cx + x, r.cy + h - 1, r.cz + z, 4 + Math.floor(rnd() * 6));
    }
  },
  garden(ctx) {
    const { p, r, T, rnd } = ctx;
    // fountain courtyard, flower beds behind hedges, small azalea trees
    pool(ctx, 0, 0, 2.6, true);
    ctx.reserve(0, 0, 3);
    for (let a = 0; a < 72; a++) {
      const x = Math.round(Math.cos((a / 72) * 6.283) * 4.5);
      const z = Math.round(Math.sin((a / 72) * 6.283) * 4.5);
      p.set(r.cx + x, r.cy - 1, r.cz + z, pick(rnd, T.path));
      ctx.reserve(x, z);
    }
    for (const [sx, sz] of spots(ctx, 6, r.R - 3, 6, 1)) planter(ctx, sx, sz);
    for (const [sx, sz] of spots(ctx, 7, r.R - 2, 4, 1)) tree(ctx, sx, sz, 3 + Math.floor(rnd() * 2), 2);
    // hedges
    for (const [sx, sz] of spots(ctx, 6, r.R - 3, 4, 0)) {
      const along = rnd() < 0.5;
      for (let i = -2; i <= 2; i++) {
        const x = sx + (along ? i : 0);
        const z = sz + (along ? 0 : i);
        if (!ctx.isCol(x, z) || onPath(r, x, z, 1)) continue;
        p.set(r.cx + x, r.cy, r.cz + z, p.leaf());
        ctx.reserve(x, z);
      }
    }
    for (const [sx, sz] of spots(ctx, 5, r.R - 2, 6, 0)) p.post(r.cx + sx, r.cy, r.cz + sz);
    cache(ctx, 0.4);
  },
  ruins(ctx) {
    const { r, rnd } = ctx;
    // a colonnade along the main path, broken walls and fallen pillars as cover
    const main = r.doors[0].dir;
    for (let t = -r.R + 3; t <= r.R - 3; t += 4) {
      for (const s of [-5, 5]) {
        const dx = main[0] * t + (main[1] ? s : 0);
        const dz = main[1] * t + (main[0] ? s : 0);
        if (!ctx.free(dx, dz)) continue;
        pillar(ctx, dx, dz, colH(ctx, dx, dz), rnd() < 0.35);
        ctx.reserve(dx, dz);
      }
    }
    for (const [sx, sz] of spots(ctx, 4, r.R - 3, 5, 1)) brokenWall(ctx, sx - 1, sz, 3 + Math.floor(rnd() * 2), rnd() < 0.5);
    for (const [sx, sz] of spots(ctx, 6, r.R - 2, 2, 2)) pool(ctx, sx, sz, 1.6);
    for (const [sx, sz] of spots(ctx, 5, r.R - 2, 4, 0)) ctx.p.post(r.cx + sx, r.cy, r.cz + sz);
    for (const [sx, sz] of spots(ctx, 4, r.R - 2, 3, 0)) ctx.p.set(r.cx + sx, r.cy, r.cz + sz, rnd() < 0.5 ? "bookshelf" : "skeleton_skull");
    for (let i = 0; i < 6; i++) {
      const [sx, sz] = [Math.floor(rnd() * r.R * 2) - r.R, Math.floor(rnd() * r.R * 2) - r.R];
      if (ctx.isCol(sx, sz)) ctx.p.set(r.cx + sx, r.cy + colH(ctx, sx, sz) - 1, r.cz + sz, "cobweb");
    }
    cache(ctx, 0.45);
  },
  treasure(ctx) {
    const { p, r, T } = ctx;
    const b = r.doors[0].dir.map((v) => -v); // far wall
    const s = [b[1], b[0]];
    const at = (t, w) => [r.cx + b[0] * t + s[0] * w, r.cz + b[1] * t + s[1] * w];
    for (let w = -3; w <= 3; w++) for (let t = r.R - 3; t <= r.R - 1; t++) {
      const [x, z] = at(t, w);
      p.set(x, r.cy - 1, z, T.trim);
    }
    for (const w of [-2, 0, 2]) {
      const [x, z] = at(r.R - 2, w);
      p.chest(x, r.cy, z, "treasure");
    }
    for (const w of [-3, 3]) {
      const [x, z] = at(r.R - 2, w);
      p.set(x, r.cy, z, "gold_block");
      p.set(x, r.cy + 1, z, T.lamp);
    }
    for (const w of [-4, 4]) {
      const [x, z] = at(r.R - 4, w);
      p.statue(x, r.cy, z, towards(b));
    }
    for (let t = 0; t < r.R - 3; t++) {
      const [x, z] = at(t, 0);
      p.set(x, r.cy - 1, z, "gilded_blackstone");
    }
    ctx.reserve(0, 0, r.R);
  },
  armory(ctx) {
    const { p, r, T } = ctx;
    const b = r.doors[0].dir.map((v) => -v);
    const s = [b[1], b[0]];
    const at = (t, w) => [r.cx + b[0] * t + s[0] * w, r.cz + b[1] * t + s[1] * w];
    for (const w of [-2, 0, 2]) {
      const [x, z] = at(r.R - 2, w);
      p.chest(x, r.cy, z, "armory");
    }
    // weapon racks (fences with iron bars) and anvils along the side walls
    for (let t = -r.R + 3; t <= r.R - 3; t += 2) {
      for (const w of [-(r.R - 2), r.R - 2]) {
        const [x, z] = at(t, w);
        p.set(x, r.cy, z, T.fence);
        p.set(x, r.cy + 1, z, "iron_bars");
        p.set(x, r.cy + 2, z, T.lamp);
      }
    }
    for (const w of [-4, 4]) {
      const [x, z] = at(r.R - 3, w);
      p.set(x, r.cy, z, "anvil");
    }
    const [x, z] = at(1, 3);
    p.set(x, r.cy, z, "smithing_table");
    const [x2, z2] = at(1, -3);
    p.set(x2, r.cy, z2, "barrel");
    ctx.reserve(0, 0, r.R);
  },
  library(ctx) {
    const { p, r, T, rnd } = ctx;
    const b = r.doors[0].dir.map((v) => -v);
    const s = [b[1], b[0]];
    const at = (t, w) => [r.cx + b[0] * t + s[0] * w, r.cz + b[1] * t + s[1] * w];
    // shelves all around, a reading table with the enchanting table
    for (const [k] of ctx.cols) {
      const [dx, dz] = k.split(",").map(Number);
      if (inApproach(r, dx, dz)) continue;
      const edge = !ctx.isCol(dx + 1, dz) || !ctx.isCol(dx - 1, dz) || !ctx.isCol(dx, dz + 1) || !ctx.isCol(dx, dz - 1);
      if (edge) for (let y = 0; y < 4; y++) p.set(r.cx + dx, r.cy + y, r.cz + dz, y === 3 ? T.plank : "bookshelf");
    }
    for (let w = -1; w <= 1; w++) for (let t = -1; t <= 1; t++) {
      const [x, z] = at(t, w);
      p.set(x, r.cy - 1, z, "red_wool");
    }
    p.set(r.cx, r.cy, r.cz, "enchanting_table");
    for (const w of [-2, 2]) {
      const [x, z] = at(r.R - 3, w);
      p.chest(x, r.cy, z, "library");
    }
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) p.set(r.cx + dx, r.cy + colH(ctx, dx, dz) - 1, r.cz + dz, hanging(T.lamp));
    for (let i = 0; i < 4; i++) p.set(r.cx + Math.floor(rnd() * 9) - 4, r.cy + 6, r.cz + Math.floor(rnd() * 9) - 4, "cobweb");
    ctx.reserve(0, 0, r.R);
  },
  shrine(ctx) {
    const { p, r, T } = ctx;
    pool(ctx, 0, 0, 3.2, true);
    ctx.reserve(0, 0, 4);
    const b = r.doors[0].dir.map((v) => -v);
    p.statue(r.cx + b[0] * (r.R - 3), r.cy, r.cz + b[1] * (r.R - 3), towards(b));
    ctx.reserve(b[0] * (r.R - 3), b[1] * (r.R - 3), 2);
    const s = [b[1], b[0]];
    p.chest(r.cx + b[0] * (r.R - 3) + s[0] * 3, r.cy, r.cz + b[1] * (r.R - 3) + s[1] * 3, "shrine");
    for (const [sx, sz] of spots(ctx, 4, r.R - 2, 5, 1)) planter(ctx, sx, sz);
    for (const [sx, sz] of spots(ctx, 4, r.R - 2, 4, 0)) p.post(r.cx + sx, r.cy, r.cz + sz);
  },
  boss(ctx) {
    const { p, r, T, rnd } = ctx;
    const b = r.doors[0].dir.map((v) => -v); // towards the back
    const s = [b[1], b[0]];
    const X = (t, w) => r.cx + b[0] * t + s[0] * w;
    const Z = (t, w) => r.cz + b[1] * t + s[1] * w;
    // cathedral front on the back wall: arches with glowing glass
    const ft = r.R - 1;
    for (let w = -10; w <= 10; w++) {
      const h = colH(ctx, b[0] * ft + s[0] * w, b[1] * ft + s[1] * w);
      for (let y = 0; y < Math.min(h, 18); y++) {
        const win = Math.abs(w) % 4 !== 0 && y >= 3 && y <= 11 - Math.abs(w) % 4;
        const arch = Math.abs(w) % 4 === 0;
        p.set(X(ft, w), r.cy + y, Z(ft, w), arch ? (y % 4 === 0 ? T.accentGlow : T.trim) : win ? "cyan_stained_glass" : p.stone());
      }
    }
    for (let w = -10; w <= 10; w++) for (let y = 0; y < 18; y += 6) if (rnd() < 0.6) p.set(X(ft - 1, w), r.cy + y + 5, Z(ft - 1, w), p.leaf());
    // throne on a dais
    for (let t = r.R - 7; t <= r.R - 2; t++) for (let w = -4; w <= 4; w++) {
      p.set(X(t, w), r.cy, Z(t, w), t === r.R - 7 || Math.abs(w) === 4 ? T.trim : pick(rnd, T.path));
      ctx.reserve(X(t, w) - r.cx, Z(t, w) - r.cz);
    }
    for (let w = -1; w <= 1; w++) for (let y = 1; y <= 4; y++) p.set(X(r.R - 2, w), r.cy + y, Z(r.R - 2, w), w ? T.trim : T.accent);
    p.set(X(r.R - 3, 0), r.cy + 1, Z(r.R - 3, 0), T.trim);
    p.set(X(r.R - 2, 0), r.cy + 5, Z(r.R - 2, 0), "gold_block");
    // two caged vaults with the boss chests
    for (const side of [-1, 1]) {
      const w0 = side * 7;
      for (let t = r.R - 5; t <= r.R - 3; t++) for (let w = w0 - 1; w <= w0 + 1; w++) {
        p.set(X(t, w), r.cy, Z(t, w), "gold_block");
        const center = t === r.R - 4 && w === w0;
        if (!center) for (let y = 1; y <= 2; y++) p.set(X(t, w), r.cy + y, Z(t, w), "iron_bars");
        ctx.reserve(X(t, w) - r.cx, Z(t, w) - r.cz);
      }
      p.set(X(r.R - 4, w0), r.cy + 2, Z(r.R - 4, w0), "iron_bars");
      p.set(X(r.R - 4, w0), r.cy + 3, Z(r.R - 4, w0), T.lamp);
      p.chest(X(r.R - 4, w0), r.cy + 1, Z(r.R - 4, w0), "boss");
    }
    // great pillars and statues along the nave
    for (const t of [-9, -3, 3]) {
      for (const side of [-1, 1]) {
        const dx = b[0] * t + s[0] * side * 9;
        const dz = b[1] * t + s[1] * side * 9;
        if (!ctx.isCol(dx, dz)) continue;
        const h = colH(ctx, dx, dz);
        for (let x = 0; x <= 1; x++) for (let z = 0; z <= 1; z++) for (let y = 0; y < h; y++) {
          p.set(r.cx + dx + x, r.cy + y, r.cz + dz + z, y % 5 === 0 ? T.trim : p.stone());
        }
        for (let y = 4; y < h; y += 2) for (const [ox, oz] of [[-1, 0], [2, 0], [0, -1], [0, 2]]) if (rnd() < 0.5) p.set(r.cx + dx + ox, r.cy + y, r.cz + dz + oz, p.leaf());
        p.vines(r.cx + dx - 1, r.cy + h - 2, r.cz + dz, 5);
        ctx.reserve(dx, dz, 2);
        const sx = b[0] * (t + 3) + s[0] * side * 6;
        const sz = b[1] * (t + 3) + s[1] * side * 6;
        if (ctx.free(sx, sz)) {
          p.statue(r.cx + sx, r.cy, r.cz + sz, [-s[0] * side, -s[1] * side]);
          ctx.reserve(sx, sz, 2);
        }
      }
    }
    for (const [sx, sz] of spots(ctx, 8, r.R - 2, 2, 2)) pool(ctx, sx, sz, 1.6);
    for (const [sx, sz] of spots(ctx, 5, r.R - 3, 6, 0)) p.post(r.cx + sx, r.cy, r.cz + sz, 3);
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(rnd() * r.R * 2) - r.R;
      const z = Math.floor(rnd() * r.R * 2) - r.R;
      if (ctx.isCol(x, z)) p.vines(r.cx + x, r.cy + colH(ctx, x, z) - 1, r.cz + z, 3 + Math.floor(rnd() * 6));
    }
  },
};

/** Where the boss stands (in front of the throne). */
export function bossSpot(r) {
  const b = r.doors[0].dir.map((v) => -v);
  return { x: r.cx + b[0] * (r.R - 9) + 0.5, y: r.cy + 0.1, z: r.cz + b[1] * (r.R - 9) + 0.5 };
}
/** Iron bars of the two caged vaults beside the boss throne. */
export function vaultBarsOf(r) {
  const b = r.doors[0].dir.map((v) => -v);
  const s = [b[1], b[0]];
  const out = [];
  for (const side of [-1, 1]) {
    const w0 = side * 7;
    for (let t = r.R - 5; t <= r.R - 3; t++) for (let w = w0 - 1; w <= w0 + 1; w++) for (let y = 1; y <= 2; y++) {
      if (t === r.R - 4 && w === w0 && y === 1) continue;
      out.push({ x: r.cx + b[0] * t + s[0] * w, y: r.cy + y, z: r.cz + b[1] * t + s[1] * w });
    }
  }
  return out;
}
/** Where the EXIT gate stands in the start room. */
export function exitSpot(r) {
  const b = backDir(r);
  return { x: r.cx + b[0] * 6 + 0.5, y: r.cy, z: r.cz + b[1] * 6 + 0.5 };
}
export const isEnding = (kind) => ENDINGS.includes(kind);
export const isCombat = (kind) => COMBAT.includes(kind);
