/**
 * Natural set dressing at 1:10: a tree that forks into boughs under a crown of
 * soft, irregular clumps, and a weathered boulder. Every surface is a displaced,
 * subdivided form with welded smooth normals, so nothing reads as faceted.
 * Deterministic: the irregularity comes from a seeded random, never Math.random.
 */
import { BufferAttribute, BufferGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import { makeRandom } from './hardsurface.js';
import { BEAD, Kit, ball, limb, v } from './kit.js';

/**
 * Area-weighted normals shared by every vertex at the same position, so a
 * non-indexed or seamed surface shades as one smooth skin.
 */
export function smoothNormals(geometry: BufferGeometry): BufferGeometry {
  const p = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index ? index.count : p.count;
  const key = (i: number): string => `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
  const sums = new Map<string, Vector3>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let t = 0; t < count; t += 3) {
    const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
    a.fromBufferAttribute(p, ia);
    b.fromBufferAttribute(p, ib).sub(a);
    c.fromBufferAttribute(p, ic).sub(a);
    const face = b.clone().cross(c);
    for (const i of [ia, ib, ic]) {
      const k = key(i);
      const sum = sums.get(k);
      if (sum) sum.add(face);
      else sums.set(k, face.clone());
    }
  }
  const normals = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) {
    const n = (sums.get(key(i)) ?? new Vector3(0, 1, 0)).clone().normalize();
    normals.set([n.x, n.y, n.z], i * 3);
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}

type Wave = { k: Vector3; phase: number; amp: number };

/** A few plane waves in random directions; summed they make low-frequency lumps. */
function waves(rand: () => number, count: number, freq: number, amp: number): Wave[] {
  const out: Wave[] = [];
  for (let i = 0; i < count; i += 1) {
    const dir = v(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    out.push({ k: dir.normalize().multiplyScalar(freq * (0.8 + 0.4 * rand())), phase: rand() * Math.PI * 2, amp: amp * (0.6 + 0.8 * rand()) });
  }
  return out;
}

function field(list: Wave[], p: Vector3): number {
  let sum = 0;
  for (const w of list) sum += w.amp * Math.sin(w.k.dot(p) + w.phase);
  return sum;
}

/** A displaced icosphere: unit directions pushed out by `shape`, then scaled and moved into place. */
function blob(detail: number, shape: (dir: Vector3) => Vector3): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, detail);
  const p = geometry.getAttribute('position');
  const dir = new Vector3();
  for (let i = 0; i < p.count; i += 1) {
    dir.fromBufferAttribute(p, i).normalize();
    const out = shape(dir.clone());
    p.setXYZ(i, out.x, out.y, out.z);
  }
  return smoothNormals(geometry);
}

/** One clump of foliage: centre, radii, and icosphere detail (3 for the big ones). */
type Clump = { at: Vector3; r: number; sy: number; detail: number };

const CLUMPS: Clump[] = [
  { at: v(0, 0.29, 0), r: 0.07, sy: 0.92, detail: 3 },
  { at: v(0.046, 0.24, 0.022), r: 0.058, sy: 0.88, detail: 3 },
  { at: v(-0.05, 0.248, -0.018), r: 0.056, sy: 0.88, detail: 3 },
  { at: v(0.008, 0.338, -0.006), r: 0.044, sy: 0.95, detail: 2 },
  { at: v(-0.026, 0.232, 0.036), r: 0.046, sy: 0.85, detail: 2 },
  { at: v(0.032, 0.256, -0.04), r: 0.046, sy: 0.85, detail: 2 },
  { at: v(0.064, 0.288, -0.004), r: 0.04, sy: 0.9, detail: 2 },
  { at: v(-0.066, 0.29, 0.012), r: 0.038, sy: 0.9, detail: 2 },
];

/** Where the trunk divides into leaders, and the clumps (indices into CLUMPS) each leader feeds. */
const FORK = v(0, 0.135, 0);
const LEADERS: { split: Vector3; clumps: number[] }[] = [
  { split: v(0.024, 0.188, 0.006), clumps: [1, 5, 6] },
  { split: v(-0.026, 0.192, -0.004), clumps: [2, 4, 7] },
  { split: v(0.003, 0.215, 0.002), clumps: [0, 3] },
];

export function buildTree(leaf: MeshStandardMaterial, timber: MeshStandardMaterial): Group {
  const g = new Group();
  g.name = 'Tree';
  const rand = makeRandom(1907);
  const kit = new Kit();

  // A trunk that leans a little, flares into roots at the floor, and forks.
  const flare = v(0, 0.024, 0);
  const mid = v(0.004, 0.08, 0.003);
  kit.put('Trunk', timber,
    limb(v(0, 0, 0), flare, 0.02, 0.0142, 10),
    limb(flare, mid, 0.0142, 0.0122, 10),
    limb(mid, FORK, 0.0122, 0.0108, 10),
    ball(mid, 0.0122, 0.0122, 0.0122, BEAD),
    ball(FORK, 0.011, 0.011, 0.011, BEAD));
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.5 + rand() * 0.4;
    const reach = 0.026 + rand() * 0.006;
    kit.put('Trunk', timber, limb(v(0, 0.018, 0), v(Math.cos(a) * reach, 0.0035, Math.sin(a) * reach), 0.0065, 0.003, 6));
  }

  // The trunk splits into three leaders; each divides again into boughs that
  // reach up into their clumps, so the tips hide in the foliage.
  for (const { split, clumps } of LEADERS) {
    kit.put('Trunk', timber, limb(FORK, split, 0.0085, 0.0065, 7), ball(split, 0.0066, 0.0066, 0.0066, BEAD));
    for (const index of clumps) {
      const end = CLUMPS[index].at.clone().lerp(split, 0.3);
      const out = v(end.x - split.x, 0, end.z - split.z);
      if (out.lengthSq() > 1e-8) out.normalize().multiplyScalar(0.004 + rand() * 0.004);
      const bend = split.clone().lerp(end, 0.5).add(out);
      kit.put('Trunk', timber, limb(split, bend, 0.0058, 0.0042, 6), limb(bend, end, 0.0042, 0.0026, 5));
    }
  }

  // The crown: overlapping clumps, flatter underneath, each lumpy in its own way.
  for (const clump of CLUMPS) {
    const coarse = waves(rand, 4, 2.4, 0.07);
    const fine = waves(rand, 5, 5.5, 0.035);
    kit.put('Leaves', leaf, new Mesh(blob(clump.detail, (d) => {
      const r = clump.r * (1 + field(coarse, d) + field(fine, d));
      const y = d.y < 0 ? d.y * 0.72 : d.y;
      return v(d.x * r, y * r * clump.sy, d.z * r).add(clump.at);
    })));
  }
  kit.build(g);
  return g;
}

/** Width, height and length of the boulder, the footprint scenes already place it by. */
const ROCK_SIZE = v(0.197, 0.116, 0.176);

/** A weathered boulder: a lumpy mass with a few worn planes, flat underneath so it sits. */
export function buildRock(stone: MeshStandardMaterial): Group {
  const g = new Group();
  g.name = 'Rock';
  const rand = makeRandom(4471);
  const coarse = waves(rand, 5, 2.2, 0.09);
  const fine = waves(rand, 6, 5, 0.03);
  const cuts = [v(0.7, 0.55, 0.3), v(-0.5, 0.6, -0.55), v(-0.2, 0.25, 0.95), v(0.35, 0.15, -0.9)].map((n) => ({ n: n.normalize(), c: 0.78 + rand() * 0.1 }));
  const geometry = blob(5, (d) => {
    const p = d.clone().multiplyScalar(1 + field(coarse, d) + field(fine, d));
    // Worn planes: anything beyond a cut is pressed most of the way back onto it.
    for (const { n, c } of cuts) {
      const over = p.dot(n) - c;
      if (over > 0) p.addScaledVector(n, -over * 0.8);
    }
    // A soft flat base.
    if (p.y < -0.5) p.y = -0.5 - (p.y + 0.5) * -0.08;
    return v(p.x * 0.1, p.y * 0.075, p.z * 0.088);
  });
  // Centre it on the origin, sit it on the floor, and fit the boulder's agreed footprint.
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  geometry.translate(-centre.x, -bounds.min.y, -centre.z);
  geometry.scale(ROCK_SIZE.x / size.x, ROCK_SIZE.y / size.y, ROCK_SIZE.z / size.z);
  smoothNormals(geometry);
  const kit = new Kit();
  kit.put('Boulder', stone, new Mesh(geometry));
  kit.build(g);
  return g;
}
