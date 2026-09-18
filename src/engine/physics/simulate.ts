/**
 * Ust seviye simulasyon orkestratoru.
 * ===================================
 * Aerodinamik, elektrik, termal, yapisal ve risk modellerini BIRLIKTE cozer.
 * Alt sistemler birbirine kilitlidir:
 *
 *      fan devri  ->  tork  ->  motor akimi  ->  batarya gerilim dususu
 *          ^                         |                     |
 *          |                         v                     v
 *      guc limiti  <-  termal derating  <-  kayiplar -> sicaklik artisi
 *
 * Bu yuzden sabit nokta iterasyonu (fixed-point) kullanilir; tipik olarak
 * 6-10 adimda 0.1 %'nin altina yakinsar.
 */

import {
  AIRFRAMES,
  BLADE_ROWS,
  DESIGN,
  DUCT_WALL,
  MOTOR,
  PACK_ENERGY_WH,
  PACK_V_NOM,
  ROTOR_ROWS,
  type Airframe,
} from '../spec';
import { MATERIALS } from '../materials';
import { massBudget } from '../parts';
import {
  airState,
  icingState,
  type AirState,
  type Environment,
  type IcingState,
} from './atmosphere';
import {
  A_THROAT,
  N_STAGES,
  solveFan,
  stallRisk,
  exitMach,
  degreeOfReaction,
  type FanOperatingPoint,
} from './fan';
import { solveMotor, type MotorResult } from './motor';
import { solveBattery, type BatteryResult } from './battery';
import { solveThermal, preheatEnergy, type ThermalResult } from './thermal';
import {
  bearingAnalysis,
  bladeMode,
  bladeStress,
  campbellCrossings,
  containmentAnalysis,
  fatigueAnalysis,
  loadPaths,
  shaftAnalysis,
  type BearingResult,
  type BladeStress,
  type CampbellCrossing,
  type ContainmentResult,
  type FatigueResult,
  type LoadPathResult,
  type ModeInfo,
  type ShaftResult,
} from './structure';
import { assessDurability, assessRisk, type DurabilityResult, type RiskResult } from './risk';

// ---------------------------------------------------------------------------
// Giris / cikis tipleri
// ---------------------------------------------------------------------------

export interface SimInput {
  env: Environment;
  /** Gaz kolu 0-1 (1 = rpmMax). */
  throttle: number;
  /** Govde kimligi (AIRFRAMES). */
  airframeId: string;
  /** Batarya sarj durumu 0-1. */
  soc: number;
  /** Batarya cevrim sayisi (yaslanma). */
  cycles: number;
  /** Sizdirmazlik kalitesi 0-1 (1 = IP67). */
  sealing: number;
  /** Buz onleyici acik mi? */
  antiIceOn: boolean;
}

export const SIM_DEFAULT: SimInput = {
  env: {
    altitude: 0,
    tempC: 15,
    humidity: 40,
    rainRate: 0,
    airspeed: 0,
    payload: 0,
    loadFactor: 1,
    snow: false,
    runTime: 120,
    humidExposureHours: 24,
  },
  throttle: 0.862, // ~12 500 rpm / 14 500 rpm = tasarim noktasi
  airframeId: 'POD',
  soc: 0.9,
  cycles: 20,
  sealing: 0.85,
  antiIceOn: false,
};

export interface MassResult {
  /** Motorun kendi kutlesi [kg]. */
  engine: number;
  /** Govde bos kutlesi [kg]. */
  airframe: number;
  /** Faydali yuk [kg]. */
  payload: number;
  /** Toplam [kg]. */
  total: number;
  /** Itki/agirlik orani. */
  thrustToWeight: number;
  /** Basili kutle [kg]. */
  printed: number;
  /** Hazir alinan (COTS) kutle [kg]. */
  cots: number;
  /** Islenmis kutle [kg]. */
  machined: number;
}

export interface PerformanceResult {
  /** Maksimum duz ucus hizi [m/s]. */
  maxSpeedMs: number;
  /** Maksimum hiz [km/h]. */
  maxSpeedKmh: number;
  /** Nozul cikis jet hizi [m/s] ve [km/h]. */
  jetSpeedMs: number;
  jetSpeedKmh: number;
  /** Maks. hizda Mach sayisi. */
  maxMach: number;
  /** 0'dan maks. hizin %90'ina hizlanma suresi [s]. */
  accelTime: number;
  /** Ayni surede alinan mesafe [m]. */
  accelDistance: number;
  /** Tirmanma hizi (en iyi) [m/s]. */
  climbRate: number;
  /** Bu gaz kolunda menzil suresi (dayaniklilik) [dk]. */
  enduranceMin: number;
  /** Maks. dayaniklilik (en verimli gaz kolunda) [dk]. */
  bestEnduranceMin: number;
  /** En iyi dayaniklilik gaz kolu. */
  bestEnduranceThrottle: number;
  /** Menzil [km]. */
  rangeKm: number;
  /** Enerji tuketimi [Wh/dk]. */
  energyPerMinute: number;
  /** Enerji tuketimi [Wh/km]. */
  energyPerKm: number;
  /** Cekilen akim [mAh/dk]. */
  mahPerMinute: number;
  /** Ucus sonunda tuketilen kapasite [mAh]. */
  mahConsumed: number;
  /** Kalkis mumkun mu (T/W > 1)? */
  canHover: boolean;
  /** Hiz-itki egrisi. */
  thrustCurve: { speed: number; thrust: number; drag: number }[];
  /** Gaz kolu taramasi. */
  throttleSweep: {
    throttle: number;
    rpm: number;
    thrust: number;
    power: number;
    current: number;
    endurance: number;
    spl: number;
  }[];
}

export interface SimResult {
  input: SimInput;
  airframe: Airframe;
  air: AirState;
  icing: IcingState;
  fan: FanOperatingPoint;
  motor: MotorResult;
  battery: BatteryResult;
  thermal: ThermalResult;
  mass: MassResult;
  performance: PerformanceResult;
  /** Yapisal analizler. */
  bladeStresses: BladeStress[];
  bladeModes: ModeInfo[];
  fatigue: FatigueResult[];
  bearings: BearingResult[];
  shaft: ShaftResult;
  containment: ContainmentResult;
  campbell: CampbellCrossing[];
  loadPath: LoadPathResult;
  /** Risk ve dayaniklilik. */
  risk: RiskResult;
  durability: DurabilityResult;
  /** Aerodinamik tanilar. */
  diagnostics: {
    exitMach: number;
    reaction: number;
    diffusionFactor: number;
    stallRisk: boolean;
    stallMargin: number;
    throatVelocity: number;
    lipVelocity: number;
    rpmAchieved: number;
    rpmRequested: number;
    rpmLimitedBy: string;
    iterations: number;
    converged: boolean;
  };
  /** Soguk hava ek bilgileri. */
  cold: {
    preheatWh: number;
    antiIceW: number;
    capacityFactor: number;
    resistanceRatio: number;
  };
  warnings: string[];
}

const MASS = massBudget();
const ENGINE_MASS_KG = MASS.totalMass / 1000;

// ---------------------------------------------------------------------------
// Tek calisma noktasi cozucu
// ---------------------------------------------------------------------------

interface CorePoint {
  fan: FanOperatingPoint;
  motor: MotorResult;
  battery: BatteryResult;
  thermal: ThermalResult;
  icing: IcingState;
  rpm: number;
  limitedBy: string;
  iterations: number;
  converged: boolean;
}

/**
 * Verilen devirde tum alt sistemleri birlikte cozer (sabit nokta).
 * Batarya gucu veya gerilimi yetmiyorsa devri dusurur.
 */
function solveCore(
  env: Environment,
  air: AirState,
  rpmRequest: number,
  soc: number,
  cycles: number,
  antiIcePowerW: number,
): CorePoint {
  let windingT = env.tempC;
  let escT = env.tempC;
  let packT = env.tempC;
  let rpm = rpmRequest;
  let limitedBy = 'gaz kolu';

  let fan!: FanOperatingPoint;
  let mot!: MotorResult;
  let bat!: BatteryResult;
  let th!: ThermalResult;
  let icing!: IcingState;
  let converged = false;
  let iterations = 0;

  for (let it = 0; it < 24; it++) {
    iterations = it + 1;

    // --- Buzlanma (fan hizina bagli) ---
    const mdotGuess = fan?.massFlow ?? 2.1;
    const throatV = mdotGuess / (air.density * A_THROAT);
    icing = icingState(env, air, throatV * 1.5); // dudakta emme tepesi ~1.5x

    // --- Aerodinamik ---
    fan = solveFan(rpm, air, icing, env.airspeed);

    // --- Elektrik ---
    const packV = soc > 0 ? Math.max(1, (bat?.voltage ?? PACK_V_NOM)) : PACK_V_NOM;
    mot = solveMotor(fan.torque, rpm, windingT, packV);
    bat = solveBattery(mot.busPower + antiIcePowerW, { soc, tempC: packT, cycles });

    // --- Devir kisitlari ---
    // (a) Gerilim: terminal gerilimi mevcut paket geriliminden buyuk olamaz
    // (b) Guc: batarya guc limiti
    // (c) Termal derating
    const derate = mot.deratingFactor;
    let rpmCap = rpmRequest;
    if (mot.terminalVoltage > bat.voltage) {
      rpmCap = Math.min(rpmCap, rpm * (bat.voltage / mot.terminalVoltage));
      limitedBy = 'batarya gerilimi';
    }
    if (!bat.powerAvailable) {
      rpmCap = Math.min(rpmCap, rpm * Math.pow(bat.powerLimit / Math.max(mot.busPower, 1), 1 / 3));
      limitedBy = 'batarya guc limiti';
    }
    if (derate < 1) {
      const iAllowed = MOTOR.currentContinuous * derate;
      if (mot.current > iAllowed) {
        rpmCap = Math.min(rpmCap, rpm * Math.pow(iAllowed / mot.current, 0.5));
        limitedBy = 'motor termal derating';
      }
    }
    const rpmNew = 0.55 * rpm + 0.45 * Math.max(600, Math.min(rpmRequest, rpmCap));

    // --- Termal ---
    th = solveThermal({
      env,
      air,
      massFlow: fan.massFlow,
      axialVelocity: fan.axialVelocity,
      motorLoss: mot.copperLoss + mot.ironLoss + mot.mechanicalLoss,
      escLoss: mot.escLoss,
      batteryHeat: bat.heatGeneration,
      gasDeltaT: fan.deltaT,
    });

    const dW = Math.abs(th.motor.tempC - windingT);
    const dE = Math.abs(th.esc.tempC - escT);
    const dP = Math.abs(th.battery.tempC - packT);
    const dR = Math.abs(rpmNew - rpm);

    windingT = 0.5 * windingT + 0.5 * th.motor.tempC;
    escT = 0.5 * escT + 0.5 * th.esc.tempC;
    packT = 0.5 * packT + 0.5 * th.battery.tempC;
    rpm = rpmNew;

    if (dW < 0.05 && dE < 0.05 && dP < 0.05 && dR < 2) {
      converged = true;
      break;
    }
  }

  if (Math.abs(rpm - rpmRequest) < 25) limitedBy = 'gaz kolu';

  return { fan, motor: mot, battery: bat, thermal: th, icing, rpm, limitedBy, iterations, converged };
}

// ---------------------------------------------------------------------------
// Surukleme
// ---------------------------------------------------------------------------

function drag(af: Airframe, air: AirState, v: number, massKg: number): number {
  const q = 0.5 * air.density * v * v;
  let d = q * af.cd * af.refArea;
  if (af.lifting && af.aspectRatio && v > 1) {
    const W = massKg * 9.80665;
    const cl = W / Math.max(q * af.refArea, 1e-6);
    const cdi = (cl * cl) / (Math.PI * af.aspectRatio * (af.oswald ?? 0.8));
    d += q * cdi * af.refArea;
  }
  if (af.rollingFriction > 0) {
    d += af.rollingFriction * massKg * 9.80665;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Ana simulasyon
// ---------------------------------------------------------------------------

export function simulate(input: SimInput): SimResult {
  const warnings: string[] = [];
  const env = input.env;
  const af = AIRFRAMES.find((a) => a.id === input.airframeId) ?? AIRFRAMES[0];
  const air = airState(env);

  const rpmRequest = Math.max(0, Math.min(1, input.throttle)) * DESIGN.rpmMax;

  // Buz onleyici gucu (ilk tahmin, sonra guncellenir)
  let antiIceW = 0;
  const core0 = solveCore(env, air, rpmRequest, input.soc, input.cycles, 0);
  if (input.antiIceOn && core0.icing.active) antiIceW = core0.icing.antiIcePower;
  const core = antiIceW > 0
    ? solveCore(env, air, rpmRequest, input.soc, input.cycles, antiIceW)
    : core0;

  const { fan, motor, battery, thermal, icing, rpm } = core;

  // --- Kutle ------------------------------------------------------------
  const totalMass = ENGINE_MASS_KG + af.emptyMass + env.payload;
  const mass: MassResult = {
    engine: ENGINE_MASS_KG,
    airframe: af.emptyMass,
    payload: env.payload,
    total: totalMass,
    thrustToWeight: fan.thrust / (totalMass * 9.80665),
    printed: MASS.printedMass / 1000,
    cots: MASS.cotsMass / 1000,
    machined: MASS.machinedMass / 1000,
  };

  // --- Yapisal ----------------------------------------------------------
  const rotorMat = MATERIALS.PA6CF;
  const stagePressureRise = fan.pressureRise / N_STAGES;
  const stageTorque = fan.torque / N_STAGES;

  const bladeStresses = BLADE_ROWS.map((r) =>
    bladeStress(
      r,
      r.kind === 'rotor' ? rpm : 0,
      r.kind === 'rotor' ? rotorMat : MATERIALS.CFPETG,
      stagePressureRise,
      r.kind === 'rotor' ? stageTorque : stageTorque * 0.85,
      r.kind === 'rotor' ? thermal.motor.coolantTempC : env.tempC + fan.deltaT * 0.5,
      env.humidity,
      env.humidExposureHours,
    ),
  );
  const rotorStresses = bladeStresses.filter((b) =>
    ROTOR_ROWS.some((r) => r.id === b.rowId),
  );

  const bladeModes = ROTOR_ROWS.map((r) => bladeMode(r, rpm, rotorMat));
  const fatigue = rotorStresses.map((bs) => fatigueAnalysis(bs, rpm, rotorMat));
  const bearings = bearingAnalysis(fan.thrust, rpm, env.loadFactor, thermal.motor.tempC * 0.55);
  const shaft = shaftAnalysis(fan.torque, rpm);
  const containment = containmentAnalysis(
    rpm,
    rotorStresses[0]?.bladeMass ?? 18,
    DUCT_WALL,
    MATERIALS.CFPETG,
  );
  const campbell = campbellCrossings(rotorMat);
  const loadPath = loadPaths(fan.thrust, env.loadFactor, totalMass);

  // --- Performans -------------------------------------------------------
  const performance = computePerformance(input, af, air, totalMass, antiIceW);

  // --- Risk -------------------------------------------------------------
  const st = stallRisk(fan);
  const waterIngress = Math.min(
    1,
    (air.lwc > 0 ? 0.25 + air.lwc * 0.06 : 0) * (1 - input.sealing) * 4 +
      (env.humidity > 95 ? 0.06 : 0),
  );
  const risk = assessRisk({
    runTimeS: env.runTime,
    rpm,
    bladeStresses: rotorStresses,
    fatigue,
    bearings,
    containment,
    campbell,
    thermal,
    soc: input.soc,
    cRate: battery.cRate,
    cycles: input.cycles,
    waterIngress,
    iceShedding: icing.sheddingRisk,
    ambientC: env.tempC,
    stallRisk: st.risk,
    overCurrent: motor.currentUtilisation > 1,
  });

  const durability = assessDurability(
    fatigue,
    bearings,
    thermal.motor.tempC,
    performance.enduranceMin,
  );

  // --- Tanilar ----------------------------------------------------------
  const throatVelocity = fan.massFlow / (air.density * A_THROAT);
  const diagnostics = {
    exitMach: exitMach(fan, air),
    reaction: degreeOfReaction(fan.flowCoefficient),
    diffusionFactor: st.df,
    stallRisk: st.risk,
    stallMargin: st.margin,
    throatVelocity,
    lipVelocity: throatVelocity * 1.5,
    rpmAchieved: rpm,
    rpmRequested: rpmRequest,
    rpmLimitedBy: core.limitedBy,
    iterations: core.iterations,
    converged: core.converged,
  };

  // --- Soguk hava -------------------------------------------------------
  const cold = {
    preheatWh: preheatEnergy(env.tempC),
    antiIceW,
    capacityFactor: battery.usableEnergy / (PACK_ENERGY_WH * 0.86),
    resistanceRatio: battery.resistance / 0.0246,
  };

  // --- Uyarilar ---------------------------------------------------------
  warnings.push(...motor.warnings, ...battery.warnings, ...thermal.warnings);
  if (!core.converged) {
    warnings.push('Cozum tam yakinsamadi — sonuclar yaklasiktir (asiri kosul).');
  }
  if (st.risk) {
    warnings.push(
      `Fan stall riski: Lieblein difuzyon faktoru ${st.df.toFixed(2)} > 0.60 siniri.`,
    );
  }
  if (diagnostics.rpmLimitedBy !== 'gaz kolu') {
    warnings.push(
      `Istenen ${rpmRequest.toFixed(0)} rpm ulasilamadi; ${rpm.toFixed(0)} rpm ile ` +
        `sinirli. Sinirlayan: ${diagnostics.rpmLimitedBy}.`,
    );
  }
  if (!containment.containedByDuct) {
    warnings.push(
      `Muhafaza: 4 mm basili cidar ${containment.ductCapacity.toFixed(0)} J sogurabilir, ` +
        `kopan kanat ${containment.bladeEnergy.toFixed(0)} J tasiyor. ` +
        `${containment.aramidLayers} kat aramid sargi ZORUNLU.`,
    );
  }
  if (shaft.speedRatio > 0.8) {
    warnings.push(
      `Mil kritik devrine yakin calisiyor: ${(shaft.speedRatio * 100).toFixed(0)}% ` +
        `(kritik ${shaft.criticalRpm.toFixed(0)} rpm).`,
    );
  }
  if (icing.active && !input.antiIceOn) {
    warnings.push(
      `BUZLANMA KOSULU (${icing.type}): dudak statik sicakligi ` +
        `${icing.throatTempC.toFixed(1)} °C, birikim ${icing.accretionRate.toFixed(2)} g/s, ` +
        `${(env.runTime / 60).toFixed(0)} dk sonunda ${icing.iceMass.toFixed(0)} g / ` +
        `%${icing.blockage.toFixed(0)} blokaj. Buz onleyiciyi acin.`,
    );
  }
  if (mass.thrustToWeight < 1 && af.lifting) {
    warnings.push(
      `Itki/agirlik = ${mass.thrustToWeight.toFixed(2)} < 1 — dikey kalkis mumkun degil; ` +
        'pistten kalkis veya firlatma gerekir.',
    );
  }
  if (env.tempC < 5) {
    warnings.push(
      `Soguk calisma: batarya on isitma ${cold.preheatWh.toFixed(0)} Wh, ` +
        `kapasite %${(cold.capacityFactor * 100).toFixed(0)}, ic direnc ` +
        `${cold.resistanceRatio.toFixed(1)}x.`,
    );
  }
  if (fan.spl > 115) {
    warnings.push(
      `Gurultu ${fan.spl.toFixed(0)} dBA (1 m) — kulak koruyucusu ZORUNLU. ` +
        `Kanat gecis frekanslari: ${fan.bladePassFrequency.map((f) => f.toFixed(0)).join(' / ')} Hz.`,
    );
  }

  return {
    input,
    airframe: af,
    air,
    icing,
    fan,
    motor,
    battery,
    thermal,
    mass,
    performance,
    bladeStresses,
    bladeModes,
    fatigue,
    bearings,
    shaft,
    containment,
    campbell,
    loadPath,
    risk,
    durability,
    diagnostics,
    cold,
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------------------
// Performans: maks. hiz, hizlanma, dayaniklilik, menzil
// ---------------------------------------------------------------------------

function computePerformance(
  input: SimInput,
  af: Airframe,
  air: AirState,
  totalMass: number,
  antiIceW: number,
): PerformanceResult {
  const env = input.env;
  const fullThrottleRpm = DESIGN.rpmMax;

  /** Belirli hizda tam gazda net itki. */
  const thrustAt = (v: number): { thrust: number; power: number; rpm: number; jet: number } => {
    const e = { ...env, airspeed: v };
    const c = solveCore(e, air, fullThrottleRpm, input.soc, input.cycles, antiIceW);
    return {
      thrust: c.fan.thrust,
      power: c.motor.busPower,
      rpm: c.rpm,
      jet: c.fan.exitVelocity,
    };
  };

  // --- Maks. hiz: T(V) = D(V) yarilama ---
  const t0 = thrustAt(0);
  let vMax = 0;
  {
    let lo = 0;
    let hi = 400;
    if (t0.thrust > drag(af, air, 0, totalMass)) {
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        const t = thrustAt(mid).thrust;
        const d = drag(af, air, mid, totalMass);
        if (t > d) lo = mid;
        else hi = mid;
      }
      vMax = (lo + hi) / 2;
    }
  }

  // --- Hiz-itki egrisi ---
  const thrustCurve: PerformanceResult['thrustCurve'] = [];
  const vTop = Math.max(vMax * 1.25, 40);
  for (let i = 0; i <= 16; i++) {
    const v = (vTop * i) / 16;
    thrustCurve.push({
      speed: v,
      thrust: thrustAt(v).thrust,
      drag: drag(af, air, v, totalMass),
    });
  }

  // --- Hizlanma: dV/dt = (T-D)/m ---
  let v = 0;
  let t = 0;
  let s = 0;
  const dt = 0.25;
  const vTarget = vMax * 0.9;
  while (v < vTarget && t < 600) {
    const T = thrustAt(v).thrust;
    const D = drag(af, air, v, totalMass);
    const a = (T - D) / totalMass;
    if (a <= 0.01) break;
    v += a * dt;
    s += v * dt;
    t += dt;
  }
  const accelTime = t;
  const accelDistance = s;

  // --- Tirmanma hizi: en iyi (T-D)*V/W ---
  let climbRate = 0;
  for (const p of thrustCurve) {
    const roc = ((p.thrust - p.drag) * p.speed) / (totalMass * 9.80665);
    if (roc > climbRate) climbRate = roc;
  }

  // --- Gaz kolu taramasi + dayaniklilik ---
  const throttleSweep: PerformanceResult['throttleSweep'] = [];
  let bestEndurance = 0;
  let bestThrottle = 0;
  for (let i = 1; i <= 12; i++) {
    const thr = i / 12;
    const c = solveCore(
      env,
      air,
      thr * DESIGN.rpmMax,
      input.soc,
      input.cycles,
      antiIceW,
    );
    const p = c.motor.busPower + antiIceW;
    const endur = p > 1 ? (c.battery.usableEnergy * input.soc * 60) / p : 0;
    throttleSweep.push({
      throttle: thr,
      rpm: c.rpm,
      thrust: c.fan.thrust,
      power: p,
      current: c.battery.current,
      endurance: endur,
      spl: c.fan.spl,
    });
    // "En iyi dayaniklilik" = govdeyi havada tutabilen en dusuk guc
    const canSustain = !af.lifting || c.fan.thrust > drag(af, air, 28, totalMass);
    if (canSustain && endur > bestEndurance) {
      bestEndurance = endur;
      bestThrottle = thr;
    }
  }

  // --- Mevcut gaz kolundaki tuketim ---
  const cur = solveCore(
    env,
    air,
    Math.max(0, Math.min(1, input.throttle)) * DESIGN.rpmMax,
    input.soc,
    input.cycles,
    antiIceW,
  );
  const busPower = cur.motor.busPower + antiIceW;
  const enduranceMin =
    busPower > 1 ? (cur.battery.usableEnergy * input.soc * 60) / busPower : 0;
  const cruiseSpeed = af.lifting ? Math.max(vMax * 0.62, 25) : vMax * 0.7;
  const rangeKm = (enduranceMin / 60) * cruiseSpeed * 3.6;
  const energyPerMinute = busPower / 60;
  const energyPerKm = cruiseSpeed > 0 ? busPower / (cruiseSpeed * 3.6) : 0;
  const mahPerMinute = (cur.battery.current * 1000) / 60;
  const mahConsumed = (cur.battery.current * 1000 * env.runTime) / 3600;

  return {
    maxSpeedMs: vMax,
    maxSpeedKmh: vMax * 3.6,
    jetSpeedMs: t0.jet,
    jetSpeedKmh: t0.jet * 3.6,
    maxMach: vMax / air.soundSpeed,
    accelTime,
    accelDistance,
    climbRate,
    enduranceMin,
    bestEnduranceMin: bestEndurance,
    bestEnduranceThrottle: bestThrottle,
    rangeKm,
    energyPerMinute,
    energyPerKm,
    mahPerMinute,
    mahConsumed,
    canHover: t0.thrust > totalMass * 9.80665,
    thrustCurve,
    throttleSweep,
  };
}

/** Onceden tanimli cevre senaryolari (UI icin). */
export const SCENARIOS: { id: string; label: string; env: Partial<Environment>; note: string }[] = [
  {
    id: 'ISA',
    label: 'Standart gun (ISA, deniz seviyesi)',
    env: { altitude: 0, tempC: 15, humidity: 40, rainRate: 0, snow: false },
    note: 'Referans tasarim kosulu.',
  },
  {
    id: 'WINTER',
    label: 'Kis — kuru soguk (-15 °C)',
    env: { altitude: 0, tempC: -15, humidity: 70, rainRate: 0, snow: false },
    note: 'Hava yogun -> itki artar; batarya ic direnci ve kapasitesi kotuleser.',
  },
  {
    id: 'ICING',
    label: 'Buzlanma — donan yagmur (-3 °C, 8 mm/h)',
    env: { altitude: 0, tempC: -3, humidity: 98, rainRate: 8, snow: false },
    note: 'En tehlikeli kosul: giris dudaginda seffaf buz birikimi.',
  },
  {
    id: 'SNOW',
    label: 'Kar firtinasi (-8 °C, kuru kar)',
    env: { altitude: 0, tempC: -8, humidity: 90, rainRate: 0, snow: true },
    note: 'Kuru kar cogunlukla yapismaz ama izgarayi tikar.',
  },
  {
    id: 'RAIN',
    label: 'Siddetli yagmur (18 °C, 50 mm/h)',
    env: { altitude: 0, tempC: 18, humidity: 100, rainRate: 50, snow: false },
    note: 'Verim kaybi + su girisi riski; buharlasma ile ek sogutma.',
  },
  {
    id: 'MONSOON',
    label: 'Tropikal saganak (26 °C, 150 mm/h)',
    env: { altitude: 0, tempC: 26, humidity: 100, rainRate: 150, snow: false },
    note: 'FAA asiri yagis zarfi. Kanat yuzeyinde su filmi.',
  },
  {
    id: 'HOT',
    label: 'Cok sicak gun (50 °C, col)',
    env: { altitude: 0, tempC: 50, humidity: 15, rainRate: 0, snow: false },
    note: 'Yogunluk %11 duser; motor/ESC/batarya termal olarak kritik.',
  },
  {
    id: 'HOTHIGH',
    label: 'Sicak & yuksek (2500 m, 40 °C)',
    env: { altitude: 2500, tempC: 40, humidity: 25, rainRate: 0, snow: false },
    note: 'En zor performans kosulu: yogunluk %26 dusuk.',
  },
  {
    id: 'HIGH',
    label: 'Yuksek irtifa seyir (5000 m, -5 °C)',
    env: { altitude: 5000, tempC: -5, humidity: 40, rainRate: 0, snow: false },
    note: 'Surukleme de dustugu icin maks. HIZ artar, itki azalir.',
  },
];
