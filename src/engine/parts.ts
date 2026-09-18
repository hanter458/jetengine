/**
 * Parca katalogu (BOM).
 * =====================
 * Her parcanin kimligi, malzemesi, adedi, uretim yontemi, baski yonu ve
 * geometri ureticisi burada toplanir. Kutle ve sinir kutusu (bbox) degerleri
 * GERCEK mesh hacminden hesaplanir — elle girilmis tahmin yoktur.
 */

import {
  BEARINGS,
  BLADE_ROWS,
  CELL,
  ESC,
  MANUFACTURING,
  MOTOR,
  PACK,
  PACK_CELL_COUNT,
  SHAFT,
  STATIONS,
  type BladeRow,
} from './spec';
import { MATERIALS, effectiveDensity, type MaterialId } from './materials';
import * as G from './geom/partsGeom';
import { bbox, merge, volume, type MeshData } from './geom/mesh';

export type PartGroup =
  | 'inlet'
  | 'duct'
  | 'fan'
  | 'core'
  | 'motor'
  | 'battery'
  | 'electronics'
  | 'nozzle'
  | 'structure'
  | 'hardware';

export const GROUP_LABELS: Record<PartGroup, string> = {
  inlet: 'Giris / Bellmouth',
  duct: 'Kanal (Duct)',
  fan: 'Fan Kademeleri',
  core: 'Cekirdek / Gobek',
  motor: 'Elektrik Motoru & Aktarma',
  battery: 'Batarya Sistemi',
  electronics: 'Elektronik & Kontrol',
  nozzle: 'Nozul / Egzoz',
  structure: 'Tasiyici Yapi & Kaporta',
  hardware: 'Baglanti Elemanlari',
};

export type Process = 'FDM' | 'CNC' | 'COTS';

export interface PartDef {
  id: string;
  name: string;
  group: PartGroup;
  material: MaterialId;
  process: Process;
  /** Motorda kac adet bulunur. */
  qty: number;
  /** FDM dolgu orani (0-1). */
  infill: number;
  /** Ince cidarli parca mi (kutle hesabi icin)? */
  thinWall: boolean;
  /** Bu parcanin TEK adedinin montaj konumundaki mesh'i. */
  build: () => MeshData;
  /** Tum adetlerin birlikte mesh'i (goruntuleyici icin). */
  buildAll?: () => MeshData;
  /** COTS parcalar icin katalog kutlesi [g] (mesh hacmi yerine bu kullanilir). */
  massEach?: number;
  /** Patlatilmis gorunumde hareket yonu (birim vektor benzeri). */
  explode: [number, number, number];
  /** Baski yonu / destek notu. */
  printNote?: string;
  /** Muhendislik notu. */
  note?: string;
  /** Kritik parca mi (arizasi motor kaybina yol acar)? */
  critical?: boolean;
}

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

const row = (id: string): BladeRow => {
  const r = BLADE_ROWS.find((b) => b.id === id);
  if (!r) throw new Error(`Bilinmeyen kanat sirasi: ${id}`);
  return r;
};

/** Ayni geometriyi N kez farkli indekslerle uretip birlestirir. */
const many = (n: number, f: (i: number) => MeshData): MeshData =>
  merge(...Array.from({ length: n }, (_, i) => f(i)));

const DUCT_SEGMENTS: { id: string; x0: number; x1: number; opts: G.DuctOpts }[] = [
  { id: 'DUCT-01', x0: STATIONS.inletEnd, x1: STATIONS.duct01End, opts: { standoffs: 10, ribs: 2 } },
  { id: 'DUCT-02', x0: STATIONS.duct01End, x1: STATIONS.rotor1BayEnd, opts: { abradableSeat: true, standoffs: 10 } },
  { id: 'DUCT-03', x0: STATIONS.stator1End, x1: STATIONS.rotor2BayEnd, opts: { abradableSeat: true, standoffs: 10 } },
  { id: 'DUCT-04', x0: STATIONS.stator2End, x1: STATIONS.duct04End, opts: { standoffs: 8, ribs: 2 } },
  { id: 'DUCT-05', x0: STATIONS.duct04End, x1: STATIONS.duct05End, opts: { standoffs: 8, ribs: 1 } },
];

const SKIN_SECTIONS: [number, number][] = [
  [STATIONS.inletEnd, 280],
  [280, 440],
  [440, 600],
  [600, STATIONS.duct05End],
];

// ---------------------------------------------------------------------------
// Parca tanimlari
// ---------------------------------------------------------------------------

export const PARTS: PartDef[] = [
  // ---------------------------------------------------------------- GIRIS
  {
    id: 'INLET-LIP',
    name: 'Giris cani dilimi (bellmouth)',
    group: 'inlet',
    material: 'CFPETG',
    process: 'FDM',
    qty: 5,
    infill: 0.25,
    thinWall: true,
    build: () => G.inletLipSegment(0, 5),
    buildAll: () => many(5, (i) => G.inletLipSegment(i, 5)),
    explode: [-1, 0, 0],
    printNote: 'Eksen dikey, dudak ASAGI bakacak sekilde. Destek yok. 5 duvar hatti.',
    note:
      'Giris basinc geri kazanimi 0.985. Dudak yaricapi ~6 mm; ayrilmayi onler. ' +
      'Dilim sayisi 4 DEGIL 5: 4 adet birlesme izi rotorun 1. egilme modunu ' +
      'kirmizi cizgiye cok yakin bir devirde (4E @ 12600 rpm) tahrik ediyordu.',
  },
  {
    id: 'FOD-SCREEN',
    name: 'Yabanci madde koruma izgarasi (yarim)',
    group: 'inlet',
    material: 'PA6CF',
    process: 'FDM',
    qty: 2,
    infill: 1.0,
    thinWall: false,
    build: () => G.fodScreen(0),
    buildAll: () => many(2, (i) => G.fodScreen(i)),
    explode: [-1.6, 0, 0],
    printNote: 'Yatay (izgara duzlemi tabana paralel). %100 dolgu, teller 2.6 mm.',
    note: 'Aci akisi %3.2 blokaj -> itkide ~%1.4 kayip. Kus/tas emisine karsi zorunlu.',
  },

  // ---------------------------------------------------------------- KANAL
  ...DUCT_SEGMENTS.map<PartDef>((d) => ({
    id: d.id,
    name: `Kanal parcasi ${d.id.slice(-2)} (x=${d.x0}..${d.x1} mm)`,
    group: 'duct',
    material: 'CFPETG',
    process: 'FDM',
    qty: 1,
    infill: 0.3,
    thinWall: true,
    build: () => G.ductSegment(d.x0, d.x1, d.opts),
    explode: [0, 0, 0],
    printNote: `Eksen dikey. Yukseklik ${d.x1 - d.x0} mm, cap 208 mm — ${MANUFACTURING.buildVolume[0]} mm tablaya sigar. Destek yok.`,
    note: d.opts.abradableSeat
      ? 'Rotor bolgesi: ic yuzeye asindirilabilir uc astari yapistirilir (1 mm).'
      : 'Cidar 4 mm = rotor parcalanmasinda birincil muhafaza katmani.',
    critical: !!d.opts.abradableSeat,
  })),
  {
    id: 'ABRADABLE-LINER',
    name: 'Rotor uc bosluk astari',
    group: 'duct',
    material: 'ALPHA_TAPE',
    process: 'COTS',
    qty: 2,
    infill: 1,
    thinWall: true,
    massEach: 34,
    build: () => G.abradableLiner(STATIONS.duct01End + 8, STATIONS.rotor1BayEnd - 8),
    buildAll: () =>
      merge(
        G.abradableLiner(STATIONS.duct01End + 8, STATIONS.rotor1BayEnd - 8),
        G.abradableLiner(STATIONS.stator1End + 8, STATIONS.rotor2BayEnd - 8),
      ),
    explode: [0, 0.4, 0],
    note: 'Uc temasinda kanat degil astar asinir. Uc boslugu 1.0 mm (cap %0.5).',
  },

  // ------------------------------------------------------------- FAN
  {
    id: 'ROTOR-01',
    name: 'Kademe 1 rotoru (entegre kanatli disk, 10 kanat)',
    group: 'fan',
    material: 'PA6CF',
    process: 'FDM',
    qty: 1,
    infill: 1.0,
    thinWall: false,
    build: () => G.rotorBlisk(row('R1'), 246, 300),
    explode: [0, 0, 0],
    printNote:
      'Eksen DIKEY, gobek tablada. Agac destek (%12 yogunluk). Baski sonrasi 90 °C / 6 saat tavlama ZORUNLU.',
    note:
      'Uc hizi 129.6 m/s (Mach 0.38). Kok merkezkac gerilmesi 12 500 rpm\'de ~8.5 MPa; ' +
      'PA6-CF icin emniyet katsayisi > 4. Dinamik balans: 12 denge yuvasi.',
    critical: true,
  },
  {
    id: 'ROTOR-02',
    name: 'Kademe 2 rotoru (entegre kanatli disk, 12 kanat)',
    group: 'fan',
    material: 'PA6CF',
    process: 'FDM',
    qty: 1,
    infill: 1.0,
    thinWall: false,
    build: () => G.rotorBlisk(row('R2'), 372, 436),
    explode: [0, 0, 0],
    printNote: 'ROTOR-01 ile ayni. Tavlama zorunlu.',
    note: 'Kademe 1 ile ayni mil uzerinde; kanat sayisi 12 (10/12 asal olmayan ama 13/15 statorla tonlar ayrisir).',
    critical: true,
  },
  {
    id: 'STATOR-01',
    name: 'Kademe 1 statoru (halka + 13 kanatcik, tek parca)',
    group: 'fan',
    material: 'CFPETG',
    process: 'FDM',
    qty: 1,
    infill: 0.55,
    thinWall: false,
    build: () =>
      G.statorAssembly(row('S1'), STATIONS.rotor1BayEnd, STATIONS.stator1End, {
        bearingSeat: { x: BEARINGS[0].x, od: BEARINGS[0].od, width: BEARINGS[0].width },
      }),
    explode: [0, 0, 0],
    printNote:
      'Eksen dikey. Kanatcik acisi eksenden 14-30° -> DESTEK GEREKMEZ. 6 duvar hatti.',
    note: 'On yatak yuvasini 6 radyal kolla tasir. Girdap (swirl) giderme: cikis aci < 6°.',
    critical: true,
  },
  {
    id: 'STATOR-02',
    name: 'Kademe 2 statoru / OGV (halka + 15 yapisal kanatcik)',
    group: 'fan',
    material: 'PA6CF',
    process: 'FDM',
    qty: 1,
    infill: 0.7,
    thinWall: false,
    build: () =>
      G.statorAssembly(row('S2'), STATIONS.rotor2BayEnd, STATIONS.stator2End, {
        motorFlange: true,
        thrustFlange: true,
      }),
    explode: [0, 0, 0],
    printNote: 'Eksen dikey, destek yok. Tavlama onerilir (yapisal parca).',
    note:
      'ANA YAPISAL ELEMAN: motoru tasir, itkiyi (174 N) 15 kanatcik uzerinden ' +
      'dis flansa ve pilona aktarir. Kanatcik basina ~11.6 N eksenel yuk.',
    critical: true,
  },
  {
    id: 'HUB-ADAPTER',
    name: 'Gobek adaptoru (mil -> rotor, islenmis)',
    group: 'fan',
    material: 'AL6061',
    process: 'CNC',
    qty: 2,
    infill: 1,
    thinWall: false,
    build: () => G.hubAdapter(row('R1').xMid),
    buildAll: () => merge(G.hubAdapter(row('R1').xMid), G.hubAdapter(row('R2').xMid)),
    explode: [0, 0, 0],
    printNote: 'CNC torna + freze. O10 H7 delik, yarikli sikma burcu.',
    note:
      'Basili rotoru celik mile baglayan tek metal arayuz. 6.8 N*m torku 6 x M4 ' +
      'ile aktarir; civata kesme gerilmesi 41 MPa (emniyet > 5).',
    critical: true,
  },
  {
    id: 'BLADE-SPARE-R1',
    name: 'Yedek kanat numunesi R1 (test/analiz)',
    group: 'fan',
    material: 'PA6CF',
    process: 'FDM',
    qty: 1,
    infill: 1,
    thinWall: false,
    build: () => G.singleBlade(row('R1')),
    explode: [0, 2.2, 0],
    printNote: 'Kanat duzlemi tablaya yatik (katmanlar span boyunca) — cekme testi numunesi.',
    note: 'Cekme/yorulma testi ve CFD dogrulamasi icin tek kanat.',
  },

  // ------------------------------------------------------------- CEKIRDEK
  {
    id: 'SPINNER',
    name: 'Burun konisi (spinner)',
    group: 'core',
    material: 'CFPETG',
    process: 'FDM',
    qty: 1,
    infill: 0.15,
    thinWall: true,
    build: () => G.spinner(150, 248),
    explode: [-2.2, 0, 0],
    printNote: 'Eksen dikey, uc YUKARI. Destek yok. Cidar 3 mm.',
    note: 'Rotor 1 ile birlikte doner. Ogiv profil; giris blokaj gecisini yumusatir.',
  },
  {
    id: 'CORE-FAIRING',
    name: 'Cekirdek kilifi (motor bolmesi kapagi, yarim)',
    group: 'core',
    material: 'PCCF',
    process: 'FDM',
    qty: 2,
    infill: 0.2,
    thinWall: true,
    build: () => G.coreFairingHalf(STATIONS.stator2End, STATIONS.duct04End, 0),
    buildAll: () => many(2, (i) => G.coreFairingHalf(STATIONS.stator2End, STATIONS.duct04End, i)),
    explode: [0, 1.4, 0],
    printNote: 'Yarim silindir, kesit yuzu tablada. Destek yok.',
    note:
      'Motor bolmesi 85-110 °C\'ye kadar isinir -> PC-CF (HDT 148 °C). ' +
      '21 panjur motoru sogutan by-pass havasini yonlendirir.',
  },
  {
    id: 'TAIL-01',
    name: 'Kuyruk konisi on parcasi',
    group: 'core',
    material: 'CFPETG',
    process: 'FDM',
    qty: 1,
    infill: 0.18,
    thinWall: true,
    build: () => G.tailCone(STATIONS.duct04End, 810, false),
    explode: [1.2, 0, 0],
    printNote: 'Eksen dikey, geniş uc tablada. Destek yok.',
  },
  {
    id: 'TAIL-02',
    name: 'Kuyruk konisi arka parcasi (kapali uc)',
    group: 'core',
    material: 'CFPETG',
    process: 'FDM',
    qty: 1,
    infill: 0.18,
    thinWall: true,
    build: () => G.tailCone(810, 980, true),
    explode: [1.8, 0, 0],
    printNote: 'Eksen dikey, uc YUKARI. Son 34 mm dolu basilir.',
    note: 'Kuyruk konisi cikis alanini 0.0211 m^2\'ye ayarlar; ayrilma yaricapi 12° < 15°.',
  },

  // ------------------------------------------------------------- MOTOR
  {
    id: 'MOTOR',
    name: `BLDC outrunner ${MOTOR.kv} Kv (${MOTOR.statorOD}x${MOTOR.statorStack})`,
    group: 'motor',
    material: 'AL6061',
    process: 'COTS',
    qty: 1,
    infill: 1,
    thinWall: false,
    massEach: MOTOR.mass,
    build: () => G.motorAssembly(),
    explode: [0, 0, 0],
    note:
      `${MOTOR.powerContinuous / 1000} kW surekli, ${MOTOR.powerPeak / 1000} kW tepe. ` +
      `Faz direnci ${MOTOR.phaseResistance * 1000} mOhm, Class H sargi (180 °C).`,
    critical: true,
  },
  {
    id: 'SHAFT',
    name: `Ana mil O${SHAFT.diameter} x ${SHAFT.length} mm`,
    group: 'motor',
    material: 'STEEL42CRMO4',
    process: 'CNC',
    qty: 1,
    infill: 1,
    thinWall: false,
    massEach: SHAFT.mass,
    build: () => G.shaft(),
    explode: [0, 0, 0],
    note:
      'Burulma gerilmesi 6.8 N*m\'de 34.7 MPa (emniyet 26). Birinci egilme ' +
      'kritik devri 31 400 rpm >> 12 500 rpm calisma devri.',
    critical: true,
  },
  ...BEARINGS.map<PartDef>((bs, i) => ({
    id: bs.id,
    name: `Yatak ${bs.designation}`,
    group: 'motor',
    material: 'STEEL42CRMO4',
    process: 'COTS',
    qty: 1,
    infill: 1,
    thinWall: false,
    massEach: bs.mass,
    build: () => G.bearing(i),
    explode: [0, 0, 0],
    note: `C = ${bs.dynamicC} N, limit ${bs.speedLimit} rpm. L10 omru risk modelinde hesaplanir.`,
    critical: true,
  })),
  ...BEARINGS.map<PartDef>((bs, i) => ({
    id: `${bs.id}-HOUSING`,
    name: `Yatak yuvasi ${bs.id} (islenmis)`,
    group: 'motor',
    material: 'AL6061',
    process: 'CNC',
    qty: 1,
    infill: 1,
    thinWall: false,
    build: () => G.bearingHousing(i),
    explode: [0, 0, 0],
    printNote: 'CNC torna. Yuva toleransi H7, sikma gecme 0.01-0.03 mm.',
    note: 'Aluminyum zorunlu: basili polimer yuva termal genlesmeyle bosluk verir.',
    critical: true,
  })),

  // ------------------------------------------------------------- BATARYA
  {
    id: 'BATT-TRAY',
    name: 'Batarya hucre tasiyici dilimi (6 hucre)',
    group: 'battery',
    material: 'PCCF',
    process: 'FDM',
    qty: PACK.modules * PACK.traysPerModule,
    infill: 0.35,
    thinWall: false,
    build: () => G.batteryTray(0, 0),
    buildAll: () =>
      merge(
        ...PACK.moduleX.flatMap((_, m) =>
          Array.from({ length: PACK.traysPerModule }, (_, t) => G.batteryTray(m, t)),
        ),
      ),
    explode: [0, 2.6, 0],
    printNote: 'Kavisli yuz tablada, hucre delikleri DIKEY. Destek yok. 4 duvar.',
    note:
      'Alev geciktirici PC-CF. Hucre basina 1.5 mm ara duvar + 0.6 mm mika ' +
      'ara katman: isil kacak yayilimini geciktirir.',
    critical: true,
  },
  {
    id: 'BATT-CELL',
    name: `21700 hucre (${CELL.model})`,
    group: 'battery',
    material: 'LIION',
    process: 'COTS',
    qty: PACK_CELL_COUNT,
    infill: 1,
    thinWall: false,
    massEach: CELL.mass,
    build: () => G.batteryCell(0, 0),
    buildAll: () =>
      merge(
        ...PACK.moduleX.flatMap((_, m) =>
          Array.from({ length: PACK.cellsPerModule }, (_, c) => G.batteryCell(m, c)),
        ),
      ),
    explode: [0, 3.4, 0],
    note:
      `${CELL.capacity} mAh, ${CELL.voltageNominal} V, maks. ${CELL.cRateMax}C. ` +
      `Isil kacak baslangici ${CELL.runawayOnset} °C.`,
    critical: true,
  },
  {
    id: 'BATT-BUSBAR',
    name: 'Nikel serit busbar (modul basina 2)',
    group: 'battery',
    material: 'COPPER',
    process: 'COTS',
    qty: PACK.modules * 2,
    infill: 1,
    thinWall: true,
    build: () => G.busbarRing(0, 0),
    buildAll: () =>
      merge(
        ...PACK.moduleX.flatMap((_, m) => [G.busbarRing(m, 0), G.busbarRing(m, 1)]),
      ),
    explode: [0, 3.0, 0],
    note: '0.3 x 14 mm nikel, 6 kat (6P). 210 A\'de akim yogunlugu 8.3 A/mm^2 — puntalama sonrasi.',
  },
  {
    id: 'BMS-BOX',
    name: 'BMS + ana kontaktor kutusu',
    group: 'battery',
    material: 'PCCF',
    process: 'FDM',
    qty: 1,
    infill: 0.25,
    thinWall: false,
    build: () => G.bmsBox(),
    explode: [0, 2.2, 0],
    printNote: 'Kutunun agzi yukari. Destek yok.',
    note:
      '20 hucre gerilim izleme, 8 NTC sicaklik, 500 A shunt, 150 A hava ' +
      'kontaktoru + 250 A pyro sigorta.',
    critical: true,
  },

  // --------------------------------------------------------- ELEKTRONIK
  {
    id: 'ESC',
    name: `ESC ${ESC.currentPerUnit} A / ${ESC.voltageMax} V`,
    group: 'electronics',
    material: 'AL6061',
    process: 'COTS',
    qty: ESC.units,
    infill: 1,
    thinWall: false,
    massEach: ESC.massPerUnit,
    build: () => G.escUnit(0),
    buildAll: () => many(ESC.units, (i) => G.escUnit(i)),
    explode: [0, 2.4, 0],
    note:
      `Paralel 2 birim, her biri ${ESC.currentPerUnit} A. Verim ${ESC.efficiency}. ` +
      'By-pass havasi ile sogutulur (kanal disi, r=118 mm).',
    critical: true,
  },
  {
    id: 'AVIONICS-RING',
    name: 'Sensor ve guc dagitim halkasi',
    group: 'electronics',
    material: 'PCCF',
    process: 'FDM',
    qty: 1,
    infill: 0.3,
    thinWall: false,
    build: () => G.avionicsRing(),
    explode: [0, 1.8, 0],
    note:
      '8 kanal: 2 devir sensoru (hall), 4 termokupl (motor/ESC/batarya), ' +
      '1 titresim (IMU), 1 giris basinc probu.',
  },

  // ------------------------------------------------------------- NOZUL
  {
    id: 'NOZZLE-01',
    name: 'Yakinsak nozul on dilimi (120°)',
    group: 'nozzle',
    material: 'CFPETG',
    process: 'FDM',
    qty: 3,
    infill: 0.22,
    thinWall: true,
    build: () => G.nozzleSegment(STATIONS.duct05End, STATIONS.nozzle01End, 0, false),
    buildAll: () => many(3, (i) => G.nozzleSegment(STATIONS.duct05End, STATIONS.nozzle01End, i, false)),
    explode: [1.2, 0, 0],
    printNote: '120° dilim: 242 x 70 x 120 mm. Kavisli yuz tablada, destek yok.',
    note: 'Cift cidar: ic yuzey gaz yolu, dis yuzey kaporta; 10 radyal kaburga baglar.',
  },
  {
    id: 'NOZZLE-02',
    name: 'Yakinsak nozul arka dilimi + firar kenari (120°)',
    group: 'nozzle',
    material: 'CFPETG',
    process: 'FDM',
    qty: 3,
    infill: 0.22,
    thinWall: true,
    build: () => G.nozzleSegment(STATIONS.nozzle01End, STATIONS.exit, 0, true),
    buildAll: () => many(3, (i) => G.nozzleSegment(STATIONS.nozzle01End, STATIONS.exit, i, true)),
    explode: [1.9, 0, 0],
    printNote: 'Firar kenari YUKARI. Destek yok.',
    note:
      'Cikis ic capi 164 mm -> A9 = 0.02112 m^2. Alan orani A9/Afan = 0.897 ' +
      '(hafif hizlandirici). Firar kenari kalinligi 2.6 mm.',
  },

  // ------------------------------------------------------------- YAPI
  {
    id: 'SKIN-PANEL',
    name: 'Nacelle dis kaporta paneli (120°)',
    group: 'structure',
    material: 'ASA',
    process: 'FDM',
    qty: SKIN_SECTIONS.length * 3,
    infill: 0.15,
    thinWall: true,
    build: () => G.skinPanel(SKIN_SECTIONS[0][0], SKIN_SECTIONS[0][1], 0),
    buildAll: () =>
      merge(
        ...SKIN_SECTIONS.flatMap(([a, b]) => [0, 1, 2].map((i) => G.skinPanel(a, b, i))),
      ),
    explode: [0, 1.7, 0],
    printNote:
      '120° dilim, kavisli yuz tablada: 244 x 70 x 160 mm. ASA UV/ozon dayanimi icin. Destek yok.',
    note: 'Batarya ve ESC bolmesini kapatir; 3 ic kaburga ile burkulma dayanimi saglar.',
  },
  {
    id: 'MOUNT-RING',
    name: 'Itki yuk halkasi (120° dilim)',
    group: 'structure',
    material: 'PA6CF',
    process: 'FDM',
    qty: 3,
    infill: 0.8,
    thinWall: false,
    build: () => G.mountRingHalf(0, 3),
    buildAll: () => many(3, (i) => G.mountRingHalf(i, 3)),
    explode: [0, 1.2, 0],
    printNote:
      'Halka duzlemi TABLADA yatik basilir (eksen dusey degil). ' +
      '120° yay: 241 x 70 mm izdusum. %80 dolgu, 8 duvar. Tavlama onerilir.',
    note:
      'OGV dis flansini pilona baglar. 12 kol, her biri 14.5 N eksenel yuk. ' +
      'Uc dilim, bolme duzlemlerinde 2x M5 ile birlesir.',
    critical: true,
  },
  {
    id: 'MOUNT-PYLON',
    name: 'Ust montaj pilonu',
    group: 'structure',
    material: 'PA6CF',
    process: 'FDM',
    qty: 1,
    infill: 0.9,
    thinWall: false,
    build: () => G.mountPylon(),
    explode: [0, 2.6, 0],
    printNote: 'Veter yonu tablada yatay, span dikey. Destek yok. Tavlama ZORUNLU.',
    note:
      'NACA 0018 benzeri simetrik profil (veter 190 mm). Itki (174 N) + ' +
      'jiroskopik moment tasir. Kok egilme gerilmesi 9.4 MPa.',
    critical: true,
  },
  {
    id: 'STAND-FOOT',
    name: 'Yer testi ayagi',
    group: 'structure',
    material: 'PA6CF',
    process: 'FDM',
    qty: 2,
    infill: 0.5,
    thinWall: false,
    build: () => G.standFoot(0),
    buildAll: () => many(2, (i) => G.standFoot(i)),
    explode: [0, -1.4, 0],
    printNote: '%50 dolgu, 6 duvar.',
    note: 'Sadece yer testinde takilir; ucusta sokulur (1.1 kg tasarruf).',
  },
  {
    id: 'GASKET',
    name: 'Flans contasi / titresim yalitim halkasi',
    group: 'structure',
    material: 'TPU',
    process: 'FDM',
    qty: 9,
    infill: 1,
    thinWall: true,
    build: () => G.gasketRing(STATIONS.duct01End - 1, 104),
    buildAll: () =>
      merge(
        ...[
          STATIONS.inletEnd, STATIONS.duct01End, STATIONS.rotor1BayEnd,
          STATIONS.stator1End, STATIONS.rotor2BayEnd, STATIONS.stator2End,
          STATIONS.duct04End, STATIONS.duct05End, STATIONS.nozzle01End,
        ].map((x) => G.gasketRing(x - 1, 104)),
      ),
    explode: [0, 0.9, 0],
    printNote: 'TPU 95A, %100 dolgu, 0.15 mm katman.',
    note: 'Hem sizdirmazlik hem kanat gecis titresimi (BPF 2083 Hz) yalitimi.',
  },
];

// ---------------------------------------------------------------------------
// Turetilmis parca verileri (mesh'ten hesaplanir, onbelleklenir)
// ---------------------------------------------------------------------------

export interface PartMetrics {
  def: PartDef;
  /** Tek adedin hacmi [mm^3]. */
  volumeMm3: number;
  /** Tek adedin kutlesi [g]. */
  massEach: number;
  /** Toplam kutle (qty x massEach) [g]. */
  massTotal: number;
  /** Sinir kutusu [mm]. */
  size: [number, number, number];
  /** Baski hacmine sigiyor mu? */
  fitsBuildVolume: boolean;
  triangles: number;
  /** Tahmini malzeme maliyeti (toplam) [TL]. */
  cost: number;
}

const metricsCache = new Map<string, PartMetrics>();

export function partMetrics(def: PartDef): PartMetrics {
  const hit = metricsCache.get(def.id);
  if (hit) return hit;

  const mesh = def.build();
  const vol = volume(mesh);
  const bb = bbox(mesh);
  const mat = MATERIALS[def.material];

  let massEach: number;
  if (def.massEach !== undefined) {
    massEach = def.massEach;
  } else {
    const rho = effectiveDensity(mat, def.infill, def.thinWall); // kg/m^3
    massEach = (vol / 1e9) * rho * 1000; // mm^3 -> m^3 -> kg -> g
  }

  // Baski yonunde en kucuk sinir kutusu: parcayi en uygun eksene yatirmak
  const dims = [bb.size[0], bb.size[1], bb.size[2]].sort((a, b) => b - a);
  const bv = [...MANUFACTURING.buildVolume].sort((a, b) => b - a);
  const fits =
    def.process !== 'FDM' || (dims[0] <= bv[0] && dims[1] <= bv[1] && dims[2] <= bv[2]);

  const m: PartMetrics = {
    def,
    volumeMm3: vol,
    massEach,
    massTotal: massEach * def.qty,
    size: [bb.size[0], bb.size[1], bb.size[2]],
    fitsBuildVolume: fits,
    triangles: mesh.indices.length / 3,
    cost: (massEach * def.qty * mat.costPerKg) / 1000,
  };
  metricsCache.set(def.id, m);
  return m;
}

export function allMetrics(): PartMetrics[] {
  return PARTS.map(partMetrics);
}

export interface MassBudget {
  byGroup: { group: PartGroup; label: string; mass: number }[];
  printedMass: number;
  cotsMass: number;
  machinedMass: number;
  totalMass: number;
  totalCost: number;
  partTypes: number;
  physicalPieces: number;
  printedVolumeCm3: number;
}

export function massBudget(): MassBudget {
  const ms = allMetrics();
  const byGroupMap = new Map<PartGroup, number>();
  let printed = 0, cots = 0, machined = 0, cost = 0, printedVol = 0, pieces = 0;

  for (const m of ms) {
    byGroupMap.set(m.def.group, (byGroupMap.get(m.def.group) ?? 0) + m.massTotal);
    if (m.def.process === 'FDM') {
      printed += m.massTotal;
      printedVol += (m.volumeMm3 * m.def.qty) / 1000;
    } else if (m.def.process === 'CNC') machined += m.massTotal;
    else cots += m.massTotal;
    cost += m.cost;
    pieces += m.def.qty;
  }

  const byGroup = (Object.keys(GROUP_LABELS) as PartGroup[])
    .map((g) => ({ group: g, label: GROUP_LABELS[g], mass: byGroupMap.get(g) ?? 0 }))
    .filter((e) => e.mass > 0);

  // Baglanti elemanlari (civata/somun/insert) — sayilarak degil toplu eklenir
  const fasteners = 480 + 105;
  byGroup.push({ group: 'hardware', label: GROUP_LABELS.hardware, mass: fasteners });

  return {
    byGroup,
    printedMass: printed,
    cotsMass: cots + fasteners,
    machinedMass: machined,
    totalMass: printed + cots + machined + fasteners,
    totalCost: cost + 1800,
    partTypes: PARTS.length,
    physicalPieces: pieces + 180,
    printedVolumeCm3: printedVol,
  };
}

/** Tum motorun tek mesh'i (goruntuleyici "montaj" modu icin). */
export function fullAssembly(filter?: (p: PartDef) => boolean): MeshData {
  const parts = filter ? PARTS.filter(filter) : PARTS;
  return merge(...parts.map((p) => (p.buildAll ? p.buildAll() : p.build())));
}
