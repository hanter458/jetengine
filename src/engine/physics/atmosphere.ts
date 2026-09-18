/**
 * Atmosfer, nem, yagmur ve buzlanma modeli.
 * =========================================
 * Tum fonksiyonlar SI birim kullanir (K, Pa, kg/m^3, m/s).
 *
 * KAYNAKLAR
 *  [A1] ISO 2533:1975 Standart Atmosfer (ISA).
 *  [A2] Alduchov & Eskridge (1996), J. Appl. Meteor. 35:601 — iyilestirilmis
 *       Magnus doygun buhar basinci katsayilari.
 *  [A3] Marshall & Palmer (1948), J. Meteor. 5:165 — damla capi dagilimi;
 *       LWC-yagis siddeti iliskisi.
 *  [A4] FAA 14 CFR Part 25 Appendix C — buzlanma zarfi (LWC, damla capi,
 *       sicaklik araliklari).
 *  [A5] Sutherland (1893) — dinamik viskozite sicaklik bagimliligi.
 */

export const R_DRY = 287.058; // [J/(kg*K)] kuru hava gaz sabiti
export const R_VAPOR = 461.495; // [J/(kg*K)] su buhari
export const CP_AIR = 1005; // [J/(kg*K)]
export const GAMMA = 1.4;
export const G0 = 9.80665; // [m/s^2]
export const L_FUSION = 334000; // [J/kg] buzun erime gizli isisi
export const L_VAPOR = 2.26e6; // [J/kg] suyun buharlasma gizli isisi
export const CP_WATER = 4182; // [J/(kg*K)]

export interface Environment {
  /** Deniz seviyesinden yukseklik [m]. */
  altitude: number;
  /** Ortam sicakligi [°C]. */
  tempC: number;
  /** Bagil nem [%]. */
  humidity: number;
  /** Yagis siddeti [mm/h]. 0 = kuru. */
  rainRate: number;
  /** Ucus/serbest akim hizi [m/s]. */
  airspeed: number;
  /** Ek tasinan kutle (faydali yuk) [kg]. */
  payload: number;
  /** Manevra yuk faktoru [g] — yatak ve baglanti yuklerini etkiler. */
  loadFactor: number;
  /** Kar/buz tanesi var mi (kuru kar emisi). */
  snow: boolean;
  /** Motorun bu kosulda ne kadar suredir calistigi [s] (buz birikimi, isinma). */
  runTime: number;
  /** Malzemenin neme maruz kaldigi toplam sure [saat]. */
  humidExposureHours: number;
}

export const ENV_ISA: Environment = {
  altitude: 0,
  tempC: 15,
  humidity: 40,
  rainRate: 0,
  airspeed: 0,
  payload: 0,
  loadFactor: 1,
  snow: false,
  runTime: 60,
  humidExposureHours: 24,
};

export interface AirState {
  /** Statik basinc [Pa]. */
  pressure: number;
  /** Sicaklik [K]. */
  temperature: number;
  /** Yogunluk [kg/m^3]. */
  density: number;
  /** ISA'ya gore yogunluk orani. */
  densityRatio: number;
  /** Dinamik viskozite [Pa*s]. */
  viscosity: number;
  /** Ses hizi [m/s]. */
  soundSpeed: number;
  /** Su buhari kismi basinci [Pa]. */
  vaporPressure: number;
  /** Doygun buhar basinci [Pa]. */
  saturationPressure: number;
  /** Sivi su icerigi [g/m^3] (yagmur). */
  lwc: number;
  /** Ortalama damla capi [um]. */
  dropletMVD: number;
  /** Nem nedeniyle yogunluk degisimi [%]. */
  humidityEffect: number;
  /**
   * Islak termometre sicakligi [°C]. Buharlasmali sogutmanin ulasabilecegi
   * TERMODINAMIK ALT SINIR budir — hicbir yuzey bu sicakligin altina inemez.
   * Stull (2011) ampirik bagintisi, +/-0.3 K dogruluk, -20..50 °C araligi.
   */
  wetBulbC: number;
}

export const ISA_RHO = 1.225;
export const ISA_P = 101325;
export const ISA_T = 288.15;

/** ISA basinc ve sicaklik (troposfer, 0-11 km). [A1] */
export function isaAt(altitude: number): { p: number; t: number } {
  const lapse = -0.0065; // [K/m]
  const t = ISA_T + lapse * Math.min(altitude, 11000);
  const p = ISA_P * Math.pow(t / ISA_T, -G0 / (lapse * R_DRY));
  if (altitude <= 11000) return { p, t };
  // Stratosfer: izotermal
  const p11 = ISA_P * Math.pow((ISA_T + lapse * 11000) / ISA_T, -G0 / (lapse * R_DRY));
  return {
    p: p11 * Math.exp((-G0 * (altitude - 11000)) / (R_DRY * 216.65)),
    t: 216.65,
  };
}

/** Doygun buhar basinci, iyilestirilmis Magnus formulu [Pa]. [A2] */
export function saturationVaporPressure(tempC: number): number {
  if (tempC >= 0) {
    return 610.94 * Math.exp((17.625 * tempC) / (tempC + 243.04));
  }
  // Buz uzerinde (T < 0) — buzlanma hesaplari icin ayri katsayilar
  return 611.21 * Math.exp((22.587 * tempC) / (tempC + 273.86));
}

/**
 * Marshall-Palmer dagilimindan yagis siddeti -> sivi su icerigi. [A3]
 *   LWC [g/m^3] = 0.072 * R^0.88   (R [mm/h])
 * Ortalama hacimsel damla capi (MVD):
 *   MVD [um] = 1000 * 0.9 * R^0.21
 */
export function rainToLWC(rainRate: number): { lwc: number; mvd: number } {
  if (rainRate <= 0) return { lwc: 0, mvd: 0 };
  return {
    lwc: 0.072 * Math.pow(rainRate, 0.88),
    mvd: 900 * Math.pow(rainRate, 0.21),
  };
}

/** Yagis siddetinin sozel siniflandirmasi. */
export function rainClass(rainRate: number): string {
  if (rainRate <= 0) return 'Kuru';
  if (rainRate < 2.5) return 'Hafif yagmur';
  if (rainRate < 10) return 'Orta siddetli yagmur';
  if (rainRate < 50) return 'Siddetli yagmur';
  if (rainRate < 100) return 'Cok siddetli yagmur';
  return 'Tropikal saganak (FAA asiri yagis zarfi)';
}

/** Tam hava durumu — nem duzeltmesi dahil. */
export function airState(env: Environment): AirState {
  const isa = isaAt(env.altitude);
  // Kullanici sicakligi verir; basinc irtifadan gelir
  const T = env.tempC + 273.15;
  const p = isa.p;

  // Yagmur yagan hava pratikte doygundur: bagil nemi en az %95 kabul ediyoruz.
  // Bu, buharlasmali sogutmanin yagmurda neden ISE YARAMADIGINI belirler.
  const rhEffective = env.rainRate > 0 ? Math.max(env.humidity, 95) : env.humidity;

  const eSat = saturationVaporPressure(env.tempC);
  const eVap = Math.min((rhEffective / 100) * eSat, p * 0.99);
  const pDry = p - eVap;

  // Nemli hava KURU havadan HAFIFTIR (su buharinin molar kutlesi daha kucuk)
  const rho = pDry / (R_DRY * T) + eVap / (R_VAPOR * T);
  const rhoDryOnly = p / (R_DRY * T);

  // Sutherland viskozite [A5]
  const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
  const a = Math.sqrt(GAMMA * R_DRY * T);
  const { lwc, mvd } = rainToLWC(env.rainRate);

  return {
    pressure: p,
    temperature: T,
    density: rho,
    densityRatio: rho / ISA_RHO,
    viscosity: mu,
    soundSpeed: a,
    vaporPressure: eVap,
    saturationPressure: eSat,
    lwc,
    dropletMVD: mvd,
    humidityEffect: (rho / rhoDryOnly - 1) * 100,
    wetBulbC: wetBulbTemp(env.tempC, rhEffective),
  };
}

/**
 * Islak termometre sicakligi — Stull (2011), Journal of Applied Meteorology,
 * "Wet-Bulb Temperature from Relative Humidity and Air Temperature".
 * Acik erisim ampirik bagintisi; deniz seviyesi basinci icin kalibre.
 *
 * @param tC  kuru termometre sicakligi [°C]
 * @param rh  bagil nem [%] (0..100)
 */
export function wetBulbTemp(tC: number, rh: number): number {
  const r = Math.max(1, Math.min(100, rh));
  const tw =
    tC * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(tC + r) -
    Math.atan(r - 1.676331) +
    0.00391838 * Math.pow(r, 1.5) * Math.atan(0.023101 * r) -
    4.686035;
  // Islak termometre kuru termometreyi asamaz
  return Math.min(tw, tC);
}

// ---------------------------------------------------------------------------
// Buzlanma
// ---------------------------------------------------------------------------

export interface IcingState {
  /** Buzlanma riski var mi? */
  active: boolean;
  /** Giris bogazindaki statik sicaklik [°C] — hizlanma nedeniyle ortamdan dusuk. */
  throatTempC: number;
  /** Hizlanmadan kaynaklanan sicaklik dususu [K]. */
  staticTempDrop: number;
  /** Toplanma verimi (collection efficiency, 0-1). */
  collectionEfficiency: number;
  /** Buz birikme hizi [g/s] (giris dudagi + spinner). */
  accretionRate: number;
  /** runTime sonunda birikmis buz kutlesi [g]. */
  iceMass: number;
  /** Giris alaninda blokaj [%]. */
  blockage: number;
  /** Buz tipi. */
  type: 'yok' | 'seffaf (glaze)' | 'donuk (rime)' | 'karisik' | 'kuru kar';
  /** Buz atma (shedding) esigi asildi mi — rotor hasar riski. */
  sheddingRisk: boolean;
  /** Buz cozme icin gereken guc [W]. */
  antiIcePower: number;
}

/**
 * Giris buzlanmasi.
 *
 * Fizik:
 *  1. Bellmouth havayi hizlandirir -> statik sicaklik DUSER:
 *       dT = V^2 / (2*cp)
 *     Bu yuzden +3 °C ortamda bile giris dudagi 0 °C altina inebilir.
 *  2. Toplanma verimi, Stokes sayisinin fonksiyonudur; buyuk damlalar
 *     (yuksek MVD) akim cizgilerini takip etmeyip yuzeye carpar.
 *  3. Birikme hizi: m_dot_ice = LWC * V * A_yakalama * E * n_donma
 *  4. Blokaj, etkin giris alanini kucultur -> itki kaybi.
 *
 * [A4] FAA Part 25 App. C zarfi ile tutarlidir.
 */
export function icingState(env: Environment, air: AirState, throatVelocity: number): IcingState {
  const dT = (throatVelocity * throatVelocity) / (2 * CP_AIR);
  const throatTempC = env.tempC - dT;

  const hasWater = env.rainRate > 0 || env.humidity > 75;
  const inRange = throatTempC < 0 && throatTempC > -25;

  if (env.snow && env.tempC < 0) {
    // Kuru kar: cogunlukla yapismaz ama izgara/dudakta birikir
    const rate = 0.25 * air.density * throatVelocity * 0.0004;
    const mass = rate * env.runTime;
    return {
      active: true,
      throatTempC,
      staticTempDrop: dT,
      collectionEfficiency: 0.25,
      accretionRate: rate,
      iceMass: mass,
      blockage: Math.min(45, (mass / 190) * 100),
      type: 'kuru kar',
      sheddingRisk: mass > 130,
      antiIcePower: 220,
    };
  }

  if (!inRange || !hasWater) {
    return {
      active: false,
      throatTempC,
      staticTempDrop: dT,
      collectionEfficiency: 0,
      accretionRate: 0,
      iceMass: 0,
      blockage: 0,
      type: 'yok',
      sheddingRisk: false,
      antiIcePower: 0,
    };
  }

  // Sivi su: yagmurdan gelen LWC + nemli havada yogusma katkisi
  const lwcEff = Math.max(air.lwc, env.humidity > 90 ? 0.35 : env.humidity > 80 ? 0.15 : 0.04);
  const mvd = air.dropletMVD > 0 ? air.dropletMVD : 20;

  // Stokes sayisi tabanli toplanma verimi (Langmuir-Blodgett yaklasimi)
  const dropletD = mvd * 1e-6;
  const rhoWater = 1000;
  const charLength = 0.012; // dudak yaricapi [m]
  const stk =
    (rhoWater * dropletD * dropletD * throatVelocity) / (18 * air.viscosity * charLength);
  const E = Math.max(0, Math.min(0.95, stk / (stk + 0.42)));

  // Donma fraksiyonu: cok soguk -> tamami donar (rime), 0 °C civari kismi (glaze)
  const freezeFraction = Math.max(0.35, Math.min(1, -throatTempC / 8));
  const type: IcingState['type'] =
    throatTempC > -8 ? 'seffaf (glaze)' : throatTempC > -15 ? 'karisik' : 'donuk (rime)';

  // Yakalama alani: dudak + spinner on izdusumu
  const captureArea = 0.0092; // [m^2]
  const rate = (lwcEff / 1000) * throatVelocity * captureArea * E * freezeFraction * 1000; // [g/s]
  const iceMass = rate * env.runTime;

  // 1 g buz ~ 1.09 cm^3; dudak cevresine yayildiginda alan kaybi
  const blockage = Math.min(60, (iceMass / 210) * 100);

  // Buz cozme gucu: donma gizli isisi + suyu 0 °C'ye getirme + tasinim kaybi
  const waterFlux = (lwcEff / 1000) * throatVelocity * captureArea * E; // [kg/s]
  const antiIcePower =
    waterFlux * (L_FUSION + CP_WATER * Math.max(0, -throatTempC)) + 180;

  return {
    active: true,
    throatTempC,
    staticTempDrop: dT,
    collectionEfficiency: E,
    accretionRate: rate,
    iceMass,
    blockage,
    type,
    sheddingRisk: iceMass > 95,
    antiIcePower,
  };
}
