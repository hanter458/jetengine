/**
 * Risk ve guvenilirlik modeli — "patlama olasiligi" sorusunun yaniti.
 * ===================================================================
 *
 * ONEMLI KAVRAMSAL NOT
 *   Elektrikli kanalli fan, YAKITLI bir jet motoru gibi patlamaz: icinde
 *   yanma odasi, kerosen ve yuksek basincli sicak gaz yoktur. Bu motorda
 *   iki ayri "siddetli ariza" mekanizmasi vardir:
 *
 *     (A) BATARYA ISIL KACAGI (thermal runaway) — gercek patlama/yangin
 *         riski budur. Li-ion hucre 138 °C civarinda oz-isinmaya girer,
 *         ardindan zincirleme reaksiyonla 600 °C'ye ulasir, gaz cikarir
 *         ve tutusur. Tek hucre 1.5 kJ'a kadar enerji bosaltir.
 *
 *     (B) ROTOR PARCALANMASI (blade release / burst) — patlama degil ama
 *         ayni derecede tehlikeli: 12 500 rpm'de kopan bir kanat ~95 J
 *         ile kanal cidarina carpar.
 *
 *   Model bu ikisini AYRI hesaplar ve sonra birlestirir.
 *
 * YONTEM
 *   Her ariza modu icin bir "yuk" (stres, sicaklik) ve bir "dayanim"
 *   dagilimi tanimlanir; ariza olasiligi bu ikisinin ortusme integralidir
 *   (stress-strength interference). Dayanimlar lognormal (mukavemet) veya
 *   normal (sicaklik esigi) kabul edilir.
 *
 *     P_f = Phi( -ln(mu_S/mu_L) / sqrt(cov_S^2 + cov_L^2) )     lognormal
 *
 *   Tek hucrelik ic kisa devre icin saha verisi tabanli taban oran
 *   kullanilir (yuksek kaliteli hucrelerde ~1e-7 / hucre-yil), abuse
 *   carpanlariyla olceklenir.
 *
 * KAYNAKLAR
 *  [R1] Wehrle et al., Batteries 11(10):371 (2025), CC BY — Arrhenius tipi
 *       cok kademeli isil kacak modeli, ARC kalibrasyonu, modul yayilimi.
 *  [R2] Parhizi, Ostanek et al., J. Electrochem. Soc. 171:010521 (2024),
 *       CC BY — SOC'nin isil kacak baslangicina etkisi; yuksek SOC daha
 *       dusuk baslangic sicakligi.
 *  [R3] Abada et al., J. Power Sources (2018), HAL-01863187 — yaslanmanin
 *       oz-isinma ve kacak baslangicina etkisi; Arrhenius alt-modelleri.
 *  [R4] Fischer et al., PMLR 147 (2021) — isil kacak olasiligina belirsiz
 *       Bayes yaklasimi; A ve Ea belirsizliginin olasiliga yansitilmasi.
 *  [R5] Turk & Koc, Materials 12(23):3990 (2019) — basilmis CF-naylon
 *       dayanim degiskenligi (anizotropi, katman kusurlari).
 */

import { CELL, PACK, PACK_CELL_COUNT } from '../spec';
import type { BladeStress, ContainmentResult, FatigueResult, BearingResult, CampbellCrossing } from './structure';
import type { ThermalResult } from './thermal';

// ---------------------------------------------------------------------------
// Istatistik yardimcilari
// ---------------------------------------------------------------------------

/** Standart normal dagilim kumulatif fonksiyonu (Abramowitz-Stegun 7.1.26). */
export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  p = z > 0 ? 1 - p : p;
  return Math.max(0, Math.min(1, p));
}

/**
 * Lognormal dayanim / lognormal yuk ortusmesi.
 * @param strengthMean dayanim ortalamasi
 * @param loadMean     yuk ortalamasi
 * @param covS         dayanim degisim katsayisi
 * @param covL         yuk degisim katsayisi
 */
export function interferenceProbability(
  strengthMean: number,
  loadMean: number,
  covS: number,
  covL: number,
): number {
  if (loadMean <= 0) return 0;
  if (strengthMean <= 0) return 1;
  const sS = Math.sqrt(Math.log(1 + covS * covS));
  const sL = Math.sqrt(Math.log(1 + covL * covL));
  const z = Math.log(strengthMean / loadMean) / Math.sqrt(sS * sS + sL * sL);
  return normalCDF(-z);
}

// ---------------------------------------------------------------------------
// Ariza modu tanimi
// ---------------------------------------------------------------------------

export type Severity = 'katastrofik' | 'tehlikeli' | 'ciddi' | 'kucuk';

export interface FailureMode {
  id: string;
  label: string;
  /** Kisa aciklama / mekanizma. */
  mechanism: string;
  severity: Severity;
  /** Tek bir ucus/calisma icin olasilik. */
  perRun: number;
  /** Saat basina olasilik. */
  perHour: number;
  /** Tetikleyen fiziksel buyukluk (gosterim icin). */
  driver: string;
  /** Mevcut marj (1 = tam sinirda, >1 guvenli). */
  margin: number;
  /** Azaltici onlem onerisi. */
  mitigation: string;
}

export interface RiskInput {
  /** Bu kosuldaki calisma suresi [s]. */
  runTimeS: number;
  rpm: number;
  bladeStresses: BladeStress[];
  fatigue: FatigueResult[];
  bearings: BearingResult[];
  containment: ContainmentResult;
  campbell: CampbellCrossing[];
  thermal: ThermalResult;
  /** Batarya sarj durumu 0-1. */
  soc: number;
  /** Hucre basina C-orani. */
  cRate: number;
  /** Batarya cevrim sayisi. */
  cycles: number;
  /** Su girisi riski (0-1): yagmur + IP sizdirmazlik. */
  waterIngress: number;
  /** Buz atma riski var mi? */
  iceShedding: boolean;
  /** Ortam sicakligi [°C]. */
  ambientC: number;
  /** Stall/surge riski. */
  stallRisk: boolean;
  /** Motor uyarilari var mi (asiri akim vb.). */
  overCurrent: boolean;
}

export interface RiskResult {
  modes: FailureMode[];
  /** Katastrofik olay olasiligi (bu calisma icin). */
  catastrophicPerRun: number;
  /** Katastrofik olay olasiligi (saat basina). */
  catastrophicPerHour: number;
  /** Ozel olarak "patlama/yangin" (batarya kaynakli) olasiligi. */
  explosionPerRun: number;
  explosionPerHour: number;
  /** Rotor parcalanma olasiligi. */
  burstPerRun: number;
  /** Herhangi bir arizanin olasiligi. */
  anyFailurePerRun: number;
  /** Ortalama arizalar arasi sure [saat]. */
  mtbfHours: number;
  /** Isil kacak analizi ayrintisi. */
  runaway: RunawayAnalysis;
  /** Sozel risk seviyesi. */
  riskLevel: 'cok dusuk' | 'dusuk' | 'orta' | 'yuksek' | 'kabul edilemez';
  /** Sertifikasyon karsilastirmasi. */
  certificationNote: string;
}

// ---------------------------------------------------------------------------
// Isil kacak
// ---------------------------------------------------------------------------

export interface RunawayAnalysis {
  /** Olculen/kestirilen hucre sicakligi [°C]. */
  cellTempC: number;
  /** SOC'ye gore duzeltilmis kacak baslangic sicakligi [°C]. */
  onsetTempC: number;
  /** Baslangic sicakligina kalan marj [K]. */
  marginK: number;
  /** Arrhenius oz-isinma hizi [°C/min] — mevcut sicaklikta. */
  selfHeatRate: number;
  /** Sogutmanin sagladigi maks. oz-isinma hizi [°C/min]. */
  coolingCapacity: number;
  /** Kacak kosulu (oz-isinma > sogutma)? */
  thermallyUnstable: boolean;
  /** Tek hucre kacaginda aciga cikan enerji [kJ]. */
  cellEnergyKj: number;
  /** Komsu hucreye yayilma gecikmesi [s]. */
  propagationDelayS: number;
  /** Tum paketin kacmasi halinde toplam enerji [MJ]. */
  packEnergyMj: number;
  /** Ic kisa devre kaynakli taban olasilik (bu calisma). */
  internalShortProb: number;
  /** Termal kaynakli olasilik (bu calisma). */
  thermalProb: number;
  /** Mekanik hasar (buz/parca) kaynakli olasilik. */
  mechanicalProb: number;
}

/**
 * Isil kacak analizi.
 *
 * Arrhenius oz-isinma hizi [R1][R3]:
 *   dT/dt = (dH * A / (m*cp)) * exp(-Ea/(R*T))
 * Kalibrasyon: NMC hucresinde 138 °C'de ~0.2 °C/min, 180 °C'de ~10 °C/min
 * (ARC olcumleriyle uyumlu). Ea = 1.2e5 J/mol alinir.
 *
 * Kacak kosulu: oz-isinma hizi, sogutma kapasitesini gecerse sistem
 * termal olarak kararsizdir (Semenov kriteri).
 */
export function analyzeRunaway(inp: RiskInput): RunawayAnalysis {
  const cellTempC = inp.thermal.battery.tempC;
  const T = cellTempC + 273.15;

  // SOC etkisi: yuksek SOC -> daha dusuk baslangic sicakligi [R2]
  // 100% SOC'de -8 K, 50% SOC'de +10 K (ARC egilimleri)
  const socShift = 10 - 18 * inp.soc;
  // Yaslanma: yaslanmis hucre daha dusuk sicaklikta kacar [R3]
  const ageShift = -0.012 * inp.cycles;
  const onsetTempC = CELL.runawayOnset + socShift + ageShift;

  // Arrhenius oz-isinma
  const Ea = 1.2e5; // [J/mol]
  const Rgas = 8.314;
  // A, 138 °C'de 0.2 °C/min verecek sekilde kalibre
  const Tref = 138 + 273.15;
  const A = 0.2 / Math.exp(-Ea / (Rgas * Tref));
  const selfHeatRate = A * Math.exp(-Ea / (Rgas * T)); // [°C/min]

  // Sogutma kapasitesi: UA * dT / (m*cp) -> °C/min
  const cCell = (CELL.mass / 1000) * CELL.specificHeat; // [J/K]
  const uaPerCell = inp.thermal.battery.ua / PACK_CELL_COUNT;
  const coolingCapacity =
    ((uaPerCell * Math.max(1, cellTempC - inp.ambientC)) / cCell) * 60;

  const thermallyUnstable = selfHeatRate > coolingCapacity && cellTempC > CELL.selfHeatOnset;

  // Tek hucre kacak enerjisi: elektrokimyasal + yanma
  // NMC 21700 icin ~5x depolanan elektrik enerjisi
  const storedWh = (CELL.capacity / 1000) * CELL.voltageNominal;
  const cellEnergyKj = storedWh * 3.6 * 5.0;

  // ---- Olasiliklar ----

  // (1) Ic kisa devre (uretim kusuru): saha verisi ~1e-7 / hucre-yil,
  //     yuksek C-orani ve sicaklik ile artar.
  const hours = inp.runTimeS / 3600;
  const cRateFactor = 1 + 2.2 * Math.max(0, inp.cRate - 3);
  const tempFactor = Math.exp(Math.max(0, cellTempC - 25) / 22);
  const internalShortProb =
    PACK_CELL_COUNT * 1e-7 * (hours / 8760) * cRateFactor * tempFactor * 1000;

  // (2) Termal kaynakli: sicaklik esigi ortusmesi.
  //     Baslangic sicakligi normal dagilir (sigma 12 K — hucreler arasi
  //     degisim + SOC/yaslanma belirsizligi [R2][R4]).
  const sigmaOnset = 12;
  const zTherm = (onsetTempC - cellTempC) / sigmaOnset;
  let thermalProb = 1 - normalCDF(zTherm);
  // 120 hucreden herhangi biri: 1-(1-p)^n
  thermalProb = 1 - Math.pow(1 - thermalProb, PACK_CELL_COUNT);
  if (thermallyUnstable) thermalProb = Math.max(thermalProb, 0.35);

  // (3) Mekanik: su girisi (kisa devre), buz/parca carpmasi, titresim
  const mechanicalProb =
    inp.waterIngress * 2.5e-4 +
    (inp.iceShedding ? 8e-4 : 0) +
    (inp.overCurrent ? 6e-4 : 0);

  const { propagationDelayS } = { propagationDelayS: propagationDelay() };

  return {
    cellTempC,
    onsetTempC,
    marginK: onsetTempC - cellTempC,
    selfHeatRate,
    coolingCapacity,
    thermallyUnstable,
    cellEnergyKj,
    propagationDelayS,
    packEnergyMj: (cellEnergyKj * PACK_CELL_COUNT) / 1000,
    internalShortProb: Math.min(1, internalShortProb),
    thermalProb: Math.min(1, thermalProb),
    mechanicalProb: Math.min(1, mechanicalProb),
  };
}

/** Komsu hucreye isil kacak yayilma gecikmesi [s] (PC-CF + mika bariyer). */
function propagationDelay(): number {
  const k = 0.32; // [W/(m*K)]
  const area = 0.07 * 0.003;
  const thickness = 0.0021;
  const ua = (k * area) / thickness;
  const cCell = (CELL.mass / 1000) * CELL.specificHeat;
  const q = ua * (600 - 25) * PACK.parallel;
  return (cCell * (CELL.runawayOnset - 25)) / Math.max(q, 1e-9);
}

// ---------------------------------------------------------------------------
// Ana risk degerlendirmesi
// ---------------------------------------------------------------------------

export function assessRisk(inp: RiskInput): RiskResult {
  const modes: FailureMode[] = [];
  const hours = inp.runTimeS / 3600;
  const perRunToHour = (p: number) => (hours > 0 ? p / hours : p);

  const runaway = analyzeRunaway(inp);

  // --- 1. Batarya isil kacagi (PATLAMA/YANGIN) -------------------------
  const explosionPerRun = Math.min(
    1,
    runaway.internalShortProb + runaway.thermalProb + runaway.mechanicalProb,
  );
  modes.push({
    id: 'BATT-TR',
    label: 'Batarya isil kacagi (yangin / patlama)',
    mechanism:
      `Hucre ${runaway.cellTempC.toFixed(0)} °C, kacak baslangici ` +
      `${runaway.onsetTempC.toFixed(0)} °C (SOC ve yaslanma duzeltmeli). ` +
      `Oz-isinma ${runaway.selfHeatRate.toFixed(3)} °C/dk, sogutma ` +
      `${runaway.coolingCapacity.toFixed(2)} °C/dk. ` +
      (runaway.thermallyUnstable
        ? 'TERMAL OLARAK KARARSIZ — Semenov kriteri asildi.'
        : 'Termal olarak kararli.'),
    severity: 'katastrofik',
    perRun: explosionPerRun,
    perHour: perRunToHour(explosionPerRun),
    driver: `T_hucre = ${runaway.cellTempC.toFixed(0)} °C, C = ${inp.cRate.toFixed(1)}C`,
    margin: runaway.marginK / 40,
    mitigation:
      'Hucre arasi mika bariyer + PC-CF tasiyici (yayilma gecikmesi ' +
      `${runaway.propagationDelayS.toFixed(0)} s), 8 kanal NTC izleme, ` +
      '250 A pyro sigorta, basinc tahliye kanallari asagi yonlu.',
  });

  // --- 2. Rotor kanadi kopmasi (statik asim) ---------------------------
  let burstStatic = 0;
  for (const bs of inp.bladeStresses) {
    // Dayanim degiskenligi: basilmis CF-naylonda CoV ~0.13 [R5]
    const p = interferenceProbability(bs.allowable, bs.peak, 0.13, 0.08);
    burstStatic = Math.max(burstStatic, p);
  }

  // --- 3. Rotor kanadi yorulma kirilmasi -------------------------------
  let fatigueProb = 0;
  for (const f of inp.fatigue) {
    const damage = hours * f.damagePerHour;
    // Miner hasari 1'e yaklastikca olasilik artar; hasar dagilimi CoV 0.4
    fatigueProb = Math.max(fatigueProb, interferenceProbability(1, damage, 0.4, 0.25));
  }

  // --- 4. Rezonans kaynakli hizli kirilma ------------------------------
  const badCrossings = inp.campbell.filter(
    (c) => c.inOperatingRange && c.severity === 'yuksek' && Math.abs(c.rpm - inp.rpm) < inp.rpm * 0.06,
  );
  const resonanceProb = badCrossings.length > 0 ? 0.012 * badCrossings.length : 0;

  const burstPerRun = Math.min(1, burstStatic + fatigueProb + resonanceProb + (inp.iceShedding ? 3e-3 : 0));

  modes.push({
    id: 'ROTOR-BURST',
    label: 'Rotor kanadi kopmasi / parcalanma',
    mechanism:
      `Kok tepe gerilmesi ${inp.bladeStresses[0]?.peak.toFixed(1)} MPa, ` +
      `izin verilen ${inp.bladeStresses[0]?.allowable.toFixed(1)} MPa. ` +
      `Kopan kanat enerjisi ${inp.containment.bladeEnergy.toFixed(0)} J. ` +
      (inp.containment.containedByDuct
        ? '4 mm basili cidar yeterli.'
        : `Basili cidar YETERSIZ (${inp.containment.ductCapacity.toFixed(0)} J) — ` +
          `${inp.containment.aramidLayers} kat aramid sargi ZORUNLU.`),
    severity: 'katastrofik',
    perRun: burstPerRun,
    perHour: perRunToHour(burstPerRun),
    driver: `sigma_tepe/sigma_izin = ${(
      (inp.bladeStresses[0]?.peak ?? 0) / (inp.bladeStresses[0]?.allowable ?? 1)
    ).toFixed(2)}`,
    margin: inp.bladeStresses[0]?.safetyFactor ?? 0,
    mitigation:
      `${inp.containment.aramidLayers} kat aramid muhafaza sargisi, tavlama ` +
      'sonrasi tahribatsiz muayene, 200 saatte bir kanat degisimi, ' +
      'ISO 1940-1 G6.3 dinamik balans.',
  });

  // --- 5. Motor sargi yanmasi ------------------------------------------
  const wT = inp.thermal.motor.tempC;
  const motorProb = interferenceProbability(180, wT, 0.06, 0.1);
  modes.push({
    id: 'MOTOR-BURN',
    label: 'Motor sargi izolasyon kaybi',
    mechanism:
      `Sargi ${wT.toFixed(0)} °C, Class H limiti 180 °C. ` +
      `Denge sicakligi ${inp.thermal.motor.steadyTempC.toFixed(0)} °C, ` +
      `zaman sabiti ${(inp.thermal.motor.tau / 60).toFixed(1)} dk.`,
    severity: 'ciddi',
    perRun: motorProb,
    perHour: perRunToHour(motorProb),
    driver: `T_sargi = ${wT.toFixed(0)} °C`,
    margin: 180 / Math.max(wT, 1),
    mitigation: 'Termal derating yazilimda etkin, 4 kanal NTC, cekirdek panjur sogutmasi.',
  });

  // --- 6. ESC arizasi ---------------------------------------------------
  const escT = inp.thermal.esc.tempC;
  const escProb =
    interferenceProbability(110, escT, 0.07, 0.1) + (inp.overCurrent ? 4e-3 : 0);
  modes.push({
    id: 'ESC-FAIL',
    label: 'ESC (motor surucu) arizasi',
    mechanism:
      `MOSFET govdesi ${escT.toFixed(0)} °C (limit 110 °C). ` +
      (inp.overCurrent ? 'Asiri akim tespit edildi.' : 'Akim limitler icinde.'),
    severity: 'tehlikeli',
    perRun: Math.min(1, escProb),
    perHour: perRunToHour(Math.min(1, escProb)),
    driver: `T_ESC = ${escT.toFixed(0)} °C`,
    margin: 110 / Math.max(escT, 1),
    mitigation:
      '2 birim paralel (yedekli: biri arizalanirsa %50 guc korunur), ' +
      'NACA agizli nacelle havalandirmasi, yerde harici sogutma fani.',
  });

  // --- 7. Yatak arizasi -------------------------------------------------
  const worstBearing = inp.bearings.reduce((a, b) =>
    a.limitingHours < b.limitingHours ? a : b,
  );
  const bearingProb = 1 - Math.exp(-Math.pow(hours / Math.max(worstBearing.limitingHours, 1e-6), 1.5));
  modes.push({
    id: 'BRG-FAIL',
    label: 'Yatak arizasi (gres / yorulma)',
    mechanism:
      `${worstBearing.id}: esdeger yuk ${worstBearing.equivalent.toFixed(0)} N, ` +
      `L10 ${worstBearing.l10Hours.toFixed(0)} h, gres omru ` +
      `${worstBearing.greaseHours.toFixed(0)} h. Hiz faktoru ` +
      `${(worstBearing.speedFactor / 1000).toFixed(0)}k mm/dk ` +
      `(limitin %${(worstBearing.speedUtilisation * 100).toFixed(0)}'i).`,
    severity: 'tehlikeli',
    perRun: Math.min(1, bearingProb),
    perHour: perRunToHour(Math.min(1, bearingProb)),
    driver: `${worstBearing.limitingHours.toFixed(0)} h belirleyici omur`,
    margin: worstBearing.limitingHours / Math.max(hours, 1e-3),
    mitigation:
      'Hibrit seramik bilyeli, yuksek sicaklik gresi; her 100 saatte ' +
      'titresim spektrumu kontrolu (IMU verisi).',
  });

  // --- 8. Fan stall / surge --------------------------------------------
  if (inp.stallRisk) {
    modes.push({
      id: 'FAN-STALL',
      label: 'Fan durmasi (stall / surge)',
      mechanism:
        'Lieblein difuzyon faktoru 0.60 esigini asti — kanat sirasinda ' +
        'akis ayrilmasi. Donen stall, kanatlarda yuksek genlikli degisken ' +
        'yuk olusturur.',
      severity: 'ciddi',
      perRun: 0.06,
      perHour: perRunToHour(0.06),
      driver: 'DF > 0.60',
      margin: 0.9,
      mitigation:
        'Devir programini stall hattindan uzak tut; giris carpikligini ' +
        'azalt (FOD izgarasi bakimi), buz birikimini onle.',
    });
  }

  // --- 9. Buz atma (ice shedding) --------------------------------------
  if (inp.iceShedding) {
    modes.push({
      id: 'ICE-SHED',
      label: 'Buz atma ve rotor hasari',
      mechanism:
        'Giris dudaginda biriken buz kutlesi kritik esigi asti. Atilan buz ' +
        'parcasi rotora carparak kanat hasarina ve ani dengesizlige yol acar.',
      severity: 'tehlikeli',
      perRun: 0.08,
      perHour: perRunToHour(0.08),
      driver: 'Buz kutlesi > 95 g',
      margin: 0.8,
      mitigation:
        'Elektrikli buz onleyici (dudakta 250 W rezistans hatti), ' +
        'periyodik buz cozme cevrimi, buzlanma kosulunda ucus yasagi.',
    });
  }

  // --- 10. Su girisi ----------------------------------------------------
  if (inp.waterIngress > 0.05) {
    const p = inp.waterIngress * 0.02;
    modes.push({
      id: 'WATER-IN',
      label: 'Su girisi ve elektriksel kisa devre',
      mechanism:
        `Su giris riski %${(inp.waterIngress * 100).toFixed(0)}. Batarya ve ESC ` +
        'bolmesi kanal DISINDA ve nacelle icinde; IP65 sizdirmazlik gerekir.',
      severity: 'tehlikeli',
      perRun: p,
      perHour: perRunToHour(p),
      driver: `Su girisi risk endeksi ${inp.waterIngress.toFixed(2)}`,
      margin: 1 / Math.max(inp.waterIngress, 0.01),
      mitigation:
        'Tum flanslarda TPU conta, konformal kaplama (elektronik), ' +
        'bolme tabaninda tahliye delikleri, konnektorlerde IP67, ' +
        'batarya bolmesine hidrofobik membran havalandirma.',
    });
  }

  // --- Toplama ----------------------------------------------------------
  const catastrophic = modes.filter((m) => m.severity === 'katastrofik');
  const catastrophicPerRun = 1 - catastrophic.reduce((p, m) => p * (1 - m.perRun), 1);
  const anyFailurePerRun = 1 - modes.reduce((p, m) => p * (1 - m.perRun), 1);
  const catastrophicPerHour = perRunToHour(catastrophicPerRun);

  const mtbfHours = anyFailurePerRun > 1e-12 ? hours / anyFailurePerRun : Infinity;

  let riskLevel: RiskResult['riskLevel'];
  if (catastrophicPerHour < 1e-6) riskLevel = 'cok dusuk';
  else if (catastrophicPerHour < 1e-4) riskLevel = 'dusuk';
  else if (catastrophicPerHour < 1e-2) riskLevel = 'orta';
  else if (catastrophicPerHour < 0.1) riskLevel = 'yuksek';
  else riskLevel = 'kabul edilemez';

  const certificationNote =
    `Hesaplanan katastrofik olay orani ${catastrophicPerHour.toExponential(2)} /saat. ` +
    'Karsilastirma: CS-23/Part 23 hafif ucaklar icin katastrofik ariza hedefi ' +
    '1e-7 ile 1e-9 /saat arasindadir; insansiz deneysel platformlarda ' +
    'genellikle 1e-4 /saat kabul edilir. ' +
    (catastrophicPerHour < 1e-4
      ? 'Bu tasarim deneysel IHA kategorisi icin kabul edilebilir seviyededir.'
      : 'Bu kosulda ucus ONERILMEZ; calisma zarfini daraltin.');

  return {
    modes: modes.sort((a, b) => b.perRun - a.perRun),
    catastrophicPerRun,
    catastrophicPerHour,
    explosionPerRun,
    explosionPerHour: perRunToHour(explosionPerRun),
    burstPerRun,
    anyFailurePerRun,
    mtbfHours,
    runaway,
    riskLevel,
    certificationNote,
  };
}

// ---------------------------------------------------------------------------
// Dayaniklilik ozeti
// ---------------------------------------------------------------------------

export interface DurabilityResult {
  /** Kanat yorulma omru [saat]. */
  bladeLifeHours: number;
  /** Yatak belirleyici omru [saat]. */
  bearingLifeHours: number;
  /** Batarya cevrim omru (%80 kapasiteye kadar). */
  batteryCycles: number;
  /** Batarya toplam calisma suresi [saat]. */
  batteryLifeHours: number;
  /** Motor omru [saat]. */
  motorLifeHours: number;
  /** Genel revizyon araligi (TBO) [saat]. */
  overhaulInterval: number;
  /** Belirleyici bilesen. */
  limitingComponent: string;
  /** Bakim programi. */
  schedule: { at: string; action: string }[];
}

export function assessDurability(
  fatigue: FatigueResult[],
  bearings: BearingResult[],
  motorTempC: number,
  enduranceMinutes: number,
): DurabilityResult {
  const bladeLife = Math.min(...fatigue.map((f) => f.lifeHours));
  const bearingLife = Math.min(...bearings.map((b) => b.limitingHours));

  // Batarya: %80 kapasiteye kadar cevrim (0.00042/cevrim kaybi -> 476 cevrim)
  const batteryCycles = 476;
  const batteryLifeHours = (batteryCycles * enduranceMinutes) / 60;

  // Motor: sargi izolasyon omru Arrhenius (her 10 K'de yarilanir),
  // 155 °C'de 20 000 saat referansi
  const motorLifeHours = 20000 * Math.pow(2, (155 - motorTempC) / 10);

  const candidates: [string, number][] = [
    ['Rotor kanatlari (yorulma)', bladeLife],
    ['Yataklar (gres/yorulma)', bearingLife],
    ['Batarya paketi (cevrim)', batteryLifeHours],
    ['Motor sargisi (termal yaslanma)', motorLifeHours],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  const tbo = candidates[0][1] * 0.5; // %50 emniyet payi

  return {
    bladeLifeHours: bladeLife,
    bearingLifeHours: bearingLife,
    batteryCycles,
    batteryLifeHours,
    motorLifeHours,
    overhaulInterval: tbo,
    limitingComponent: candidates[0][0],
    schedule: [
      { at: 'Her calisma oncesi', action: 'Gorsel kanat/kanal kontrolu, civata tork isareti, batarya gerilim dengesi' },
      { at: '10 saat', action: 'Titresim spektrumu (IMU), uc bosluk olcumu, conta kontrolu' },
      { at: '50 saat', action: 'Rotor sokum + tahribatsiz muayene (boya penetrant), yatak serbest donme kontrolu' },
      { at: '100 saat', action: 'Yatak degisimi, gres yenileme, dinamik balans tekrari' },
      { at: `${Math.round(tbo)} saat (TBO)`, action: `Genel revizyon. Belirleyici bilesen: ${candidates[0][0]}` },
    ],
  };
}
