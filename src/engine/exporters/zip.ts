/**
 * Minimal ZIP yazici (sikistirmasiz / "store" yontemi).
 * =====================================================
 * Hicbir dis kutuphane gerektirmez. Tarayicida tum STL/OBJ dosyalarini
 * tek indirmede paketlemek icin kullanilir.
 *
 * STL dosyalari zaten ikili ve yogun oldugundan deflate kazanci
 * (~%35) karmasikligi hak etmez; "store" her yerde uyumludur.
 *
 * Bicim: PKZIP 2.0, yerel basli + merkezi dizin + son kayit.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

const enc = (s: string): Uint8Array => {
  // UTF-8
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return new Uint8Array(out);
};

/** DOS tarih/saat bicimi. */
function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const { time, date } = dosDateTime();
  const files = entries.map((e) => ({
    nameBytes: enc(e.name),
    data: typeof e.data === 'string' ? enc(e.data) : e.data,
  }));

  let totalLocal = 0;
  let totalCentral = 0;
  for (const f of files) {
    totalLocal += 30 + f.nameBytes.length + f.data.length;
    totalCentral += 46 + f.nameBytes.length;
  }
  const size = totalLocal + totalCentral + 22;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let o = 0;
  const offsets: number[] = [];
  const crcs: number[] = [];

  // Yerel basliklar + veri
  for (const f of files) {
    offsets.push(o);
    const crc = crc32(f.data);
    crcs.push(crc);
    view.setUint32(o, 0x04034b50, true); // imza
    view.setUint16(o + 4, 20, true); // gereken surum
    view.setUint16(o + 6, 0x0800, true); // bayrak: UTF-8 ad
    view.setUint16(o + 8, 0, true); // yontem: store
    view.setUint16(o + 10, time, true);
    view.setUint16(o + 12, date, true);
    view.setUint32(o + 14, crc, true);
    view.setUint32(o + 18, f.data.length, true);
    view.setUint32(o + 22, f.data.length, true);
    view.setUint16(o + 26, f.nameBytes.length, true);
    view.setUint16(o + 28, 0, true); // ek alan
    o += 30;
    bytes.set(f.nameBytes, o);
    o += f.nameBytes.length;
    bytes.set(f.data, o);
    o += f.data.length;
  }

  // Merkezi dizin
  const centralStart = o;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    view.setUint32(o, 0x02014b50, true);
    view.setUint16(o + 4, 20, true); // olusturan surum
    view.setUint16(o + 6, 20, true);
    view.setUint16(o + 8, 0x0800, true);
    view.setUint16(o + 10, 0, true);
    view.setUint16(o + 12, time, true);
    view.setUint16(o + 14, date, true);
    view.setUint32(o + 16, crcs[i], true);
    view.setUint32(o + 20, f.data.length, true);
    view.setUint32(o + 24, f.data.length, true);
    view.setUint16(o + 28, f.nameBytes.length, true);
    view.setUint16(o + 30, 0, true);
    view.setUint16(o + 32, 0, true);
    view.setUint16(o + 34, 0, true);
    view.setUint16(o + 36, 0, true);
    view.setUint32(o + 38, 0, true);
    view.setUint32(o + 42, offsets[i], true);
    o += 46;
    bytes.set(f.nameBytes, o);
    o += f.nameBytes.length;
  }

  // Merkezi dizin sonu
  view.setUint32(o, 0x06054b50, true);
  view.setUint16(o + 4, 0, true);
  view.setUint16(o + 6, 0, true);
  view.setUint16(o + 8, files.length, true);
  view.setUint16(o + 10, files.length, true);
  view.setUint32(o + 12, o - centralStart, true);
  view.setUint32(o + 16, centralStart, true);
  view.setUint16(o + 20, 0, true);

  return bytes;
}
