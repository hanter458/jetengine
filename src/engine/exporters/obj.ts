/**
 * Wavefront OBJ yazici (kose normalleri dahil).
 * OBJ, STL'den farkli olarak kose paylasimini korur — dosya kucuktur ve
 * Blender/Fusion gibi programlarda daha temiz acilir.
 */

import type { MeshData } from '../geom/mesh';

export function meshToOBJ(mesh: MeshData, name = 'part'): string {
  const p = mesh.positions;
  const ix = mesh.indices;
  const nVerts = p.length / 3;

  // Kose normalleri: komsu yuz normallerinin alan agirlikli toplami
  const nrm = new Float32Array(p.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const u1 = p[b] - p[a], u2 = p[b + 1] - p[a + 1], u3 = p[b + 2] - p[a + 2];
    const v1 = p[c] - p[a], v2 = p[c + 1] - p[a + 1], v3 = p[c + 2] - p[a + 2];
    const nx = u2 * v3 - u3 * v2;
    const ny = u3 * v1 - u1 * v3;
    const nz = u1 * v2 - u2 * v1;
    for (const o of [a, b, c]) {
      nrm[o] += nx;
      nrm[o + 1] += ny;
      nrm[o + 2] += nz;
    }
  }

  const lines: string[] = [
    `# EDF-1000 elektrikli kanalli fan — ${name}`,
    '# Birim: milimetre. Eksen: +X motor ekseni (akis yonu), +Y yukari.',
    `# Kose: ${nVerts}  Ucgen: ${ix.length / 3}`,
    `o ${name}`,
  ];

  for (let i = 0; i < p.length; i += 3) {
    lines.push(`v ${p[i].toFixed(4)} ${p[i + 1].toFixed(4)} ${p[i + 2].toFixed(4)}`);
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    lines.push(
      `vn ${(nrm[i] / l).toFixed(4)} ${(nrm[i + 1] / l).toFixed(4)} ${(nrm[i + 2] / l).toFixed(4)}`,
    );
  }
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] + 1, b = ix[i + 1] + 1, c = ix[i + 2] + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return lines.join('\n') + '\n';
}
