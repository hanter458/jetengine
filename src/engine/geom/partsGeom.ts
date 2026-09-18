/**
 * EDF-1000 parca geometrileri.
 * ============================
 * Her fonksiyon, parcanin MONTAJ KOORDINATLARINDA (motor eksenine gore
 * dogru konumda) mesh'ini uretir. Baski icin parca ayrica kendi
 * merkezine tasinip yonlendirilir (bkz. exporters/).
 *
 * Tum olculer mm.
 */

import {
  CORE_PROFILE,
  DUCT_INNER_PROFILE,
  DUCT_WALL,
  MANUFACTURING,
  MOTOR,
  NACELLE_OUTER_PROFILE,
  PACK,
  SKIN_WALL,
  STATIONS,
  BEARINGS,
  CELL,
  COUPLING,
  ESC,
  SHAFT,
  type BladeRow,
} from '../spec';
import { airfoilContour } from './airfoil';
import { bladeArray, bladeSolid } from './blade';
import {
  box,
  clipProfile,
  cylinderX,
  flangeWithBoltHoles,
  loftSections,
  merge,
  MeshBuilder,
  multiply,
  offsetProfile,
  polarArray,
  profileRadius,
  radialCylinder,
  resampleProfile,
  rotationX,
  rotationZ,
  roundedBox,
  torusX,
  transformMesh,
  translation,
  tubeX,
  revolveShell,
  revolveSolid,
  type MeshData,
  type Vec3,
} from './mesh';

// ---------------------------------------------------------------------------
// Yogun (yumusatilmis) profiller
// ---------------------------------------------------------------------------

export const GASPATH = resampleProfile(DUCT_INNER_PROFILE, 2.5);
export const NACELLE = resampleProfile(NACELLE_OUTER_PROFILE, 3.0);
export const CORE = resampleProfile(CORE_PROFILE, 2.5);

const gas = (x0: number, x1: number) => clipProfile(GASPATH, x0, x1);
const nac = (x0: number, x1: number) => clipProfile(NACELLE, x0, x1);
const core = (x0: number, x1: number) => clipProfile(CORE, x0, x1);

export const rGas = (x: number) => profileRadius(GASPATH, x);
export const rNac = (x: number) => profileRadius(NACELLE, x);
export const rCore = (x: number) => profileRadius(CORE, x);

const SEG = 108; // kanal parcalari icin cevresel bolme
const BOLT = MANUFACTURING.boltDia + 0.3; // M4 -> 4.3 mm gecme deligi

// ---------------------------------------------------------------------------
// 1. Giris dudagi (bellmouth) — 4 dilim
// ---------------------------------------------------------------------------

/**
 * Giris cani dilimi. Ic yuzey daralarak 200 mm'lik kanala baglanir,
 * dis yuzey kaporta hattini olusturur. Hucum kenarinda iki yuzey
 * birlesir (yuvarlatilmis dudak).
 */
export function inletLipSegment(index = 0, count = 4): MeshData {
  const th0 = (index * Math.PI * 2) / count;
  const dth = (Math.PI * 2) / count;
  const x1 = STATIONS.inletEnd; // 120

  const innerProf = gas(0, x1);
  // Dis yuzey: dudak tepesine kadar kaporta hattini izler (x<12), sonra
  // hizla ic yuzeyin 4.5 mm disina doner. Aradaki bosluk batarya halkasi
  // ve kaporta paneli icindir — dudak INCE bir kabuktur, dolu blok degil.
  const outerProf: [number, number][] = nac(0, x1).map(([x, r]) => {
    const blend = Math.max(0, Math.min(1, (x - 12) / 26));
    const target = rGas(x) + DUCT_WALL + 0.5;
    return [x, r * (1 - blend) + target * blend];
  });

  const shell = revolveShell(innerProf, outerProf, {
    segments: SEG,
    thetaStart: th0,
    thetaLength: dth,
  });

  // Baglanti flansi (kanal 01'e civatalanir)
  const rf = rGas(x1) + DUCT_WALL;
  const flange = flangeWithBoltHoles(x1 - 6, 6, rf - 0.1, rf + 13, 3, rf + 7, BOLT, {
    thetaStart: th0,
    thetaLength: dth,
  });

  // Dilim birlesim kulaklari (radyal kesim yuzunde M4)
  const lugs = new MeshBuilder();
  for (const t of [th0, th0 + dth]) {
    for (const xl of [34, 74, 108]) {
      lugs.append(
        transformMesh(
          box([xl, 0, 0], [22, 9, 7]),
          multiply(rotationX(t), translation(0, rGas(xl) + DUCT_WALL + 4, 0)),
        ),
      );
    }
  }

  return merge(shell, flange, lugs.build());
}

// ---------------------------------------------------------------------------
// 2. Kanal (duct) parcalari
// ---------------------------------------------------------------------------

export interface DuctOpts {
  /** Uc bosluk astari yuvasi (rotor bolgesi). */
  abradableSeat?: boolean;
  /** Dis tarafta batarya/kaporta destek ayaklari. */
  standoffs?: number;
  /** Sertlestirme kaburgasi sayisi. */
  ribs?: number;
}

/** Dairesel kanal parcasi: kabuk + iki uc flansi + destekler. */
export function ductSegment(x0: number, x1: number, opts: DuctOpts = {}): MeshData {
  const innerProf = gas(x0, x1);
  const outerProf = offsetProfile(innerProf, DUCT_WALL);
  const shell = revolveShell(innerProf, outerProf, { segments: SEG });

  const rf0 = rGas(x0) + DUCT_WALL;
  const rf1 = rGas(x1) + DUCT_WALL;
  const fFwd = flangeWithBoltHoles(x0, 5, rf0 - 0.1, rf0 + 13, MANUFACTURING.flangeBolts, rf0 + 7, BOLT);
  const fAft = flangeWithBoltHoles(x1 - 5, 5, rf1 - 0.1, rf1 + 13, MANUFACTURING.flangeBolts, rf1 + 7, BOLT);

  const extras = new MeshBuilder();

  // Cevresel sertlestirme kaburgalari
  const nRibs = opts.ribs ?? 0;
  for (let i = 1; i <= nRibs; i++) {
    const x = x0 + ((x1 - x0) * i) / (nRibs + 1);
    const r = rGas(x) + DUCT_WALL;
    extras.append(revolveShell([[x - 3, r], [x + 3, r]], [[x - 3, r + 5], [x + 3, r + 5]], { segments: SEG }));
  }

  // Kaporta / batarya destek ayaklari
  const nStand = opts.standoffs ?? 0;
  for (let i = 0; i < nStand; i++) {
    const th = (i * Math.PI * 2) / nStand;
    for (const x of [x0 + 18, (x0 + x1) / 2, x1 - 18]) {
      const r = rGas(x) + DUCT_WALL;
      extras.append(radialCylinder(x, th, r - 1, r + 6, 9));
    }
  }

  // Asindirilabilir uc astari yuvasi (rotor bolgesi): ic yuzeyde 1 mm cukur
  if (opts.abradableSeat) {
    const xa = x0 + 8, xb = x1 - 8;
    const rIn = rGas((xa + xb) / 2);
    extras.append(
      revolveShell(
        [[xa, rIn + 0.4], [xb, rIn + 0.4]],
        [[xa, rIn + 1.4], [xb, rIn + 1.4]],
        { segments: SEG },
      ),
    );
  }

  return merge(shell, fFwd, fAft, extras.build());
}

// ---------------------------------------------------------------------------
// 3. Rotor (entegre kanatli disk / blisk)
// ---------------------------------------------------------------------------

/**
 * Tek parca rotor: gobek jantı + govde + kanatlar + gobek adaptor flansi.
 * Baski yonu: eksen dikey. Kanatlar agac destek ile basilir, sonra tavlanir.
 */
export function rotorBlisk(row: BladeRow, x0: number, x1: number): MeshData {
  const xMid = row.xMid;
  const rRimIn = 41;
  const rBore = 22.5; // O45 gobek adaptoru gecmesi
  const rBoss = 33;

  // Jant (kanat platformlarini tasiyan halka), uclarda pah
  const rimOuter: [number, number][] = [
    [x0, 45.5], [x0 + 3.5, 50], [x1 - 3.5, 50], [x1, 45.5],
  ];
  const rimInner: [number, number][] = [
    [x0, rRimIn], [x0 + 3.5, rRimIn], [x1 - 3.5, rRimIn], [x1, rRimIn],
  ];
  const rim = revolveShell(rimInner, rimOuter, { segments: 120 });

  // Govde: civata delikli disk (gobek adaptorune baglanir)
  const web = flangeWithBoltHoles(xMid - 4.5, 9, rBore, rRimIn + 0.5, 6, rBoss, BOLT, { layers: 4 });

  // Gobek burcu (mil hizalama yuzeyi)
  const boss = tubeX(x0 + 5, x1 - 5, rBore, rBore + 5.5, 48);

  // Kanatlar
  const blades = bladeArray(row, { rootFlare: 6.5, spanSections: 20, tipRound: true });

  // Denge agirligi yuvalari (dinamik balans icin)
  const balance = new MeshBuilder();
  for (let i = 0; i < 12; i++) {
    const th = (i * Math.PI * 2) / 12;
    balance.append(radialCylinder(x1 - 7, th, 36, 40.5, 5.2));
  }

  return merge(rim, web, boss, blades, balance.build());
}

/**
 * Islenmis aluminyum gobek adaptoru: O22 mil -> basili rotor (O45 delik).
 * Yarikli sikma burcu; kama kanali YOK (basili parcada kama yuvasi
 * catlak baslangici olur), torku surtunme + 6 x M4 ile aktarir.
 */
export function hubAdapter(xMid: number): MeshData {
  const rShaft = SHAFT.diameter / 2; // 11
  const b = new MeshBuilder();
  b.append(revolveShell(
    [[xMid - 17, rShaft], [xMid + 17, rShaft]],
    [[xMid - 17, 22.4], [xMid + 17, 22.4]],
    { segments: 64 },
  ));
  // Civata delikli flans (rotor govdesine baglanir)
  b.append(flangeWithBoltHoles(xMid - 5, 10, 22.2, 40, 6, 33, BOLT, { layers: 4 }));
  // Sikma yariklari: 3 adet radyal kesik gorseli
  for (let i = 0; i < 3; i++) {
    const th = (i * Math.PI * 2) / 3;
    b.append(transformMesh(box([xMid - 11, 17, 0], [12, 12, 1.6]), rotationX(th)));
  }
  return b.build();
}

/** Sikma kaplin: fan mili (O20 journal) -> motor mili (O12). */
export function coupling(): MeshData {
  const x0 = COUPLING.x;
  const x1 = x0 + COUPLING.length;
  const b = new MeshBuilder();
  b.append(revolveShell(
    [[x0, 6], [x0 + COUPLING.length / 2, 6], [x0 + COUPLING.length / 2, 10], [x1, 10]],
    [[x0, COUPLING.od / 2], [x1, COUPLING.od / 2]],
    { segments: 48 },
  ));
  // Sikma civatalari
  for (const xb of [x0 + 7, x1 - 7]) {
    for (let i = 0; i < 2; i++) {
      b.append(radialCylinder(xb, i * Math.PI, 12, COUPLING.od / 2 + 3, 5));
    }
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// 4. Stator (tek parca: halka + kanatciklar + ic govde)
// ---------------------------------------------------------------------------

export interface StatorOpts {
  /** Ic govdede yatak yuvasi. */
  bearingSeat?: BearingSeat;
  /** Arka yuzde motor baglanti flansi. */
  motorFlange?: boolean;
  /** Yapisal: itki yukunu kaportaya aktaran dis flans. */
  thrustFlange?: boolean;
}

export interface BearingSeat {
  x: number;
  od: number;
  width: number;
}

/**
 * Stator kademesi — TEK PARCA basilir (halka + kanatciklar + ic govde).
 * Kanatcik acisi eksenden 10-30° oldugu icin eksen dikey basildiginda
 * destek gerektirmez; yuk yolu kesintisizdir.
 */
export function statorAssembly(row: BladeRow, x0: number, x1: number, opts: StatorOpts = {}): MeshData {
  const innerProf = gas(x0, x1);
  const outerProf = offsetProfile(innerProf, DUCT_WALL);
  const ring = revolveShell(innerProf, outerProf, { segments: SEG });

  const rf0 = rGas(x0) + DUCT_WALL;
  const rf1 = rGas(x1) + DUCT_WALL;
  const fFwd = flangeWithBoltHoles(x0, 5, rf0 - 0.1, rf0 + 13, MANUFACTURING.flangeBolts, rf0 + 7, BOLT);
  const fAft = flangeWithBoltHoles(x1 - 5, 5, rf1 - 0.1, rf1 + 13, MANUFACTURING.flangeBolts, rf1 + 7, BOLT);

  // Kanatciklar: uc, kanal cidarinin 3.5 mm icine gomulur
  const vanes = bladeArray(row, {
    rootFlare: 7,
    spanSections: 16,
    tipRound: false,
    tipExtend: 3.5,
  });

  // Ic govde (gobek kilifi)
  const xa = Math.max(x0 + 4, row.xMid - 36);
  const xb = Math.min(x1 - 4, row.xMid + 36);
  const hubShroud = revolveShell(
    [[xa, 41], [xa + 4, 41], [xb - 4, 41], [xb, 41]],
    [[xa, 45], [xa + 4, 50], [xb - 4, 50], [xb, 45]],
    { segments: 96 },
  );

  const extras = new MeshBuilder();

  // Yatak yuvasi + kollar (spokes)
  if (opts.bearingSeat) {
    const s = opts.bearingSeat;
    const rSeat = s.od / 2;
    extras.append(tubeX(s.x - s.width / 2 - 4, s.x + s.width / 2 + 4, rSeat, rSeat + 5, 48));
    // 6 radyal kol: yatak yuvasini ic govdeye baglar
    for (let i = 0; i < 6; i++) {
      const th = (i * Math.PI * 2) / 6;
      extras.append(
        transformMesh(
          box([s.x, (rSeat + 5 + 41) / 2, 0], [16, 41 - rSeat - 5, 5]),
          rotationX(th),
        ),
      );
    }
  }

  // Motor baglanti flansi (arka ic yuz)
  if (opts.motorFlange) {
    extras.append(flangeWithBoltHoles(x1 - 12, 7, 20, 41, 8, 30, 5.3, { layers: 3 }));
  }

  // Itki flansi: yuku dis kaportaya / pilona aktarir.
  // Dis cap 252 mm'de tutuldu -> 256 mm baski tablasina sigar.
  if (opts.thrustFlange) {
    const xm = (x0 + x1) / 2;
    const rOut = rGas(xm) + DUCT_WALL;
    extras.append(flangeWithBoltHoles(xm - 4, 8, rOut - 0.1, rOut + 22, 10, rOut + 14, 5.3));
    for (let i = 0; i < 10; i++) {
      const th = (i * Math.PI * 2) / 10;
      extras.append(transformMesh(box([xm, rOut + 11, 0], [26, 22, 6]), rotationX(th)));
    }
  }

  return merge(ring, fFwd, fAft, vanes, hubShroud, extras.build());
}

// ---------------------------------------------------------------------------
// 5. Spinner (burun konisi)
// ---------------------------------------------------------------------------

export function spinner(x0 = 150, x1 = 248): MeshData {
  const xSolid = x0 + 42; // uc kisim dolu, arkasi kabuk

  // Dolu burun ve kabuk TEK govde olarak devrilir: ic yuzey x=xSolid'de
  // eksene (r=0) iner, boylece onundeki bolge dolu kalir. Ayri govde olarak
  // uretilseler x=xSolid'de AYNI kose halkasini paylasir, o halkanin
  // kenarlari 4 ucgen tarafindan kullanilir ve mesh manifold olmaz.
  const outerProf = core(x0, x1);
  const innerProf: [number, number][] = [
    [xSolid, 0],
    ...offsetProfile(core(xSolid, x1), -3.0),
  ];
  const shell = revolveShell(innerProf, outerProf, { segments: 96 });

  // Rotor 1'e baglanma flansi
  const flange = flangeWithBoltHoles(x1 - 8, 8, 24, 44, 6, 33, BOLT, { layers: 3 });
  const lip = tubeX(x1 - 8, x1, 44, 47.6, 96);

  return merge(shell, flange, lip);
}

// ---------------------------------------------------------------------------
// 6. Cekirdek kilifi ve kuyruk konisi
// ---------------------------------------------------------------------------

/** Motor bolmesini kapatan cekirdek kilifi — 2 yarim halinde. */
export function coreFairingHalf(x0: number, x1: number, index = 0): MeshData {
  const outerProf = core(x0, x1);
  const innerProf = offsetProfile(outerProf, -3.2);
  const shell = revolveShell(innerProf, outerProf, {
    segments: 96,
    thetaStart: index * Math.PI,
    thetaLength: Math.PI,
  });

  // Sogutma havasi girisi: 3 sirada isinsal delik yerine kanatli panjur
  const louvers = new MeshBuilder();
  for (let i = 0; i < 7; i++) {
    const th = index * Math.PI + 0.22 + (i * (Math.PI - 0.44)) / 6;
    for (const x of [x0 + 22, x0 + 46, x0 + 70]) {
      louvers.append(transformMesh(box([x, 47, 0], [14, 7, 3]), rotationX(th)));
    }
  }

  // Birlesim kulaklari
  const lugs = new MeshBuilder();
  for (const t of [index * Math.PI, (index + 1) * Math.PI]) {
    for (const xl of [x0 + 14, (x0 + x1) / 2, x1 - 14]) {
      lugs.append(
        transformMesh(box([xl, 0, 0], [20, 8, 6]), multiply(rotationX(t), translation(0, 44, 0))),
      );
    }
  }
  return merge(shell, louvers.build(), lugs.build());
}

/** Kuyruk konisi parcasi. Son parcada uc dolu basilir. */
export function tailCone(x0: number, x1: number, closeTip = false): MeshData {
  const outerProf = core(x0, x1);
  if (closeTip) {
    const xSolid = x1 - 34;
    // Kabuk ve dolu uc TEK govde: dis yuzey konisin ucuna kadar gider, ic
    // yuzey x=xSolid'de eksene (r=0) iner. Boylece son 34 mm dolu kalir.
    // Ayri govdeler x=xSolid'de ayni kose halkasini paylasip manifold
    // olmayan kenar olustururdu.
    const shellInner: [number, number][] = [
      ...offsetProfile(core(x0, xSolid), -3.0),
      [xSolid, 0],
    ];
    const shell = revolveShell(shellInner, outerProf, { segments: 96 });
    return merge(shell, tubeX(x0, x0 + 7, rCore(x0) - 6.6, rCore(x0) - 3.2, 96));
  }
  const innerProf = offsetProfile(outerProf, -3.0);
  const shell = revolveShell(innerProf, outerProf, { segments: 96 });
  const joint = tubeX(x1 - 8, x1, rCore(x1) - 6.4, rCore(x1) - 3.2, 96);
  const flange = flangeWithBoltHoles(x0, 5, rCore(x0) - 14, rCore(x0) - 3.4, 6, rCore(x0) - 8.5, BOLT);
  return merge(shell, joint, flange);
}

// ---------------------------------------------------------------------------
// 7. Motor, mil, yataklar (COTS referans geometrileri)
// ---------------------------------------------------------------------------

export function motorAssembly(): MeshData {
  const x0 = MOTOR.xFront;
  const x1 = x0 + MOTOR.canLength;
  const rCan = MOTOR.canOD / 2;
  const b = new MeshBuilder();

  // Donen kampana (bell)
  b.append(revolveSolid(
    [
      [x0, 12], [x0 + 2, rCan - 2], [x0 + 5, rCan], [x1 - 14, rCan],
      [x1 - 12, rCan - 1], [x1 - 12, 30],
    ],
    { segments: 72 },
  ));
  // Havalandirma delikleri yerine cevresel kanallar
  for (let i = 0; i < 12; i++) {
    const th = (i * Math.PI * 2) / 12;
    b.append(transformMesh(box([x0 + 16, rCan - 1, 0], [18, 3.2, 7]), rotationX(th)));
  }
  // Stator paketi (sabit)
  b.append(tubeX(x0 + 14, x1 - 16, 26, MOTOR.statorOD / 2 - 3, 64));
  // Sargilar
  b.append(polarArray(
    transformMesh(box([(x0 + x1) / 2 - 1, 33, 0], [MOTOR.statorStack - 8, 12, 7.4]), rotationX(0)),
    MOTOR.slots,
  ));
  // On montaj flansi (OGV ic govdesine civatalanir)
  b.append(flangeWithBoltHoles(x0 + 2, 8, 14, 34, 8, 24.5, 5.3, { layers: 3 }));
  // Motorun kendi mili — one dogru cikip kapline girer
  b.append(cylinderX(x0 - 20, x1 - 24, MOTOR.shaftDia / 2, MOTOR.shaftDia / 2, 28));
  return b.build();
}

/**
 * Ana fan mili: O22 x 4 mm boru, uclarda O20 islenmis yatak yuzeyleri.
 * Yatak konumlarinda omuz (segman yuvasi) vardir.
 */
export function shaft(): MeshData {
  const x0 = SHAFT.xStart;
  const x1 = x0 + SHAFT.length;
  const rO = SHAFT.diameter / 2; // 11
  const rJ = SHAFT.journalDia / 2; // 10
  const rI = rO - SHAFT.wall; // 7

  const outer: [number, number][] = [];
  const push = (x: number, r: number) => outer.push([x, r]);
  push(x0, rJ - 0.6);
  push(x0 + 2, rJ);
  for (const bs of BEARINGS) {
    push(bs.x - bs.width / 2 - 8, rJ);
    push(bs.x - bs.width / 2 - 8, rO); // omuz
    push(bs.x - bs.width / 2 - 1, rO);
    push(bs.x - bs.width / 2 - 1, rJ);
    push(bs.x + bs.width / 2 + 1, rJ);
    push(bs.x + bs.width / 2 + 1, rO);
    push(bs.x + bs.width / 2 + 8, rO);
    push(bs.x + bs.width / 2 + 8, rJ);
  }
  push(x1 - 2, rJ);
  push(x1, rJ - 0.6);
  outer.sort((a, b) => a[0] - b[0]);

  return revolveShell(
    [[x0, rI], [x1, rI]],
    outer,
    { segments: 40 },
  );
}

export function bearing(index: number): MeshData {
  const bs = BEARINGS[index];
  const b = new MeshBuilder();
  const x0 = bs.x - bs.width / 2;
  const x1 = bs.x + bs.width / 2;
  b.append(tubeX(x0, x1, bs.bore / 2, bs.bore / 2 + 3.2, 48)); // ic bilezik
  b.append(tubeX(x0, x1, bs.od / 2 - 3.2, bs.od / 2, 48)); // dis bilezik
  b.append(tubeX(x0 + 1.2, x1 - 1.2, bs.bore / 2 + 3.4, bs.od / 2 - 3.4, 48)); // conta
  return b.build();
}

/** Islenmis aluminyum yatak yuvasi. */
export function bearingHousing(index: number): MeshData {
  const bs = BEARINGS[index];
  const rIn = bs.od / 2;
  const x0 = bs.x - bs.width / 2 - 3;
  const x1 = bs.x + bs.width / 2 + 3;
  return merge(
    tubeX(x0, x1, rIn, rIn + 4.5, 48),
    flangeWithBoltHoles(x0, 4, rIn, rIn + 14, 4, rIn + 8, BOLT, { layers: 3 }),
    torusX(x1 - 1.6, rIn + 1.0, 1.0, 48, 8), // segman yuvasi gorseli
  );
}

// ---------------------------------------------------------------------------
// 8. Batarya modulleri
// ---------------------------------------------------------------------------

const TRAY_R_IN = 105;
const TRAY_R_OUT = 132;
const CELL_HOLE = CELL.diameter + 0.4;

/**
 * Batarya hucre tasiyici dilimi: iki uc plakasi (6 gercek hucre deligi)
 * + ic/dis cidar + busbar kanali.
 */
export function batteryTray(moduleIndex: number, trayIndex: number): MeshData {
  const x0 = PACK.moduleX[moduleIndex];
  const L = PACK.moduleLength;
  const dth = (Math.PI * 2) / PACK.traysPerModule;
  const th0 = trayIndex * dth;
  const n = PACK.cellsPerTray;

  const plateFwd = flangeWithBoltHoles(x0, 3.2, TRAY_R_IN, TRAY_R_OUT, n, PACK.ringRadius, CELL_HOLE, {
    thetaStart: th0,
    thetaLength: dth,
    holeSeg: 20,
    layers: 3,
  });
  const plateMid = flangeWithBoltHoles(x0 + L / 2 - 1.6, 3.2, TRAY_R_IN, TRAY_R_OUT, n, PACK.ringRadius, CELL_HOLE, {
    thetaStart: th0,
    thetaLength: dth,
    holeSeg: 20,
    layers: 3,
  });
  const plateAft = flangeWithBoltHoles(x0 + L - 3.2, 3.2, TRAY_R_IN, TRAY_R_OUT, n, PACK.ringRadius, CELL_HOLE, {
    thetaStart: th0,
    thetaLength: dth,
    holeSeg: 20,
    layers: 3,
  });

  // Ic ve dis cidarlar
  const inner = revolveShell(
    [[x0, TRAY_R_IN], [x0 + L, TRAY_R_IN]],
    [[x0, TRAY_R_IN + 2.4], [x0 + L, TRAY_R_IN + 2.4]],
    { segments: SEG, thetaStart: th0, thetaLength: dth },
  );
  const outer = revolveShell(
    [[x0, TRAY_R_OUT - 2.4], [x0 + L, TRAY_R_OUT - 2.4]],
    [[x0, TRAY_R_OUT], [x0 + L, TRAY_R_OUT]],
    { segments: SEG, thetaStart: th0, thetaLength: dth },
  );

  // Baglanti kulaklari
  const lugs = new MeshBuilder();
  for (const t of [th0 + 0.02, th0 + dth - 0.02]) {
    for (const xl of [x0 + 12, x0 + L / 2, x0 + L - 12]) {
      lugs.append(transformMesh(box([xl, TRAY_R_IN + 8, 0], [14, 14, 5]), rotationX(t)));
    }
  }

  return merge(plateFwd, plateMid, plateAft, inner, outer, lugs.build());
}

/** Tek 21700 hucre, montaj konumunda. */
export function batteryCell(moduleIndex: number, cellIndex: number): MeshData {
  const x0 = PACK.moduleX[moduleIndex] + 3.2;
  const cell = revolveSolid(
    [
      [x0, 0], [x0, CELL.diameter / 2 - 1], [x0 + 0.8, CELL.diameter / 2],
      [x0 + CELL.height - 0.8, CELL.diameter / 2], [x0 + CELL.height, CELL.diameter / 2 - 1],
      [x0 + CELL.height, 0],
    ],
    { segments: 24 },
  );
  const th = (cellIndex * Math.PI * 2) / PACK.cellsPerModule + Math.PI / PACK.cellsPerModule;
  return transformMesh(cell, multiply(rotationX(th), translation(0, PACK.ringRadius, 0)));
}

/** Nikel serit busbar halkasi (modul basina 2 adet: + ve -). */
export function busbarRing(moduleIndex: number, side: 0 | 1): MeshData {
  const x0 = PACK.moduleX[moduleIndex];
  const x = side === 0 ? x0 + 1.4 : x0 + PACK.moduleLength - 2.6;
  const b = new MeshBuilder();
  // Segmentli halka: 20S6P icin seri gruplar arasi atlamali baglanti
  for (let g = 0; g < PACK.series / PACK.modules; g++) {
    const th0 = (g * Math.PI * 2) / (PACK.series / PACK.modules);
    const dth = (Math.PI * 2) / (PACK.series / PACK.modules) - 0.09;
    b.append(revolveShell(
      [[x, PACK.ringRadius - 7], [x + 1.2, PACK.ringRadius - 7]],
      [[x, PACK.ringRadius + 7], [x + 1.2, PACK.ringRadius + 7]],
      { segments: 96, thetaStart: th0, thetaLength: dth },
    ));
  }
  return b.build();
}

/** BMS + kontaktor kutusu. */
export function bmsBox(): MeshData {
  const x = 660;
  const b = new MeshBuilder();
  const body = roundedBox([x, 0, 0], [124, 46, 74], 6);
  b.append(transformMesh(body, translation(0, 118, 0)));
  // Sogutucu kanatciklari
  for (let i = 0; i < 9; i++) {
    b.append(transformMesh(
      box([x - 52 + i * 13, 0, 0], [5, 9, 66]),
      translation(0, 118 + 27, 0),
    ));
  }
  // Konnektor
  b.append(transformMesh(cylinderX(x + 62, x + 74, 11, 11, 24), translation(0, 118, 0)));
  return b.build();
}

// ---------------------------------------------------------------------------
// 9. ESC ve elektronik
// ---------------------------------------------------------------------------

export function escUnit(index: number): MeshData {
  const th = index === 0 ? (Math.PI * 2) / 3 : (Math.PI * 4) / 3;
  const xMid = 540;
  const [L, W, H] = ESC.size;
  const b = new MeshBuilder();
  b.append(roundedBox([xMid, 0, 0], [L, H, W], 4));
  // Sogutucu: 14 kanatcik
  for (let i = 0; i < 14; i++) {
    b.append(box([xMid - L / 2 + 6 + i * 7.2, H / 2 + 7, 0], [3.4, 15, W - 6]));
  }
  // Kablo cikislari
  for (const dz of [-16, 0, 16]) {
    b.append(transformMesh(cylinderX(xMid + L / 2, xMid + L / 2 + 14, 5.5, 5.5, 20), translation(0, 0, dz)));
  }
  const local = b.build();
  return transformMesh(local, multiply(rotationX(th), translation(0, 118, 0)));
}

/** Guc dagitim ve sensor halkasi. */
export function avionicsRing(): MeshData {
  const x = 612;
  const b = new MeshBuilder();
  b.append(revolveShell(
    [[x, 106], [x + 18, 106]],
    [[x, 112], [x + 18, 112]],
    { segments: 96 },
  ));
  // Sensorler: 8 adet termokupl / devir sensoru braketi
  for (let i = 0; i < 8; i++) {
    const th = (i * Math.PI * 2) / 8;
    b.append(transformMesh(box([x + 9, 116, 0], [12, 14, 8]), rotationX(th)));
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// 10. Dis kaporta panelleri
// ---------------------------------------------------------------------------

/** Nacelle dis kaporta paneli (120° dilim). */
export function skinPanel(x0: number, x1: number, index: number, count = 3): MeshData {
  const th0 = (index * Math.PI * 2) / count;
  const dth = (Math.PI * 2) / count;
  const outerProf = nac(x0, x1);
  const innerProf = offsetProfile(outerProf, -SKIN_WALL);
  const shell = revolveShell(innerProf, outerProf, {
    segments: SEG,
    thetaStart: th0,
    thetaLength: dth,
  });

  // Ic sertlestirme kaburgalari + baglanti kulaklari
  const extras = new MeshBuilder();
  for (const xr of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.5, x0 + (x1 - x0) * 0.75]) {
    const r = rNac(xr) - SKIN_WALL;
    // Kaburganin dis ucu panel cidarinin 0.4 mm icine girer: aksi halde
    // kaburga kabugu panelin ic yuzeyine TAM oturur, ayni koseleri paylasir
    // ve o kenarlar 4 ucgen tarafindan kullanilir. Serbest kaburga
    // yuksekligi (6 mm) degismez.
    extras.append(revolveShell(
      [[xr - 2, r - 6], [xr + 2, r - 6]],
      [[xr - 2, r + 0.4], [xr + 2, r + 0.4]],
      { segments: SEG, thetaStart: th0, thetaLength: dth },
    ));
  }
  for (const t of [th0 + 0.015, th0 + dth - 0.015]) {
    for (const xl of [x0 + 20, (x0 + x1) / 2, x1 - 20]) {
      const r = rNac(xl) - SKIN_WALL;
      extras.append(transformMesh(box([xl, r - 5, 0], [26, 10, 6]), rotationX(t)));
    }
  }
  return merge(shell, extras.build());
}

// ---------------------------------------------------------------------------
// 11. Nozul
// ---------------------------------------------------------------------------

/** Cift cidarli yakinsak nozul parcasi (120° dilim). */
export function nozzleSegment(x0: number, x1: number, index: number, closeTE = false): MeshData {
  const th0 = (index * Math.PI * 2) / 3;
  const dth = (Math.PI * 2) / 3;

  const gasIn = gas(x0, x1);
  const gasOut = offsetProfile(gasIn, 3.4);
  const gasShell = revolveShell(gasIn, gasOut, { segments: SEG, thetaStart: th0, thetaLength: dth });

  const skinOut = nac(x0, x1);
  const skinIn = offsetProfile(skinOut, -SKIN_WALL);
  const skinShell = revolveShell(skinIn, skinOut, { segments: SEG, thetaStart: th0, thetaLength: dth });

  // Iki cidari baglayan radyal kaburgalar
  const ribs = new MeshBuilder();
  for (let i = 0; i <= 4; i++) {
    const th = th0 + (dth * i) / 4;
    for (const xr of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) {
      ribs.append(radialCylinder(xr, th, rGas(xr) + 3.0, rNac(xr) - SKIN_WALL + 0.4, 7));
    }
  }

  // Firar kenari kapanis halkasi. Iki cidar x>x1-6'da zaten radyal olarak
  // ust uste bindigi icin bu halka dis yuzeyi belirlemez; uclari komsu
  // cidarlarin 0.4 mm ICINE gomulur ki kabuklar ayni kose halkasini
  // paylasmayip ic ice gecsin (kaburgalarda da ayni yontem kullanilir).
  const te = closeTE
    ? revolveShell(
        [[x1 - 6, rGas(x1 - 6) + 3.0], [x1, rGas(x1) + 0.4]],
        [[x1 - 6, rNac(x1 - 6) - 0.4], [x1, rNac(x1) - 0.4]],
        { segments: SEG, thetaStart: th0, thetaLength: dth },
      )
    : null;

  // Flans
  const rf = rGas(x0) + 3.4;
  const flange = flangeWithBoltHoles(x0, 5, rf - 0.1, rf + 12, 4, rf + 6.5, BOLT, {
    thetaStart: th0,
    thetaLength: dth,
  });

  return merge(gasShell, skinShell, ribs.build(), te, flange);
}

// ---------------------------------------------------------------------------
// 12. Tasiyici yapi: pilon, yuk halkasi, ayaklar
// ---------------------------------------------------------------------------

/**
 * Itki yukunu tasiyan dis halka (OGV flansini kaportaya baglar).
 *
 * Dis capi 277 mm oldugu icin 256 mm'lik baski tablasina TEK PARCA SIGMAZ;
 * bu yuzden 120°'lik 3 dilim halinde basilir ve bolme duzlemlerinde
 * 2x M5 ile birlestirilir. 120° yayin kirisi 2*139*sin(60°) = 241 mm,
 * sehimi 70 mm -> tabla izdusumu 241 x 70 mm, rahatca sigar.
 */
export function mountRingHalf(index = 0, count = 3): MeshData {
  const x = 474;
  const th0 = (index * Math.PI * 2) / count;
  const dth = (Math.PI * 2) / count;
  const b = new MeshBuilder();
  const revOpt = { segments: 48, thetaStart: th0, thetaLength: dth, caps: true };
  b.append(revolveShell(
    [[x - 14, 108], [x + 14, 108]],
    [[x - 14, 116], [x + 14, 116]],
    revOpt,
  ));
  // Radyal kollar -> kaporta ic yuzeyi. 12 kol: 3 dilime tam bolunur ve
  // 12E tahrik mertebesi zaten flans civatalarindan mevcut (yeni mertebe yok).
  const nArms = 12;
  for (let i = 0; i < nArms; i++) {
    const th = (i * Math.PI * 2) / nArms;
    // sadece bu yarim halkaya dusen kollar
    const rel = ((th - th0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (rel > dth - 1e-6) continue;
    b.append(transformMesh(box([x, 127, 0], [24, 24, 7]), rotationX(th)));
  }
  b.append(revolveShell(
    [[x - 12, 134], [x + 12, 134]],
    [[x - 12, 138.6], [x + 12, 138.6]],
    revOpt,
  ));
  b.append(flangeWithBoltHoles(x - 4, 8, 104, 112, Math.round(12 / count), 108.5, 5.3, {
    thetaStart: th0,
    thetaLength: dth,
  }));
  // Bolme duzlemi kulaklari: 2x M5 her uctan
  for (const th of [th0, th0 + dth]) {
    for (const r of [112, 130]) {
      b.append(transformMesh(box([x, r, 9], [26, 14, 10]), rotationX(th)));
    }
  }
  return b.build();
}

/**
 * Ust montaj pilonu — itki yukunu olcum tezgahina / govdeye aktarir.
 * Kesit: simetrik NACA 0018 benzeri profil, yaricapla hafif daralan veter.
 * Bu, motorun kendi itkisinin (174 N) + jiroskopik momentlerin tasindigi
 * ana yapisal elemandir.
 */
export function mountPylon(): MeshData {
  const xMid = 474;
  const rRoot = 134;
  const rTop = 216;
  const nSec = 12;
  const sections: Vec3[][] = [];
  for (let i = 0; i <= nSec; i++) {
    const t = i / nSec;
    const y = rRoot + (rTop - rRoot) * t;
    const c = 190 * (1 - 0.2 * t);
    const contour = airfoilContour({
      chord: c,
      thickness: 0.18 - 0.04 * t,
      camber: 0,
      points: 26,
      teThickness: 1.6,
    });
    sections.push(contour.map(([s, n]) => [xMid + s, y, n] as Vec3));
  }
  const strut = loftSections(sections, true, true);

  const b = new MeshBuilder();
  b.append(strut);
  // Ust baglanti plakasi + 4 civata burcu (gecen delikli)
  b.append(transformMesh(roundedBox([xMid, 0, 0], [206, 11, 96], 8), translation(0, rTop + 5, 0)));
  for (const dx of [-76, -26, 26, 76]) {
    for (const dz of [-34, 34]) {
      b.append(transformMesh(
        tubeX(rTop - 1, rTop + 12, 3.2, 6.4, 20),
        multiply(translation(xMid + dx, 0, dz), rotationZ(Math.PI / 2)),
      ));
    }
  }
  // Kok kavisi: kaporta yuzeyine yumusak gecis
  for (let i = 0; i < 6; i++) {
    const w = 190 - i * 8;
    b.append(transformMesh(
      box([xMid, 0, 0], [w, 4, 40 + i * 9]),
      translation(0, rRoot + 2 + i * 3.5, 0),
    ));
  }
  return b.build();
}

/** Yer testi ayagi. */
export function standFoot(index: number): MeshData {
  const x = index === 0 ? 260 : 660;
  const b = new MeshBuilder();
  b.append(transformMesh(box([x, 0, 0], [70, 120, 46]), translation(0, -190, 0)));
  b.append(transformMesh(box([x, 0, 0], [150, 12, 120]), translation(0, -256, 0)));
  b.append(transformMesh(box([x, 0, 0], [48, 60, 34]), translation(0, -145, 0)));
  return b.build();
}

// ---------------------------------------------------------------------------
// 13. Yabanci madde koruma izgarasi (FOD screen)
// ---------------------------------------------------------------------------

export function fodScreen(index = 0): MeshData {
  const x = 104;
  const b = new MeshBuilder();
  const rOuter = rGas(x) - 1;
  const halfStart = index * Math.PI;

  // Cevresel halkalar
  for (const R of [rOuter, rOuter * 0.72, rOuter * 0.45, rOuter * 0.2]) {
    const seg = Math.max(24, Math.round(R * 1.2));
    b.append(revolveShell(
      [[x - 1.4, R - 1.4], [x + 1.4, R - 1.4]],
      [[x - 1.4, R], [x + 1.4, R]],
      { segments: seg, thetaStart: halfStart, thetaLength: Math.PI },
    ));
  }
  // Isinsal teller
  const nSpokes = 12;
  for (let i = 0; i <= nSpokes; i++) {
    const th = halfStart + (i * Math.PI) / nSpokes;
    b.append(radialCylinder(x, th, 6, rOuter, 2.6));
  }
  // Merkez gobek
  b.append(cylinderX(x - 2, x + 2, 7, 7, 24));
  // Kanal flansina baglanti kulaklari
  for (const t of [halfStart + 0.05, halfStart + Math.PI - 0.05]) {
    b.append(transformMesh(box([x, rOuter - 6, 0], [14, 14, 6]), rotationX(t)));
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// 14. Conta / titresim yalitim halkalari
// ---------------------------------------------------------------------------

export function gasketRing(x: number, rIn: number): MeshData {
  return revolveShell(
    [[x, rIn], [x + 1.6, rIn]],
    [[x, rIn + 12], [x + 1.6, rIn + 12]],
    { segments: 96 },
  );
}

/** Rotor uc bosluk astari (asindirilabilir halka). */
export function abradableLiner(x0: number, x1: number): MeshData {
  const rIn = rGas((x0 + x1) / 2);
  return revolveShell(
    [[x0, rIn + 0.4], [x1, rIn + 0.4]],
    [[x0, rIn + 1.4], [x1, rIn + 1.4]],
    { segments: SEG },
  );
}

/** Tek kanat (yedek parca olarak ayri basim / analiz gorseli). */
export function singleBlade(row: BladeRow): MeshData {
  return bladeSolid(row, { rootFlare: 6.5, spanSections: 22, tipRound: row.kind === 'rotor' });
}
