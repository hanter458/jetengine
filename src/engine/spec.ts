/**
 * EDF-1000 — 1 metrelik elektrikli jet motoru (2 kademeli elektrikli kanallı fan)
 * ============================================================================
 * TEK DOGRULUK KAYNAGI (single source of truth).
 *
 * Buradaki her sayi hem 3D geometriyi hem fizik simulasyonunu besler.
 * Bir olcuyu degistirdiginizde STL dosyalari VE performans tahminleri birlikte degisir.
 *
 * BIRIMLER
 *   Uzunluk .............. mm   (3D baski / imalat kolayligi icin)
 *   Aci .................. derece
 *   Kutle ................ g
 *   Diger her sey ........ SI (m, kg, s, N, W, J, K, Pa)
 *
 * KOORDINAT SISTEMI
 *   +X : motor ekseni, hava akis yonu (x=0 giris dudagi on yuzeyi, x=1000 nozul cikisi)
 *   +Y : yukari
 *   +Z : saga
 *   r  : eksene dik yaricap = sqrt(y^2 + z^2)
 *
 * TASARIM NOKTASI OZETI (bkz. docs/DESIGN.md — tam turev ve kaynaklar)
 *   Toplam uzunluk ....................... 1000 mm
 *   Nacelle maks. cap .................... 282 mm
 *   Kanal ic capi (fan duzlemi) .......... 200 mm
 *   Rotor uc capi ........................ 198 mm (1.0 mm uc bosluğu)
 *   Gobek capi ........................... 100 mm (gobek/uc orani 0.505)
 *   Kademe sayisi ........................ 2 (rotor + stator x2)
 *   Kanat sayisi ......................... R1:10  S1:13  R2:12  S2:15
 *   Tasarim devri ........................ 12 500 rpm
 *   Tasarim akis katsayisi (phi) ......... 0.75
 *   Tasarim statik itki .................. ~174 N (17.7 kgf) @ ISA deniz seviyesi
 *   Saft gucu / elektrik gucu ............ 8.9 kW / 10.0 kW
 *   Batarya .............................. 20S6P 21700 = 18 000 mAh @ 72 V = 1296 Wh
 */

// ---------------------------------------------------------------------------
// 0. Global
// ---------------------------------------------------------------------------

export const ENGINE_NAME = 'EDF-1000';
export const ENGINE_REV = 'Rev C';

/** Motorun toplam eksenel uzunlugu [mm]. Proje kisiti: tam 1 metre. */
export const TOTAL_LENGTH = 1000;

// ---------------------------------------------------------------------------
// 1. Gaz yolu (akis kanali) profili
// ---------------------------------------------------------------------------
// Kanalin IC yuzeyi: giris cani (bellmouth) -> sabit kesit -> yakinsak nozul.
// [x_mm, r_mm] cift listesi; aradaki degerler Catmull-Rom benzeri interpolasyon
// ile yumusatilir (bkz. geom/profile.ts).

export const DUCT_INNER_PROFILE: readonly [number, number][] = [
  [0, 116.0], // giris dudagi on ucu (hucum kenari)
  [4, 109.5],
  [10, 105.2],
  [18, 102.6],
  [30, 101.2],
  [50, 100.3],
  [80, 100.05],
  [120, 100.0], // daralma bitti: sabit ic cap 200 mm
  [400, 100.0],
  [700, 100.0],
  [760, 100.0], // nozul yakinsamasi baslangici
  [820, 97.5],
  [880, 92.0],
  [940, 86.5],
  [1000, 82.0], // nozul cikisi: ic cap 164 mm
];

/** Nacelle DIS yuzeyi (kaporta hatti). */
export const NACELLE_OUTER_PROFILE: readonly [number, number][] = [
  [0, 116.0], // dudak on ucu — ic profille ayni nokta
  [3, 123.0],
  [8, 128.5],
  [16, 133.0],
  [30, 137.5],
  [55, 140.3],
  [90, 141.0], // maks. cap 282 mm
  [500, 141.0],
  [700, 141.0],
  [760, 139.5],
  [830, 132.0],
  [900, 118.0],
  [960, 100.0],
  [1000, 86.0], // nozul dis yaricapi (82 + 4 mm et)
];

/** Kanal cidar kalinligi [mm] (3D baskida 4 mm = 10 duvar hatti @ 0.4 mm). */
export const DUCT_WALL = 4.0;
/** Dis kaporta panel kalinligi [mm]. */
export const SKIN_WALL = 2.4;

/**
 * Eksenel bolumleme istasyonlari [mm].
 * Parcalar bu sinirlarda flansla birlesir. Rotorlar ve statorlar
 * kasitli olarak flans araliklarinin ORTASINA denk gelir ki her kanat
 * sirasi kendi kanal parcasiyla birlikte sokulebilsin.
 */
export const STATIONS = {
  inletLip: 0,
  inletEnd: 120,
  duct01End: 246,
  rotor1BayEnd: 310,
  stator1End: 372,
  rotor2BayEnd: 436,
  stator2End: 512,
  duct04End: 640,
  duct05End: 760,
  nozzle01End: 880,
  exit: 1000,
} as const;

// ---------------------------------------------------------------------------
// 2. Cekirdek (gobek) profili — spinner, rotor gobekleri, motor yatagi, kuyruk konisi
// ---------------------------------------------------------------------------

export const HUB_RADIUS = 50.0; // fan duzleminde gobek yaricapi [mm]
export const TIP_CLEARANCE = 1.0; // rotor ucu ile kanal arasi bosluk [mm]
export const TIP_RADIUS = 99.0; // = 100.0 - 1.0

export const CORE_PROFILE: readonly [number, number][] = [
  [150, 0.0], // spinner ucu
  [158, 14.0],
  [172, 27.0],
  [190, 38.0],
  [212, 45.5],
  [240, 50.0], // spinner tabani = gobek capi 100 mm
  [620, 50.0], // sabit gobek: rotor/stator/motor bolgesi
  [660, 49.0],
  [720, 45.0],
  [790, 38.0],
  [860, 28.0],
  [930, 15.0],
  [980, 0.0], // kuyruk konisi ucu
];

// ---------------------------------------------------------------------------
// 3. Kanat sirasi (blade row) tanimlari
// ---------------------------------------------------------------------------

export interface BladeRow {
  id: string;
  label: string;
  kind: 'rotor' | 'stator';
  /** Kanat/kanatcik sayisi. */
  count: number;
  /** Kok veterinin eksenel orta noktasi [mm]. */
  xMid: number;
  /** Kok veter uzunlugu [mm]. */
  chordRoot: number;
  /** Uc veter uzunlugu [mm]. */
  chordTip: number;
  /** Kokte maks. kalinlik/veter orani. */
  thickRoot: number;
  /** Ucta maks. kalinlik/veter orani. */
  thickTip: number;
  /** Kokte metal aci (eksenden) [deg]. */
  pitchRoot: number;
  /** Ucta metal aci (eksenden) [deg]. */
  pitchTip: number;
  /** Kamber (egrilik) orani — orta hat maks. sapma / veter. */
  camber: number;
  /** Gobek yaricapi bu sirada [mm]. */
  rHub: number;
  /** Uc yaricapi bu sirada [mm]. */
  rTip: number;
  /** Stator icin: gobek disinda kalan yapisal gorev var mi? */
  structural?: boolean;
}

/**
 * Kanat acilari hiz ucgenlerinden turetildi (docs/DESIGN.md §4):
 *   U(r) = omega * r,  Vx = 76.6 m/s (tasarim noktasinda sabit eksenel hiz varsayimi)
 *   rotor giris rolatif aci  beta1 = atan(U / Vx)
 *   rotor cikis rolatif aci  beta2 = atan((U - c_theta2) / Vx)
 * Kanat acilari bu iki acinin arasinda, sapma (deviation) icin Carter kurali ile
 * duzeltildi. Kanat sayilari MDPI Aerospace 9(5):241 ve 12(6):509'daki
 * dogrulanmis 10-rotor/6-stator mimarisinden yola cikip, rotor-stator etkilesim
 * tonlarini azaltmak icin asal-fark kuralina gore secildi (10/13, 12/15).
 */
export const BLADE_ROWS: readonly BladeRow[] = [
  {
    id: 'R1',
    label: 'Kademe 1 Rotor',
    kind: 'rotor',
    count: 10,
    xMid: 272,
    chordRoot: 54,
    chordTip: 44,
    // Kok kalinligi 0.155 secildi: ilk egilme modunu 4E ve 5E motor
    // mertebeleri ARASINA tasir (bkz. physics/structure.ts Campbell analizi).
    thickRoot: 0.155,
    thickTip: 0.07,
    pitchRoot: 33.0,
    pitchTip: 56.0,
    camber: 0.085,
    rHub: 50,
    rTip: 99,
  },
  {
    id: 'S1',
    label: 'Kademe 1 Stator',
    kind: 'stator',
    count: 13,
    xMid: 335,
    chordRoot: 50,
    chordTip: 46,
    thickRoot: 0.12,
    thickTip: 0.09,
    pitchRoot: 30.0,
    pitchTip: 14.0,
    camber: 0.11,
    rHub: 50,
    rTip: 100,
  },
  {
    id: 'R2',
    label: 'Kademe 2 Rotor',
    kind: 'rotor',
    count: 12,
    xMid: 402,
    chordRoot: 50,
    chordTip: 42,
    thickRoot: 0.145,
    thickTip: 0.07,
    pitchRoot: 34.0,
    pitchTip: 57.0,
    camber: 0.08,
    rHub: 50,
    rTip: 99,
  },
  {
    id: 'S2',
    label: 'Kademe 2 Stator / OGV (yapisal)',
    kind: 'stator',
    count: 15,
    xMid: 470,
    chordRoot: 58,
    chordTip: 52,
    thickRoot: 0.16,
    thickTip: 0.10,
    pitchRoot: 28.0,
    pitchTip: 10.0,
    camber: 0.10,
    rHub: 50,
    rTip: 100,
    structural: true,
  },
];

export const ROTOR_ROWS = BLADE_ROWS.filter((r) => r.kind === 'rotor');
export const STATOR_ROWS = BLADE_ROWS.filter((r) => r.kind === 'stator');

// ---------------------------------------------------------------------------
// 4. Tasarim noktasi (aerodinamik)
// ---------------------------------------------------------------------------

export const DESIGN = {
  /** Tasarim devri [rpm]. */
  rpm: 12500,
  /** Maksimum izin verilen devir [rpm] (yapisal limit, bkz. risk modeli). */
  rpmMax: 14500,
  /** Tasarim akis katsayisi phi = Vx / U_mean. */
  flowCoefficient: 0.75,
  /** Kademe basina is katsayisi psi = dh0 / U_mean^2. */
  workCoefficient: 0.202,
  /** Fan izentropik verimi (2 kademe + stator, dusuk yukleme). */
  fanEfficiency: 0.82,
  /** Giris basinc geri kazanim katsayisi (bellmouth). */
  inletRecovery: 0.985,
  /** Nozul hiz katsayisi. */
  nozzleVelocityCoeff: 0.975,
  /** Tasarim statik itki [N] — hesaplanan deger physics/fan.ts'te dogrulanir. */
  thrustStatic: 174,
} as const;

// ---------------------------------------------------------------------------
// 5. Elektrik motoru — BLDC outrunner
// ---------------------------------------------------------------------------

export const MOTOR = {
  model: 'EDF-1000-M1 (8085 sinifi outrunner)',
  /** Stator dis capi [mm]. */
  statorOD: 80,
  /** Stator paket yuksekligi (yigin boyu) [mm]. */
  statorStack: 85,
  /** Govde (can) dis capi [mm]. */
  canOD: 88,
  /** Govde toplam boyu [mm]. */
  canLength: 104,
  /**
   * Motor on yuzeyinin eksenel konumu [mm].
   * OGV kanatciklarinin (x=470) GERISINE yerlestirildi: 88 mm capli govde,
   * kanatcik koklerinin bulundugu ince cidarli gobek bolgesine sigmaz.
   */
  xFront: 516,
  /** Hiz sabiti [rpm/V]. */
  kv: 200,
  /** Kutup sayisi / oluk sayisi. */
  poles: 28,
  slots: 24,
  /** Faz direnci [ohm] (faz-faz olcumunun yarisi). */
  phaseResistance: 0.018,
  /** Bosta akim @ 10 V [A]. */
  noLoadCurrent: 1.8,
  /** Surekli maks. guc [W]. */
  powerContinuous: 11000,
  /** 30 s tepe guc [W]. */
  powerPeak: 15000,
  /** Maks. surekli faz akimi [A]. */
  currentContinuous: 160,
  /** Sargi sinifi maks. sicakligi [°C] (Class H). */
  tempMax: 180,
  /** Termal derating baslangic sicakligi [°C]. */
  tempDerateStart: 120,
  /** Kutle [g]. */
  mass: 1620,
  /** Motorun kendi mil capi [mm] — kaplin ile fan miline baglanir. */
  shaftDia: 12,
} as const;

export const ESC = {
  model: 'EDF-1000-E1 (2 x 120 A, 20S)',
  units: 2,
  /** Birim basina surekli akim [A]. */
  currentPerUnit: 120,
  voltageMax: 90,
  /** Anahtarlama + iletim verimi. */
  efficiency: 0.97,
  /** Birim govde olculeri [mm] (u x g x y). */
  size: [110, 62, 24] as const,
  /** Birim kutlesi (sogutucu dahil) [g]. */
  massPerUnit: 420,
} as const;

// ---------------------------------------------------------------------------
// 6. Batarya modulu — 20S6P 21700
// ---------------------------------------------------------------------------
// Hucre: Samsung INR21700-30T sinifi yuksek-guc hucresi.
// Kaynak: Schmitt et al., J. Electrochem. Soc. 170 (2023) 070509 (CC BY)
//   3.0 Ah, 3.6 V nom, 2.5-4.2 V, maks. surekli desarj 11.66C, 154.3 Wh/kg
//   omik direnc ~5.9 mOhm

export const CELL = {
  model: 'INR21700-30T sinifi (yuksek guc)',
  diameter: 21.2, // [mm] uretim toleransi dahil
  height: 70.4, // [mm]
  /** Nominal kapasite [mAh]. */
  capacity: 3000,
  voltageNominal: 3.6,
  voltageMax: 4.2,
  voltageMin: 2.5,
  /** Maks. surekli desarj C-orani. */
  cRateMax: 11.66,
  /** Omik ic direnc [ohm] (1 kHz). */
  resistance: 0.0059,
  /** Kutle [g]. */
  mass: 70,
  /** Ozgul enerji [Wh/kg]. */
  specificEnergy: 154.3,
  /** Isil kacak baslangic sicakligi [°C] (ARC, %100 SOC). */
  runawayOnset: 138,
  /** Kendinden isinma baslangici [°C]. */
  selfHeatOnset: 92,
  /** Surekli servis sicakligi ust siniri [°C]. */
  serviceTemp: 60,
  /** Ozgul isi [J/(kg*K)]. */
  specificHeat: 1040,
} as const;

export const PACK = {
  /** Seri hucre sayisi. */
  series: 20,
  /** Paralel hucre sayisi. */
  parallel: 6,
  /** Modul sayisi (kanal etrafinda halka modul). */
  modules: 4,
  /** Modul basina hucre. */
  cellsPerModule: 30,
  /** Halka uzerinde hucre merkez yaricapi [mm]. */
  ringRadius: 118,
  /** Modullerin eksenel baslangic konumlari [mm]. */
  moduleX: [128, 206, 284, 362] as const,
  /** Modul basina halka dilim (tasiyici) sayisi. */
  traysPerModule: 5,
  /** Dilim basina hucre sayisi. */
  cellsPerTray: 6,
  /** Modul eksenel uzunlugu [mm] (hucre + tasiyici + busbar). */
  moduleLength: 76,
  /** Kullanilabilir enerji orani (BMS kesme sinirlari). */
  usableFraction: 0.86,
  /** Hucre araligi disinda paket ek kutlesi (tasiyici, busbar, BMS, kablo) [g]. */
  overheadMass: 1700,
} as const;

// Turetilmis batarya degerleri -------------------------------------------------

/** Paket nominal gerilimi [V]. */
export const PACK_V_NOM = PACK.series * CELL.voltageNominal; // 72.0
/** Paket tam sarj gerilimi [V]. */
export const PACK_V_MAX = PACK.series * CELL.voltageMax; // 84.0
/** Paket kesme gerilimi [V]. */
export const PACK_V_MIN = PACK.series * CELL.voltageMin; // 50.0
/** Paket kapasitesi [mAh] — KULLANICININ SORDUGU DEGER. */
export const PACK_CAPACITY_MAH = PACK.parallel * CELL.capacity; // 18 000 mAh
/** Paket nominal enerjisi [Wh]. */
export const PACK_ENERGY_WH = (PACK_CAPACITY_MAH / 1000) * PACK_V_NOM; // 1296 Wh
/** Kullanilabilir enerji [Wh]. */
export const PACK_ENERGY_USABLE_WH = PACK_ENERGY_WH * PACK.usableFraction; // ~1114 Wh
/** Toplam hucre sayisi. */
export const PACK_CELL_COUNT = PACK.series * PACK.parallel; // 120
/** Maks. surekli desarj akimi [A]. */
export const PACK_I_MAX = PACK.parallel * (CELL.cRateMax * CELL.capacity) / 1000; // 210 A
/** Paket ic direnci [ohm] — hucre matrisi + %25 baglanti payi. */
export const PACK_RESISTANCE =
  ((PACK.series / PACK.parallel) * CELL.resistance) * 1.25; // ~0.0246
/** Paket kutlesi [g]. */
export const PACK_MASS = PACK_CELL_COUNT * CELL.mass + PACK.overheadMass; // 10 100 g

// ---------------------------------------------------------------------------
// 7. Mil, yataklar, baglanti elemanlari
// ---------------------------------------------------------------------------

/**
 * Ana fan mili.
 *
 * NEDEN BORU (dolu mil degil)?
 *   Yatak araligi 176 mm + 50 mm tasma (rotor 1 disarida) ile dolu O15 mm
 *   celik milin birinci egilme kritik devri ~13 100 rpm cikiyordu — calisma
 *   devri 12 500 rpm'e fazlasiyla yakin (marj 1.05, kabul edilemez).
 *   O22 x 4 mm boru, %13 daha hafif olmasina ragmen 3.9 kat daha rijittir;
 *   kritik devir ~24 800 rpm'e cikar (marj 1.98). Bkz. physics/structure.ts.
 */
export const SHAFT = {
  /** Boru dis capi [mm]. */
  diameter: 22.0,
  /** Cidar kalinligi [mm]. */
  wall: 4.0,
  /** Yatak oturma capi (islenmis uc burclari) [mm]. */
  journalDia: 20.0,
  length: 266, // [mm]
  xStart: 250,
  material: 'Dikissiz celik boru 42CrMo4, O22x4, sertlestirilmis; uclar O20 h6 taslanmis',
  mass: 532, // [g] boru + iki uc burcu
} as const;

/** Motor mili -> fan mili sikma kaplini. */
export const COUPLING = {
  model: 'Yarikli sikma kaplin O20 / O12',
  x: 500,
  length: 34,
  od: 40,
  mass: 96, // [g]
} as const;

export interface BearingSpec {
  id: string;
  designation: string;
  bore: number; // [mm]
  od: number; // [mm]
  width: number; // [mm]
  /** Dinamik yuk katsayisi C [N]. */
  dynamicC: number;
  /** Limit devir (yagli) [rpm]. */
  speedLimit: number;
  x: number; // eksenel konum [mm]
  mass: number; // [g]
}

export const BEARINGS: readonly BearingSpec[] = [
  {
    id: 'BRG-FWD',
    designation: '6004-2RS (20x42x12) hibrit seramik',
    bore: 20,
    od: 42,
    width: 12,
    dynamicC: 9950,
    speedLimit: 26000,
    x: 322, // Kademe 1 statorunun ic govdesi icinde
    mass: 69,
  },
  {
    id: 'BRG-AFT',
    designation: '6204-2RS (20x47x14) hibrit seramik',
    bore: 20,
    od: 47,
    width: 14,
    dynamicC: 12700,
    speedLimit: 22000,
    x: 498, // OGV ic govdesi — eksenel itki yukunu tasir
    mass: 106,
  },
];

// ---------------------------------------------------------------------------
// 8. Yapisal / imalat kisitlari
// ---------------------------------------------------------------------------

export const MANUFACTURING = {
  /** Hedef yazici baski hacmi [mm] — parca bolumleme bunu kullanir. */
  buildVolume: [256, 256, 256] as const,
  /** Nozul capi [mm]. */
  nozzleDia: 0.4,
  /** Katman yuksekligi [mm]. */
  layerHeight: 0.2,
  /** Duvar hatti sayisi (yapisal parcalar). */
  wallLines: 5,
  /** Flans civata capi [mm]. */
  boltDia: 4, // M4
  /** Kanal flanslarindaki civata sayisi. */
  flangeBolts: 12,
  /** Gecme toleransi (kaydirmali) [mm]. */
  clearanceFit: 0.25,
  /** Sikma gecme [mm]. */
  pressFit: -0.05,
} as const;

// ---------------------------------------------------------------------------
// 9. Kutle butcesi
// ---------------------------------------------------------------------------
// Basili parcalarin kutleleri gercek mesh hacmi x malzeme yogunlugu x dolgu
// oranindan otomatik hesaplanir (parts.ts). Buradakiler basili olmayan
// (COTS / islenmis) kalemler.

export const NON_PRINTED_MASS: readonly { id: string; label: string; mass: number }[] = [
  { id: 'MOTOR', label: 'BLDC motor (8085, 200 Kv)', mass: MOTOR.mass },
  { id: 'ESC', label: `ESC x${ESC.units} (sogutucu dahil)`, mass: ESC.units * ESC.massPerUnit },
  { id: 'PACK', label: `Batarya 20S6P (${PACK_CELL_COUNT} hucre)`, mass: PACK_MASS },
  { id: 'SHAFT', label: 'Celik fan mili (O22x4 boru)', mass: SHAFT.mass },
  { id: 'COUPLING', label: 'Sikma kaplin O20/O12', mass: COUPLING.mass },
  { id: 'BEARINGS', label: 'Yataklar', mass: BEARINGS.reduce((s, b) => s + b.mass, 0) },
  { id: 'FASTENERS', label: 'Civata / somun / pul (M4-M6)', mass: 480 },
  { id: 'WIRING', label: 'Guc kablolari, konnektor, sensorler', mass: 390 },
  { id: 'INSERTS', label: 'Isi ile gomulen pirinc yuvalar (x96)', mass: 105 },
];

// ---------------------------------------------------------------------------
// 10. Test arac / govde referansi (maks. hiz hesabi icin)
// ---------------------------------------------------------------------------
// "Maks. kac km/h hiza cikiyor" sorusu ancak bir govde tanimiyla yanitlanabilir:
// itki = surukleme dengesi. Uc referans senaryo tanimliyoruz.

export interface Airframe {
  id: string;
  label: string;
  /** Sifir-tasima surukleme katsayisi. */
  cd: number;
  /** Referans alan [m^2] (ucan govdelerde kanat alani, podda on kesit). */
  refArea: number;
  /** Motor disindaki bos kutle [kg]. */
  emptyMass: number;
  /** Tekerlek/zemin surtunme katsayisi (0 = ucus). */
  rollingFriction: number;
  /** Kanat en-boy orani (yalnizca tasima ureten govdeler). */
  aspectRatio?: number;
  /** Oswald verimi. */
  oswald?: number;
  /** Tasima uretiyor mu (indirgenmis surukleme hesabi icin)? */
  lifting: boolean;
}

export const AIRFRAMES: readonly Airframe[] = [
  {
    id: 'POD',
    label: 'Ciplak motor podu (kanatsiz, kut govde)',
    cd: 0.26,
    refArea: 0.0625, // pi/4 * 0.282^2 — motor on kesiti
    emptyMass: 0,
    rollingFriction: 0,
    lifting: false,
  },
  {
    id: 'UAV',
    label: 'Deneysel IHA (1.9 m kanat acikligi, S=0.42 m^2)',
    cd: 0.028,
    refArea: 0.42,
    emptyMass: 11.0,
    rollingFriction: 0,
    aspectRatio: 8.6,
    oswald: 0.82,
    lifting: true,
  },
  {
    id: 'DART',
    label: 'Yuksek hizli hedef ucagi (ince govde, S=0.26 m^2)',
    cd: 0.020,
    refArea: 0.26,
    emptyMass: 7.5,
    rollingFriction: 0,
    aspectRatio: 6.2,
    oswald: 0.80,
    lifting: true,
  },
  {
    id: 'CART',
    label: 'Ray ustu itki test arabasi (yer testi)',
    cd: 0.55,
    refArea: 0.18,
    emptyMass: 24.0,
    rollingFriction: 0.012,
    lifting: false,
  },
];
