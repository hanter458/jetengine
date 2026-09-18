/**
 * Tarayici indirme yardimcilari.
 * ==============================
 * Tum dosyalar ISTEMCIDE uretilir — sunucu yok, ag istegi yok.
 * Parca geometrisi spec.ts'den her seferinde yeniden hesaplanir, bu yuzden
 * indirilen STL her zaman ekranda gorduklerinizle ayni olculere sahiptir.
 */

import { meshToBinarySTL, orientForPrint } from '../engine/exporters/stl';
import { meshToOBJ } from '../engine/exporters/obj';
import { createZip, type ZipEntry } from '../engine/exporters/zip';
import type { MeshData } from '../engine/geom/mesh';
import { PARTS, allMetrics, GROUP_LABELS, massBudget, type PartDef } from '../engine/parts';
import { MATERIALS } from '../engine/materials';
import { MANUFACTURING } from '../engine/spec';

function saveBlob(data: Uint8Array | string, filename: string, mime: string): void {
  // TypeScript 5.7+ Uint8Array'i arabellek turune gore genelledi; uretilen
  // arabellek her zaman duz bir ArrayBuffer oldugu icin kopyalamadan
  // yeniden goruntuleyip BlobPart'a uyumlu hale getiriyoruz.
  const part: BlobPart =
    typeof data === 'string'
      ? data
      : new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari'nin indirmeyi baslatmasina zaman tani
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Baski icin yonlendirilmis tek parca STL indirir. */
export function downloadSTL(part: PartDef, mesh: MeshData): void {
  const oriented = orientForPrint(mesh, 'xToZ');
  saveBlob(
    meshToBinarySTL(oriented, part.id),
    `${part.id}.stl`,
    'model/stl',
  );
}

/** Montaj konumunu KORUYAN OBJ indirir (CAD'e aktarim / kontrol icin). */
export function downloadOBJ(part: PartDef, mesh: MeshData): void {
  saveBlob(meshToOBJ(mesh, part.id), `${part.id}.obj`, 'text/plain');
}

/** Tum montaji tek OBJ olarak indirir. */
export function downloadAssemblyOBJ(mesh: MeshData): void {
  saveBlob(meshToOBJ(mesh, 'EDF-1000-assembly'), 'EDF-1000-montaj.obj', 'text/plain');
}

// ---------------------------------------------------------------------------
// Toplu paket
// ---------------------------------------------------------------------------

/**
 * Basilacak TUM parcalari + BOM + baski ayarlarini tek ZIP'te toplar.
 * `onProgress` her parca bittiginde 0..1 arasi ilerleme bildirir.
 */
export async function downloadAllZip(
  meshOf: (p: PartDef) => MeshData,
  onProgress: (frac: number, label: string) => void,
  opts: { includeCots?: boolean } = {},
): Promise<void> {
  const list = PARTS.filter((p) => opts.includeCots || p.process !== 'COTS');
  const entries: ZipEntry[] = [];

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    onProgress(i / list.length, p.id);
    // Tarayiciyi kilitlemeden ilerle
    await new Promise((r) => setTimeout(r, 0));
    const mesh = meshOf(p);
    const dir = p.process === 'FDM' ? 'stl-basilacak' : p.process === 'CNC' ? 'stl-islenecek' : 'stl-referans';
    entries.push({
      name: `${dir}/${p.id}_x${p.qty}.stl`,
      data: meshToBinarySTL(orientForPrint(mesh, 'xToZ'), p.id),
    });
  }

  onProgress(0.97, 'BOM + dokumanlar');
  await new Promise((r) => setTimeout(r, 0));

  entries.push({ name: 'BOM.csv', data: bomCsv() });
  entries.push({ name: 'BASKI-AYARLARI.txt', data: printGuide() });
  entries.push({ name: 'OKUBENI.txt', data: readme() });

  onProgress(1, 'ZIP yaziliyor');
  saveBlob(createZip(entries), 'EDF-1000-tum-parcalar.zip', 'application/zip');
}

// ---------------------------------------------------------------------------
// Metin ekleri
// ---------------------------------------------------------------------------

export function bomCsv(): string {
  const m = allMetrics();
  const head = [
    'Kimlik',
    'Ad',
    'Grup',
    'Uretim',
    'Malzeme',
    'Adet',
    'Birim kutle [g]',
    'Toplam kutle [g]',
    'Dolgu [%]',
    'Boyut X [mm]',
    'Boyut Y [mm]',
    'Boyut Z [mm]',
    'Tablaya sigar',
    'Kritik',
    'Baski notu',
    'Muhendislik notu',
  ].join(';');

  const rows = PARTS.map((p, i) => {
    const k = m[i];
    return [
      p.id,
      p.name,
      GROUP_LABELS[p.group],
      p.process,
      MATERIALS[p.material].name,
      p.qty,
      k.massEach.toFixed(1),
      k.massTotal.toFixed(1),
      p.process === 'FDM' ? (p.infill * 100).toFixed(0) : '',
      k.size[0].toFixed(1),
      k.size[1].toFixed(1),
      k.size[2].toFixed(1),
      k.fitsBuildVolume ? 'evet' : 'HAYIR',
      p.critical ? 'evet' : '',
      (p.printNote ?? '').replace(/;/g, ','),
      (p.note ?? '').replace(/;/g, ','),
    ].join(';');
  });

  // Excel'in ; ayiricisini tanimasi icin BOM + sep satiri
  return `\uFEFFsep=;\n${head}\n${rows.join('\n')}\n`;
}

export function printGuide(): string {
  const b = massBudget();
  const L: string[] = [];
  const put = (s = '') => L.push(s);

  put('EDF-1000 — 3D BASKI AYARLARI VE PARCA YONLENDIRME');
  put('='.repeat(72));
  put();
  put(`Basilacak parca tipi   : ${PARTS.filter((p) => p.process === 'FDM').length}`);
  put(`Fiziksel basilacak adet: ${PARTS.filter((p) => p.process === 'FDM').reduce((s, p) => s + p.qty, 0)}`);
  put(`Toplam basili kutle    : ${(b.printedMass / 1000).toFixed(2)} kg`);
  put(`Filament hacmi         : ${b.printedVolumeCm3.toFixed(0)} cm3  (~${(b.printedMass / 1000 / 0.95).toFixed(1)} kg makara)`);
  put(`Varsayilan tabla       : ${MANUFACTURING.buildVolume.join(' x ')} mm`);
  put();
  put('GENEL AYARLAR');
  put('-'.repeat(72));
  put(`  Nozul capi           : ${MANUFACTURING.nozzleDia} mm (sertlestirilmis)`);
  put(`  Katman yuksekligi    : ${MANUFACTURING.layerHeight} mm`);
  put('  Ilk katman           : 0.25 mm, %100 akis');
  put(`  Duvar hatti          : gaz yolu parcalarinda >= ${MANUFACTURING.wallLines}, kritik parcalarda 6-8`);
  put('  Ust/alt katman       : 5 / 5');
  put('  Dolgu deseni         : gyroid (kabuk) / kubik (yapisal)');
  put(`  Flans civatasi       : M${MANUFACTURING.boltDia} x ${MANUFACTURING.flangeBolts} adet/flans`);
  put(`  Kaydirmali gecme     : +${MANUFACTURING.clearanceFit} mm | sikma gecme ${MANUFACTURING.pressFit} mm`);
  put('  Kacinilacak          : vazo modu, %0 dolgu, 0.1 mm alti katman');
  put();
  put('MALZEMELER');
  put('-'.repeat(72));
  for (const id of ['PA6CF', 'CFPETG', 'PCCF', 'ASA', 'TPU'] as const) {
    const mt = MATERIALS[id];
    if (!mt.print) continue;
    put();
    put(`  ${mt.name}`);
    put(`     nozul ${mt.print.nozzleC} °C | tabla ${mt.print.bedC} °C | ` +
        `hazne ${mt.print.enclosure ? 'KAPALI gerekli' : 'acik olur'}`);
    put(`     HDT ${mt.hdt} °C | servis ${mt.serviceTemp} °C`);
    put(`     cekme ${mt.uts} MPa (XY) / ${(mt.uts * mt.zFactor).toFixed(0)} MPa (Z, katman arasi)`);
    if (mt.print.dry) put(`     kurutma: ${mt.print.dry}`);
    put(`     ${mt.print.tip}`);
    put(`     kaynak: ${mt.source}`);
  }
  put();
  put('PARCA PARCA YONLENDIRME');
  put('='.repeat(72));
  const met = allMetrics();
  for (const g of Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]) {
    const inGroup = PARTS.map((p, i) => [p, met[i]] as const).filter(
      ([p]) => p.group === g && p.process === 'FDM',
    );
    if (!inGroup.length) continue;
    put();
    put(`--- ${GROUP_LABELS[g].toUpperCase()} ---`);
    for (const [p, k] of inGroup) {
      put();
      put(`  [${p.id}]  x${p.qty}  ${p.name}`);
      put(`     malzeme ${MATERIALS[p.material].name} | dolgu %${(p.infill * 100).toFixed(0)} | ${k.massEach.toFixed(0)} g/adet`);
      put(`     olcu ${k.size.map((v) => v.toFixed(0)).join(' x ')} mm${k.fitsBuildVolume ? '' : '   *** TABLAYA SIGMIYOR ***'}`);
      if (p.printNote) put(`     baski: ${p.printNote}`);
      if (p.note) put(`     not  : ${p.note}`);
    }
  }
  put();
  put('='.repeat(72));
  put('UYARI: Bu bir DENEYSEL bilim projesidir. Muhafaza (containment) icin');
  put('kanal cevresine 3 kat aramid sargi ZORUNLUDUR. Ilk calistirmayi');
  put('mutlaka koruyucu bir kafes arkasindan ve uzaktan yapin.');
  return L.join('\n');
}

export function readme(): string {
  const b = massBudget();
  return [
    'EDF-1000 — 1 METRELIK ELEKTRIKLI KANALLI FAN (DUCTED FAN) MOTORU',
    '='.repeat(72),
    '',
    'Bu ZIP, motorun TUM parcalarinin baski icin yonlendirilmis STL',
    'dosyalarini icerir. Olculer milimetre, olcek 1:1.',
    '',
    'KLASORLER',
    '  stl-basilacak/  FDM ile basilacak parcalar (yonlendirilmis, z=0 tablada)',
    '  stl-islenecek/  CNC/torna ile islenecek parcalar (celik, aluminyum)',
    '  stl-referans/   Hazir alinan (COTS) parcalarin yer tutucu modelleri —',
    '                  BUNLARI BASMAYIN, katalogdan satin alin.',
    '  BOM.csv         Tam malzeme listesi (Excel ile acilir)',
    '  BASKI-AYARLARI.txt  Parca parca yonlendirme, dolgu, duvar sayisi',
    '',
    'OZET',
    `  Toplam motor kutlesi : ${(b.totalMass / 1000).toFixed(2)} kg`,
    `  Basili               : ${(b.printedMass / 1000).toFixed(2)} kg`,
    `  Hazir alinan (COTS)  : ${(b.cotsMass / 1000).toFixed(2)} kg`,
    `  Islenmis             : ${(b.machinedMass / 1000).toFixed(2)} kg`,
    `  Parca tipi / adet    : ${b.partTypes} tip, ${b.physicalPieces} fiziksel parca`,
    '',
    'GUVENLIK — MUTLAKA OKUYUN',
    '-'.repeat(72),
    '  1. Rotor 12 500 rpm donuyor; uc hizi ~130 m/s. Kopan bir kanat 53 J',
    '     tasir. 4 mm basili cidar tam sinirda kalir; kanal cevresine 3 kat',
    '     aramid (kevlar) sargi ZORUNLUDUR.',
    '  2. 20S6P Li-ion paket 1296 Wh enerji tasir. Kisa devre = termal kacak.',
    '     BMS ve hucre bazli sigorta atlanamaz.',
    '  3. Ilk calistirmayi koruyucu kafes arkasindan, uzaktan gaz kolu ile,',
    '     yanginda kullanilacak kum kovasi hazirda yapin.',
    '  4. Bu bir DENEYSEL egitim projesidir; havacilikta kullanilamaz.',
  ].join('\n');
}
