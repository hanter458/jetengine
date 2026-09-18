/**
 * Tasarim dogrulama raporu.
 * =========================
 *   npm run report
 *
 * Tum modelleri calistirip sonuclari terminale doker. Bir sayiyi
 * degistirdiginizde neyin bozuldugunu gormek icin kullanin.
 */

import {
  BLADE_ROWS,
  ENGINE_NAME,
  ENGINE_REV,
  MANUFACTURING,
  PACK_CAPACITY_MAH,
  PACK_CELL_COUNT,
  PACK_ENERGY_WH,
  PACK_I_MAX,
  PACK_RESISTANCE,
  PACK_V_MAX,
  PACK_V_MIN,
  PACK_V_NOM,
  TOTAL_LENGTH,
} from '../src/engine/spec';
import { allMetrics, massBudget, PARTS, partMetrics } from '../src/engine/parts';
import { aspectRatio, solidity } from '../src/engine/geom/blade';
import {
  A_ANNULUS,
  A_EXIT,
  AREA_RATIO,
  geometricMeanBladeAngle,
  N_STAGES,
  R_MEAN,
  TAN_BETA2,
} from '../src/engine/physics/fan';
import { SCENARIOS, simulate, SIM_DEFAULT } from '../src/engine/physics/simulate';
import { meshDiagnostics } from '../src/engine/exporters/stl';
import { AIRFRAMES } from '../src/engine/spec';

const line = (c = '─') => console.log(c.repeat(78));
const hdr = (s: string) => {
  console.log();
  line('═');
  console.log(`  ${s}`);
  line('═');
};
const row = (k: string, v: string | number, unit = '') => {
  const val = typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(3)) : v;
  console.log(`  ${k.padEnd(44, '.')} ${String(val).padStart(14)} ${unit}`);
};

// ---------------------------------------------------------------------------
hdr(`${ENGINE_NAME} ${ENGINE_REV} — TASARIM DOGRULAMA RAPORU`);

row('Toplam uzunluk', TOTAL_LENGTH, 'mm');
row('Fan halka alani A_fan', A_ANNULUS * 1e4, 'cm²');
row('Nozul cikis alani A9', A_EXIT * 1e4, 'cm²');
row('Alan orani A9/A_fan', AREA_RATIO);
row('Ortalama yaricap', R_MEAN * 1000, 'mm');
row('Kademe sayisi', N_STAGES);
row('Kalibre edilmis tan(beta2)', TAN_BETA2);
row('  -> beta2', (Math.atan(TAN_BETA2) * 180) / Math.PI, '°');
row('Kanat geometrik ort. metal acisi', geometricMeanBladeAngle(), '°');
console.log();
console.log('  TUTARLILIK KONTROLU: kalibre beta2 ile kanat metal acisi');
console.log('  birbirine yakin olmali (aero model geometriyle uyumlu mu?).');

// ---------------------------------------------------------------------------
hdr('KANAT SIRALARI');
for (const r of BLADE_ROWS) {
  console.log(`\n  ${r.id} — ${r.label}`);
  row('  kanat sayisi', r.count);
  row('  x konumu', r.xMid, 'mm');
  row('  veter (kok/uc)', `${r.chordRoot} / ${r.chordTip}`, 'mm');
  row('  aci (kok/uc)', `${r.pitchRoot} / ${r.pitchTip}`, '°');
  row('  en-boy orani (AR)', aspectRatio(r));
  row('  kati (solidity)', solidity(r));
}

// ---------------------------------------------------------------------------
hdr('BATARYA PAKETI');
row('Konfigurasyon', '20S6P 21700');
row('Hucre sayisi', PACK_CELL_COUNT);
row('KAPASITE', PACK_CAPACITY_MAH, 'mAh');
row('Nominal / maks / min gerilim', `${PACK_V_NOM} / ${PACK_V_MAX} / ${PACK_V_MIN}`, 'V');
row('Enerji', PACK_ENERGY_WH, 'Wh');
row('Maks. surekli akim', PACK_I_MAX, 'A');
row('Maks. guc', (PACK_I_MAX * PACK_V_NOM) / 1000, 'kW');
row('Ic direnc', PACK_RESISTANCE * 1000, 'mΩ');

// ---------------------------------------------------------------------------
hdr('KUTLE BUTCESI (gercek mesh hacminden)');
const mb = massBudget();
for (const g of mb.byGroup) {
  row(g.label, g.mass / 1000, 'kg');
}
line();
row('Basili (FDM)', mb.printedMass / 1000, 'kg');
row('Islenmis (CNC)', mb.machinedMass / 1000, 'kg');
row('Hazir alinan (COTS)', mb.cotsMass / 1000, 'kg');
row('TOPLAM MOTOR KUTLESI', mb.totalMass / 1000, 'kg');
row('Basili malzeme hacmi', mb.printedVolumeCm3, 'cm³');
row('Farkli parca tipi', mb.partTypes);
row('Fiziksel parca sayisi', mb.physicalPieces);
row('Tahmini malzeme maliyeti', mb.totalCost, 'TL');

// ---------------------------------------------------------------------------
hdr('PARCA LISTESI — GEOMETRI DOGRULAMASI');
console.log(
  '  ' +
    'KIMLIK'.padEnd(18) +
    'ADET'.padStart(5) +
    'KUTLE(g)'.padStart(10) +
    'ÖLÇÜ (mm)'.padStart(24) +
    'ÜÇGEN'.padStart(9) +
    '  SIĞAR',
);
line();
let totalTris = 0;
let overSize = 0;
for (const m of allMetrics()) {
  totalTris += m.triangles * m.def.qty;
  if (!m.fitsBuildVolume) overSize++;
  const size = m.size.map((s) => s.toFixed(0)).join('×');
  console.log(
    '  ' +
      m.def.id.padEnd(18) +
      String(m.def.qty).padStart(5) +
      m.massEach.toFixed(1).padStart(10) +
      size.padStart(24) +
      String(m.triangles).padStart(9) +
      '  ' +
      (m.fitsBuildVolume ? '✓' : '✗ BUYUK'),
  );
}
line();
row('Toplam ucgen (tum montaj)', totalTris);
row(`Baski hacmine sigmayan parca (${MANUFACTURING.buildVolume.join('×')} mm)`, overSize);

// ---------------------------------------------------------------------------
hdr('MESH KALITE KONTROLU (su gecirmezlik)');
console.log('  Basilacak parcalarin kapali hacim olusturup olusturmadigi:');
line();
for (const p of PARTS.filter((x) => x.process === 'FDM').slice(0, 40)) {
  const d = meshDiagnostics(p.build());
  const pm = partMetrics(p);
  const status = d.watertight ? '✓ kapali' : `${d.openEdges} acik kenar`;
  console.log(
    '  ' +
      p.id.padEnd(18) +
      `${d.triangles} ucgen`.padStart(14) +
      `${(pm.volumeMm3 / 1000).toFixed(1)} cm³`.padStart(12) +
      '   ' +
      status,
  );
}

// ---------------------------------------------------------------------------
hdr('TASARIM NOKTASI PERFORMANSI (ISA, deniz seviyesi, statik)');
const s = simulate(SIM_DEFAULT);
row('Devir (istenen / ulasilan)', `${s.diagnostics.rpmRequested.toFixed(0)} / ${s.diagnostics.rpmAchieved.toFixed(0)}`, 'rpm');
row('Sinirlayan', s.diagnostics.rpmLimitedBy);
row('Yakinsama', `${s.diagnostics.converged ? 'evet' : 'HAYIR'} (${s.diagnostics.iterations} adim)`);
line();
row('Akis katsayisi phi', s.fan.flowCoefficient);
row('Is katsayisi psi (kademe)', s.fan.workCoefficient);
row('Reaksiyon derecesi', s.diagnostics.reaction);
row('Lieblein difuzyon faktoru', s.diagnostics.diffusionFactor);
row('Uc hizi', s.fan.tipSpeed, 'm/s');
row('Uc Mach', s.fan.tipMach);
row('Reynolds (kanat)', s.fan.eff.reynoldsNumber);
line();
row('Kutle debisi', s.fan.massFlow, 'kg/s');
row('Eksenel hiz (fan)', s.fan.axialVelocity, 'm/s');
row('Nozul cikis hizi', s.fan.exitVelocity, 'm/s');
row('Cikis Mach', s.diagnostics.exitMach);
row('Toplam basinc artisi', s.fan.pressureRise, 'Pa');
row('Fan basinc orani', s.fan.pressureRatio);
row('Fan verimi (net)', s.fan.eff.net);
row('Merit figuru FM', s.fan.figureOfMerit);
console.log('    (literatur: 390 mm eDPF deneyinde FM = 0.70-0.75)');
line();
row('ITKI', s.fan.thrust, 'N');
row('ITKI', s.fan.thrust / 9.80665, 'kgf');
row('Tork', s.fan.torque, 'N·m');
row('Saft gucu', s.fan.shaftPower / 1000, 'kW');
row('Elektrik gucu (bus)', s.motor.busPower / 1000, 'kW');
row('Itki / guc', s.fan.thrust / (s.motor.busPower / 1000), 'N/kW');
row('Ozgul itki', s.fan.specificThrust, 'N·s/kg');
line();
row('Motor verimi', s.motor.efficiency);
row('Motor+ESC verimi', s.motor.efficiencyTotal);
row('Batarya akimi', s.battery.current, 'A');
row('Batarya gerilimi (yuk altinda)', s.battery.voltage, 'V');
row('Gerilim dususu', s.battery.sag, 'V');
row('Hucre C-orani', s.battery.cRate, 'C');
row('Bakir / demir / mekanik kayip', `${s.motor.copperLoss.toFixed(0)} / ${s.motor.ironLoss.toFixed(0)} / ${s.motor.mechanicalLoss.toFixed(0)}`, 'W');
row('ESC kaybi', s.motor.escLoss, 'W');
row('Batarya omik isi', s.battery.heatGeneration, 'W');
line();
row('Gurultu (1 m)', s.fan.spl, 'dBA');
row('Kanat gecis frekanslari', s.fan.bladePassFrequency.map((f) => f.toFixed(0)).join(' / '), 'Hz');

// ---------------------------------------------------------------------------
hdr('TERMAL');
for (const n of [s.thermal.motor, s.thermal.esc, s.thermal.battery]) {
  console.log(`\n  ${n.label}`);
  row('  isi uretimi', n.heat, 'W');
  row('  isil iletim UA', n.ua, 'W/K');
  row('  denge sicakligi', n.steadyTempC, '°C');
  row(`  t=${SIM_DEFAULT.env.runTime}s sicakligi`, n.tempC, '°C');
  row('  zaman sabiti', n.tau / 60, 'dk');
  row('  limit', n.limitC, '°C');
}

// ---------------------------------------------------------------------------
hdr('YAPISAL');
for (const b of s.bladeStresses) {
  console.log(`\n  ${b.rowId} — ${b.label}`);
  row('  merkezkac gerilmesi', b.centrifugal, 'MPa');
  row('  egilme (eksenel / tegetsel)', `${b.bendingAxial.toFixed(2)} / ${b.bendingTangential.toFixed(2)}`, 'MPa');
  row('  tepe gerilmesi (Kt dahil)', b.peak, 'MPa');
  row('  izin verilen', b.allowable, 'MPa');
  row('  EMNIYET KATSAYISI', b.safetyFactor);
  row('  kanat kutlesi', b.bladeMass, 'g');
  row('  uc uzamasi', b.tipGrowth, 'mm');
}
console.log();
for (const m of s.bladeModes) {
  row(`${m.rowId} 1. egilme modu (duran)`, m.staticFreq, 'Hz');
  row(`${m.rowId} 1. egilme modu (donerken)`, m.runningFreq, 'Hz');
  row(`${m.rowId} motor mertebesi`, m.engineOrder, 'E');
}
console.log('\n  CAMPBELL KESISMELERI (calisma araliginda):');
for (const c of s.campbell.filter((x) => x.inOperatingRange)) {
  console.log(
    `    ${c.rowId}  ${String(c.order).padStart(3)}E @ ${c.rpm.toFixed(0).padStart(6)} rpm  ` +
      `[${c.severity}]  ${c.source}`,
  );
}
console.log();
row('Mil burulma gerilmesi', s.shaft.torsion, 'MPa');
row('Mil emniyet katsayisi', s.shaft.safetyFactor);
row('Mil kritik devri', s.shaft.criticalRpm, 'rpm');
row('Calisma / kritik orani', s.shaft.speedRatio);
row('Burulma acisi', s.shaft.twistAngle, '°');
console.log();
for (const b of s.bearings) {
  console.log(`  ${b.id} (${b.designation})`);
  row('  esdeger yuk', b.equivalent, 'N');
  row('  L10 omru', b.l10Hours, 'saat');
  row('  gres omru', b.greaseHours, 'saat');
  row('  belirleyici omur', b.limitingHours, 'saat');
  row('  hiz kullanimi', b.speedUtilisation);
}
console.log();
row('OGV kanatcik basina yuk', s.loadPath.ogvLoadPerVane, 'N');
row('OGV gerilmesi / emniyet', `${s.loadPath.ogvStress.toFixed(2)} MPa / ${s.loadPath.ogvSafety.toFixed(1)}`);
row('Pilon gerilmesi / emniyet', `${s.loadPath.pylonStress.toFixed(2)} MPa / ${s.loadPath.pylonSafety.toFixed(1)}`);
row('Civata kesme / emniyet', `${s.loadPath.boltStress.toFixed(1)} MPa / ${s.loadPath.boltSafety.toFixed(1)}`);
console.log();
row('Kopan kanat enerjisi', s.containment.bladeEnergy, 'J');
row('Rotor kinetik enerjisi', s.containment.rotorEnergy, 'J');
row('4 mm cidar kapasitesi', s.containment.ductCapacity, 'J');
row('Aramid sargili kapasite', s.containment.withAramid, 'J');
row('Cidar tek basina yeterli?', s.containment.containedByDuct ? 'EVET' : 'HAYIR');
row('Onerilen aramid kat', s.containment.aramidLayers);

// ---------------------------------------------------------------------------
hdr('PERFORMANS — GOVDE KARSILASTIRMASI');
console.log(
  '  ' + 'GOVDE'.padEnd(10) + 'MAKS HIZ'.padStart(12) + 'T/W'.padStart(8) +
  'HIZLANMA'.padStart(11) + 'TIRMANMA'.padStart(11) + 'MENZIL'.padStart(10),
);
line();
for (const af of AIRFRAMES) {
  const r = simulate({ ...SIM_DEFAULT, throttle: 1.0, airframeId: af.id });
  console.log(
    '  ' +
      af.id.padEnd(10) +
      `${r.performance.maxSpeedKmh.toFixed(0)} km/h`.padStart(12) +
      r.mass.thrustToWeight.toFixed(2).padStart(8) +
      `${r.performance.accelTime.toFixed(1)} s`.padStart(11) +
      `${r.performance.climbRate.toFixed(1)} m/s`.padStart(11) +
      `${r.performance.rangeKm.toFixed(1)} km`.padStart(10),
  );
}
console.log();
row('Jet cikis hizi (statik)', s.performance.jetSpeedKmh, 'km/h');
row('Dayaniklilik (tasarim gaz kolu)', s.performance.enduranceMin, 'dk');
row('En iyi dayaniklilik', s.performance.bestEnduranceMin, 'dk');
row('  bu gaz kolunda', s.performance.bestEnduranceThrottle * 100, '%');
row('Enerji tuketimi', s.performance.energyPerMinute, 'Wh/dk');
row('Akim tuketimi', s.performance.mahPerMinute, 'mAh/dk');

// ---------------------------------------------------------------------------
hdr('RISK — TASARIM NOKTASI');
row('Katastrofik olay (bu calisma)', s.risk.catastrophicPerRun.toExponential(2));
row('Katastrofik olay (saat basina)', s.risk.catastrophicPerHour.toExponential(2));
row('PATLAMA/YANGIN (batarya)', s.risk.explosionPerHour.toExponential(2), '/saat');
row('Rotor parcalanmasi', s.risk.burstPerRun.toExponential(2));
row('Risk seviyesi', s.risk.riskLevel);
console.log();
console.log('  Hucre sicakligi ' + s.risk.runaway.cellTempC.toFixed(1) + ' °C, ');
console.log('  kacak baslangici ' + s.risk.runaway.onsetTempC.toFixed(1) + ' °C, ');
console.log('  marj ' + s.risk.runaway.marginK.toFixed(1) + ' K');
console.log('  oz-isinma ' + s.risk.runaway.selfHeatRate.toExponential(2) + ' °C/dk vs ');
console.log('  sogutma ' + s.risk.runaway.coolingCapacity.toFixed(2) + ' °C/dk');
console.log('  yayilma gecikmesi ' + s.risk.runaway.propagationDelayS.toFixed(0) + ' s');
console.log();
console.log('  ARIZA MODLARI:');
for (const m of s.risk.modes) {
  console.log(
    `    ${m.id.padEnd(13)} ${m.perRun.toExponential(2).padStart(10)}  ` +
      `[${m.severity}]  marj ${m.margin.toFixed(2)}`,
  );
}

// ---------------------------------------------------------------------------
hdr('DAYANIKLILIK');
row('Kanat yorulma omru', s.durability.bladeLifeHours, 'saat');
row('Yatak omru', s.durability.bearingLifeHours, 'saat');
row('Batarya cevrim omru', s.durability.batteryCycles, 'cevrim');
row('Batarya calisma omru', s.durability.batteryLifeHours, 'saat');
row('Motor omru', s.durability.motorLifeHours, 'saat');
row('TBO (revizyon araligi)', s.durability.overhaulInterval, 'saat');
row('Belirleyici bilesen', s.durability.limitingComponent);

// ---------------------------------------------------------------------------
hdr('CEVRE SENARYOLARI');
console.log(
  '  ' + 'SENARYO'.padEnd(10) + 'ITKI'.padStart(9) + 'GUC'.padStart(8) +
  'SURE'.padStart(8) + 'MOTOR'.padStart(8) + 'BATRY'.padStart(7) +
  'BUZ'.padStart(7) + 'RISK/h'.padStart(11),
);
line();
for (const sc of SCENARIOS) {
  const r = simulate({
    ...SIM_DEFAULT,
    env: { ...SIM_DEFAULT.env, ...sc.env, runTime: 300 },
  });
  console.log(
    '  ' +
      sc.id.padEnd(10) +
      `${r.fan.thrust.toFixed(0)} N`.padStart(9) +
      `${(r.motor.busPower / 1000).toFixed(1)}kW`.padStart(8) +
      `${r.performance.enduranceMin.toFixed(1)}dk`.padStart(8) +
      `${r.thermal.motor.tempC.toFixed(0)}°C`.padStart(8) +
      `${r.thermal.battery.tempC.toFixed(0)}°C`.padStart(7) +
      `${r.icing.blockage.toFixed(0)}%`.padStart(7) +
      r.risk.catastrophicPerHour.toExponential(1).padStart(11),
  );
}

// ---------------------------------------------------------------------------
hdr('YUK (KUTLE) TARAMASI — "kutle altinda nasil tepki veriyor"');
console.log(
  '  ' + 'YUK(kg)'.padStart(8) + 'TOPLAM'.padStart(9) + 'T/W'.padStart(7) +
  'MAKS HIZ'.padStart(11) + 'TIRMANMA'.padStart(11) + 'PILON σ'.padStart(10) +
  'YATAK L10'.padStart(11),
);
line();
for (const payload of [0, 2, 5, 10, 15, 20, 30]) {
  const r = simulate({
    ...SIM_DEFAULT,
    throttle: 1.0,
    airframeId: 'UAV',
    env: { ...SIM_DEFAULT.env, payload },
  });
  console.log(
    '  ' +
      String(payload).padStart(8) +
      `${r.mass.total.toFixed(1)}`.padStart(9) +
      r.mass.thrustToWeight.toFixed(2).padStart(7) +
      `${r.performance.maxSpeedKmh.toFixed(0)} km/h`.padStart(11) +
      `${r.performance.climbRate.toFixed(1)} m/s`.padStart(11) +
      `${r.loadPath.pylonStress.toFixed(1)}MPa`.padStart(10) +
      `${r.bearings[1].l10Hours.toFixed(0)}h`.padStart(11),
  );
}

// ---------------------------------------------------------------------------
hdr('UYARILAR (tasarim noktasi)');
if (s.warnings.length === 0) console.log('  Uyari yok.');
for (const w of s.warnings) console.log(`  ! ${w}`);

console.log();
line('═');
console.log('  Rapor tamamlandi.');
line('═');
console.log();
