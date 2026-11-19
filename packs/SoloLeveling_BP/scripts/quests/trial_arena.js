// The Job Change trial hall: a dark cathedral where the Blood-Red Commander
// waits on his throne. Pure design (operation list, see gates/plan.js).
import { mulberry32, Painter, themeOf } from "../gates/plan.js";

export const HALL = { x: 26, z: 13 }; // inner half-size
export const EXTENT = { x: 30, yLo: -4, yHi: 24, z: 17 }; // area to clear/protect
/** Player start, wave spawn points and the throne (relative to the origin). */
export const START = { x: -23, y: 0, z: 0 };
export const SPAWNS = [[-10, -11], [4, -11], [18, -11], [-10, 11], [4, 11], [18, 11], [-17, -5], [-17, 5], [10, -5], [10, 5]];
export const THRONE = { x: 21, y: 2, z: 0 };

const ceilAt = (z) => 14 + Math.round(6 * Math.cos((Math.abs(z) / (HALL.z + 1)) * (Math.PI / 2)));

/** @param {{x:number,y:number,z:number}} o floor-level origin */
export function trialDesign(o) {
  const rnd = mulberry32(7331);
  const p = new Painter(rnd, { ...themeOf(5), stone: ["polished_blackstone_bricks", "polished_blackstone_bricks", "cracked_polished_blackstone_bricks"], trim: "chiseled_polished_blackstone" });
  const X = (v) => o.x + v;
  const Y = (v) => o.y + v;
  const Z = (v) => o.z + v;
  // shell and vaulted nave
  p.fill(X(-HALL.x - 3), Y(-3), Z(-HALL.z - 3), X(HALL.x + 3), Y(23), Z(HALL.z + 3), "polished_blackstone_bricks");
  for (let z = -HALL.z; z <= HALL.z; z++) p.fill(X(-HALL.x), Y(0), Z(z), X(HALL.x), Y(ceilAt(z) - 1), Z(z), "air");
  // floor: dark tiles, gilded border lines, red runner to the throne
  for (let x = -HALL.x; x <= HALL.x; x++) for (let z = -HALL.z; z <= HALL.z; z++) {
    let f = (x + z) % 2 === 0 ? "polished_blackstone" : "polished_deepslate";
    if (Math.abs(z) === 3) f = "gilded_blackstone";
    if (x % 7 === 3 && Math.abs(z) === 5) f = "shroomlight";
    p.set(X(x), Y(-1), Z(z), f);
    if (Math.abs(z) <= 2 && x <= 18) p.set(X(x), Y(0), Z(z), "red_carpet");
  }
  // ceiling ribs
  for (let x = -HALL.x; x <= HALL.x; x += 7) for (let z = -HALL.z; z <= HALL.z; z++) p.set(X(x), Y(ceilAt(z)), Z(z), "chiseled_polished_blackstone");
  // pillars (2x2) in two rows, with red bands and hanging soul lanterns
  for (const px of [-21, -14, -7, 0, 7, 14]) {
    for (const pz of [-9, 7]) {
      const h = ceilAt(pz);
      for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let y = 0; y < h; y++) {
        const band = y === 0 || y === 5 || y === h - 1;
        p.set(X(px + a), Y(y), Z(pz + b), band ? "chiseled_polished_blackstone" : y === 6 ? "red_nether_bricks" : "polished_blackstone_bricks");
      }
    }
    for (const lz of [-5, 5]) p.set(X(px + 3), Y(ceilAt(lz) - 1), Z(lz), { id: "minecraft:soul_lantern", states: { hanging: true } });
  }
  // tall red windows glowing from behind
  for (const wz of [-(HALL.z + 1), HALL.z + 1]) {
    for (const wx of [-18, -11, -4, 3, 10, 17]) {
      for (let a = 0; a <= 1; a++) for (let y = 4; y <= 11; y++) {
        p.set(X(wx + a), Y(y), Z(wz), y === 11 ? "chiseled_polished_blackstone" : "red_stained_glass");
        p.set(X(wx + a), Y(y), Z(wz + Math.sign(wz)), "shroomlight");
      }
    }
  }
  // kneeling knights along the walls, facing the nave
  for (const sx of [-17, -3, 11]) {
    p.statue(X(sx), Y(0), Z(-11), [0, 1]);
    p.statue(X(sx), Y(0), Z(11), [0, -1]);
  }
  // throne dais: three steps, braziers and the throne
  for (let step = 0; step < 3; step++) {
    const x0 = 19 + step * 2;
    const w = 6 - step;
    for (let x = x0; x <= HALL.x; x++) for (let z = -w; z <= w; z++) p.set(X(x), Y(step), Z(z), step === 2 ? "polished_blackstone" : "chiseled_polished_blackstone");
  }
  for (const s of [-5, 5]) {
    p.set(X(20), Y(1), Z(s), "soul_campfire");
    p.set(X(22), Y(2), Z(s - Math.sign(s)), "gold_block");
  }
  for (let y = 3; y <= 7; y++) for (let z = -1; z <= 1; z++) p.set(X(25), Y(y), Z(z), y === 7 ? "gold_block" : z === 0 ? "red_nether_bricks" : "chiseled_polished_blackstone");
  p.set(X(24), Y(3), Z(-1), "polished_blackstone_bricks");
  p.set(X(24), Y(3), Z(1), "polished_blackstone_bricks");
  // great window behind the throne
  for (let y = 9; y <= 16; y++) for (let z = -3; z <= 3; z++) {
    p.set(X(HALL.x + 1), Y(y), Z(z), Math.abs(z) === 3 || y === 16 ? "chiseled_polished_blackstone" : "red_stained_glass");
    p.set(X(HALL.x + 2), Y(y), Z(z), "shroomlight");
  }
  // entrance: a sealed great door behind the start
  for (let y = 0; y <= 7; y++) for (let z = -3; z <= 3; z++) p.set(X(-HALL.x - 1), Y(y), Z(z), Math.abs(z) === 3 || y === 7 ? "chiseled_polished_blackstone" : "iron_bars");
  for (let y = 0; y <= 6; y++) for (let z = -2; z <= 2; z++) p.set(X(-HALL.x - 2), Y(y), Z(z), "polished_blackstone_bricks");
  for (const s of [-4, 4]) p.post(X(-HALL.x + 1), Y(0), Z(s), 2);
  return p.ops;
}
