/**
 * BLDC motor ve ESC elektrik modeli.
 * ==================================
 * Klasik firincasiz DA makine esdegeri:
 *
 *   Kt = 60 / (2*pi*Kv)          [N*m/A]   tork sabiti
 *   E  = rpm / Kv                [V]       zit-emk (back-EMF)
 *   Iq = T_shaft / Kt            [A]       tork ureten akim
 *   V  = E + Iq * R_ll           [V]       gereken terminal gerilimi
 *
 * Kayiplar:
 *   Bakir  : P_cu = Iq^2 * R_ll
 *   Demir  : P_fe = k * (f_el/f_ref)^1.6           (histerezis+girdap, Steinmetz)
 *   Mekanik: yatak surtunmesi + kampana ruzgar direnci ~ rpm^2.4
 *
 * Sicaklik: bakir direnci +0.393 %/K (bakirin sicaklik katsayisi),
 * miknatis akisi -0.11 %/K (NdFeB) -> yuksek sicaklikta Kv artar, tork sabiti
 * duser. Ikisi birlikte "sicak motor daha verimsiz" davranisini uretir.
 */

import { ESC, MOTOR, PACK_V_NOM } from '../spec';

export const COPPER_TEMP_COEFF = 0.00393; // [1/K] @20 °C referans
export const NDFEB_FLUX_COEFF = -0.0011; // [1/K] kalici miknatis akisi

export interface MotorResult {
  /** Saft mekanik gucu [W]. */
  shaftPower: number;
  /** Elektriksel giris gucu (motor terminalinde) [W]. */
  electricalPower: number;
  /** Batarya cikisindaki guc (ESC kayiplari dahil) [W]. */
  busPower: number;
  /** Tork ureten akim [A]. */
  current: number;
  /** Gereken terminal gerilimi [V]. */
  terminalVoltage: number;
  /** Zit-emk [V]. */
  backEmf: number;
  /** Tork sabiti (sicakliga gore duzeltilmis) [N*m/A]. */
  kt: number;
  /** Etkin Kv (sicaklik duzeltmeli) [rpm/V]. */
  kvEffective: number;
  /** Bakir kaybi [W]. */
  copperLoss: number;
  /** Demir kaybi [W]. */
  ironLoss: number;
  /** Mekanik kayip [W]. */
  mechanicalLoss: number;
  /** ESC kaybi [W]. */
  escLoss: number;
  /** Motor verimi. */
  efficiency: number;
  /** Motor + ESC toplam verimi. */
  efficiencyTotal: number;
  /** Elektrik frekansi [Hz]. */
  electricalFrequency: number;
  /** Akimin surekli limite orani. */
  currentUtilisation: number;
  /** Termal derating nedeniyle kullanilabilir guc orani. */
  deratingFactor: number;
  /** Uyarilar. */
  warnings: string[];
}

/** Sicakliga bagli faz-faz direnci [ohm]. */
export function phaseResistance(windingTempC: number): number {
  const r20 = MOTOR.phaseResistance * 2; // faz-faz
  return r20 * (1 + COPPER_TEMP_COEFF * (windingTempC - 20));
}

/** Sicakliga bagli etkin Kv (miknatis zayiflamasi Kv'yi artirir). */
export function effectiveKv(magnetTempC: number): number {
  const fluxRatio = 1 + NDFEB_FLUX_COEFF * (magnetTempC - 20);
  return MOTOR.kv / Math.max(0.6, fluxRatio);
}

/**
 * Termal derating: sargi sicakligi `tempDerateStart` degerini gectikten
 * sonra izin verilen akim dogrusal olarak azalir, `tempMax`ta sifirlanir.
 */
export function deratingFactor(windingTempC: number): number {
  if (windingTempC <= MOTOR.tempDerateStart) return 1;
  const span = MOTOR.tempMax - MOTOR.tempDerateStart;
  return Math.max(0, 1 - (windingTempC - MOTOR.tempDerateStart) / span);
}

/**
 * Motoru istenen tork ve devirde calistirmak icin gereken elektrik gucu.
 *
 * @param torque       saft torku [N*m]
 * @param rpm          devir
 * @param windingTempC sargi sicakligi [°C]
 * @param busVoltage   mevcut batarya gerilimi [V]
 */
export function solveMotor(
  torque: number,
  rpm: number,
  windingTempC: number,
  busVoltage: number = PACK_V_NOM,
): MotorResult {
  const warnings: string[] = [];
  const omega = (rpm * 2 * Math.PI) / 60;
  const shaftPower = torque * omega;

  const kvEff = effectiveKv(windingTempC);
  const kt = 60 / (2 * Math.PI * kvEff);
  const rll = phaseResistance(windingTempC);

  // Bosta akim (miknatis surukleme + histerezis) tork uretmeyen bilesen
  const i0 = MOTOR.noLoadCurrent * (rpm / (MOTOR.kv * 10));
  const iq = torque / kt;
  const iTotal = iq + i0;

  const backEmf = rpm / kvEff;
  const terminalVoltage = backEmf + iTotal * rll;

  const copperLoss = iTotal * iTotal * rll;

  // Demir kaybi: Steinmetz benzeri, tasarim noktasinda ~240 W
  const fEl = (rpm / 60) * (MOTOR.poles / 2);
  const fRef = (12500 / 60) * (MOTOR.poles / 2);
  const ironLoss = 240 * Math.pow(Math.max(0, fEl) / fRef, 1.6);

  // Mekanik: yatak + kampana ruzgar direnci
  const mechanicalLoss = 60 * Math.pow(rpm / 12500, 2.4);

  const electricalPower = shaftPower + copperLoss + ironLoss + mechanicalLoss;
  const escLoss = (electricalPower * (1 - ESC.efficiency)) / ESC.efficiency;
  const busPower = electricalPower + escLoss;

  const efficiency = electricalPower > 1 ? shaftPower / electricalPower : 0;
  const efficiencyTotal = busPower > 1 ? shaftPower / busPower : 0;

  const derate = deratingFactor(windingTempC);
  const util = iTotal / MOTOR.currentContinuous;

  if (terminalVoltage > busVoltage * 0.99) {
    warnings.push(
      `Gerilim yetersiz: ${terminalVoltage.toFixed(1)} V gerekli, ` +
        `${busVoltage.toFixed(1)} V mevcut. Bu devir ulasilamaz.`,
    );
  }
  if (util > 1) {
    warnings.push(
      `Motor akimi surekli limitin ustunde: ${iTotal.toFixed(0)} A / ` +
        `${MOTOR.currentContinuous} A (%${((util - 1) * 100).toFixed(0)} asim).`,
    );
  }
  if (iTotal > ESC.units * ESC.currentPerUnit) {
    warnings.push(`ESC akim limiti asildi: ${iTotal.toFixed(0)} A > ${ESC.units * ESC.currentPerUnit} A.`);
  }
  if (windingTempC > MOTOR.tempDerateStart) {
    warnings.push(
      `Sargi sicakligi ${windingTempC.toFixed(0)} °C — guc %${((1 - derate) * 100).toFixed(0)} kisitlandi.`,
    );
  }
  if (windingTempC > MOTOR.tempMax) {
    warnings.push('KRITIK: Sargi izolasyon sinifi (Class H, 180 °C) asildi. Motor kaybi riski.');
  }
  if (shaftPower > MOTOR.powerPeak) {
    warnings.push(`Saft gucu tepe degeri asiyor: ${(shaftPower / 1000).toFixed(1)} kW > ${MOTOR.powerPeak / 1000} kW.`);
  }

  return {
    shaftPower,
    electricalPower,
    busPower,
    current: iTotal,
    terminalVoltage,
    backEmf,
    kt,
    kvEffective: kvEff,
    copperLoss,
    ironLoss,
    mechanicalLoss,
    escLoss,
    efficiency,
    efficiencyTotal,
    electricalFrequency: fEl,
    currentUtilisation: util,
    deratingFactor: derate,
    warnings,
  };
}

/** Verilen gerilim ve sargi sicakliginda ulasilabilecek maks. devir. */
export function maxRpmAtVoltage(busVoltage: number, windingTempC: number, torque: number): number {
  const kvEff = effectiveKv(windingTempC);
  const kt = 60 / (2 * Math.PI * kvEff);
  const rll = phaseResistance(windingTempC);
  const iq = torque / kt;
  return Math.max(0, (busVoltage - iq * rll) * kvEff);
}
