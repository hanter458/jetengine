/**
 * Yapisal analiz ve dayaniklilik.
 * ===============================
 * Kapsam:
 *   1. Kanat kok gerilmesi (merkezkac + aerodinamik egilme)
 *   2. Campbell diyagrami — kanat rezonansi / motor mertebeleri
 *   3. Mil burulmasi ve kritik devir
 *   4. Yatak esdeger yuku ve L10 omru
 *   5. Yorulma omru (Basquin + Miner birikimli hasar)
 *   6. Muhafaza (containment) enerji dengesi
 *   7. Pilon ve OGV yuk yollari
 *
 * KAYNAKLAR
 *  [S1] Turk & Koc, Materials 12(23):3990 (2019) — basilmis kirpik CF-naylon
 *       cekme dayanimi ve siddetli anizotropi.
 *  [S2] Ahlawat et al., JMST 39:5143 (2025) — CF-naylon cekme-cekme yorulma
 *       dayanimi 12-14.5 MPa (10^6 cevrim mertebesi).
 *  [S3] ISO 281 — bilyali yatak dinamik yuk ve L10 omru.
 *  [S4] Southwell katsayisi ile merkezkac sertlesmesi; standart
 *       turbomakine pratigi (Dixon & Hall, Bolum 6).
 *  [S5] ISO 1940-1 — rotor balans kalite dereceleri (G6.3).
 */

import {
  BEARINGS,
  BLADE_ROWS,
  DESIGN,
  MANUFACTURING,
  ROTOR_ROWS,
  SHAFT,
  STATOR_ROWS,
  type BladeRow,
} from '../spec';
import {
  MATERIALS,
  moistureKnockdown,
  temperatureKnockdown,
  type Material,
} from '../materials';
import { bladeSectionArea, centrifugalRootStress, chordAt, thicknessAt } from '../geom/blade';
import { A_ANNULUS, R_MEAN } from './fan';

// ---------------------------------------------------------------------------
// Kanat gerilmesi
// ---------------------------------------------------------------------------

export interface BladeStress {
  rowId: string;
  label: string;
  /** Merkezkac cekme gerilmesi (kok) [MPa]. */
  centrifugal: number;
  /** Eksenel yukten egilme gerilmesi [MPa]. */
  bendingAxial: number;
  /** Tegetsel (tork) yukten egilme gerilmesi [MPa]. */
  bendingTangential: number;
  /** Gerilme yigilma katsayisi (kok kavisi). */
  kt: number;
  /** Centikli maks. gerilme [MPa]. */
  peak: number;
  /** Tasarim izin verilen gerilme [MPa]. */
  allowable: number;
  /** Emniyet katsayisi. */
  safetyFactor: number;
  /** Uc hizi [m/s]. */
  tipSpeed: number;
  /** Kanat kutlesi [g]. */
  bladeMass: number;
  /** Uc uzamasi (merkezkac) [mm]. */
  tipGrowth: number;
}

/**
 * Kanat kok gerilmesi. Merkezkac baskindir; aerodinamik egilme
 * mertebe olarak daha kucuktur ama yorulmada etkindir (degisken bilesen).
 */
export function bladeStress(
  row: BladeRow,
  rpm: number,
  material: Material,
  stagePressureRise: number,
  stageTorque: number,
  tempC: number,
  humidity: number,
  humidHours: number,
): BladeStress {
  const sigmaC = centrifugalRootStress(row, rpm, material.density) / 1e6; // [MPa]

  // Kesit atalet momentleri (profil kesiti icin ampirik katsayilar)
  const c = chordAt(row, row.rHub); // [mm]
  const t = thicknessAt(row, row.rHub) * c; // [mm]
  const Iweak = 0.04 * c * t * t * t; // [mm^4] veter eksenine gore
  const Zweak = Iweak / (t / 2); // [mm^3]
  const Istrong = 0.036 * t * c * c * c;
  const Zstrong = Istrong / (c / 2);

  // Eksenel yuk: kademe basinc artisi x halka alani / kanat sayisi
  const axialForce = (stagePressureRise * A_ANNULUS) / row.count; // [N]
  // Tegetsel yuk: tork / (ortalama yaricap x kanat sayisi)
  const tangForce = stageTorque / (R_MEAN * row.count); // [N]
  const arm = (R_MEAN * 1000 - row.rHub) * 0.62; // [mm] etkin moment kolu

  const bendingAxial = Zweak > 0 ? (axialForce * arm) / Zweak : 0; // [N/mm^2] = MPa
  const bendingTangential = Zstrong > 0 ? (tangForce * arm) / Zstrong : 0;

  // Kok kavisi gerilme yigilmasi: r_fillet/t ~ 0.8 -> Kt ~ 1.6 (basili
  // parcada katman kusurlari icin 1.25 ek carpan)
  const kt = 1.6 * 1.25;
  const peak = kt * (sigmaC + Math.hypot(bendingAxial, bendingTangential));

  const knock =
    temperatureKnockdown(material, tempC) *
    moistureKnockdown(material, humidity, humidHours);
  // Yuk span (katman) yonunde -> XY dayanimi, ama katmanlar arasi
  // bilesen de var; %70 XY + %30 Z karisimi alinir
  const allowable = material.uts * (0.7 + 0.3 * material.zFactor) * knock;

  // Kanat kutlesi
  const n = 40;
  let volMm3 = 0;
  for (let i = 0; i < n; i++) {
    const r = row.rHub + ((row.rTip - row.rHub) * (i + 0.5)) / n;
    volMm3 += bladeSectionArea(row, r) * ((row.rTip - row.rHub) / n);
  }
  const bladeMass = (volMm3 / 1e9) * material.density * 1000; // [g]

  // Uc uzamasi: merkezkac alaninda eksenel uzama
  const E = material.modulus * 1000; // [MPa]
  const tipGrowth = ((sigmaC / E) * (row.rTip - row.rHub)) / 2;

  return {
    rowId: row.id,
    label: row.label,
    centrifugal: sigmaC,
    bendingAxial,
    bendingTangential,
    kt,
    peak,
    allowable,
    safetyFactor: peak > 1e-6 ? allowable / peak : 99,
    tipSpeed: ((rpm * 2 * Math.PI) / 60) * (row.rTip / 1000),
    bladeMass,
    tipGrowth,
  };
}

// ---------------------------------------------------------------------------
// Campbell diyagrami — rezonans
// ---------------------------------------------------------------------------

export interface ModeInfo {
  rowId: string;
  /** Duran (statik) ilk egilme modu [Hz]. */
  staticFreq: number;
  /** Donerken merkezkac sertlesmesiyle artan frekans [Hz]. */
  runningFreq: number;
  /** Motor mertebesi (frekans / donme frekansi). */
  engineOrder: number;
}

export interface CampbellCrossing {
  rowId: string;
  /** Motor mertebesi. */
  order: number;
  /** Kesisme devri [rpm]. */
  rpm: number;
  /** Bu mertebeyi uyaran donanim. */
  source: string;
  /** Calisma araliginda mi? */
  inOperatingRange: boolean;
  /** Ciddiyet: yuksek = tehlikeli. */
  severity: 'yuksek' | 'orta' | 'dusuk';
}

/**
 * Kanadin ilk egilme (flap) modu — ankastre kiris:
 *   f0 = (1.875^2 / 2pi) * sqrt(EI / (rho*A*L^4))
 * Merkezkac sertlesmesi Southwell bagintisiyla: [S4]
 *   f^2 = f0^2 + K * (Omega/2pi)^2,  K ~ 1.5 (dusuk en-boy oranli kanat)
 */
export function bladeMode(row: BladeRow, rpm: number, material: Material): ModeInfo {
  const c = chordAt(row, row.rHub) / 1000; // [m]
  const t = (thicknessAt(row, row.rHub) * chordAt(row, row.rHub)) / 1000; // [m]
  const I = 0.04 * c * t * t * t; // [m^4]
  const A = 0.68 * c * t; // [m^2]
  const L = (row.rTip - row.rHub) / 1000; // [m]
  const E = material.modulus * 1e9; // [Pa]

  const f0 =
    ((1.875 * 1.875) / (2 * Math.PI)) *
    Math.sqrt((E * I) / (material.density * A * Math.pow(L, 4)));
  const rotHz = rpm / 60;
  const K = 1.5;
  const fRun = Math.sqrt(f0 * f0 + K * rotHz * rotHz);
  return {
    rowId: row.id,
    staticFreq: f0,
    runningFreq: fRun,
    engineOrder: rotHz > 0 ? fRun / rotHz : 0,
  };
}

/** Motoru uyaran gercek donanim sayimlari -> motor mertebeleri. */
export const EXCITATION_SOURCES: { order: number; source: string; severity: CampbellCrossing['severity'] }[] = [
  { order: 1, source: 'Rotor dengesizligi + pilon izi (1 adet)', severity: 'yuksek' },
  { order: 2, source: 'Yanal giris carpiklig (2 adet ESC bolmesi)', severity: 'dusuk' },
  { order: 3, source: 'Kaporta paneli / nozul dilimi (3 adet)', severity: 'orta' },
  { order: 5, source: 'Giris cani dilimi + batarya tasiyici dilimi (5 adet)', severity: 'orta' },
  { order: 6, source: 'Yatak tasiyici kollari (6 adet)', severity: 'orta' },
  { order: 10, source: 'Itki flansi / yuk halkasi kollari (10 adet)', severity: 'dusuk' },
  { order: 12, source: 'Flans civatalari (12 adet)', severity: 'dusuk' },
  { order: 13, source: 'Kademe 1 stator kanatciklari (13 adet)', severity: 'yuksek' },
  { order: 15, source: 'Kademe 2 OGV kanatciklari (15 adet)', severity: 'yuksek' },
];

export function campbellCrossings(material: Material): CampbellCrossing[] {
  const out: CampbellCrossing[] = [];
  const idleRpm = 2500;
  for (const row of BLADE_ROWS) {
    if (row.kind !== 'rotor') continue;
    for (const ex of EXCITATION_SOURCES) {
      // f_run(rpm) = order * rpm/60 kesisimini bul
      // sqrt(f0^2 + K*(rpm/60)^2) = order*rpm/60
      const c = chordAt(row, row.rHub) / 1000;
      const t = (thicknessAt(row, row.rHub) * chordAt(row, row.rHub)) / 1000;
      const I = 0.04 * c * t * t * t;
      const A = 0.68 * c * t;
      const L = (row.rTip - row.rHub) / 1000;
      const E = material.modulus * 1e9;
      const f0 =
        ((1.875 * 1.875) / (2 * Math.PI)) *
        Math.sqrt((E * I) / (material.density * A * Math.pow(L, 4)));
      const K = 1.5;
      const denom = ex.order * ex.order - K;
      if (denom <= 0) continue;
      const rotHz = f0 / Math.sqrt(denom);
      const rpm = rotHz * 60;
      const inRange = rpm >= idleRpm && rpm <= DESIGN.rpmMax;
      if (rpm < 500 || rpm > DESIGN.rpmMax * 1.6) continue;
      out.push({
        rowId: row.id,
        order: ex.order,
        rpm,
        source: ex.source,
        inOperatingRange: inRange,
        severity: inRange ? ex.severity : 'dusuk',
      });
    }
  }
  return out.sort((a, b) => a.rpm - b.rpm);
}

// ---------------------------------------------------------------------------
// Mil
// ---------------------------------------------------------------------------

export interface ShaftResult {
  /** Burulma gerilmesi [MPa]. */
  torsion: number;
  /** Izin verilen kayma gerilmesi [MPa]. */
  allowableShear: number;
  safetyFactor: number;
  /** Birinci egilme kritik devri [rpm]. */
  criticalRpm: number;
  /** Calisma devri / kritik devir. */
  speedRatio: number;
  /** Burulma acisi [derece]. */
  twistAngle: number;
}

/**
 * Mil analizi.
 *
 * Burulma:  tau = T*r/J,  J = pi*(do^4 - di^4)/32
 *
 * Kritik devir (birinci egilme):
 *   Rayleigh yontemi, etkin acikligi yatak araligi + iki tasma olarak
 *   alinir (rotor 1 on yatagin ONUNDE, tasmali). Basit mesnetli kiris:
 *     omega_n = (pi/L_eff)^2 * sqrt(E*I*L_eff / m_eq)
 *   m_eq = boru kutlesi + rotor/adaptor kutleleri.
 *
 * Tasarim kurali: n_calisma / n_kritik < 0.8 (alt-kritik calisma).
 */
export function shaftAnalysis(torque: number, rpm: number): ShaftResult {
  const mat = MATERIALS.STEEL42CRMO4;
  const dO = SHAFT.diameter / 1000;
  const dI = (SHAFT.diameter - 2 * SHAFT.wall) / 1000;
  const J = (Math.PI * (Math.pow(dO, 4) - Math.pow(dI, 4))) / 32;
  const I = (Math.PI * (Math.pow(dO, 4) - Math.pow(dI, 4))) / 64;
  const tau = ((torque * (dO / 2)) / J) / 1e6; // [MPa]
  const allowableShear = mat.yield * 0.577; // von Mises kayma akma siniri

  const span = (BEARINGS[1].x - BEARINGS[0].x) / 1000;
  const overhangFwd = (BEARINGS[0].x - ROTOR_ROWS[0].xMid) / 1000;
  const lEff = span + 2 * Math.max(0, overhangFwd);

  const area = (Math.PI * (dO * dO - dI * dI)) / 4;
  const rotorMass = 0.9; // [kg] iki rotor govdesi + 2 adaptor
  const mEq = mat.density * area * lEff + rotorMass;

  const omegaN = Math.pow(Math.PI / lEff, 2) * Math.sqrt((mat.modulus * 1e9 * I * lEff) / mEq);
  const criticalRpm = (omegaN * 60) / (2 * Math.PI);

  const G = 80e9;
  const twist = ((torque * (SHAFT.length / 1000)) / (G * J)) * (180 / Math.PI);

  return {
    torsion: tau,
    allowableShear,
    safetyFactor: tau > 1e-6 ? allowableShear / tau : 99,
    criticalRpm,
    speedRatio: rpm / Math.max(criticalRpm, 1),
    twistAngle: twist,
  };
}

// ---------------------------------------------------------------------------
// Yataklar
// ---------------------------------------------------------------------------

export interface BearingResult {
  id: string;
  designation: string;
  /** Radyal yuk [N]. */
  radial: number;
  /** Eksenel yuk [N]. */
  axial: number;
  /** Esdeger dinamik yuk [N]. */
  equivalent: number;
  /** L10 omru [milyon devir]. */
  l10Rev: number;
  /** L10 omru [saat]. */
  l10Hours: number;
  /** Gres omru [saat] (hiz ve sicakliga bagli — genellikle asil sinir). */
  greaseHours: number;
  /** Hiz faktoru n*dm [mm/dk]. */
  speedFactor: number;
  /** Limit devrin ne kadari kullaniliyor. */
  speedUtilisation: number;
  /** Belirleyici omur [saat]. */
  limitingHours: number;
}

/**
 * ISO 281 yatak omru. [S3]
 *   P = X*Fr + Y*Fa
 *   L10 = (C/P)^3 x 10^6 devir
 * Gres omru Kf*(limit devir orani) ve sicakliga gore ayrica hesaplanir;
 * yuksek devirli kucuk yataklarda GENELLIKLE belirleyici olan budur.
 */
export function bearingAnalysis(
  thrust: number,
  rpm: number,
  loadFactor: number,
  tempC: number,
): BearingResult[] {
  const omega = (rpm * 2 * Math.PI) / 60;
  const rotorMass = 0.45; // [kg] rotor basina
  // ISO 1940-1 G6.3: e * omega = 6.3 mm/s -> e [m]
  const ecc = 0.0063 / Math.max(omega, 1);
  const unbalanceForce = 2 * rotorMass * ecc * omega * omega;
  const maneuverForce = 2 * rotorMass * 9.80665 * loadFactor;

  return BEARINGS.map((bs, i) => {
    const isAft = i === 1;
    const radial = unbalanceForce + maneuverForce * (isAft ? 0.6 : 0.4);
    const axial = isAft ? thrust : 0; // eksenel yuku arka yatak tasir
    const X = 0.56;
    const Y = axial / Math.max(radial, 1e-6) > 1.5 ? 1.45 : 1.0;
    const P = Math.max(radial, X * radial + Y * axial);
    const l10Rev = Math.pow(bs.dynamicC / Math.max(P, 1), 3); // [milyon devir]
    const l10Hours = (l10Rev * 1e6) / (Math.max(rpm, 1) * 60);

    const dm = (bs.bore + bs.od) / 2;
    const speedFactor = rpm * dm;
    // Gres omru: her 15 K'de yarilanir, hiz faktoruyle azalir
    const greaseBase = 12000; // [saat] referans: 100 000 mm/dk, 70 °C
    const greaseHours =
      greaseBase *
      Math.pow(100000 / Math.max(speedFactor, 1), 1.3) *
      Math.pow(0.5, Math.max(0, tempC - 70) / 15);

    return {
      id: bs.id,
      designation: bs.designation,
      radial,
      axial,
      equivalent: P,
      l10Rev,
      l10Hours,
      greaseHours,
      speedFactor,
      speedUtilisation: rpm / bs.speedLimit,
      limitingHours: Math.min(l10Hours, greaseHours),
    };
  });
}

// ---------------------------------------------------------------------------
// Yorulma
// ---------------------------------------------------------------------------

export interface FatigueResult {
  rowId: string;
  /** Ortalama gerilme [MPa]. */
  meanStress: number;
  /** Degisken gerilme genligi [MPa]. */
  alternatingStress: number;
  /** Goodman duzeltmeli esdeger genlik [MPa]. */
  equivalentAlternating: number;
  /** Yorulma dayanimi [MPa]. */
  fatigueStrength: number;
  /** Kirilmaya kadar cevrim sayisi. */
  cyclesToFailure: number;
  /** Saat cinsinden omur (calisma devrinde). */
  lifeHours: number;
  /** 1 saatlik calismada birikimli hasar (Miner). */
  damagePerHour: number;
}

/**
 * Basquin + Goodman. Basilmis CF-naylonun 10^6 cevrim yorulma dayanimi
 * 12-14.5 MPa olarak olculmustur [S2]; egim b = -0.11 alinmistir
 * (elyaf katkili termoplastikler icin tipik).
 */
export function fatigueAnalysis(bs: BladeStress, rpm: number, material: Material): FatigueResult {
  // Merkezkac = sabit (ortalama), aerodinamik uyarma = degisken
  const mean = bs.kt * bs.centrifugal;
  // Kanat gecis uyarimi: kararli aero yukun %18'i genlik (rotor-stator
  // etkilesimi, kanal carpikligi) — turbomakine pratiginde tipik
  const alt = bs.kt * Math.hypot(bs.bendingAxial, bs.bendingTangential) * 0.18 + 0.35;

  const su = bs.allowable;
  // Goodman: sigma_a_eq = sigma_a / (1 - sigma_m/Su)
  const eqAlt = mean < su ? alt / (1 - mean / su) : alt * 10;
  const sf = material.fatigue1e6;

  // Basquin: S = S_1e6 * (N/1e6)^b
  const b = -0.11;
  const cycles =
    eqAlt > 0 ? 1e6 * Math.pow(eqAlt / sf, 1 / b) : Infinity;
  const cyclesPerHour = rpm * 60;
  const lifeHours = cycles / Math.max(cyclesPerHour, 1);

  return {
    rowId: bs.rowId,
    meanStress: mean,
    alternatingStress: alt,
    equivalentAlternating: eqAlt,
    fatigueStrength: sf,
    cyclesToFailure: cycles,
    lifeHours,
    damagePerHour: 1 / Math.max(lifeHours, 1e-9),
  };
}

// ---------------------------------------------------------------------------
// Muhafaza (containment)
// ---------------------------------------------------------------------------

export interface ContainmentResult {
  /** Tek kanat firlamasinin kinetik enerjisi [J]. */
  bladeEnergy: number;
  /** Tum rotorun kinetik enerjisi [J]. */
  rotorEnergy: number;
  /** Basili 4 mm kanal cidarinin sogurabilecegi enerji [J]. */
  ductCapacity: number;
  /** Aramid sargi eklenince toplam kapasite [J]. */
  withAramid: number;
  /** Basili kanal tek basina yeterli mi? */
  containedByDuct: boolean;
  /** Aramid sargi ile yeterli mi? */
  containedWithAramid: boolean;
  /** Onerilen aramid kat sayisi. */
  aramidLayers: number;
  /** Firlama hizi [m/s]. */
  fragmentVelocity: number;
}

/**
 * Muhafaza enerji dengesi.
 *
 * Basili termoplastik cidarin sogurma kapasitesi, delinme enerjisi
 * yaklasimiyla tahmin edilir:
 *   E_abs ~ pi * d_frag * t * (UTS/2) * t    (kesme + membran isi)
 * Bu YALNIZCA mertebe tahminidir; gercek dogrulama tahrip testi gerektirir.
 *
 * Aramid kumas (200 g/m^2 Kevlar-29, epoksi ile 3 kat) kucuk parcalar icin
 * kat basina ~85 J sogurur — model ucak ve kucuk EDF uygulamalarinda
 * yaygin pratik.
 */
export function containmentAnalysis(
  rpm: number,
  bladeMassG: number,
  ductWallMm: number,
  ductMaterial: Material,
): ContainmentResult {
  const omega = (rpm * 2 * Math.PI) / 60;
  const row = ROTOR_ROWS[0];
  // Kok kavisinden kopan kanadin agirlik merkezi hizi
  const rCg = ((row.rHub + row.rTip) / 2 / 1000) * 1.02;
  const v = omega * rCg;
  const m = bladeMassG / 1000;
  const bladeEnergy = 0.5 * m * v * v;

  // Rotor atalet momenti (jant + kanatlar)
  const iRotor = 0.0026; // [kg*m^2] mesh tabanli tahmin
  const rotorEnergy = 0.5 * iRotor * omega * omega;

  const t = ductWallMm / 1000;
  const dFrag = (chordAt(row, row.rTip) / 1000) * 0.8;
  const ductCapacity = Math.PI * dFrag * t * t * ((ductMaterial.uts * 1e6) / 2);

  const layers = 3;
  const withAramid = ductCapacity + layers * 85;

  return {
    bladeEnergy,
    rotorEnergy,
    ductCapacity,
    withAramid,
    containedByDuct: ductCapacity >= bladeEnergy * 1.5,
    containedWithAramid: withAramid >= bladeEnergy * 1.5,
    aramidLayers: Math.max(
      layers,
      Math.ceil((bladeEnergy * 1.5 - ductCapacity) / 85),
    ),
    fragmentVelocity: v,
  };
}

// ---------------------------------------------------------------------------
// Yuk yollari: OGV ve pilon
// ---------------------------------------------------------------------------

export interface LoadPathResult {
  /** OGV kanatcigi basina eksenel yuk [N]. */
  ogvLoadPerVane: number;
  /** OGV kanatciginda basma/egilme gerilmesi [MPa]. */
  ogvStress: number;
  ogvSafety: number;
  /** Pilon kokunde egilme gerilmesi [MPa]. */
  pylonStress: number;
  pylonSafety: number;
  /** Flans civatasi basina kesme yuku [N]. */
  boltShear: number;
  /** Civata kesme gerilmesi [MPa]. */
  boltStress: number;
  boltSafety: number;
}

export function loadPaths(thrust: number, loadFactor: number, totalMassKg: number): LoadPathResult {
  const ogv = STATOR_ROWS[STATOR_ROWS.length - 1];
  const perVane = thrust / ogv.count;
  const c = chordAt(ogv, ogv.rHub);
  const t = thicknessAt(ogv, ogv.rHub) * c;
  const area = 0.68 * c * t; // [mm^2]
  const ogvStress = perVane / area; // MPa
  const ogvMat = MATERIALS.PA6CF;
  const ogvAllow = ogvMat.uts * (0.7 + 0.3 * ogvMat.zFactor) * 0.85;

  // Pilon: itki + agirlik x yuk faktoru, kokte egilme
  const pylonMat = MATERIALS.PA6CF;
  const chordP = 190, thickP = 0.18 * 190;
  const Zp = (0.036 * thickP * chordP * chordP * chordP) / (chordP / 2); // [mm^3]
  const armP = 82; // [mm] kokten yuk merkezine
  const sideLoad = totalMassKg * 9.80665 * loadFactor;
  const momentP = Math.hypot(thrust, sideLoad) * armP; // [N*mm]
  const pylonStress = momentP / Zp;
  const pylonAllow = pylonMat.uts * (0.7 + 0.3 * pylonMat.zFactor) * 0.85;

  // Flans civatalari: itkiyi kesme ile aktarir
  const nBolts = MANUFACTURING.flangeBolts;
  const boltShear = thrust / nBolts;
  const boltArea = (Math.PI * MANUFACTURING.boltDia * MANUFACTURING.boltDia) / 4;
  const boltStress = boltShear / boltArea;
  // 8.8 sinifi civata: 640 MPa cekme, 0.6 x = 384 MPa kesme
  const boltAllow = 384;

  return {
    ogvLoadPerVane: perVane,
    ogvStress,
    ogvSafety: ogvStress > 1e-6 ? ogvAllow / ogvStress : 99,
    pylonStress,
    pylonSafety: pylonStress > 1e-6 ? pylonAllow / pylonStress : 99,
    boltShear,
    boltStress,
    boltSafety: boltStress > 1e-6 ? boltAllow / boltStress : 99,
  };
}
