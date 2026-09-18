/**
 * Kanat (rotor / stator) 3B geometri ureteci.
 * ===========================================
 * Her kanat, silindirik yuzeyler uzerine "sarilmis" profil kesitlerinin
 * loft'lanmasiyla uretilir. Burulma (twist) yasasi serbest-vorteks
 * yaklasimindan gelir:
 *
 *   tan(beta(r)) = tan(beta_hub) + (tan(beta_tip) - tan(beta_hub)) * (r-rh)/(rt-rh)
 *
 * Bu, beta = atan(U/Vx) ve U = omega*r iliskisiyle tutarlidir (U yaricapla
 * dogrusal artar, dolayisiyla tan(beta) da dogrusal artar).
 *
 * Kok baglantisi: profil kalinligi gobegin hemen altinda kademeli olarak
 * buyutulerek gercek bir kok kavisi (fillet) olusturulur — merkezkac
 * gerilmesinin en yuksek oldugu yerde gerilme yigilmasini dusurur.
 */

import { airfoilContour } from './airfoil';
import type { MeshData, Vec2, Vec3 } from './mesh';
import { loftSections, merge, polarArray, revolveShell } from './mesh';
import type { BladeRow } from '../spec';

const AIRFOIL_POINTS = 40;

/**
 * Yerel profil konturunu (s, n) yaricap r'deki silindirik yuzeye sarar.
 *
 * @param contour [s, n] — s: veter boyu, n: veter dikine [mm]
 * @param r       yaricap [mm]
 * @param xMid    kesitin eksenel orta noktasi [mm]
 * @param pitchDeg profil acisi (eksenden) [deg]
 * @param sign    +1 rotor (donme yonu), -1 aynalanmis
 */
export function wrapContour(
  contour: readonly Vec2[],
  r: number,
  xMid: number,
  pitchDeg: number,
  sign = 1,
): Vec3[] {
  const b = (pitchDeg * Math.PI) / 180;
  const cb = Math.cos(b), sb = Math.sin(b);
  return contour.map(([s, n]) => {
    // Veter yonu eksenle beta acisi yapar; n veter dikine
    const x = xMid + s * cb - n * sb;
    const u = sign * (s * sb + n * cb); // cevresel yay uzunlugu
    const th = u / r;
    return [x, r * Math.cos(th), r * Math.sin(th)] as Vec3;
  });
}

/** Yaricapla dogrusal interpolasyon yardimcisi. */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Serbest-vorteks burulma yasasi. */
export function twistAt(row: BladeRow, r: number): number {
  const t = (r - row.rHub) / (row.rTip - row.rHub);
  const tanH = Math.tan((row.pitchRoot * Math.PI) / 180);
  const tanT = Math.tan((row.pitchTip * Math.PI) / 180);
  return (Math.atan(lerp(tanH, tanT, t)) * 180) / Math.PI;
}

export function chordAt(row: BladeRow, r: number): number {
  const t = (r - row.rHub) / (row.rTip - row.rHub);
  return lerp(row.chordRoot, row.chordTip, Math.pow(t, 0.85));
}

export function thicknessAt(row: BladeRow, r: number): number {
  const t = (r - row.rHub) / (row.rTip - row.rHub);
  return lerp(row.thickRoot, row.thickTip, t);
}

export interface BladeOpts {
  /** Yaricap yonunde kesit sayisi. */
  spanSections?: number;
  /** Kok kavisinin gobek altina indigi derinlik [mm]. */
  rootFlare?: number;
  /** Uc yuvarlatma: son kesitin kalinlik carpani. */
  tipRound?: boolean;
  /** Ucu kanal duvarinin icine kadar uzat (stator icin) [mm]. */
  tipExtend?: number;
  /** Donme yonu isareti. */
  sign?: number;
}

/**
 * TEK kanat govdesi (gobekten uca). Kok kavisi dahil.
 * Cikti, motor eksenine gore dogru konumda; theta = 0 dolayindadir.
 */
export function bladeSolid(row: BladeRow, opts: BladeOpts = {}): MeshData {
  const nSpan = opts.spanSections ?? 18;
  const flare = opts.rootFlare ?? 6.0;
  const tipExtend = opts.tipExtend ?? 0;
  const sign = opts.sign ?? 1;

  const sections: Vec3[][] = [];

  // --- Kok kavisi: gobegin altindan baslayip kalinligi kademeli azaltarak
  //     profile baglanir (gerilme yigilmasini dusuren "flare").
  const flareSteps = 4;
  for (let i = 0; i < flareSteps; i++) {
    const f = i / flareSteps; // 0 = en altta (en kalin)
    const r = row.rHub - flare * (1 - f);
    const k = 1 + 2.6 * Math.pow(1 - f, 1.7); // kalinlik carpani
    const cMul = 1 + 0.16 * Math.pow(1 - f, 1.4); // veter de hafif buyur
    sections.push(
      wrapContour(
        airfoilContour({
          chord: chordAt(row, row.rHub) * cMul,
          thickness: thicknessAt(row, row.rHub) * k,
          camber: row.camber,
          points: AIRFOIL_POINTS,
          teThickness: 0.8,
        }),
        Math.max(r, 2),
        row.xMid,
        twistAt(row, row.rHub),
        sign,
      ),
    );
  }

  // --- Ana kanat govdesi
  for (let i = 0; i <= nSpan; i++) {
    const t = i / nSpan;
    const r = lerp(row.rHub, row.rTip + tipExtend, t);
    sections.push(
      wrapContour(
        airfoilContour({
          chord: chordAt(row, Math.min(r, row.rTip)),
          thickness: thicknessAt(row, Math.min(r, row.rTip)),
          camber: row.camber,
          points: AIRFOIL_POINTS,
          teThickness: 0.7,
        }),
        r,
        row.xMid,
        twistAt(row, Math.min(r, row.rTip)),
        sign,
      ),
    );
  }

  // --- Uc yuvarlatma (rotor): kesit kalinligini hizla daralt
  if (opts.tipRound !== false && tipExtend === 0) {
    for (const k of [0.62, 0.3]) {
      sections.push(
        wrapContour(
          airfoilContour({
            chord: chordAt(row, row.rTip) * (0.55 + 0.45 * k),
            thickness: thicknessAt(row, row.rTip) * k,
            camber: row.camber,
            points: AIRFOIL_POINTS,
            teThickness: 0.5,
          }),
          row.rTip + (1 - k) * 0.9,
          row.xMid,
          twistAt(row, row.rTip),
          sign,
        ),
      );
    }
  }

  return loftSections(sections, true, true);
}

/**
 * Kanatlarin oturdugu gobek platformu — komsu platformlar birbirine degerek
 * kesintisiz gobek yuzeyini olusturur.
 */
export function bladePlatform(row: BladeRow, rInner: number, rOuter: number): MeshData {
  const beta = (twistAt(row, row.rHub) * Math.PI) / 180;
  const axialExtent = chordAt(row, row.rHub) * Math.cos(beta) + 8;
  const x0 = row.xMid - axialExtent / 2;
  const x1 = row.xMid + axialExtent / 2;
  const dth = (Math.PI * 2) / row.count;
  return revolveShell(
    [[x0, rInner], [x1, rInner]],
    [[x0, rOuter], [x1, rOuter]],
    { segments: 120, thetaStart: -dth / 2, thetaLength: dth },
  );
}

/** Tum kanat dizisi (count adet kanat, esit acilarla). */
export function bladeArray(row: BladeRow, opts: BladeOpts = {}): MeshData {
  return polarArray(bladeSolid(row, opts), row.count);
}

/** Kanat + platform dizisi. */
export function bladedRing(
  row: BladeRow,
  platformInner: number,
  platformOuter: number,
  opts: BladeOpts = {},
): MeshData {
  return merge(
    bladeArray(row, opts),
    polarArray(bladePlatform(row, platformInner, platformOuter), row.count),
  );
}

// ---------------------------------------------------------------------------
// Analiz yardimcilari (fizik modeli bunlari kullanir)
// ---------------------------------------------------------------------------

/** Kanat en-boy orani (aspect ratio) = span / ortalama veter. */
export function aspectRatio(row: BladeRow): number {
  const span = row.rTip - row.rHub;
  const meanChord = (row.chordRoot + row.chordTip) / 2;
  return span / meanChord;
}

/** Kati (solidity) = veter / kanat araligi, orta yaricapta. */
export function solidity(row: BladeRow): number {
  const rm = Math.sqrt((row.rTip ** 2 + row.rHub ** 2) / 2);
  const pitch = (2 * Math.PI * rm) / row.count;
  return chordAt(row, rm) / pitch;
}

/**
 * Kanat kesit alani yaricap boyunca [mm^2] — merkezkac gerilmesi icin.
 * Profil alani ~ 0.68 * veter * maks.kalinlik (NACA benzeri kesit icin).
 */
export function bladeSectionArea(row: BladeRow, r: number): number {
  const c = chordAt(row, r);
  return 0.68 * c * c * thicknessAt(row, r);
}

/**
 * Kanat kokundeki merkezkac cekme gerilmesi [Pa].
 *   sigma(rh) = (rho * omega^2 / A(rh)) * integral_{rh}^{rt} A(r) * r dr
 */
export function centrifugalRootStress(
  row: BladeRow,
  rpm: number,
  materialDensity: number, // [kg/m^3]
): number {
  const omega = (rpm * 2 * Math.PI) / 60;
  const n = 60;
  let integral = 0; // [m^3]
  for (let i = 0; i < n; i++) {
    const r0 = (row.rHub + ((row.rTip - row.rHub) * i) / n) / 1000;
    const r1 = (row.rHub + ((row.rTip - row.rHub) * (i + 1)) / n) / 1000;
    const rm = (r0 + r1) / 2;
    const A = bladeSectionArea(row, rm * 1000) / 1e6; // [m^2]
    integral += A * rm * (r1 - r0);
  }
  const Aroot = bladeSectionArea(row, row.rHub) / 1e6;
  return (materialDensity * omega * omega * integral) / Aroot;
}
