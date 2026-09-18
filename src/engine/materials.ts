/**
 * Malzeme veritabani.
 * ===================
 * Mukavemet degerleri 3D BASILMIS numunelerden olculmus, acik erisimli
 * kaynaklardan alinmistir — katalog "reçine" degerleri degil. FDM parcalar
 * siddetli sekilde ANIZOTROPIKTIR; bu yuzden her malzemede katmanlar arasi
 * (Z yonu) mukavemet orani `zFactor` olarak ayrica tutulur ve yapisal
 * analizde kullanilir.
 *
 * Kaynaklar (tam liste: docs/REFERENCES.md)
 *  [M1] Yavas et al., Polymers 16(23):3336 (2024) — CF-PETG, baski
 *       parametrelerinin etkisi, CC BY.
 *  [M2] Kumar et al., Mater. Res. Express 12:055301 (2025) — %30 CF-PETG:
 *       60 MPa cekme, E 3.8 GPa.
 *  [M3] Turk & Koc, Materials 12(23):3990 (2019) / PMC6926501 — kirpik
 *       CF-naylon: 56 MPa; surekli CF: 190 MPa, E 17.7 GPa; siddetli
 *       anizotropi, katmanlar arasi gozeneklilik.
 *  [M4] Ahlawat et al., J. Mech. Sci. Technol. 39:5143 (2025) — CF-naylon
 *       cekme-cekme yorulma dayanimi 12-14.5 MPa.
 *  [M5] ASM / MatWeb 6061-T6, 42CrMo4 standart degerleri.
 */

export type MaterialId =
  | 'PA6CF'
  | 'CFPETG'
  | 'PCCF'
  | 'ASA'
  | 'TPU'
  | 'AL6061'
  | 'STEEL42CRMO4'
  | 'COPPER'
  | 'LIION'
  | 'FR4'
  | 'ALPHA_TAPE';

export interface Material {
  id: MaterialId;
  name: string;
  /** Yogunluk [kg/m^3] (tam dolu malzeme). */
  density: number;
  /** Cekme dayanimi, baski yonunde (XY) [MPa]. */
  uts: number;
  /** Akma dayanimi [MPa] (polimerlerde %0.2 ofset yerine kopma esas alinir). */
  yield: number;
  /** Elastisite modulu [GPa]. */
  modulus: number;
  /** Katmanlar arasi (Z) mukavemet orani. */
  zFactor: number;
  /** 10^6 cevrimde yorulma dayanimi [MPa]. */
  fatigue1e6: number;
  /** Surekli servis sicakligi ust siniri [°C]. */
  serviceTemp: number;
  /** Isi sapma sicakligi HDT-B [°C]. */
  hdt: number;
  /** Isil iletkenlik [W/(m*K)]. */
  conductivity: number;
  /** Ozgul isi [J/(kg*K)]. */
  specificHeat: number;
  /** Isil genlesme katsayisi [1e-6/K]. */
  cte: number;
  /** Su emme / nem hassasiyeti (0-1, 1 = cok hassas). */
  moistureSensitivity: number;
  /** Yaklasik maliyet [TL/kg] (2026 ortalamasi, yalnizca BOM tahmini icin). */
  costPerKg: number;
  /** Goruntuleyicide kullanilacak renk. */
  color: string;
  /** Metalik goruntu (render). */
  metalness: number;
  roughness: number;
  source: string;
  /** FDM baski ayarlari — yalnizca basilabilir polimerlerde tanimli. */
  print?: {
    /** Nozul sicakligi [°C]. */
    nozzleC: number;
    /** Tabla sicakligi [°C]. */
    bedC: number;
    /** Kapali hazne gerekli mi? */
    enclosure: boolean;
    /** Baski oncesi kurutma [saat @ °C], nem hassasiyeti yuksek olanlar icin. */
    dry?: string;
    /** Kritik baski notu. */
    tip: string;
  };
}

export const MATERIALS: Record<MaterialId, Material> = {
  PA6CF: {
    id: 'PA6CF',
    name: 'PA6-CF (karbon elyaf katkili naylon, tavlanmis)',
    density: 1180,
    uts: 56,
    yield: 50,
    modulus: 4.5,
    zFactor: 0.45,
    fatigue1e6: 14.5,
    serviceTemp: 120,
    hdt: 145,
    conductivity: 0.35,
    specificHeat: 1600,
    cte: 40,
    moistureSensitivity: 0.9,
    costPerKg: 2400,
    color: '#26282c',
    metalness: 0.12,
    roughness: 0.74,
    source: '[M3] Materials 12(23):3990, [M4] JMST 39:5143',
    print: {
      nozzleC: 285,
      bedC: 60,
      enclosure: true,
      dry: '8 sa @ 80 °C, kuru kutuda basin',
      tip:
        'Sertlestirilmis nozul zorunlu (elyaf asindirir). Baski sonrasi ' +
        '2 sa @ 120 °C tavlama katmanlar arasi dayanimi ~%25 artirir; ' +
        'tavlarken parcayi kum yatagina gomun (carpilma).',
    },
  },
  CFPETG: {
    id: 'CFPETG',
    name: 'CF-PETG (%20-30 kirpik karbon elyaf)',
    density: 1350,
    uts: 60,
    yield: 54,
    modulus: 3.8,
    zFactor: 0.42,
    fatigue1e6: 15,
    serviceTemp: 68,
    hdt: 78,
    conductivity: 0.29,
    specificHeat: 1200,
    cte: 60,
    moistureSensitivity: 0.35,
    costPerKg: 1450,
    color: '#31353b',
    metalness: 0.1,
    roughness: 0.8,
    source: '[M1] Polymers 16(23):3336, [M2] MRX 12:055301',
    print: {
      nozzleC: 255,
      bedC: 80,
      enclosure: false,
      dry: '6 sa @ 65 °C',
      tip:
        'Sertlestirilmis nozul. Sogutma fani %30-40 (fazlasi katman ' +
        'yapismasini bozar). Gaz yolu parcalarinda 5 duvar hatti.',
    },
  },
  PCCF: {
    id: 'PCCF',
    name: 'PC-CF (polikarbonat + karbon elyaf, yuksek sicaklik)',
    density: 1220,
    uts: 72,
    yield: 66,
    modulus: 6.1,
    zFactor: 0.48,
    fatigue1e6: 19,
    serviceTemp: 135,
    hdt: 148,
    conductivity: 0.32,
    specificHeat: 1200,
    cte: 35,
    moistureSensitivity: 0.7,
    costPerKg: 3100,
    color: '#1f2226',
    metalness: 0.1,
    roughness: 0.7,
    source: 'Uretici teknik veri sayfasi + [M1] metodolojisi',
    print: {
      nozzleC: 300,
      bedC: 110,
      enclosure: true,
      dry: '10 sa @ 90 °C',
      tip:
        'Kapali hazne 55 °C uzeri olmali, yoksa katman ayrilmasi olur. ' +
        'Yalnizca motor bolmesi gibi sicak bolgelerde kullanilir.',
    },
  },
  ASA: {
    id: 'ASA',
    name: 'ASA (UV dayanimli, dis kaporta)',
    density: 1070,
    uts: 42,
    yield: 38,
    modulus: 2.1,
    zFactor: 0.55,
    fatigue1e6: 11,
    serviceTemp: 92,
    hdt: 103,
    conductivity: 0.17,
    specificHeat: 1400,
    cte: 85,
    moistureSensitivity: 0.2,
    costPerKg: 900,
    color: '#8d949e',
    metalness: 0.05,
    roughness: 0.55,
    source: 'Uretici teknik veri sayfasi',
    print: {
      nozzleC: 255,
      bedC: 100,
      enclosure: true,
      tip:
        'Kapali hazne (carpilma). Hava akimindan koru. Stiren kokusu icin ' +
        'havalandirma sart. Dis kaporta UV/ozon dayanimi icin secildi.',
    },
  },
  TPU: {
    id: 'TPU',
    name: 'TPU 95A (conta, titresim yalitimi)',
    density: 1210,
    uts: 30,
    yield: 9,
    modulus: 0.03,
    zFactor: 0.85,
    fatigue1e6: 4,
    serviceTemp: 80,
    hdt: 70,
    conductivity: 0.19,
    specificHeat: 1600,
    cte: 150,
    moistureSensitivity: 0.5,
    costPerKg: 1600,
    color: '#15171a',
    metalness: 0.0,
    roughness: 0.95,
    source: 'Uretici teknik veri sayfasi',
    print: {
      nozzleC: 230,
      bedC: 50,
      enclosure: false,
      dry: '6 sa @ 60 °C',
      tip:
        'Dogrudan tahrikli ekstruder gerekir, hiz <= 25 mm/s. Geri cekme ' +
        '(retraction) kapali. Contalar %100 dolgu, 3 duvar.',
    },
  },
  AL6061: {
    id: 'AL6061',
    name: 'Aluminyum 6061-T6 (islenmis)',
    density: 2700,
    uts: 310,
    yield: 276,
    modulus: 68.9,
    zFactor: 1.0,
    fatigue1e6: 96,
    serviceTemp: 200,
    hdt: 400,
    conductivity: 167,
    specificHeat: 896,
    cte: 23.6,
    moistureSensitivity: 0,
    costPerKg: 850,
    color: '#b9c0c8',
    metalness: 0.92,
    roughness: 0.3,
    source: '[M5] ASM Handbook',
  },
  STEEL42CRMO4: {
    id: 'STEEL42CRMO4',
    name: 'Celik 42CrMo4 (sertlestirilmis, mil)',
    density: 7850,
    uts: 1000,
    yield: 900,
    modulus: 210,
    zFactor: 1.0,
    fatigue1e6: 450,
    serviceTemp: 400,
    hdt: 600,
    conductivity: 42,
    specificHeat: 460,
    cte: 12.3,
    moistureSensitivity: 0,
    costPerKg: 320,
    color: '#6e747c',
    metalness: 0.95,
    roughness: 0.22,
    source: '[M5] EN 10083-3',
  },
  COPPER: {
    id: 'COPPER',
    name: 'Bakir / nikel serit (busbar)',
    density: 8940,
    uts: 220,
    yield: 70,
    modulus: 117,
    zFactor: 1.0,
    fatigue1e6: 80,
    serviceTemp: 200,
    hdt: 600,
    conductivity: 398,
    specificHeat: 385,
    cte: 16.5,
    moistureSensitivity: 0,
    costPerKg: 980,
    color: '#c98a5a',
    metalness: 0.95,
    roughness: 0.35,
    source: '[M5]',
  },
  LIION: {
    id: 'LIION',
    name: 'Li-ion 21700 hucre (NMC, yuksek guc)',
    density: 2850,
    uts: 0,
    yield: 0,
    modulus: 0,
    zFactor: 1,
    fatigue1e6: 0,
    serviceTemp: 60,
    hdt: 0,
    conductivity: 2.5,
    specificHeat: 1040,
    cte: 0,
    moistureSensitivity: 0,
    costPerKg: 5200,
    color: '#2f6f5f',
    metalness: 0.7,
    roughness: 0.4,
    source: 'Schmitt et al., JES 170:070509 (2023)',
  },
  FR4: {
    id: 'FR4',
    name: 'FR4 / elektronik montaj',
    density: 1850,
    uts: 300,
    yield: 300,
    modulus: 24,
    zFactor: 1,
    fatigue1e6: 60,
    serviceTemp: 130,
    hdt: 140,
    conductivity: 0.3,
    specificHeat: 1100,
    cte: 16,
    moistureSensitivity: 0.2,
    costPerKg: 4000,
    color: '#1c4a2a',
    metalness: 0.2,
    roughness: 0.6,
    source: 'IPC-4101',
  },
  ALPHA_TAPE: {
    id: 'ALPHA_TAPE',
    name: 'Asindirilabilir uc astari (abradable liner)',
    density: 900,
    uts: 12,
    yield: 8,
    modulus: 0.6,
    zFactor: 0.6,
    fatigue1e6: 3,
    serviceTemp: 90,
    hdt: 80,
    conductivity: 0.2,
    specificHeat: 1500,
    cte: 100,
    moistureSensitivity: 0.3,
    costPerKg: 2200,
    color: '#d8cfa8',
    metalness: 0,
    roughness: 0.9,
    source: 'Kanal uc bosluk yonetimi yaygin uygulamasi',
  },
};

/**
 * FDM parcanin GERCEK yogunlugu — dolgu (infill) oranina gore.
 * Kabuk (duvar+ust/alt) neredeyse tam dolu oldugundan etkin yogunluk
 * dogrusal degildir; 0.35 + 0.65*infill ampirik karisimini kullaniyoruz
 * (ince cidarli parcalarda kabuk baskin).
 */
export function effectiveDensity(mat: Material, infill: number, isThinWall: boolean): number {
  if (mat.id === 'AL6061' || mat.id === 'STEEL42CRMO4' || mat.id === 'COPPER' ||
      mat.id === 'LIION' || mat.id === 'FR4') {
    return mat.density;
  }
  if (isThinWall) return mat.density * 0.97; // cidar tamamen duvar hatlarindan olusur
  return mat.density * (0.34 + 0.66 * infill);
}

/**
 * Anizotropi ve baski kusurlarini iceren tasarim izin verilen gerilme [MPa].
 * @param loadAlongLayers true ise yuk katman duzleminde (XY), false ise Z'de
 * @param knockdown ek guvenlik indirimi (sicaklik, nem, yaslanma)
 */
export function allowableStress(
  mat: Material,
  loadAlongLayers: boolean,
  knockdown = 1.0,
): number {
  const base = loadAlongLayers ? mat.uts : mat.uts * mat.zFactor;
  return base * knockdown;
}

/**
 * Sicakligin polimer mukavemetine etkisi.
 * HDT'nin altinda yumusak dusus, HDT'ye yaklasirken hizli kayip.
 * Basit ama literaturdeki DMA egrileriyle uyumlu bir sigmoid.
 */
export function temperatureKnockdown(mat: Material, tempC: number): number {
  if (mat.id === 'AL6061' || mat.id === 'STEEL42CRMO4') {
    return Math.max(0.55, 1 - Math.max(0, tempC - 100) * 0.0018);
  }
  const t = (tempC - (mat.serviceTemp - 25)) / Math.max(10, mat.hdt - mat.serviceTemp + 35);
  return Math.max(0.08, Math.min(1, 1 - 0.92 / (1 + Math.exp(-4.2 * (t - 0.5)))));
}

/** Nem emiliminin mukavemete etkisi (PA6-CF icin kritik). */
export function moistureKnockdown(mat: Material, relHumidity: number, hoursExposed: number): number {
  const saturation = 1 - Math.exp(-hoursExposed / 120); // ~5 gunde doygunluk
  const loss = 0.28 * mat.moistureSensitivity * (relHumidity / 100) * saturation;
  return 1 - loss;
}
