/**
 * Bagimsiz ucgen mesh kutuphanesi.
 * =================================
 * Hicbir dis bagimliligi yok — hem tarayicida (three.js BufferGeometry'ye
 * cevrilir) hem Node'da (STL/OBJ yazimi) ayni kod calisir. Bu sayede ekranda
 * gordugunuz sey indirdiginiz STL ile bit-bit aynidir.
 *
 * Tum uzunluklar mm.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Mat4 = Float64Array; // 16, satir-oncelikli degil: kolon-oncelikli (OpenGL)

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

// ---------------------------------------------------------------------------
// Vektor yardimcilari
// ---------------------------------------------------------------------------

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scaleV = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const DEG = Math.PI / 180;
export const deg2rad = (d: number) => d * DEG;

// ---------------------------------------------------------------------------
// MeshBuilder
// ---------------------------------------------------------------------------

export class MeshBuilder {
  private pos: number[] = [];
  private idx: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }
  get triangleCount() {
    return this.idx.length / 3;
  }

  /** Koseyi ekler ve indeksini dondurur. */
  v(p: Vec3): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    return i;
  }

  vAll(ps: readonly Vec3[]): number[] {
    return ps.map((p) => this.v(p));
  }

  tri(a: number, b: number, c: number): void {
    if (a === b || b === c || a === c) return; // dejenere ucgeni at
    this.idx.push(a, b, c);
  }

  /** Dortlu yuz: a-b-c-d saat yonunun tersi sirada. */
  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /**
   * Iki kose halkasini yan yuzey olarak birlestirir.
   * ringA ve ringB ayni uzunlukta olmali. `closed` ise son-ilk de baglanir.
   */
  bridge(ringA: readonly number[], ringB: readonly number[], closed = true): void {
    const n = Math.min(ringA.length, ringB.length);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      this.quad(ringA[i], ringB[i], ringB[j], ringA[j]);
    }
  }

  /**
   * Bir kose halkasini merkez noktaya baglayarak kapak (fan) olusturur.
   * `closed` false ise son-ilk dilimi uretilmez (yay/sektor kapaklari).
   */
  cap(ring: readonly number[], center: number, flip = false, closed = true): void {
    const n = ring.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(center, ring[j], ring[i]);
      else this.tri(center, ring[i], ring[j]);
    }
  }

  /**
   * Iki es-uzunluklu halka arasini duz kapak olarak kapatir (annulus).
   * `closed` false ise son-ilk dilimi uretilmez (yay/sektor kapaklari).
   */
  capAnnulus(inner: readonly number[], outer: readonly number[], flip = false, closed = true): void {
    const n = Math.min(inner.length, outer.length);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      if (flip) {
        this.quad(inner[i], outer[i], outer[j], inner[j]);
      } else {
        this.quad(inner[i], inner[j], outer[j], outer[i]);
      }
    }
  }

  /** Baska bir mesh'i (opsiyonel donusumle) bu builder'a ekler. */
  append(m: MeshData, xf?: Mat4): void {
    const base = this.pos.length / 3;
    const p = m.positions;
    if (xf) {
      for (let i = 0; i < p.length; i += 3) {
        const t = applyMat4(xf, [p[i], p[i + 1], p[i + 2]]);
        this.pos.push(t[0], t[1], t[2]);
      }
    } else {
      for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    }
    for (let i = 0; i < m.indices.length; i++) this.idx.push(m.indices[i] + base);
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.pos),
      indices: new Uint32Array(this.idx),
    };
  }
}

export function merge(...meshes: (MeshData | null | undefined)[]): MeshData {
  const b = new MeshBuilder();
  for (const m of meshes) if (m) b.append(m);
  return b.build();
}

// ---------------------------------------------------------------------------
// 4x4 donusumler (kolon-oncelikli)
// ---------------------------------------------------------------------------

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function scaling(x: number, y = x, z = x): Mat4 {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function rotationX(rad: number): Mat4 {
  const m = identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotationY(rad: number): Mat4 {
  const m = identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function rotationZ(rad: number): Mat4 {
  const m = identity();
  const c = Math.cos(rad), s = Math.sin(rad);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

export function applyMat4(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export function transformMesh(m: MeshData, xf: Mat4): MeshData {
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const t = applyMat4(xf, [m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
    out[i] = t[0];
    out[i + 1] = t[1];
    out[i + 2] = t[2];
  }
  return { positions: out, indices: m.indices };
}

/** Mesh'i X ekseni etrafinda `count` kez esit acilarla cogaltir (kanat dizisi). */
export function polarArray(m: MeshData, count: number, phase = 0): MeshData {
  const b = new MeshBuilder();
  for (let i = 0; i < count; i++) {
    b.append(m, rotationX(phase + (i * 2 * Math.PI) / count));
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// Profil (2B kesit) araclari
// ---------------------------------------------------------------------------

/**
 * Centripetal Catmull-Rom ile profil yumusatma/yeniden ornekleme.
 * Asiri salinim yapmaz, kose noktalarindan tam gecer.
 */
export function resampleProfile(
  pts: readonly [number, number][],
  targetStep = 3.0,
): [number, number][] {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const P = pts.map((p) => [p[0], p[1]] as [number, number]);
  const out: [number, number][] = [];
  const get = (i: number) => P[Math.max(0, Math.min(P.length - 1, i))];

  for (let i = 0; i < P.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.round(segLen / targetStep));
    // centripetal knot araliklari
    const d = (a: number[], b: number[]) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let s = 0; s < steps; s++) {
      const t = t1 + ((t2 - t1) * s) / steps;
      const A1 = mix(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
      const A2 = mix(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      const A3 = mix(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
      const B1 = mix(A1, A2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
      const B2 = mix(A2, A3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
      const C = mix(B1, B2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      out.push([C[0], C[1]]);
    }
  }
  out.push([P[P.length - 1][0], P[P.length - 1][1]]);
  return out;
}

function mix(a: readonly number[], b: readonly number[], wa: number, wb: number): [number, number] {
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

/** Profilden [x0, x1] araligini kirpar; uc noktalar dogrusal interpolasyonla eklenir. */
export function clipProfile(
  prof: readonly [number, number][],
  x0: number,
  x1: number,
): [number, number][] {
  const rAt = (x: number) => profileRadius(prof, x);
  const out: [number, number][] = [[x0, rAt(x0)]];
  for (const p of prof) if (p[0] > x0 + 1e-6 && p[0] < x1 - 1e-6) out.push([p[0], p[1]]);
  out.push([x1, rAt(x1)]);
  return out;
}

/** Profil uzerinde verilen x icin yaricapi dogrusal interpolasyonla bulur. */
export function profileRadius(prof: readonly [number, number][], x: number): number {
  if (x <= prof[0][0]) return prof[0][1];
  const n = prof.length;
  if (x >= prof[n - 1][0]) return prof[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    const [xa, ra] = prof[i];
    const [xb, rb] = prof[i + 1];
    if (x >= xa && x <= xb) {
      const t = (x - xa) / (xb - xa || 1);
      return ra + (rb - ra) * t;
    }
  }
  return prof[n - 1][1];
}

// ---------------------------------------------------------------------------
// Devirme (revolve) govdeleri
// ---------------------------------------------------------------------------

export interface RevolveOpts {
  /** Cevresel bolme sayisi (tam tur icin). */
  segments?: number;
  /** Baslangic acisi [rad]. */
  thetaStart?: number;
  /** Taranan aci [rad]; 2*PI = tam tur. */
  thetaLength?: number;
}

/**
 * Bir ic ve bir dis profil arasinda kabuk (shell) govde olusturur.
 * Kanal, kaporta, nozul, tasiyici halkalar — hepsi bununla uretilir.
 *
 * @param inner [x, r] ic yuzey profili (x artan)
 * @param outer [x, r] dis yuzey profili (ayni x araligi)
 */
export function revolveShell(
  inner: readonly [number, number][],
  outer: readonly [number, number][],
  opts: RevolveOpts = {},
): MeshData {
  const segments = opts.segments ?? 96;
  const thetaStart = opts.thetaStart ?? 0;
  const thetaLength = opts.thetaLength ?? Math.PI * 2;
  const full = Math.abs(thetaLength - Math.PI * 2) < 1e-9;
  const nTheta = full ? segments : Math.max(2, Math.round((segments * thetaLength) / (Math.PI * 2)) + 1);

  const b = new MeshBuilder();
  const angles: number[] = [];
  for (let i = 0; i < nTheta; i++) {
    angles.push(thetaStart + (thetaLength * i) / (full ? nTheta : nTheta - 1));
  }

  const ringsIn: number[][] = [];
  const ringsOut: number[][] = [];
  for (const [x, r] of inner) {
    ringsIn.push(angles.map((a) => b.v([x, r * Math.cos(a), r * Math.sin(a)])));
  }
  for (const [x, r] of outer) {
    ringsOut.push(angles.map((a) => b.v([x, r * Math.cos(a), r * Math.sin(a)])));
  }

  // Ic yuzey (normaller iceri bakar -> ters sira)
  for (let i = 0; i < ringsIn.length - 1; i++) bridgeRing(b, ringsIn[i + 1], ringsIn[i], full);
  // Dis yuzey
  for (let i = 0; i < ringsOut.length - 1; i++) bridgeRing(b, ringsOut[i], ringsOut[i + 1], full);

  // Uc kapaklari (on ve arka halka yuzleri). Sektorde son-ilk dilimi
  // uretilmez; o bosluk yan kesim yuzleriyle kapanir.
  b.capAnnulus(ringsIn[0], ringsOut[0], true, full);
  b.capAnnulus(ringsIn[ringsIn.length - 1], ringsOut[ringsOut.length - 1], false, full);

  // Sektor ise yan kesim yuzleri
  if (!full) {
    const sideA_in = ringsIn.map((r) => r[0]);
    const sideA_out = ringsOut.map((r) => r[0]);
    const sideB_in = ringsIn.map((r) => r[r.length - 1]);
    const sideB_out = ringsOut.map((r) => r[r.length - 1]);
    stitchStrip(b, sideA_in, sideA_out);
    stitchStrip(b, sideB_out, sideB_in);
  }
  return b.build();
}

function bridgeRing(b: MeshBuilder, ra: readonly number[], rb: readonly number[], closed: boolean) {
  const n = Math.min(ra.length, rb.length);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    b.quad(ra[i], rb[i], rb[j], ra[j]);
  }
}

/**
 * Iki ACIK kose zincirini ucgen seridiyle birlestirir. Zincirlerin uzunlugu
 * farkli olabilir: normalize edilmis indekse gore "fermuar" ilerlemesi yapilir.
 * Serit siniri tam olarak iki zincir + iki uc kenaridir; bu yuzden devirme
 * govdelerinin yan kesim yuzeyi acik kenar birakmadan kapanir.
 */
function stitchStrip(b: MeshBuilder, ra: readonly number[], rb: readonly number[]): void {
  const na = ra.length, nb = rb.length;
  if (na < 2 || nb < 2) return;
  let i = 0, j = 0;
  while (i < na - 1 || j < nb - 1) {
    const ua = (i + 1) / (na - 1);
    const ub = (j + 1) / (nb - 1);
    if (j >= nb - 1 || (i < na - 1 && ua <= ub)) {
      b.tri(ra[i], ra[i + 1], rb[j]);
      i++;
    } else {
      b.tri(rb[j + 1], rb[j], ra[i]);
      j++;
    }
  }
}

/**
 * Kapali bir kesit konturunu X ekseni etrafinda cevirerek dolu govde uretir.
 * Profil r=0'da baslar/biter ise (koni, spinner) otomatik tepe noktasi kullanir.
 */
export function revolveSolid(
  profile: readonly [number, number][],
  opts: RevolveOpts = {},
): MeshData {
  const segments = opts.segments ?? 96;
  const thetaStart = opts.thetaStart ?? 0;
  const thetaLength = opts.thetaLength ?? Math.PI * 2;
  const full = Math.abs(thetaLength - Math.PI * 2) < 1e-9;
  const nTheta = full ? segments : Math.max(2, Math.round((segments * thetaLength) / (Math.PI * 2)) + 1);
  const angles: number[] = [];
  for (let i = 0; i < nTheta; i++) {
    angles.push(thetaStart + (thetaLength * i) / (full ? nTheta : nTheta - 1));
  }

  const b = new MeshBuilder();
  const rings: (number[] | number)[] = profile.map(([x, r]) => {
    if (Math.abs(r) < 1e-6) return b.v([x, 0, 0]); // tepe noktasi
    return angles.map((a) => b.v([x, r * Math.cos(a), r * Math.sin(a)]));
  });

  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], c = rings[i + 1];
    if (typeof a === 'number' && typeof c === 'number') continue;
    if (typeof a === 'number') b.cap(c as number[], a, true, full);
    else if (typeof c === 'number') b.cap(a as number[], c, false, full);
    else bridgeRing(b, a as number[], c as number[], full);
  }

  // Uc kapaklari (profil r=0'da bitmiyorsa disk kapak). Profil zaten
  // eksende bitiyorsa tepe noktasi kapak merkezi olarak kullanilir.
  const first = rings[0], last = rings[rings.length - 1];
  const axis0 = typeof first === 'number' ? first : b.v([profile[0][0], 0, 0]);
  const axis1 = typeof last === 'number' ? last : b.v([profile[profile.length - 1][0], 0, 0]);
  if (typeof first !== 'number') b.cap(first, axis0, false, full);
  if (typeof last !== 'number') b.cap(last, axis1, true, full);

  // Sektor ise yan kesim yuzleri: eksen ile profil arasindaki duzlem alan
  if (!full) {
    const side = (t: number) => rings.map((r) => (typeof r === 'number' ? r : r[t]));
    stitchStrip(b, [axis0, axis1], side(0));
    stitchStrip(b, side(nTheta - 1), [axis0, axis1]);
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// Temel primitifler
// ---------------------------------------------------------------------------

/** Eksene (X) paralel silindir/koni. x0..x1, yaricap r0..r1. */
export function cylinderX(x0: number, x1: number, r0: number, r1 = r0, segments = 64): MeshData {
  return revolveSolid([[x0, r0], [x1, r1]], { segments });
}

/** Ic bos boru (X ekseni). */
export function tubeX(x0: number, x1: number, rIn: number, rOut: number, segments = 64): MeshData {
  return revolveShell([[x0, rIn], [x1, rIn]], [[x0, rOut], [x1, rOut]], { segments });
}

/** X ekseni etrafinda simit (torus). R: ana yaricap, r: kesit yaricapi. */
export function torusX(x: number, R: number, r: number, segMajor = 72, segMinor = 12): MeshData {
  const b = new MeshBuilder();
  const rings: number[][] = [];
  for (let i = 0; i < segMajor; i++) {
    const th = (Math.PI * 2 * i) / segMajor;
    const ring: number[] = [];
    for (let j = 0; j < segMinor; j++) {
      const ph = (Math.PI * 2 * j) / segMinor;
      const rr = R + r * Math.cos(ph);
      ring.push(b.v([x + r * Math.sin(ph), rr * Math.cos(th), rr * Math.sin(th)]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segMajor; i++) {
    b.bridge(rings[i], rings[(i + 1) % segMajor], true);
  }
  return b.build();
}

/**
 * Yaricap yonunde (isinsal) silindir — baglanti pimleri, destek ayaklari,
 * kablo gecisleri icin. theta = 0 ise +Y yonunde.
 */
export function radialCylinder(
  x: number,
  theta: number,
  r0: number,
  r1: number,
  dia: number,
  segments = 20,
): MeshData {
  // X ekseni boyunca silindiri uret, sonra +Y'ye cevir ve theta kadar dondur
  const c = cylinderX(r0, r1, dia / 2, dia / 2, segments);
  // 1) +X eksenini +Y'ye cevir (silindir artik isinsal)
  // 2) eksenel konuma otele
  // 3) theta kadar cevresel dondur
  const xf = multiply(
    rotationX(theta),
    multiply(translation(x, 0, 0), rotationZ(Math.PI / 2)),
  );
  return transformMesh(c, xf);
}

/**
 * Profili yuzey normali boyunca `d` kadar oteler (+d = eksenden uzaga).
 * Yakinsak nozul gibi egik yuzeylerde sabit CIDAR KALINLIGI verir —
 * duz radyal oteleme bunu yapamaz.
 */
export function offsetProfile(
  prof: readonly [number, number][],
  d: number,
): [number, number][] {
  const n = prof.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = prof[Math.max(0, i - 1)];
    const b = prof[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dr = b[1] - a[1];
    const l = Math.hypot(dx, dr) || 1;
    dx /= l;
    dr /= l;
    out.push([prof[i][0] - d * dr, prof[i][1] + d * dx]);
  }
  return out;
}

/** Dikdortgen prizma: merkez c, boyut s. */
export function box(center: Vec3, size: Vec3): MeshData {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const b = new MeshBuilder();
  const p: Vec3[] = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ];
  const i = b.vAll(p);
  b.quad(i[0], i[3], i[2], i[1]); // -z
  b.quad(i[4], i[5], i[6], i[7]); // +z
  b.quad(i[0], i[1], i[5], i[4]); // -y
  b.quad(i[2], i[3], i[7], i[6]); // +y
  b.quad(i[1], i[2], i[6], i[5]); // +x
  b.quad(i[0], i[4], i[7], i[3]); // -x
  return b.build();
}

/** Kenarlari yuvarlatilmis kutu (kose yaricapi r, sadece Z ekseni boyunca). */
export function roundedBox(center: Vec3, size: Vec3, radius: number, corner = 6): MeshData {
  const [sx, sy, sz] = size;
  const r = Math.min(radius, sx / 2 - 0.01, sy / 2 - 0.01);
  const path: Vec2[] = [];
  const hx = sx / 2 - r, hy = sy / 2 - r;
  const cs: Vec2[] = [[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]];
  const a0 = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j <= corner; j++) {
      const a = a0[k] + (Math.PI / 2) * (j / corner);
      path.push([cs[k][0] + r * Math.cos(a), cs[k][1] + r * Math.sin(a)]);
    }
  }
  return extrudePolygon(path, sz, [center[0], center[1], center[2] - sz / 2]);
}

/**
 * Kapali 2B poligonu (XY duzleminde, saat yonunun tersi) +Z yonunde oturtur.
 * Poligon konveks olmak zorunda degil ama yildiz-benzeri (merkezden gorunur)
 * olmali — kullandigimiz tum kesitler boyle.
 */
export function extrudePolygon(poly: readonly Vec2[], height: number, origin: Vec3 = [0, 0, 0]): MeshData {
  const b = new MeshBuilder();
  const [ox, oy, oz] = origin;
  const bot = poly.map((p) => b.v([ox + p[0], oy + p[1], oz]));
  const top = poly.map((p) => b.v([ox + p[0], oy + p[1], oz + height]));
  b.bridge(bot, top, true);
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  cx /= poly.length; cy /= poly.length;
  const cb = b.v([ox + cx, oy + cy, oz]);
  const ct = b.v([ox + cx, oy + cy, oz + height]);
  b.cap(bot, cb, false);
  b.cap(top, ct, true);
  return b.build();
}

// ---------------------------------------------------------------------------
// Delikli flans / plaka (gercek gecen delikler)
// ---------------------------------------------------------------------------

/**
 * Cıvata delikli halka flans — delikler GERCEK gecen deliklerdir.
 *
 * Yontem: flans, civata sayisi kadar acisal sektore bolunur. Her sektorde
 * delik cevresinden sektor sinirina "O-grid" (yildiz seklinde isinsal ag)
 * cikarilir. Delik merkezi sektorun tamamini gordugu icin ag kendini kesmez.
 */
export function flangeWithBoltHoles(
  x0: number,
  thickness: number,
  rInner: number,
  rOuter: number,
  boltCount: number,
  boltRadius: number,
  holeDia: number,
  opts: { holeSeg?: number; layers?: number; thetaStart?: number; thetaLength?: number } = {},
): MeshData {
  const holeSeg = opts.holeSeg ?? 16;
  const layers = opts.layers ?? 3;
  const thetaLength = opts.thetaLength ?? Math.PI * 2;
  const thetaStart = opts.thetaStart ?? 0;
  const rHole = holeDia / 2;
  const b = new MeshBuilder();
  const dTheta = thetaLength / boltCount;
  const perSide = 6; // sektor sinirinda kenar basina nokta

  for (let s = 0; s < boltCount; s++) {
    const thC = thetaStart + (s + 0.5) * dTheta;
    const th0 = thC - dTheta / 2;
    const th1 = thC + dTheta / 2;
    const cy = boltRadius * Math.cos(thC);
    const cz = boltRadius * Math.sin(thC);

    // Sektor sinir dongusu (ic yay -> +radyal kenar -> dis yay -> -radyal kenar)
    const boundary: Vec2[] = [];
    for (let i = 0; i < perSide; i++) {
      const t = th0 + (dTheta * i) / perSide;
      boundary.push([rInner * Math.cos(t), rInner * Math.sin(t)]);
    }
    for (let i = 0; i < perSide; i++) {
      const rr = rInner + ((rOuter - rInner) * i) / perSide;
      boundary.push([rr * Math.cos(th1), rr * Math.sin(th1)]);
    }
    for (let i = 0; i < perSide; i++) {
      const t = th1 - (dTheta * i) / perSide;
      boundary.push([rOuter * Math.cos(t), rOuter * Math.sin(t)]);
    }
    for (let i = 0; i < perSide; i++) {
      const rr = rOuter - ((rOuter - rInner) * i) / perSide;
      boundary.push([rr * Math.cos(th0), rr * Math.sin(th0)]);
    }

    // Sinir dongusunu delik cevresi nokta sayisina yeniden ornekle
    const M = Math.max(boundary.length, holeSeg * 2);
    const resB = resampleLoop(boundary, M);

    // Her sinir noktasi icin delik merkezinden isin cizip delik cevresine in
    const rings: { y: number; z: number }[][] = [];
    for (let l = 0; l <= layers; l++) {
      const t = l / layers;
      const ring = resB.map((p) => {
        const dy = p[0] - cy, dz = p[1] - cz;
        const d = Math.hypot(dy, dz) || 1e-6;
        const uy = dy / d, uz = dz / d;
        const hy = cy + uy * rHole, hz = cz + uz * rHole;
        return { y: hy + (p[0] - hy) * t, z: hz + (p[1] - hz) * t };
      });
      rings.push(ring);
    }

    // Alt ve ust yuzler
    const botIdx = rings.map((r) => r.map((p) => b.v([x0, p.y, p.z])));
    const topIdx = rings.map((r) => r.map((p) => b.v([x0 + thickness, p.y, p.z])));
    for (let l = 0; l < layers; l++) {
      bridgeRing(b, botIdx[l + 1], botIdx[l], true); // alt yuz (normal -x)
      bridgeRing(b, topIdx[l], topIdx[l + 1], true); // ust yuz (normal +x)
    }
    // Delik cidari
    bridgeRing(b, botIdx[0], topIdx[0], true);
    // Dis sinir cidari (komsu sektor ayni koseleri uretecegi icin mesh
    // topolojik olarak "kaynakli" degil ama STL/render icin sorun yok ve
    // dis cidar ic/dis yuzeyleri kapatir)
    bridgeRingOuter(b, botIdx[layers], topIdx[layers], resB, rInner, rOuter, 1e-3);
  }
  return b.build();
}

/** Sadece flansin gercek dis/ic cevresine denk gelen sinir kenarlarini kapatir. */
function bridgeRingOuter(
  b: MeshBuilder,
  bot: readonly number[],
  top: readonly number[],
  loop: readonly Vec2[],
  rInner: number,
  rOuter: number,
  tol: number,
) {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ri = Math.hypot(loop[i][0], loop[i][1]);
    const rj = Math.hypot(loop[j][0], loop[j][1]);
    const onInner = Math.abs(ri - rInner) < rInner * tol + 0.02 && Math.abs(rj - rInner) < rInner * tol + 0.02;
    const onOuter = Math.abs(ri - rOuter) < rOuter * tol + 0.02 && Math.abs(rj - rOuter) < rOuter * tol + 0.02;
    if (onOuter) b.quad(bot[i], top[i], top[j], bot[j]);
    else if (onInner) b.quad(bot[j], top[j], top[i], bot[i]);
    else b.quad(bot[i], top[i], top[j], bot[j]); // radyal kesim yuzu (sektor sinirı)
  }
}

/** Kapali donguyu esit yay uzunlugunda M noktaya yeniden ornekler. */
export function resampleLoop(loop: readonly Vec2[], M: number): Vec2[] {
  const n = loop.length;
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum.push(cum[i] + Math.hypot(loop[j][0] - loop[i][0], loop[j][1] - loop[i][1]));
  }
  const total = cum[n];
  const out: Vec2[] = [];
  for (let k = 0; k < M; k++) {
    const target = (total * k) / M;
    let i = 0;
    while (i < n && cum[i + 1] < target) i++;
    const segLen = cum[i + 1] - cum[i] || 1e-9;
    const t = (target - cum[i]) / segLen;
    const a = loop[i % n], c = loop[(i + 1) % n];
    out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loft (kesit yigini) — kanatlar icin
// ---------------------------------------------------------------------------

/**
 * Kapali kesit dizisini birbirine baglayarak tup govde uretir.
 * Tum kesitler ayni sayida noktaya sahip olmali.
 */
export function loftSections(
  sections: readonly (readonly Vec3[])[],
  capStart = true,
  capEnd = true,
): MeshData {
  const b = new MeshBuilder();
  const rings = sections.map((s) => s.map((p) => b.v(p)));
  for (let i = 0; i < rings.length - 1; i++) b.bridge(rings[i], rings[i + 1], true);
  if (capStart) {
    const c = centroid(sections[0]);
    b.cap(rings[0], b.v(c), true);
  }
  if (capEnd) {
    const c = centroid(sections[sections.length - 1]);
    b.cap(rings[rings.length - 1], b.v(c), false);
  }
  return b.build();
}

export function centroid(pts: readonly Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  const n = pts.length || 1;
  return [x / n, y / n, z / n];
}

// ---------------------------------------------------------------------------
// Olcum / analiz
// ---------------------------------------------------------------------------

export interface BBox {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
}

export function bbox(m: MeshData): BBox {
  const p = m.positions;
  if (p.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
  }
  const mn: Vec3 = [Infinity, Infinity, Infinity];
  const mx: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < mn[k]) mn[k] = p[i + k];
      if (p[i + k] > mx[k]) mx[k] = p[i + k];
    }
  }
  return {
    min: mn,
    max: mx,
    size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]],
    center: [(mx[0] + mn[0]) / 2, (mx[1] + mn[1]) / 2, (mx[2] + mn[2]) / 2],
  };
}

/**
 * Isaretli hacim (divergence teoremi / tetrahedron toplami) [mm^3].
 * Kapali ve tutarli yonlu mesh icin dogru; kucuk topolojik bosluklar
 * sonucu ihmal edilebilir duzeyde etkiler.
 */
export function volume(m: MeshData): number {
  const p = m.positions, ix = m.indices;
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b2 = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b2], by = p[b2 + 1], bz = p[b2 + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    v +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return Math.abs(v);
}

/** Toplam yuzey alani [mm^2]. */
export function surfaceArea(m: MeshData): number {
  const p = m.positions, ix = m.indices;
  let s = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b2 = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const u: Vec3 = [p[b2] - p[a], p[b2 + 1] - p[a + 1], p[b2 + 2] - p[a + 2]];
    const w: Vec3 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    s += len(cross(u, w)) / 2;
  }
  return s / 2;
}
