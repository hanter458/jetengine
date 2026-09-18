/**
 * Batarya paketi modeli — 20S6P 21700.
 * ====================================
 * Hucre verileri: Samsung INR21700-30T sinifi yuksek-guc hucresi.
 *
 * KAYNAKLAR
 *  [B1] Schmitt, Kremer et al., J. Electrochem. Soc. 170:070509 (2023),
 *       CC BY — INR21700-50E ve -30T tam parametrizasyonu: 154.3 / 255.7
 *       Wh/kg, maks. desarj 11.66C / 2C, EIS ile omik direnc.
 *  [B2] Quinn et al., J. Electrochem. Soc. 165(14):A3284 (2018), CC BY —
 *       18650/20700/21700 karsilastirmasi: 207-240 Wh/kg, 13.6-15.0 mOhm
 *       (1 kHz), C-oraniyla ozgul enerji dususu, akim kaynakli isinma.
 *  [B3] DLR, Zenodo 10.5281/zenodo.18772167 (2026) — N21700-BAK-CG50
 *       qOCV, 0.2-3C hiz testleri, SOC'ye bagli EIS veri seti.
 *  [B4] Ostanek/Parhizi et al., J. Electrochem. Soc. 171:010521 (2024),
 *       CC BY — SOC'nin isil kacak baslangicina etkisi (ARC).
 *
 * Soguk davranisi Arrhenius tipi direnc artisiyla modellenir:
 *   R(T) = R_298 * exp( (Ea/R) * (1/T - 1/298) ),  Ea/R ~ 2100 K
 * Bu, -10 °C'de ~2.5 kat, -20 °C'de ~4.3 kat direnc verir — olculen
 * degerlerle uyumludur.
 */

import {
  CELL,
  PACK,
  PACK_CAPACITY_MAH,
  PACK_CELL_COUNT,
  PACK_ENERGY_WH,
  PACK_I_MAX,
  PACK_RESISTANCE,
  PACK_V_MAX,
  PACK_V_MIN,
  PACK_V_NOM,
} from '../spec';

/** Arrhenius aktivasyon terimi Ea/R [K]. */
export const ARRHENIUS_EA_R = 2100;

/** NMC hucre acik devre gerilimi egrisi (SOC -> V). [B3] */
const OCV_CURVE: [number, number][] = [
  [0.00, 2.90], [0.05, 3.15], [0.10, 3.30], [0.20, 3.45], [0.30, 3.55],
  [0.40, 3.63], [0.50, 3.71], [0.60, 3.80], [0.70, 3.89], [0.80, 3.98],
  [0.90, 4.08], [1.00, 4.20],
];

/** Sicakliga bagli kullanilabilir kapasite orani. [B2] */
const CAPACITY_VS_TEMP: [number, number][] = [
  [-30, 0.45], [-20, 0.64], [-10, 0.80], [0, 0.90], [10, 0.96],
  [25, 1.00], [45, 1.00], [55, 0.97], [65, 0.90],
];

function interp(table: readonly [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  const n = table.length;
  if (x >= table[n - 1][0]) return table[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    if (x >= table[i][0] && x <= table[i + 1][0]) {
      const t = (x - table[i][0]) / (table[i + 1][0] - table[i][0]);
      return table[i][1] + (table[i + 1][1] - table[i][1]) * t;
    }
  }
  return table[n - 1][1];
}

/** Tek hucre acik devre gerilimi [V]. */
export function cellOCV(soc: number): number {
  return interp(OCV_CURVE, Math.max(0, Math.min(1, soc)));
}

/** Paket acik devre gerilimi [V]. */
export function packOCV(soc: number): number {
  return PACK.series * cellOCV(soc);
}

/**
 * Paket ic direnci [ohm] — sicaklik, SOC ve yaslanma etkisiyle.
 * @param tempC hucre sicakligi
 * @param soc   0-1
 * @param sohCycles tamamlanmis tam cevrim sayisi (yaslanma)
 */
export function packResistance(tempC: number, soc: number, sohCycles = 0): number {
  const T = tempC + 273.15;
  const arrhenius = Math.exp(ARRHENIUS_EA_R * (1 / T - 1 / 298.15));
  const socFactor = 1 + 0.8 * Math.pow(1 - soc, 3); // dusuk SOC'de direnc artar
  const ageFactor = 1 + 0.00045 * sohCycles; // 500 cevrimde ~%22 artis
  return PACK_RESISTANCE * arrhenius * socFactor * ageFactor;
}

/** Kapasite tutma orani (yaslanma). */
export function capacityRetention(cycles: number): number {
  return Math.max(0.6, 1 - 0.00042 * cycles); // 500 cevrimde ~%79
}

export interface BatteryState {
  /** Sarj durumu 0-1. */
  soc: number;
  /** Hucre sicakligi [°C]. */
  tempC: number;
  /** Tamamlanmis cevrim sayisi. */
  cycles: number;
}

export interface BatteryResult {
  /** Terminal (yuk altinda) gerilimi [V]. */
  voltage: number;
  /** Acik devre gerilimi [V]. */
  ocv: number;
  /** Cekilen akim [A]. */
  current: number;
  /** Hucre basina akim [A]. */
  currentPerCell: number;
  /** Etkin C-orani. */
  cRate: number;
  /** Ic direnc [ohm]. */
  resistance: number;
  /** Gerilim dususu [V]. */
  sag: number;
  /** Omik isi uretimi [W]. */
  heatGeneration: number;
  /** Desarj verimi (omik). */
  efficiency: number;
  /** Kullanilabilir enerji [Wh] (sicaklik + yaslanma duzeltmeli). */
  usableEnergy: number;
  /** Kullanilabilir kapasite [mAh]. */
  usableCapacity: number;
  /** Bu guc seviyesinde kalan sure [s]. */
  remainingTime: number;
  /** Maks. surekli guc [W]. */
  powerLimit: number;
  /** Istenen guc saglanabiliyor mu? */
  powerAvailable: boolean;
  /** Uyarilar. */
  warnings: string[];
}

/**
 * Istenen bus gucunu saglamak icin batarya durumunu cozer.
 * Guc = V * I ve V = OCV - I*R oldugundan ikinci derece denklem cozulur:
 *   I = (OCV - sqrt(OCV^2 - 4*R*P)) / (2*R)
 */
export function solveBattery(requiredPower: number, st: BatteryState): BatteryResult {
  const warnings: string[] = [];
  const ocv = packOCV(st.soc);
  const R = packResistance(st.tempC, st.soc, st.cycles);

  // Maks. iletilebilir guc (empedans uyumu) = OCV^2/(4R)
  const pMaxTheoretical = (ocv * ocv) / (4 * R);
  const pMaxCurrent = PACK_I_MAX * (ocv - PACK_I_MAX * R);
  const powerLimit = Math.min(pMaxTheoretical, Math.max(0, pMaxCurrent));

  let powerAvailable = true;
  let P = requiredPower;
  if (P > powerLimit) {
    powerAvailable = false;
    warnings.push(
      `Batarya guc limiti: ${(powerLimit / 1000).toFixed(1)} kW mevcut, ` +
        `${(requiredPower / 1000).toFixed(1)} kW istendi.`,
    );
    P = powerLimit;
  }

  const disc = ocv * ocv - 4 * R * P;
  const current = disc > 0 ? (ocv - Math.sqrt(disc)) / (2 * R) : ocv / (2 * R);
  const voltage = ocv - current * R;
  const sag = current * R;
  const heat = current * current * R;
  const efficiency = P > 0 ? P / (P + heat) : 1;

  const tempFactor = interp(CAPACITY_VS_TEMP, st.tempC);
  const retention = capacityRetention(st.cycles);
  const usableEnergy = PACK_ENERGY_WH * PACK.usableFraction * tempFactor * retention;
  const usableCapacity = PACK_CAPACITY_MAH * PACK.usableFraction * tempFactor * retention;

  const remainingEnergy = usableEnergy * st.soc; // [Wh]
  const remainingTime = P > 1 ? (remainingEnergy * 3600) / P : Infinity;

  const cRate = current / PACK.parallel / (CELL.capacity / 1000);
  const currentPerCell = current / PACK.parallel;

  if (voltage < PACK_V_MIN) {
    warnings.push(`Paket gerilimi kesme sinirinin altinda: ${voltage.toFixed(1)} V < ${PACK_V_MIN} V.`);
  }
  if (cRate > CELL.cRateMax) {
    warnings.push(`Hucre C-orani asildi: ${cRate.toFixed(1)}C > ${CELL.cRateMax}C.`);
  }
  if (st.tempC < 0) {
    warnings.push(
      `Soguk batarya (${st.tempC.toFixed(0)} °C): ic direnc ` +
        `${(R / PACK_RESISTANCE).toFixed(1)}x, kapasite %${(tempFactor * 100).toFixed(0)}. ` +
        'Kalkis oncesi on isitma onerilir.',
    );
  }
  if (st.tempC > 55) {
    warnings.push(`Batarya sicak (${st.tempC.toFixed(0)} °C): isil kacak riski artiyor, guc kisitlanmali.`);
  }

  return {
    voltage,
    ocv,
    current,
    currentPerCell,
    cRate,
    resistance: R,
    sag,
    heatGeneration: heat,
    efficiency,
    usableEnergy,
    usableCapacity,
    remainingTime,
    powerLimit,
    powerAvailable,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Paket ozeti (statik bilgi — kullanicinin "kac mAh" sorusu)
// ---------------------------------------------------------------------------

export const PACK_SUMMARY = {
  konfigurasyon: `${PACK.series}S${PACK.parallel}P`,
  hucreTipi: CELL.model,
  hucreSayisi: PACK_CELL_COUNT,
  kapasiteMah: PACK_CAPACITY_MAH,
  nominalGerilim: PACK_V_NOM,
  maksGerilim: PACK_V_MAX,
  minGerilim: PACK_V_MIN,
  enerjiWh: PACK_ENERGY_WH,
  maksAkimA: PACK_I_MAX,
  maksGucKw: (PACK_I_MAX * PACK_V_NOM) / 1000,
  icDirencMohm: PACK_RESISTANCE * 1000,
  modulSayisi: PACK.modules,
  modulBasinaHucre: PACK.cellsPerModule,
} as const;

/**
 * Sarj suresi tahmini.
 * @param chargerPowerW sarj cihazi gucu
 */
export function chargeTime(chargerPowerW: number, fromSoc = 0.1, toSoc = 1.0): number {
  const energy = PACK_ENERGY_WH * (toSoc - fromSoc);
  // CC-CV: son %20 sabit gerilimde yavaslar
  const ccEnergy = energy * 0.8;
  const cvEnergy = energy * 0.2;
  const ccTime = (ccEnergy * 3600) / chargerPowerW;
  const cvTime = (cvEnergy * 3600) / (chargerPowerW * 0.35);
  return ccTime + cvTime;
}
