/**
 * Fan / itki aerodinamigi.
 * ========================
 * 1B ortalama-cizgi (mean-line) modeli: Euler is denklemi + surekliligin
 * es zamanli cozumu. Cizelgeye bakilarak "itki = k * rpm^2" gibi bir
 * uydurma YAPILMAZ — calisma noktasi her kosulda yeniden cozulur.
 *
 * MODEL
 *   1. Kademe is katsayisi hiz ucgenlerinden:
 *          psi(phi) = lambda * (1 - phi * tan(beta2))
 *      lambda = is-yapma katsayisi (~0.86, sinir tabaka blokaji),
 *      beta2  = rotor cikis bagil acisi (kanat metal acisinden).
 *      tan(beta2) tasarim noktasindan kalibre edilir, boylece model
 *      geometriyle tutarli kalir.
 *
 *   2. Toplam basinc artisi:  dp_t = rho * n * psi * U_m^2 * eta_fan
 *
 *   3. Nozul cikis hizi (enerji):  v9 = Cv * sqrt(V0^2 + 2*dp_t/rho)
 *
 *   4. Sureklilik:  v9 = Vx * A_ann/A9 = phi * U_m * A_ann/A9
 *
 *   (3) ve (4) birlikte phi icin tek bir kok verir (yarilama ile cozulur).
 *
 *   5. Itki:  T = m_dot * (v9 - V0)      [brut itki - ram surukleme]
 *      Guc:   P_saft = m_dot * n * psi * U_m^2
 *
 * KAYNAKLAR
 *  [F1] Nguyen et al., Aerospace 12(6):509 (2025), CC BY — 390 mm eDPF
 *       statik deneyleri: FM 0.70-0.75, CT/CP/FM'in devirle degisimi.
 *  [F2] Li et al., Aerospace 9(5):241 (2022), CC BY — BEMT + CFD kanat
 *       tasarimi; 150 mm kanalli fan, 10 rotor / 6 stator dogrulamasi.
 *  [F3] Goodhand et al., Aerosp. Sci. Technol. 152:109411 (2024) — EDF
 *       aerodinamik/akustik tasarimi; akis katsayisinin (0.60/0.75/0.90)
 *       verim ve gurultu uzerindeki birinci mertebeden etkisi.
 *  [F4] Dixon & Hall, "Fluid Mechanics and Thermodynamics of Turbomachinery",
 *       7. baski — is-yapma katsayisi, sapma (deviation), kayip korelasyonlari.
 */

import {
  BLADE_ROWS,
  DESIGN,
  HUB_RADIUS,
  ROTOR_ROWS,
  TIP_RADIUS,
} from '../spec';
import { solidity, twistAt } from '../geom/blade';
import { rGas } from '../geom/partsGeom';
import { CP_AIR, GAMMA, type AirState, type IcingState } from './atmosphere';

// ---------------------------------------------------------------------------
// Sabit geometrik buyuklukler (spec'ten turetilir, mm -> m)
// ---------------------------------------------------------------------------

/** Fan halka (annulus) alani [m^2]. */
export const A_ANNULUS =
  Math.PI * ((TIP_RADIUS / 1000) ** 2 - (HUB_RADIUS / 1000) ** 2);

/** Nozul cikis alani [m^2] (x = 1000 mm, kuyruk konisi bitmis). */
export const A_EXIT = Math.PI * (rGas(1000) / 1000) ** 2;

/** Giris bogaz alani [m^2] (x = 120 mm; spinner henuz baslamadi). */
export const A_THROAT = Math.PI * (rGas(120) / 1000) ** 2;

/** Ortalama (RMS) yaricap [m]. */
export const R_MEAN = Math.sqrt(
  (((TIP_RADIUS / 1000) ** 2 + (HUB_RADIUS / 1000) ** 2) / 2),
);

/** Kademe sayisi. */
export const N_STAGES = ROTOR_ROWS.length;

/** Alan orani A9/A_fan — nozul daralma orani. */
export const AREA_RATIO = A_EXIT / A_ANNULUS;

/** Is-yapma katsayisi (work-done factor) — cok kademeli aksiyal fan. [F4] */
export const WORK_DONE_FACTOR = 0.86;

/**
 * Rotor cikis bagil acisinin tanjanti; tasarim noktasindan kalibre.
 *   psi_d = lambda * (1 - phi_d * tan(beta2))
 */
export const TAN_BETA2 =
  (1 - DESIGN.workCoefficient / WORK_DONE_FACTOR) / DESIGN.flowCoefficient;

/** Geometrik kontrol: kanat ortalama metal acisi ile karsilastirma. */
export function geometricMeanBladeAngle(): number {
  const rm = R_MEAN * 1000;
  const angles = ROTOR_ROWS.map((r) => twistAt(r, rm));
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

// ---------------------------------------------------------------------------
// Verim duzeltmeleri
// ---------------------------------------------------------------------------

export interface EfficiencyPenalties {
  /** Tasarim disi akis katsayisi cezasi. */
  offDesign: number;
  /** Reynolds sayisi cezasi. */
  reynolds: number;
  /** Yagmur / su filmi cezasi. */
  rain: number;
  /** Buz blokaji cezasi. */
  icing: number;
  /** FOD izgarasi blokaj cezasi. */
  screen: number;
  /** Net fan verimi. */
  net: number;
  /** Kanat Reynolds sayisi. */
  reynoldsNumber: number;
}

/**
 * Fan verimi duzeltmeleri.
 *
 * - Tasarim disi: parabolik kayip, phi tasarimdan uzaklastikca artar.
 *   [F3]'te akis katsayisinin verime birinci mertebeden etkisi gosterilmistir.
 * - Reynolds: Re < 2e5 altinda laminer ayrilma kayiplari. Re^-0.2 kurali. [F4]
 * - Yagmur: kanat yuzeyinde su filmi + damla carpismasi; agir yagista
 *   olculen itki kayiplariyla uyumlu ampirik kalibrasyon.
 */
export function efficiencyPenalties(
  phi: number,
  air: AirState,
  icing: IcingState,
  relativeVelocity: number,
  screenBlockage = 0.032,
): EfficiencyPenalties {
  // Reynolds: orta yaricapta veter uzunlugu referansli
  const chord = 0.048; // [m] ortalama veter
  const Re = (air.density * relativeVelocity * chord) / air.viscosity;
  const reRef = 2.5e5;
  const reynolds = Re < reRef ? Math.pow(Re / reRef, 0.14) : 1;

  const dPhi = phi - DESIGN.flowCoefficient;
  const offDesign = Math.max(0.35, 1 - 1.55 * dPhi * dPhi - 0.18 * Math.max(0, -dPhi));

  // Yagmur: LWC^0.6 ile olcekleyen ampirik kayip
  const rain = air.lwc > 0 ? 1 - 0.011 * Math.pow(air.lwc, 0.6) : 1;

  // Buz: blokaj + yuzey purzuzlulugu
  const icingPen = icing.active ? 1 - 0.0042 * icing.blockage : 1;

  // FOD izgarasi: blokaj orani kadar toplam basinc kaybi
  const screen = 1 - 0.45 * screenBlockage;

  const net = DESIGN.fanEfficiency * offDesign * reynolds * rain * icingPen * screen;
  return { offDesign, reynolds, rain, icing: icingPen, screen, net, reynoldsNumber: Re };
}

// ---------------------------------------------------------------------------
// Calisma noktasi cozucu
// ---------------------------------------------------------------------------

export interface FanOperatingPoint {
  rpm: number;
  /** Aci hizi [rad/s]. */
  omega: number;
  /** Ortalama yaricapta kanat hizi [m/s]. */
  bladeSpeedMean: number;
  /** Uc hizi [m/s]. */
  tipSpeed: number;
  /** Uc Mach sayisi (bagil). */
  tipMach: number;
  /** Akis katsayisi. */
  flowCoefficient: number;
  /** Kademe is katsayisi. */
  workCoefficient: number;
  /** Eksenel hiz (fan duzlemi) [m/s]. */
  axialVelocity: number;
  /** Nozul cikis hizi [m/s]. */
  exitVelocity: number;
  /** Kutle debisi [kg/s]. */
  massFlow: number;
  /** Toplam basinc artisi [Pa]. */
  pressureRise: number;
  /** Fan basinc orani. */
  pressureRatio: number;
  /** Brut itki [N]. */
  thrustGross: number;
  /** Ram surukleme [N]. */
  ramDrag: number;
  /** Net itki [N]. */
  thrust: number;
  /** Saft gucu [W]. */
  shaftPower: number;
  /** Tork [N*m]. */
  torque: number;
  /** Ozgul itki [N*s/kg]. */
  specificThrust: number;
  /** Itki/guc [N/kW]. */
  thrustPerKw: number;
  /** Merit figuru (ducted fan tanimi). */
  figureOfMerit: number;
  /** Itki verimi (propulsif). */
  propulsiveEfficiency: number;
  /** Cikis toplam sicaklik artisi [K]. */
  deltaT: number;
  /** Verim bilesenleri. */
  eff: EfficiencyPenalties;
  /** Stall (durma) sinirina yakinlik: 1 = tasarim, <0.55 -> stall riski. */
  stallMargin: number;
  /** Kanat gecis frekansi [Hz] (her rotor icin). */
  bladePassFrequency: number[];
  /** Tahmini ses basinc duzeyi, 1 m'de [dBA]. */
  spl: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Verilen devir ve kosullarda fan calisma noktasini cozer.
 */
export function solveFan(
  rpm: number,
  air: AirState,
  icing: IcingState,
  airspeed: number,
): FanOperatingPoint {
  const omega = (rpm * 2 * Math.PI) / 60;
  const Um = omega * R_MEAN;
  const tipSpeed = omega * (TIP_RADIUS / 1000);

  // Buz blokaji etkin cikis alanini degistirmez ama giris alanini kucultur;
  // bu, akis katsayisini dusuren bir tikanma (throttling) etkisi yaratir.
  const blockFactor = 1 - clamp(icing.blockage / 100, 0, 0.6);
  const areaRatioEff = AREA_RATIO / Math.max(0.4, blockFactor);

  // psi(phi) = lambda * (1 - phi*tanB2), verim de phi'ye bagli -> yarilama
  const residual = (phi: number): number => {
    const psi = WORK_DONE_FACTOR * (1 - phi * TAN_BETA2);
    const wRel = Math.hypot(phi * Um, Um); // bagil hiz buyuklugu
    const eff = efficiencyPenalties(phi, air, icing, wRel);
    const dpt = Math.max(0, air.density * N_STAGES * psi * Um * Um * eff.net);
    const v9energy =
      DESIGN.nozzleVelocityCoeff *
      Math.sqrt(airspeed * airspeed + (2 * dpt) / air.density);
    const v9continuity = phi * Um * areaRatioEff;
    return v9continuity - v9energy;
  };

  // Kok araligi: phi in (0.02, 1/tanB2) — ustte psi sifirlanir
  let lo = 0.02;
  let hi = Math.min(1.9, 0.999 / TAN_BETA2);
  if (residual(lo) > 0) {
    // Cok yuksek ucus hizi: fan itki uretemiyor (windmilling)
    hi = lo;
  } else {
    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      if (residual(mid) < 0) lo = mid;
      else hi = mid;
    }
  }
  const phi = (lo + hi) / 2;

  const psi = Math.max(0, WORK_DONE_FACTOR * (1 - phi * TAN_BETA2));
  const wRel = Math.hypot(phi * Um, Um);
  const eff = efficiencyPenalties(phi, air, icing, wRel);
  const dpt = Math.max(0, air.density * N_STAGES * psi * Um * Um * eff.net);

  const Vx = phi * Um;
  const v9 = Vx * areaRatioEff;
  const mdot = air.density * A_EXIT * v9 * blockFactor;

  const thrustGross = mdot * v9;
  const ramDrag = mdot * airspeed;
  const thrust = thrustGross - ramDrag;

  const dh0 = N_STAGES * psi * Um * Um; // [J/kg] gercek is
  const shaftPower = mdot * dh0;
  const torque = shaftPower / Math.max(omega, 1e-6);

  // Merit figuru — kanalli fan tanimi: P_ideal = 0.5*T^1.5/sqrt(rho*A9)
  const pIdeal =
    thrust > 0 ? (0.5 * Math.pow(thrust, 1.5)) / Math.sqrt(air.density * A_EXIT) : 0;
  const figureOfMerit = shaftPower > 1 ? clamp(pIdeal / shaftPower, 0, 1) : 0;

  // Propulsif verim (Froude)
  const propulsiveEfficiency = v9 + airspeed > 0 ? (2 * airspeed) / (v9 + airspeed) : 0;

  const tipMach = Math.hypot(tipSpeed, Vx) / air.soundSpeed;

  // Kanat gecis frekanslari
  const bpf = ROTOR_ROWS.map((r) => (rpm / 60) * r.count);

  // Gurultu: eDPF deneyinde 6000 rpm ustunde ~120 dB [F1].
  // Uc Mach ve yuklemeye bagli ampirik model (1 m, serbest alan).
  const spl =
    thrust > 1
      ? 20 + 10 * Math.log10(Math.max(1, shaftPower)) + 50 * Math.log10(Math.max(0.1, tipMach / 0.38))
      : 0;

  return {
    rpm,
    omega,
    bladeSpeedMean: Um,
    tipSpeed,
    tipMach,
    flowCoefficient: phi,
    workCoefficient: psi,
    axialVelocity: Vx,
    exitVelocity: v9,
    massFlow: mdot,
    pressureRise: dpt,
    pressureRatio: 1 + dpt / air.pressure,
    thrustGross,
    ramDrag,
    thrust,
    shaftPower,
    torque,
    specificThrust: mdot > 1e-6 ? thrust / mdot : 0,
    thrustPerKw: shaftPower > 1 ? thrust / (shaftPower / 1000) : 0,
    figureOfMerit,
    propulsiveEfficiency: clamp(propulsiveEfficiency, 0, 1),
    deltaT: dh0 / CP_AIR,
    eff,
    stallMargin: phi / DESIGN.flowCoefficient,
    bladePassFrequency: bpf,
    spl: clamp(spl, 0, 145),
  };
}

// ---------------------------------------------------------------------------
// Ek analizler
// ---------------------------------------------------------------------------

/** Kademe reaksiyon derecesi (degree of reaction) — ortalama yaricapta. */
export function degreeOfReaction(phi: number): number {
  // R = 1 - (c_theta2)/(2U);  c_theta2 = psi*U/lambda... ortalama-cizgi
  const psi = WORK_DONE_FACTOR * (1 - phi * TAN_BETA2);
  return 1 - psi / (2 * WORK_DONE_FACTOR);
}

/** Difuzyon faktoru (Lieblein) — kanat yuklemesi / ayrilma gostergesi. */
export function diffusionFactor(phi: number): number {
  const psi = WORK_DONE_FACTOR * (1 - phi * TAN_BETA2);
  const sigma = solidity(BLADE_ROWS[0]);
  const w1 = Math.hypot(phi, 1);
  const w2 = Math.hypot(phi, 1 - psi / WORK_DONE_FACTOR);
  const dCtheta = psi / WORK_DONE_FACTOR;
  return 1 - w2 / w1 + dCtheta / (2 * sigma * w1);
}

/** Cikis Mach sayisi (sikistirilabilirlik kontrolu). */
export function exitMach(op: FanOperatingPoint, air: AirState): number {
  return op.exitVelocity / air.soundSpeed;
}

/** Nozul tikanma (choke) kontrolu — bu tasarimda asla olmamali. */
export function isChoked(op: FanOperatingPoint, air: AirState): boolean {
  return exitMach(op, air) >= 1 / Math.sqrt((GAMMA + 1) / 2);
}

/**
 * Surge/stall siniri: Lieblein difuzyon faktoru 0.60'i gecerse
 * kanat sirasinda ayrilma baslar.
 */
export function stallRisk(op: FanOperatingPoint): { df: number; risk: boolean; margin: number } {
  const df = diffusionFactor(op.flowCoefficient);
  return { df, risk: df > 0.6, margin: (0.6 - df) / 0.6 };
}
