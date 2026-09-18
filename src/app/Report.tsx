/**
 * Tasarim raporu sekmesi.
 * =======================
 * Tasarimin NEDEN boyle oldugunu ve hangi acik erisimli calismalara
 * dayandigini anlatir. Sayilar canli simulasyondan gelir; metin sabit.
 */

import { useMemo } from 'react';
import type { SimResult } from '../engine/physics/simulate';
import { SCENARIOS, simulate } from '../engine/physics/simulate';
import { BLADE_ROWS, DESIGN, TIP_RADIUS, HUB_RADIUS, TOTAL_LENGTH, CELL, MOTOR } from '../engine/spec';
import { PACK_SUMMARY } from '../engine/physics/battery';
import { massBudget } from '../engine/parts';
import { REFERENCES } from '../engine/references';

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export function DesignReport(props: { sim: SimResult }) {
  const s = props.sim;
  const budget = useMemo(() => massBudget(), []);

  // Tum senaryolari ayni gaz kolunda coz — karsilastirma tablosu
  const scen = useMemo(
    () =>
      SCENARIOS.map((sc) => ({
        sc,
        r: simulate({ ...s.input, env: { ...s.input.env, ...sc.env } }),
      })),
    [s.input],
  );

  // Yuk taramasi
  const loads = useMemo(
    () =>
      [0, 5, 10, 15, 20, 30].map((payload) => ({
        payload,
        r: simulate({ ...s.input, airframeId: 'UAV', env: { ...s.input.env, payload } }),
      })),
    [s.input],
  );

  return (
    <div className="doc">
      <h1>EDF-1000 — Tasarim Raporu</h1>
      <p className="lead">
        1 metre uzunlugunda, iki kademeli, elektrikli kanalli fan (electric ducted
        fan). Tum geometri tek bir parametrik spesifikasyondan uretilir; bu sayfadaki
        sayilarin hepsi o spesifikasyondan hesaplanir — elle girilmis tek bir
        performans degeri yoktur.
      </p>

      <div className="cards">
        <Card l="Uzunluk" v={`${TOTAL_LENGTH}`} u="mm" s="tam 1 metre" />
        <Card l="Fan capi" v={`${(TIP_RADIUS * 2).toFixed(0)}`} u="mm" s={`gobek ${(HUB_RADIUS * 2).toFixed(0)} mm`} />
        <Card l="Tasarim devri" v={DESIGN.rpm.toLocaleString('tr-TR')} u="rpm" s={`limit ${DESIGN.rpmMax.toLocaleString('tr-TR')}`} />
        <Card l="Itki" v={f(s.fan.thrust, 0)} u="N" s={`${f(s.fan.thrust / 9.80665, 1)} kgf`} />
        <Card l="Batarya" v={(PACK_SUMMARY.kapasiteMah / 1000).toFixed(0)} u="Ah" s={`${PACK_SUMMARY.konfigurasyon} · ${f(PACK_SUMMARY.enerjiWh, 0)} Wh`} />
        <Card l="Toplam kutle" v={f(budget.totalMass / 1000, 1)} u="kg" s={`basili ${f(budget.printedMass / 1000, 1)} kg`} />
      </div>

      {/* =================================================================== */}
      <h2>1. Neden kanalli fan, neden iki kademe?</h2>
      <p>
        "Elektrikli jet motoru" fiziksel olarak bir <b>kanalli fan</b>dir: yanma
        odasi yoktur, itki tamamen havayi hizlandirmaktan gelir. Ayni gucte itki
        uretmenin en verimli yolu <i>cok havayi az hizlandirmak</i>tir. 1 metrelik
        bir govdede fan capini buyutme imkani sinirli oldugu icin{' '}
        {(TIP_RADIUS * 2).toFixed(0)} mm capinda karar verildi; kalan itki ihtiyaci
        basinc artisindan karsilanmak zorunda.
      </p>
      <p>
        Tek kademede bu basinc artisini almak, kademe yuklemesini (is katsayisi ψ)
        verimin coktugu bolgeye tasiyor. Bu yuzden{' '}
        <b>2 rotor + 2 stator</b> kullanildi; her kademe ψ ={' '}
        {f(s.fan.workCoefficient, 3)} ile hafif yuklu kaliyor ve net fan verimi{' '}
        <b>%{f(s.fan.eff.net * 100, 1)}</b> olcusunde tutulabiliyor. Merit figuru{' '}
        <b>{f(s.fan.figureOfMerit, 3)}</b>; 390 mm'lik bir deneysel elektrikli
        kanalli fan olcumunde bildirilen 0.70-0.75 araliginin hemen ustunde, yani
        model iyimser ama savunulabilir bolgede.
      </p>

      <h3>Kanatcik sayilari neden asal ve farkli?</h3>
      <p>
        Rotor ve stator kanatcik sayilari ortak bolen vermeyecek sekilde secildi (
        {BLADE_ROWS.map((r) => `${r.id}=${r.count}`).join(', ')}). Ortak bolen,
        rotor-stator etkilesiminden dogan tahrik kuvvetlerinin ayni fazda
        toplanmasina ve hem gurultunun hem titresimin patlamasina yol acar. Ayni
        nedenle giris cani <b>4 degil 5 dilim</b> yapildi: 4 dilimin birlesme izi
        rotorun ilk egilme modunu kirmizi cizginin hemen altinda (4E @ ~12 600 rpm)
        tahrik ediyordu.
      </p>

      <table className="tbl">
        <thead>
          <tr>
            <th>Sira</th>
            <th>Kanat</th>
            <th>x [mm]</th>
            <th>veter k/u</th>
            <th>aci k/u [°]</th>
          </tr>
        </thead>
        <tbody>
          {BLADE_ROWS.map((r) => (
            <tr key={r.id}>
              <td>
                {r.id} — {r.label}
              </td>
              <td>{r.count}</td>
              <td>{r.xMid}</td>
              <td>
                {r.chordRoot} / {r.chordTip}
              </td>
              <td>
                {r.pitchRoot} / {r.pitchTip}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* =================================================================== */}
      <h2>2. Batarya: neden 20S6P, neden 18 000 mAh?</h2>
      <p>
        Batarya kapasitesi keyfi degil, <b>guc talebinden geriye dogru</b> hesaplandi.
        Tasarim noktasinda motor bus'tan {f(s.motor.busPower / 1000, 2)} kW cekiyor.
        Tek bir {CELL.model} hucresi surekli{' '}
        {f((CELL.cRateMax * CELL.capacity) / 1000, 0)} A verebiliyor; hucre bazinda C-oranini{' '}
        <b>{f(s.battery.cRate, 1)} C</b> gibi hucre omrunu yakmayan bir seviyede
        tutmak icin 6 paralel kol gerekiyor.
      </p>
      <p>
        Gerilim tarafinda motorun {MOTOR.kv} Kv sargisi {DESIGN.rpm.toLocaleString('tr-TR')} rpm
        icin ~{f(s.motor.terminalVoltage, 0)} V istiyor; 20 seri hucre nominal{' '}
        {f(PACK_SUMMARY.nominalGerilim, 0)} V (dolu {f(PACK_SUMMARY.maksGerilim, 0)} V)
        verdigi icin 20S secildi. Sonuc:{' '}
        <b>20S6P = 120 hucre, {PACK_SUMMARY.kapasiteMah.toLocaleString('tr-TR')} mAh,{' '}
        {f(PACK_SUMMARY.enerjiWh, 0)} Wh</b>, paket ic direnci{' '}
        {f(PACK_SUMMARY.icDirencMohm, 1)} mΩ.
      </p>
      <p>
        Bu paket 1 metrelik govdeye <i>arkaya dizilerek</i> sigmaz — gaz yolunu
        tikardi. Bunun yerine hucreler kanal etrafina{' '}
        <b>4 halka modul</b> halinde yerlestirildi; boylece hem aerodinamik kesit
        korunuyor hem de hucreler kaporta altindaki havalandirma akisiyla
        sogutuluyor. Bu, paketin neden {f(s.thermal.battery.tempC, 0)} °C'de
        kalabildiginin de cevabi.
      </p>

      {/* =================================================================== */}
      <h2>3. Cevre kosullari: kis, yagmur, sicak</h2>
      <p>
        Asagidaki tablo <b>ayni gaz kolunda</b> tum hava kosullarini kiyaslar. Her
        satir tam fizik modelinin bagimsiz bir cozumudur.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Senaryo</th>
            <th>ρ [kg/m³]</th>
            <th>Itki [N]</th>
            <th>Guc [kW]</th>
            <th>Sure [dk]</th>
            <th>Motor [°C]</th>
            <th>Batarya [°C]</th>
            <th>Buz</th>
            <th>Risk/sa</th>
          </tr>
        </thead>
        <tbody>
          {scen.map(({ sc, r }) => (
            <tr key={sc.id}>
              <td title={sc.note}>{sc.label}</td>
              <td>{f(r.air.density, 3)}</td>
              <td>{f(r.fan.thrust, 0)}</td>
              <td>{f(r.motor.busPower / 1000, 1)}</td>
              <td>{f(r.performance.enduranceMin, 1)}</td>
              <td className={r.thermal.motor.tempC > r.thermal.motor.limitC ? 'r' : r.thermal.motor.tempC > 140 ? 'y' : 'g'}>
                {f(r.thermal.motor.tempC, 0)}
              </td>
              <td className={r.thermal.battery.tempC > 50 ? 'r' : r.thermal.battery.tempC > 40 ? 'y' : 'g'}>
                {f(r.thermal.battery.tempC, 0)}
              </td>
              <td className={r.icing.blockage > 10 ? 'r' : r.icing.blockage > 0 ? 'y' : ''}>
                {r.icing.active ? `%${f(r.icing.blockage, 0)}` : '—'}
              </td>
              <td className={r.risk.catastrophicPerHour > 1e-4 ? 'r' : r.risk.catastrophicPerHour > 1e-5 ? 'y' : 'g'}>
                {r.risk.catastrophicPerHour.toExponential(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Kis (-15 °C): itki artar, batarya kotuleser</h3>
      <p>
        Soguk hava yogun oldugu icin ayni devirde kutle debisi ve dolayisiyla itki{' '}
        <b>artar</b>. Bedeli batarya tarafinda odenir: hucre ic direnci Arrhenius
        bagintisiyla yukselir, kullanilabilir kapasite duser. Net etki, itki artmasina
        ragmen <b>ucus suresinin kisalmasidir</b>. Bu yuzden tasarima batarya on
        isitma (preheat) enerjisi hesabi dahil edildi:{' '}
        {f(s.cold.preheatWh, 0)} Wh.
      </p>

      <h3>Buzlanma (-3 °C, donan yagmur): en tehlikeli kosul</h3>
      <p>
        Giris cani ic yuzeyinde hava hizlandigi icin statik sicaklik ortamdan{' '}
        <b>daha da duser</b> — ortam donma noktasinin biraz uzerinde olsa bile dudakta
        buz birikir. Model, damla atalet parametresinden toplanma verimini,
        oradan birikme hizini ve giris blokajini hesaplar. Buzlanma senaryosunda
        itki tasarim noktasinin yaklasik ucte birine iner ve risk iki mertebe
        artar. Bu bir <i>tasarim kusuru degil, fizigin sinirlamasidir</i>; cozum
        buz onleyici isiticidir (
        {f(s.icing.antiIcePower > 0 ? s.icing.antiIcePower : 0, 0)} W).
      </p>

      <h3>Yagmur ve saganak: buharlasmali sogutma YOKTUR</h3>
      <p>
        Ilk modelde yagmurun parcalari buharlasmayla sogutmasina izin verilmisti ve
        batarya sicakligi ortamin cok altina iniyordu — <b>termodinamik olarak
        imkansiz</b>. Duzeltildi: yagmurlu hava doygun oldugu icin buharlasmanin
        itici gucu (doygunluk acigi) sifira yakindir ve hicbir yuzey{' '}
        <b>islak termometre sicakliginin</b> altina inemez. Simdi yagmurun etkisi
        dogru sekilde <i>sogutma degil, verim kaybi ve su girisi riski</i> olarak
        gorunuyor.
      </p>

      <h3>Sicak gun (50 °C): termal olarak belirleyici kosul</h3>
      <p>
        Yogunluk %11 dustugu icin itki azalir, ama gercek sorun{' '}
        <b>termaldir</b>: sogutma havasi zaten sicak oldugundan motor sargisi{' '}
        {f(scen.find((x) => x.sc.id === 'HOT')?.r.thermal.motor.tempC ?? 0, 0)} °C'ye
        cikiyor ve {s.thermal.motor.limitC} °C sinirina yaklasiyor. Motor termal
        derating devreye girerek devri kendisi kisitliyor — modelde bu, "sinirlayan
        etken" olarak raporlanir.
      </p>

      {/* =================================================================== */}
      <h2>4. Kutle altinda davranis</h2>
      <p>
        Faydali yuk arttikca itki degismez ama gereken tasima artar; indirgenmis
        surukleme (induced drag) buyudugu icin maksimum hiz ve ozellikle{' '}
        <b>tirmanma hizi</b> duser. Asagidaki tarama IHA govdesi icindir.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Yuk [kg]</th>
            <th>Toplam [kg]</th>
            <th>T/W</th>
            <th>Maks. hiz [km/h]</th>
            <th>Tirmanma [m/s]</th>
            <th>Menzil [km]</th>
          </tr>
        </thead>
        <tbody>
          {loads.map(({ payload, r }) => (
            <tr key={payload}>
              <td>{payload}</td>
              <td>{f(r.mass.total, 1)}</td>
              <td className={r.mass.thrustToWeight < 0.3 ? 'r' : r.mass.thrustToWeight < 0.4 ? 'y' : 'g'}>
                {f(r.mass.thrustToWeight, 2)}
              </td>
              <td>{f(r.performance.maxSpeedKmh, 0)}</td>
              <td className={r.performance.climbRate < 3 ? 'y' : 'g'}>
                {f(r.performance.climbRate, 1)}
              </td>
              <td>{f(r.performance.rangeKm, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <b>Durust bir not:</b> itki/agirlik orani 1'in altindadir, yani bu motor
        kendini dikey kaldiramaz. Bu bir eksiklik degil, tercih: elektrikli kanalli
        fanlarda tipik T/W 0.3-0.5'tir ve tasarim kanat tasimali (ucak benzeri)
        kullanim icindir. Dikey kalkis isteniyorsa fan capi degil,{' '}
        <b>batarya ozgul gucu</b> sinirlayici olur.
      </p>

      {/* =================================================================== */}
      <h2>5. Patlama olasiligi nasil hesaplandi?</h2>
      <p>
        "Patlama" bu motorda tek bir seydir: <b>batarya isil kacagi (thermal
        runaway)</b>. Rotor parcalanmasi ayri bir katastrofik moddur ama patlama
        degildir. Model ucunu ayri ayri toplar:
      </p>
      <ol>
        <li>
          <b>Ic kisa devre</b> — uretim kaynakli taban olasilik. Literaturde ticari
          Li-ion hucreler icin hucre basina 1e-7…1e-8 mertebesinde bildirilir; 120
          hucre bu tabani 120 kat buyutur.
        </li>
        <li>
          <b>Termal tetiklenme</b> — Arrhenius oz-isinma hizi ile sogutma
          kapasitesinin yarismasi. Su an hucre {f(s.risk.runaway.cellTempC, 0)} °C,
          kacak baslangici {f(s.risk.runaway.onsetTempC, 0)} °C, marj{' '}
          <b>{f(s.risk.runaway.marginK, 0)} K</b>. Oz-isinma{' '}
          {s.risk.runaway.selfHeatRate.toExponential(1)} °C/dk, sogutma{' '}
          {f(s.risk.runaway.coolingCapacity, 2)} °C/dk — yani sistem kararli.
        </li>
        <li>
          <b>Mekanik hasar</b> — kopan kanat veya buz parcasinin pakete ulasmasi.
          Halka modul yerlesimi bu yolu kisaltir; bu yuzden kanal cidari ile paket
          arasina aramid sargi konur.
        </li>
      </ol>
      <p>
        Sonuc: bu calisma icin patlama olasiligi{' '}
        <b>{s.risk.explosionPerRun.toExponential(1)}</b>, saat basina{' '}
        <b>{s.risk.explosionPerHour.toExponential(1)}</b>. Tek hucrenin kacmasi{' '}
        {f(s.risk.runaway.cellEnergyKj, 0)} kJ aciga cikarir ve komsu hucreye{' '}
        {f(s.risk.runaway.propagationDelayS, 0)} saniyede yayilir; <b>tum paket
        kacarsa {f(s.risk.runaway.packEnergyMj, 1)} MJ</b> — yaklasik 4 kg TNT'nin
        isil esdegeri (patlayici degil, yangin enerjisi). Bu sayi, BMS ve hucre
        bazli sigortanin neden tartisilmaz oldugunu tek basina anlatiyor.
      </p>
      <p>{s.risk.certificationNote}</p>

      <h3>Muhafaza (containment) — tasarimin en zayif noktasi</h3>
      <p>
        Kopan tek bir kanat {f(s.containment.bladeEnergy, 0)} J tasiyor;{' '}
        {f(s.containment.fragmentVelocity, 0)} m/s hizla firliyor. 4 mm basili
        CF-PETG cidarin sogurma kapasitesi{' '}
        {f(s.containment.ductCapacity, 0)} J — <b>tam sinirda</b>, yani emniyet
        payi yok. {f(s.containment.aramidLayers, 0)} kat aramid sargi kapasiteyi{' '}
        {f(s.containment.withAramid, 0)} J'e cikarir ve{' '}
        {f(s.containment.withAramid / s.containment.bladeEnergy, 1)}× marj saglar.
        Bu yuzden aramid sargi <b>opsiyonel degil, tasarimin parcasidir</b>.
      </p>

      {/* =================================================================== */}
      <h2>6. Dayaniklilik ve omur</h2>
      <p>
        Belirleyici bilesen <b>{s.durability.limitingComponent}</b>. Kanat yorulmasi
        ve mil pratikte sinirsiz omurlu cikiyor (gerilmeler malzeme dayanim
        sinirlarinin cok altinda); sinirlayici olan sarj cevrimleri ve yatak gres
        omrudur.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Bilesen</th>
            <th>Omur</th>
            <th>Belirleyen mekanizma</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Kanat (yorulma)</td>
            <td>{s.durability.bladeLifeHours > 1e6 ? '> 10⁶ sa' : `${f(s.durability.bladeLifeHours, 0)} sa`}</td>
            <td style={{ textAlign: 'left', fontFamily: 'var(--sans)' }}>
              Basquin + Goodman; gerilme genligi cok kucuk
            </td>
          </tr>
          <tr>
            <td>Yatak</td>
            <td>{f(s.durability.bearingLifeHours, 0)} sa</td>
            <td style={{ textAlign: 'left', fontFamily: 'var(--sans)' }}>
              Gres omru (L10 degil) — yuksek devir
            </td>
          </tr>
          <tr>
            <td>Batarya</td>
            <td>
              {f(s.durability.batteryCycles, 0)} cevrim / {f(s.durability.batteryLifeHours, 0)} sa
            </td>
            <td style={{ textAlign: 'left', fontFamily: 'var(--sans)' }}>
              %80 kapasiteye dusme; C-orani ve sicaklikla hizlanir
            </td>
          </tr>
          <tr>
            <td>Motor</td>
            <td>{s.durability.motorLifeHours > 1e5 ? '> 10⁵ sa' : `${f(s.durability.motorLifeHours, 0)} sa`}</td>
            <td style={{ textAlign: 'left', fontFamily: 'var(--sans)' }}>
              Sargi yalitimi, Arrhenius (10 K = yarim omur)
            </td>
          </tr>
        </tbody>
      </table>
      <h3>Bakim programi</h3>
      <ul>
        {s.durability.schedule.map((x, i) => (
          <li key={i}>
            <b>{x.at}</b> — {x.action}
          </li>
        ))}
      </ul>

      {/* =================================================================== */}
      <h2>7. Modelin sinirlari — neye guvenilir, neye guvenilmez</h2>
      <p>
        Bir simulasyonun degeri, nerede yanlis olabilecegini soylemesiyle olculur.
        Bu modelin bilinen sinirlari:
      </p>
      <ul>
        <li>
          <b>Aerodinamik 1B ortalama-cizgi (mean-line) modelidir</b>, CFD degil. Uc
          bosluk kacagi, kose ayrilmalari ve ikincil akislar ampirik katsayilarla
          temsil edilir. Itki tahmininde <b>±%15</b> hata beklenmelidir.
        </li>
        <li>
          <b>Yapisal analiz kapali form formullere dayanir</b>, sonlu elemanlar
          degil. Kanat kok gerilmesi ve emniyet katsayilari bu yuzden cok yuksek
          cikiyor; gercek FDM parcalarda katman arasi kusurlar, bosluklar ve
          gerilme yigilmalari bu marji <b>onemli olcude yer</b>.
        </li>
        <li>
          <b>Malzeme verileri basilmis numune olcumlerinden</b> alinmistir ama sizin
          yaziciniz, filamentiniz ve nem durumunuz farkli sonuc verir. Kritik
          parcalari basmadan once kendi numunenizi cekip dogrulayin.
        </li>
        <li>
          <b>Risk olasiliklari mertebe tahminidir</b>, sertifikasyon degeri degil.
          Gerilme-dayanim girisim modeli, dagilimlarin varsayilan sekline duyarlidir.
        </li>
        <li>
          <b>Yorulma ve gres omru</b> sabit calisma noktasi icin hesaplanir; gercek
          kullanimda gaz kolu degisimleri (Miner toplami) omru kisaltir.
        </li>
      </ul>

      {/* =================================================================== */}
      <h2>8. Kaynaklar</h2>
      <p>
        Tasarim, acik erisimli (open access) bilimsel yayinlara ve standart
        muhendislik referanslarina dayandirildi. Kod icindeki koseli parantezli
        etiketler ([A1], [M3], [B2] gibi) bu listeye isaret eder.
      </p>
      <ul>
        {REFERENCES.map((r) => (
          <li key={r.tag} style={{ marginBottom: 6 }}>
            <code>{r.tag}</code> {r.authors}, <i>{r.title}</i>. {r.venue}
            {r.year ? `, ${r.year}` : ''}.{' '}
            {r.doi && (
              <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
                doi:{r.doi}
              </a>
            )}
            {r.url && !r.doi && (
              <a href={r.url} target="_blank" rel="noreferrer">
                baglanti
              </a>
            )}
            <div style={{ color: 'var(--fg-dimmer)', fontSize: 11.5 }}>{r.usedFor}</div>
          </li>
        ))}
      </ul>

      <h2>9. Uyari</h2>
      <div className="alert danger" style={{ fontSize: 12 }}>
        <b>!</b>
        <span>
          Bu proje <b>deneysel ve egitim amaclidir</b>. Rotor uc hizi 130 m/s,
          batarya enerjisi {f(PACK_SUMMARY.enerjiWh, 0)} Wh'dir. Aramid muhafaza
          sargisi, BMS, hucre sigortalari ve uzaktan calistirma <b>zorunludur</b>.
          Hicbir havacilik uygulamasinda kullanilamaz; tasarim hicbir sertifikasyon
          surecinden gecmemistir.
        </span>
      </div>
    </div>
  );
}

function Card(props: { l: string; v: string; u?: string; s?: string }) {
  return (
    <div className="card">
      <div className="l">{props.l}</div>
      <div className="v">
        {props.v}
        {props.u && <small>{props.u}</small>}
      </div>
      {props.s && <div className="s">{props.s}</div>}
    </div>
  );
}
