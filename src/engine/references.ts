/**
 * Kaynakca.
 * =========
 * Tasarimin dayandigi acik erisimli (open access) yayinlar ve standartlar.
 * Kod icindeki koseli parantezli etiketler ([F1], [B2], [M3] ...) bu
 * listeye isaret eder. Bu dosya tek dogruluk kaynagidir; web arayuzu ve
 * uretilen raporlar buradan okur.
 *
 * Etiket onekleri
 *   F  fan / aerodinamik        B  batarya hucresi
 *   M  malzeme (FDM polimer)    R  risk / isil kacak
 *   S  yapisal / yorulma        A  atmosfer / buzlanma
 *   E  elektrik makinesi        N  gurultu / akustik
 */

export interface Reference {
  tag: string;
  authors: string;
  title: string;
  venue: string;
  year?: number;
  doi?: string;
  url?: string;
  /** Acik erisim / lisans durumu. */
  access: 'CC BY' | 'acik erisim' | 'standart' | 'kitap' | 'veri seti';
  /** Bu projede tam olarak neyi belirledi. */
  usedFor: string;
}

export const REFERENCES: readonly Reference[] = [
  // ------------------------------------------------------------------ FAN
  {
    tag: 'F1',
    authors: 'Nguyen, N. et al.',
    title:
      'Experimental Investigation of Static Performance of an Electric Ducted Propeller Fan',
    venue: 'Aerospace 12(6):509',
    year: 2025,
    doi: '10.3390/aerospace12060509',
    access: 'CC BY',
    usedFor:
      '390 mm elektrikli kanalli fanin statik deney verisi. Merit figuru 0.70-0.75 araligi, ' +
      'bu projenin hesaplanan FM degeri icin dogrulama olcutu olarak kullanildi.',
  },
  {
    tag: 'F2',
    authors: 'Li, Y. et al.',
    title: 'Aerodynamic Design and Analysis of a Ducted Fan Based on BEMT and CFD',
    venue: 'Aerospace 9(5):241',
    year: 2022,
    doi: '10.3390/aerospace9050241',
    access: 'CC BY',
    usedFor:
      '150 mm kanalli fanda 10 rotor / 6 stator kanatcik konfigurasyonu ve BEMT-CFD ' +
      'karsilastirmasi. Kanatcik sayisi seciminde ve kanat burulma dagiliminda esas alindi.',
  },
  {
    tag: 'F3',
    authors: 'Goodhand, M. et al.',
    title: 'Aerodynamic and Acoustic Design of Electric Ducted Fans',
    venue: 'Aerospace Science and Technology 152:109411',
    year: 2024,
    doi: '10.1016/j.ast.2024.109411',
    access: 'acik erisim',
    usedFor:
      'Akis katsayisinin (phi = 0.60 / 0.75 / 0.90) verim ve gurultu uzerindeki birinci ' +
      'mertebeden etkisi. Tasarim phi degerinin 0.75 secilmesinin gerekcesi.',
  },
  {
    tag: 'F4',
    authors: 'Dixon, S. L. & Hall, C. A.',
    title: 'Fluid Mechanics and Thermodynamics of Turbomachinery, 7. baski',
    venue: 'Butterworth-Heinemann',
    year: 2014,
    access: 'kitap',
    usedFor:
      'Is-yapma katsayisi (work-done factor), sapma (deviation) ve kayip korelasyonlari; ' +
      'Lieblein difuzyon faktoru; reaksiyon derecesi tanimi.',
  },
  {
    tag: 'N1',
    authors: 'Tyler, J. M. & Sofrin, T. G.',
    title: 'Axial Flow Compressor Noise Studies',
    venue: 'SAE Transactions 70:309-332',
    year: 1962,
    access: 'acik erisim',
    usedFor:
      'Rotor-stator etkilesim modlari. Kanatcik sayilarinin ortak bolen vermeyecek ' +
      'sekilde secilmesinin (10/13/12/15) akustik gerekcesi.',
  },

  // -------------------------------------------------------------- BATARYA
  {
    tag: 'B1',
    authors: 'Schmitt, J., Kremer, L. et al.',
    title:
      'Electrical Characterization and Parametrization of Commercial 21700 Lithium-Ion Cells',
    venue: 'Journal of The Electrochemical Society 170:070509',
    year: 2023,
    doi: '10.1149/1945-7111/ace8ff',
    access: 'CC BY',
    usedFor:
      'INR21700-50E / -30T tam parametrizasyonu: 154.3 ve 255.7 Wh/kg ozgul enerji, ' +
      'maks. desarj 11.66C / 2C, EIS ile omik direnc. Hucre secimi ve ic direnc modeli.',
  },
  {
    tag: 'B2',
    authors: 'Quinn, J. B. et al.',
    title:
      'Energy Density of Cylindrical Li-Ion Cells: A Comparison of Commercial 18650 to the 21700 Cells',
    venue: 'Journal of The Electrochemical Society 165(14):A3284',
    year: 2018,
    doi: '10.1149/2.0281814jes',
    access: 'CC BY',
    usedFor:
      '18650 / 20700 / 21700 karsilastirmasi: 207-240 Wh/kg, 13.6-15.0 mOhm (1 kHz), ' +
      'C-orani arttikca ozgul enerji dususu. 21700 formatinin secilme gerekcesi.',
  },
  {
    tag: 'B3',
    authors: 'DLR (Deutsches Zentrum fur Luft- und Raumfahrt)',
    title: 'N21700-BAK-CG50 cell characterisation data set (qOCV, 0.2-3C, EIS)',
    venue: 'Zenodo',
    year: 2026,
    doi: '10.5281/zenodo.18772167',
    access: 'veri seti',
    usedFor:
      'Acik devre gerilim egrisi (OCV-SOC) ve SOC bagimli EIS verisi. Paket gerilim ' +
      'dususu ve kalan kapasite hesaplarinin temeli.',
  },
  {
    tag: 'B4',
    authors: 'Ostanek, J., Parhizi, M. et al.',
    title: 'Effect of State of Charge on Thermal Runaway Onset in Li-Ion Cells',
    venue: 'Journal of The Electrochemical Society 171:010521',
    year: 2024,
    doi: '10.1149/1945-7111/ad1d7f',
    access: 'CC BY',
    usedFor:
      'ARC olcumleriyle SOC-kacak baslangic sicakligi iliskisi. Yuksek SOC daha dusuk ' +
      'baslangic sicakligi verir; risk modelindeki SOC duzeltmesi buradan.',
  },

  // -------------------------------------------------- RISK / ISIL KACAK
  {
    tag: 'R1',
    authors: 'Wehrle, L. et al.',
    title:
      'Multi-Stage Arrhenius Modelling of Thermal Runaway in Lithium-Ion Batteries',
    venue: 'Batteries 11(10):371',
    year: 2025,
    doi: '10.3390/batteries11100371',
    access: 'CC BY',
    usedFor:
      'Arrhenius tipi cok kademeli isil kacak modeli, ARC kalibrasyonu ve modul ici ' +
      'yayilim. Oz-isinma hizi ile sogutma kapasitesinin karsilastirilmasi bu modeldir.',
  },
  {
    tag: 'R2',
    authors: 'Abada, S. et al.',
    title: 'Combined Experimental and Modeling Approaches of the Thermal Runaway of Aged Li-Ion Batteries',
    venue: 'Journal of Power Sources (HAL-01863187)',
    year: 2018,
    url: 'https://hal.science/hal-01863187',
    access: 'acik erisim',
    usedFor:
      'Yaslanmanin oz-isinma ve kacak baslangicina etkisi. Paket yasi (cevrim sayisi) ' +
      'kaydiricisinin risk uzerindeki etkisi bu calismadan olcekleniyor.',
  },
  {
    tag: 'R3',
    authors: 'Fischer, S. et al.',
    title: 'Uncertainty-Aware Bayesian Estimation of Thermal Runaway Probability',
    venue: 'Proceedings of Machine Learning Research 147',
    year: 2021,
    access: 'acik erisim',
    usedFor:
      'Arrhenius on-carpani A ve aktivasyon enerjisi Ea belirsizliginin olasiliga ' +
      'yansitilmasi. Risk sayilarinin neden "mertebe tahmini" olarak sunuldugunun gerekcesi.',
  },

  // ------------------------------------------------------------- MALZEME
  {
    tag: 'M1',
    authors: 'Yavas, D. et al.',
    title:
      'Effect of Printing Parameters on the Mechanical Behavior of Carbon-Fiber-Reinforced PETG',
    venue: 'Polymers 16(23):3336',
    year: 2024,
    doi: '10.3390/polym16233336',
    access: 'CC BY',
    usedFor:
      'CF-PETG basilmis numune mukavemeti ve baski parametrelerinin etkisi. Kanal, ' +
      'giris ve nozul parcalarinin malzeme secimi ve duvar sayisi.',
  },
  {
    tag: 'M2',
    authors: 'Kumar, R. et al.',
    title: 'Mechanical Characterization of 30% Carbon Fiber Reinforced PETG',
    venue: 'Materials Research Express 12:055301',
    year: 2025,
    doi: '10.1088/2053-1591/add8a2',
    access: 'acik erisim',
    usedFor: '%30 CF-PETG: 60 MPa cekme dayanimi, E = 3.8 GPa. Malzeme veritabani girdisi.',
  },
  {
    tag: 'M3',
    authors: 'Turk, D.-A. & Koc, M.',
    title:
      'Mechanical Characterization of 3D-Printed Short and Continuous Carbon Fiber Reinforced Nylon',
    venue: 'Materials 12(23):3990 (PMC6926501)',
    year: 2019,
    doi: '10.3390/ma12233990',
    access: 'CC BY',
    usedFor:
      'Kirpik CF-naylon 56 MPa, surekli CF 190 MPa (E = 17.7 GPa); siddetli anizotropi ' +
      've katmanlar arasi gozeneklilik. PA6-CF icin zFactor = 0.45 degeri buradan.',
  },
  {
    tag: 'M4',
    authors: 'Ahlawat, S. et al.',
    title: 'Tension-Tension Fatigue Behaviour of Carbon Fiber Reinforced Nylon Composites',
    venue: 'Journal of Mechanical Science and Technology 39:5143',
    year: 2025,
    doi: '10.1007/s12206-025-1015-9',
    access: 'acik erisim',
    usedFor:
      '10^6 cevrimde yorulma dayanimi 12-14.5 MPa. Kanat yorulma omru hesabindaki ' +
      'Basquin egrisinin dayanak noktasi.',
  },
  {
    tag: 'M5',
    authors: 'ASM International / EN 10083-3',
    title: 'Metals Handbook — 6061-T6 ve 42CrMo4 mekanik ozellikleri',
    venue: 'ASM Handbook / EN standardi',
    access: 'standart',
    usedFor: 'Mil (42CrMo4) ve islenmis aluminyum parcalarin dayanim degerleri.',
  },

  // ----------------------------------------------------------- YAPISAL
  {
    tag: 'S1',
    authors: 'ISO',
    title: 'ISO 281 — Rolling bearings: Dynamic load ratings and rating life',
    venue: 'ISO',
    access: 'standart',
    usedFor: '6004-2RS ve 6204-2RS yataklarin L10 omur hesabi.',
  },
  {
    tag: 'S2',
    authors: 'ISO',
    title: 'ISO 1940-1 — Balance quality requirements for rotors in a constant rigid state',
    venue: 'ISO',
    access: 'standart',
    usedFor:
      'Rotor balans kalite derecesi G6.3. Izin verilen artik dengesizlik ve yatak ' +
      'yukune katkisi.',
  },
  {
    tag: 'S3',
    authors: 'Southwell, R. V. (Dixon & Hall, Bolum 6 uzerinden)',
    title: 'Centrifugal stiffening of rotating blades (Southwell coefficient)',
    venue: 'standart turbomakine pratigi',
    access: 'kitap',
    usedFor:
      'Donerken kanat dogal frekansinin artisi. Campbell diyagramindaki "donerken" ' +
      'mod frekanslari bu bagintiyla hesaplanir.',
  },

  // ----------------------------------------------- ATMOSFER / BUZLANMA
  {
    tag: 'A1',
    authors: 'ISO',
    title: 'ISO 2533:1975 — Standard Atmosphere',
    venue: 'ISO',
    access: 'standart',
    usedFor: 'Irtifaya gore basinc, sicaklik ve yogunluk (ISA).',
  },
  {
    tag: 'A2',
    authors: 'Alduchov, O. A. & Eskridge, R. E.',
    title: 'Improved Magnus Form Approximation of Saturation Vapor Pressure',
    venue: 'Journal of Applied Meteorology 35:601',
    year: 1996,
    doi: '10.1175/1520-0450(1996)035<0601:IMFAOS>2.0.CO;2',
    access: 'acik erisim',
    usedFor: 'Doygun buhar basinci. Nemli havanin yogunlugu ve buharlasma itici gucu.',
  },
  {
    tag: 'A3',
    authors: 'Marshall, J. S. & Palmer, W. M.',
    title: 'The Distribution of Raindrops with Size',
    venue: 'Journal of Meteorology 5:165',
    year: 1948,
    doi: '10.1175/1520-0469(1948)005<0165:TDORWS>2.0.CO;2',
    access: 'acik erisim',
    usedFor:
      'Yagis siddetinden sivi su icerigi (LWC) ve ortalama damla capi. Yagmur verim ' +
      'kaybi ve buzlanma toplanma verimi girdileri.',
  },
  {
    tag: 'A4',
    authors: 'FAA',
    title: '14 CFR Part 25 Appendix C — Icing Envelope',
    venue: 'ABD Federal Havacilik Idaresi',
    access: 'standart',
    usedFor:
      'Buzlanma zarfi: LWC, damla capi ve sicaklik kombinasyonlari. Buzlanma ' +
      'senaryosunun (-3 °C, 8 mm/h) bu zarf icinde secilmesi.',
  },
  {
    tag: 'A5',
    authors: 'Sutherland, W.',
    title: 'The Viscosity of Gases and Molecular Force',
    venue: 'Philosophical Magazine 36:507',
    year: 1893,
    access: 'acik erisim',
    usedFor: 'Dinamik viskozitenin sicaklikla degisimi. Kanat Reynolds sayisi.',
  },
  {
    tag: 'A6',
    authors: 'Stull, R.',
    title: 'Wet-Bulb Temperature from Relative Humidity and Air Temperature',
    venue: 'Journal of Applied Meteorology and Climatology 50:2267',
    year: 2011,
    doi: '10.1175/JAMC-D-11-0143.1',
    access: 'acik erisim',
    usedFor:
      'Islak termometre sicakligi. Buharlasmali sogutmanin termodinamik alt siniri — ' +
      'hicbir parcanin bu sicakligin altina inememesini saglar.',
  },
];

/** Etiketten kaynak bulur (rapor uretiminde kullanilir). */
export function ref(tag: string): Reference | undefined {
  return REFERENCES.find((r) => r.tag === tag);
}
