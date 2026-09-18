/**
 * Ikili (binary) STL yazici.
 * ==========================
 * Bagimsiz — tarayicida ve Node'da ayni sonucu verir.
 *
 * Bicim:
 *   80 bayt   basli (header)
 *    4 bayt   ucgen sayisi (uint32 LE)
 *   her ucgen icin 50 bayt:
 *     12 bayt normal (3 x float32)
 *     36 bayt 3 kose (9 x float32)
 *      2 bayt oznitelik sayisi (uint16)
 */

import { bbox, type MeshData, type Vec3 } from '../geom/mesh';

export function meshToBinarySTL(mesh: MeshData, header = 'EDF-1000'): Uint8Array {
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Basli (ASCII, 80 bayt)
  const h = `${header} | EDF-1000 elektrikli kanalli fan | birim: mm`.slice(0, 79);
  for (let i = 0; i < h.length; i++) bytes[i] = h.charCodeAt(i) & 0x7f;

  view.setUint32(80, triCount, true);

  const p = mesh.positions;
  let o = 84;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3;
    const b = mesh.indices[i + 1] * 3;
    const c = mesh.indices[i + 2] * 3;

    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];

    const u1 = bx - ax, u2 = by - ay, u3 = bz - az;
    const v1 = cx - ax, v2 = cy - ay, v3 = cz - az;
    let nx = u2 * v3 - u3 * v2;
    let ny = u3 * v1 - u1 * v3;
    let nz = u1 * v2 - u2 * v1;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;

    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    view.setFloat32(o + 12, ax, true);
    view.setFloat32(o + 16, ay, true);
    view.setFloat32(o + 20, az, true);
    view.setFloat32(o + 24, bx, true);
    view.setFloat32(o + 28, by, true);
    view.setFloat32(o + 32, bz, true);
    view.setFloat32(o + 36, cx, true);
    view.setFloat32(o + 40, cy, true);
    view.setFloat32(o + 44, cz, true);
    view.setUint16(o + 48, 0, true);
    o += 50;
  }
  return bytes;
}

/**
 * Parcayi BASKI icin yonlendirir:
 *   - istege bagli donme
 *   - sinir kutusunu orijine tasi (z = 0 tabla yuzeyi)
 *   - XY duzleminde ortala
 */
export function orientForPrint(mesh: MeshData, rotate?: 'none' | 'xToZ' | 'yToZ'): MeshData {
  const p = new Float32Array(mesh.positions);
  // Motor ekseni +X'tir; baski tablasi normali +Z olmalidir.
  if (rotate === 'xToZ' || rotate === undefined) {
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = z;      // yeni X = eski Z
      p[i + 1] = y;  // Y ayni
      p[i + 2] = x;  // yeni Z = eski X (motor ekseni dikey)
    }
  } else if (rotate === 'yToZ') {
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = x;
      p[i + 1] = z;
      p[i + 2] = y;
    }
  }
  const out: MeshData = { positions: p, indices: mesh.indices };
  const bb = bbox(out);
  const shift: Vec3 = [-bb.center[0], -bb.center[1], -bb.min[2]];
  for (let i = 0; i < p.length; i += 3) {
    p[i] += shift[0];
    p[i + 1] += shift[1];
    p[i + 2] += shift[2];
  }
  return out;
}

/** Mesh'in su gecirmezlik (watertight) on kontrolu: acik kenar sayimi. */
export function meshDiagnostics(mesh: MeshData): {
  triangles: number;
  vertices: number;
  openEdges: number;
  watertight: boolean;
  degenerate: number;
} {
  const edge = new Map<string, number>();
  const ix = mesh.indices;
  let degenerate = 0;
  const p = mesh.positions;

  // Kose kaynagi (weld): ayni konumdaki koseleri tek kimlige indir
  const keyOf = (i: number) =>
    `${Math.round(p[i * 3] * 100)},${Math.round(p[i * 3 + 1] * 100)},${Math.round(p[i * 3 + 2] * 100)}`;
  const weld = new Map<string, number>();
  const remap = new Uint32Array(mesh.positions.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = keyOf(i);
    let id = weld.get(k);
    if (id === undefined) {
      id = weld.size;
      weld.set(k, id);
    }
    remap[i] = id;
  }

  for (let i = 0; i < ix.length; i += 3) {
    const a = remap[ix[i]], b = remap[ix[i + 1]], c = remap[ix[i + 2]];
    if (a === b || b === c || a === c) {
      degenerate++;
      continue;
    }
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      edge.set(k, (edge.get(k) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  for (const count of edge.values()) if (count !== 2) openEdges++;

  return {
    triangles: ix.length / 3,
    vertices: weld.size,
    openEdges,
    watertight: openEdges === 0,
    degenerate,
  };
}
