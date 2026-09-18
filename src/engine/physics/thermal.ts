/**
 * Toplu parametreli (lumped) termal ag.
 * =====================================
 * Uc isi kaynagi vardir: motor sargilari, ESC ve batarya paketi. Her biri
 * bir isi kapasitesi C [J/K] ve cevreye bir isil iletim UA [W/K] ile
 * modellenir. Zorlanmis tasinim, hizla Nu ~ Re^0.8 (Dittus-Boelter) olarak
 * olceklenir; bu yuzden UA hava debisinin 0.8. kuvvetiyle artar.
 *
 * Gecici (transient) cozum ONEMLIDIR: batarya paketinin zaman sabiti
 * ~6.5 dakikadir; yani tipik bir ucus suresinde denge sicakligina
 * ULASAMAZ. Bu, kisa sureli yuksek gucun neden guvenli oldugunu aciklar.
 *
 *   T(t) = T_inf + (T_0 - T_inf) * exp(-t/tau),   tau = C/UA
 *   T_inf = T_hava + Q/UA
 *
 * Yagmur ek bir sogutma yolu ekler: su filminin buharlasma gizli isisi.
 */

import { CELL, ESC, MOTOR, PACK_CELL_COUNT, PACK } from '../spec';
import { L_VAPOR, type AirState, type Environment } from './atmosphere';

export interface ThermalNode {
  label: string;
  /** Isi uretimi [W]. */
  heat: number;
  /** Isil iletim [W/K]. */
  ua: number;
  /** Isi kapasitesi [J/K]. */
  capacity: number;
  /** Sogutma havasi sicakligi [°C]. */
  coolantTempC: number;
  /** Denge sicakligi [°C]. */
  steadyTempC: number;
  /** t = runTime aninda sicaklik [°C]. */
  tempC: number;
  /** Zaman sabiti [s]. */
  tau: number;
  /** Izin verilen maks. sicaklik [°C]. */
  limitC: number;
  /** Limite gore kullanim orani. */
  utilisation: number;
}

const transient = (t0: number, tInf: number, tau: number, t: number) =>
  tInf + (t0 - tInf) * Math.exp(-t / Math.max(tau, 1e-3));

export interface ThermalInput {
  env: Environment;
  air: AirState;
  /** Fan kutle debisi [kg/s] — sogutma akislarini olcekler. */
  massFlow: number;
  /** Fan duzlemi eksenel hizi [m/s]. */
  axialVelocity: number;
  /** Motor kayiplari [W]. */
  motorLoss: number;
  /** ESC kayiplari [W] (toplam). */
  escLoss: number;
  /** Batarya omik isisi [W] (toplam). */
  batteryHeat: number;
  /** Cikis gazi toplam sicaklik artisi [K] — cekirdek sogutma havasini isitir. */
  gasDeltaT: number;
}

export interface ThermalResult {
  motor: ThermalNode;
  esc: ThermalNode;
  battery: ThermalNode;
  /** Yagmurun buharlasma ile sagladigi ek sogutma [W]. */
  evaporativeCooling: number;
  /** Cekirdek sogutma havasi debisi [kg/s]. */
  coreCoolingFlow: number;
  /** Nacelle havalandirma debisi [kg/s]. */
  nacelleVentFlow: number;
  warnings: string[];
}

// Referans (tasarim noktasi) degerleri — UA olcekleme icin
const MDOT_REF = 2.14; // [kg/s]
const UA_MOTOR_REF = 11.4; // [W/K]
const UA_ESC_REF = 5.5; // [W/K] birim basina, ram havasi ile
const UA_ESC_STATIC = 2.4; // [W/K] birim basina, yerde
const UA_PACK_REF = 55; // [W/K] toplam, 100 m/s'de
const UA_PACK_STATIC = 22; // [W/K] toplam, yerde

export function solveThermal(inp: ThermalInput): ThermalResult {
  const { env, air } = inp;
  const warnings: string[] = [];
  const tAmb = env.tempC;
  const mdotRatio = Math.max(0.05, inp.massFlow / MDOT_REF);

  // Cekirdek sogutma: ana akisin ~%2'si panjurlardan gecirilir
  const coreCoolingFlow = inp.massFlow * 0.02;
  // Nacelle havalandirma: NACA agizli iki girisin gecirdigi debi;
  // yerde sadece dogal tasinim + fan emisi kacagi ile beslenir
  const ramFactor = Math.min(1, env.airspeed / 60);
  const nacelleVentFlow = 0.006 + 0.055 * ramFactor;

  // --- Yagmurun buharlasma sogutmasi -----------------------------------
  // Yuzeye carpan suyun bir kismi buharlasir. ANCAK: yagmurlu hava doygun
  // oldugu icin buharlasma itici gucu (eSat - eVap) neredeyse sifirdir.
  // Bu yuzden hem itici guc ile olcekliyoruz hem de sonucta hicbir parcanin
  // ISLAK TERMOMETRE sicakliginin altina inmesine izin vermiyoruz
  // (termodinamik alt sinir).
  const waterFlux = (air.lwc / 1000) * Math.max(env.airspeed, inp.axialVelocity) * 0.12;
  // Buharlasma potansiyeli: doygunluk acigi / doygunluk basinci  (0 = doygun hava)
  const vpDeficit = Math.max(
    0,
    (air.saturationPressure - air.vaporPressure) / Math.max(air.saturationPressure, 1),
  );
  const evaporativeCooling = waterFlux * L_VAPOR * 0.25 * vpDeficit;
  // Hicbir dugum bu sicakligin altina inemez
  const tFloor = air.wetBulbC;

  // --- Motor -----------------------------------------------------------
  // Cekirdek havasi, kademe isinmasindan dolayi ortamdan sicaktir
  const motorCoolantT = tAmb + inp.gasDeltaT * 0.85;
  const uaMotor = UA_MOTOR_REF * Math.pow(mdotRatio, 0.8);
  const cMotor = (MOTOR.mass / 1000) * 480; // Cu+Fe karisimi
  const motorInf = motorCoolantT + inp.motorLoss / uaMotor;
  const motorT = transient(tAmb, motorInf, cMotor / uaMotor, env.runTime);

  // --- ESC -------------------------------------------------------------
  const uaEscUnit = UA_ESC_STATIC + (UA_ESC_REF - UA_ESC_STATIC) * ramFactor;
  const uaEsc = uaEscUnit * ESC.units;
  const cEsc = (ESC.units * ESC.massPerUnit) / 1000 * 780;
  const escInf = Math.max(
    tFloor,
    tAmb + inp.escLoss / uaEsc - evaporativeCooling / (uaEsc * 6),
  );
  const escT = transient(tAmb, escInf, cEsc / uaEsc, env.runTime);

  // --- Batarya ---------------------------------------------------------
  const uaPack = UA_PACK_STATIC + (UA_PACK_REF - UA_PACK_STATIC) * ramFactor;
  const cPack = (PACK_CELL_COUNT * CELL.mass) / 1000 * CELL.specificHeat;
  const packInf = Math.max(
    tFloor,
    tAmb + inp.batteryHeat / uaPack - evaporativeCooling / (uaPack * 4),
  );
  const packT = transient(tAmb, packInf, cPack / uaPack, env.runTime);

  const motor: ThermalNode = {
    label: 'Motor sargisi',
    heat: inp.motorLoss,
    ua: uaMotor,
    capacity: cMotor,
    coolantTempC: motorCoolantT,
    steadyTempC: motorInf,
    tempC: motorT,
    tau: cMotor / uaMotor,
    limitC: MOTOR.tempMax,
    utilisation: motorT / MOTOR.tempMax,
  };
  const esc: ThermalNode = {
    label: 'ESC (MOSFET govdesi)',
    heat: inp.escLoss,
    ua: uaEsc,
    capacity: cEsc,
    coolantTempC: tAmb,
    steadyTempC: escInf,
    tempC: escT,
    tau: cEsc / uaEsc,
    limitC: 110,
    utilisation: escT / 110,
  };
  const battery: ThermalNode = {
    label: 'Batarya hucresi',
    heat: inp.batteryHeat,
    ua: uaPack,
    capacity: cPack,
    coolantTempC: tAmb,
    steadyTempC: packInf,
    tempC: packT,
    tau: cPack / uaPack,
    limitC: CELL.serviceTemp,
    utilisation: packT / CELL.serviceTemp,
  };

  if (motorT > MOTOR.tempDerateStart) {
    warnings.push(
      `Motor sargisi ${motorT.toFixed(0)} °C (limit ${MOTOR.tempMax} °C) — ` +
        `denge ${motorInf.toFixed(0)} °C, zaman sabiti ${(motor.tau / 60).toFixed(1)} dk.`,
    );
  }
  if (escT > 100) {
    warnings.push(
      `ESC ${escT.toFixed(0)} °C — MOSFET govde limiti 110 °C. ` +
        (ramFactor < 0.3
          ? 'Yerde calismada nacelle havalandirmasi zayif; harici fan kullanin.'
          : 'Sogutucu yuzeyi buyutulmeli.'),
    );
  }
  if (packT > 50) {
    warnings.push(
      `Batarya ${packT.toFixed(0)} °C — servis limiti ${CELL.serviceTemp} °C. ` +
        `Zaman sabiti ${(battery.tau / 60).toFixed(1)} dk oldugundan uzun ucuslarda kritik.`,
    );
  }
  if (evaporativeCooling > 50) {
    warnings.push(
      `Yagmur ${evaporativeCooling.toFixed(0)} W ek sogutma sagliyor — ` +
        'termal acidan yararli, elektriksel acidan risk (IP sizdirmazlik).',
    );
  }

  return {
    motor,
    esc,
    battery,
    evaporativeCooling,
    coreCoolingFlow,
    nacelleVentFlow,
    warnings,
  };
}

/** Isitma gerektiren soguk kosul: batarya on isitma enerjisi [Wh]. */
export function preheatEnergy(fromTempC: number, toTempC = 15): number {
  if (fromTempC >= toTempC) return 0;
  const cPack = (PACK_CELL_COUNT * CELL.mass) / 1000 * CELL.specificHeat; // [J/K]
  const dT = toTempC - fromTempC;
  // Yalitim kaybi icin %35 pay
  return (cPack * dT * 1.35) / 3600;
}

/** Paketin isil kacak yayilim direnci: hucreler arasi isil iletim. */
export function propagationResistance(): { interCellUA: number; delaySeconds: number } {
  // 1.5 mm PC-CF duvar + 0.6 mm mika, temas alani ~ 70 mm x 3 mm
  const k = 0.32; // [W/(m*K)] PC-CF
  const area = 0.07 * 0.003; // [m^2]
  const thickness = 0.0021; // [m]
  const ua = (k * area) / thickness; // [W/K]
  // Kacak yapan hucre 600 °C'ye cikar; komsu hucrenin 138 °C'ye
  // ulasma suresi (isi kapasitesi / gelen isi)
  const cCell = (CELL.mass / 1000) * CELL.specificHeat;
  const dT = 600 - 25;
  const q = ua * dT * PACK.parallel; // komsu 6 hucre
  const delay = (cCell * (CELL.runawayOnset - 25)) / Math.max(q, 1e-6);
  return { interCellUA: ua, delaySeconds: delay };
}
