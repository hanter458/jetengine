/**
 * Kompresor kanat profili (airfoil) ureteci.
 * ==========================================
 * Kalinlik dagilimi: NACA 4-basamakli seri kalinlik polinomu; son katsayi
 * -0.1036 secilerek firar kenari KAPATILIR (acik TE, su gecirmez mesh ve 3D
 * baski icin sorun yaratir).
 *
 *   yt(s) = 5t [ 0.2969 sqrt(s) - 0.1260 s - 0.3516 s^2 + 0.2843 s^3 - 0.1036 s^4 ]
 *
 * Orta hat (kamber): dairesel yay — C4 / NACA 65 ailesi kompresor kanatlarina
 * yakin, ve dusuk Mach sayilarinda (M_tip = 0.38) tamamen yeterli.
 *
 * Tum olculer mm. Yerel koordinatlar:
 *   s : veter boyunca, -c/2 (firar kenari) ... +c/2 (hucum kenari)  [ters yon!]
 *   n : veter dikine (kalinlik yonu)
 */

import type { Vec2 } from './mesh';

export interface AirfoilOpts {
  /** Veter uzunlugu [mm]. */
  chord: number;
  /** Maks. kalinlik / veter. */
  thickness: number;
  /** Maks. kamber / veter (orta hat maks. sapmasi). */
  camber: number;
  /** Yuzey basina nokta sayisi. */
  points?: number;
  /** Firar kenari min. kalinligi [mm] — baski icin (nozul capi kadar). */
  teThickness?: number;
}

/** NACA kalinlik dagilimi; x normalize [0,1], t = kalinlik orani. */
function naca(x: number, t: number): number {
  const xc = Math.max(0, Math.min(1, x));
  return (
    5 *
    t *
    (0.2969 * Math.sqrt(xc) -
      0.126 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1036 * xc * xc * xc * xc)
  );
}

/**
 * Kapali profil konturu dondurur.
 * Sira: HUCUM KENARI -> UST yuzey -> FIRAR KENARI -> ALT yuzey -> (kapanis).
 * Her zaman ayni noktada baslar ki loft sirasinda kesitler burulmasin.
 */
export function airfoilContour(o: AirfoilOpts): Vec2[] {
  const n = o.points ?? 44;
  const c = o.chord;
  const te = o.teThickness ?? 0.6;
  const camb = o.camber;

  // Kosinus dagilimi: hucum kenarinda nokta yogunlugu yuksek
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  }

  // Dairesel yay orta hat: maks. sapma veter ortasinda
  const camberLine = (x: number) => 4 * camb * x * (1 - x); // parabolik yaklasim (dairesel yaya ~esdeger)
  const camberSlope = (x: number) => 4 * camb * (1 - 2 * x);

  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  for (const x of xs) {
    let yt = naca(x, o.thickness);
    // Firar kenarini baski icin minimum kalinliga getir
    const teBlend = Math.max(0, (x - 0.85) / 0.15);
    yt = yt * (1 - teBlend) + (te / (2 * c)) * teBlend;

    const yc = camberLine(x);
    const th = Math.atan(camberSlope(x));
    const dx = yt * Math.sin(th);
    const dy = yt * Math.cos(th);
    upper.push([(x - dx) * c, (yc + dy) * c]);
    lower.push([(x + dx) * c, (yc - dy) * c]);
  }

  // Kontur: LE -> ust -> TE -> alt -> LE (kapali)
  const loop: Vec2[] = [];
  for (let i = 0; i < upper.length; i++) loop.push(upper[i]);
  for (let i = lower.length - 2; i >= 1; i--) loop.push(lower[i]);

  // Merkezi veter ortasina tasi ve yonu cevir:
  // s ekseni +x = hucum kenarindan firar kenarina dogru artacak sekilde
  return loop.map(([x, y]) => [x - c / 2, y] as Vec2);
}

/** Dikdortgen kontur (kanat kokü / platform gecisleri icin). */
export function rectContour(width: number, height: number, cornerR = 0, seg = 4): Vec2[] {
  const hw = width / 2, hh = height / 2;
  if (cornerR <= 0) {
    return [
      [hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh],
    ];
  }
  const r = Math.min(cornerR, hw - 0.01, hh - 0.01);
  const out: Vec2[] = [];
  const cs: Vec2[] = [[hw - r, hh - r], [-(hw - r), hh - r], [-(hw - r), -(hh - r)], [hw - r, -(hh - r)]];
  const a0 = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j <= seg; j++) {
      const a = a0[k] + (Math.PI / 2) * (j / seg);
      out.push([cs[k][0] + r * Math.cos(a), cs[k][1] + r * Math.sin(a)]);
    }
  }
  return out;
}

/**
 * Kirlangickuyrugu (dovetail) kontur — kanat kokunun gobek diskine oturan
 * kismi. Merkezkac kuvveti altinda kendi kendini sikistirir.
 */
export function dovetailContour(width: number, height: number, taper: number): Vec2[] {
  const hw = width / 2, hh = height / 2;
  const hwT = hw * taper;
  return [
    [hw, hh], [-hw, hh], [-hwT, -hh], [hwT, -hh],
  ];
}
