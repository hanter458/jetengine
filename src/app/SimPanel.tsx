/**
 * Simulasyon kontrol + sonuc panelleri.
 * =====================================
 * Kullanicinin sordugu dort soruyu dogrudan yanitlar:
 *   1) kis / yagmur / sicak / yuk altinda nasil tepki veriyor
 *   2) patlama olasiligi ne
 *   3) dayanikliligi ne
 *   4) maks. kac km/h ve ne kadar batarya harciyor
 */

import type { SimInput, SimResult } from '../engine/physics/simulate';
import { SCENARIOS } from '../engine/physics/simulate';
import { PACK_SUMMARY } from '../engine/physics/battery';
import { AIRFRAMES, DESIGN, PACK } from '../engine/spec';
import { LineChart, BarChart, CampbellChart } from './Charts';

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** Cok buyuk omur degerlerini okunur hale getirir. */
const life = (h: number): string => {
  if (!Number.isFinite(h)) return 'sinirsiz';
  if (h > 1e6) return '> 10⁶ sa';
  if (h > 1e4) return `${(h / 1000).toFixed(0)}k sa`;
  if (h > 100) return `${h.toFixed(0)} sa`;
  return `${h.toFixed(1)} sa`;
};

/** Olasiligi hem bilimsel hem "1 / N" olarak gosterir. */
const prob = (p: number): string => {
  if (p <= 0) return '~0';
  if (p > 0.01) return `%${(p * 100).toFixed(1)}`;
  return `${p.toExponential(1)}  (1 / ${Math.round(1 / p).toLocaleString('tr-TR')})`;
};

function Ctrl(props: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  v: number;
  hot?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ctrl">
      <div className="ctrl-head">
        <label>{props.label}</label>
        <output>{props.value}</output>
      </div>
      <input
        type="range"
        className={props.hot ? 'hot' : undefined}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.v}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

function KV(props: { k: string; v: string; u?: string; tone?: 'ok' | 'warn' | 'danger' | 'big' }) {
  return (
    <div className={`kv${props.tone ? ` ${props.tone}` : ''}`}>
      <span>{props.k}</span>
      <b>
        {props.v}
        {props.u && <i>{props.u}</i>}
      </b>
    </div>
  );
}

// ===========================================================================
// SOL PANEL — kontroller
// ===========================================================================

export function Controls(props: {
  input: SimInput;
  onChange: (patch: Partial<SimInput>) => void;
  onEnv: (patch: Partial<SimInput['env']>) => void;
  scenario: string;
  onScenario: (id: string) => void;
  sim: SimResult;
}) {
  const { input, sim } = props;
  const e = input.env;

  return (
    <>
      <div className="section">
        <h3>
          Hava senaryosu
          <span className="pill">{props.scenario}</span>
        </h3>
        <div className="section-body">
          <div className="chips">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                className={`chip${props.scenario === s.id ? ' on' : ''}`}
                onClick={() => props.onScenario(s.id)}
                title={`${s.label} — ${s.note}`}
              >
                {s.id === 'ISA'
                  ? 'Standart'
                  : s.id === 'WINTER'
                    ? 'Kis -15°'
                    : s.id === 'ICING'
                      ? 'Buzlanma'
                      : s.id === 'SNOW'
                        ? 'Kar'
                        : s.id === 'RAIN'
                          ? 'Yagmur'
                          : s.id === 'MONSOON'
                            ? 'Saganak'
                            : s.id === 'HOT'
                              ? 'Sicak 50°'
                              : s.id === 'HOTHIGH'
                                ? 'Sicak+Yuksek'
                                : 'Yuksek irtifa'}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--fg-dimmer)', fontSize: 10.5, lineHeight: 1.5, margin: '8px 0 0' }}>
            {SCENARIOS.find((s) => s.id === props.scenario)?.note ??
              'Kaydiricilari elle degistirdiniz (serbest mod).'}
          </p>
          {(e.snow || e.rainRate > 0 || sim.icing.active) && (
            <div className={`alert ${sim.icing.active ? 'danger' : 'warn'}`} style={{ marginTop: 8 }}>
              <b>{e.snow ? '❄' : e.rainRate > 0 ? '☂' : 'i'}</b>
              <span>
                {e.snow
                  ? `Kar ortami aktif: ${f(Math.max(e.rainRate, 8), 0)} mm/h su esdegeri, ` +
                    `izgara tikanmasi %${f(sim.icing.blockage, 0)}, birikim ${f(sim.icing.iceMass, 0)} g.`
                  : e.rainRate > 0
                    ? `Yagmur ${f(e.rainRate, 0)} mm/h` +
                      (sim.icing.active
                        ? ` — buzlanma (${sim.icing.type}), blokaj %${f(sim.icing.blockage, 0)}.`
                        : '.')
                    : `${sim.icing.type}, blokaj %${f(sim.icing.blockage, 0)}.`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <h3>Calisma noktasi</h3>
        <div className="section-body">
          <Ctrl
            label="Gaz kolu"
            value={`%${(input.throttle * 100).toFixed(0)} → ${f(sim.diagnostics.rpmAchieved, 0)} rpm`}
            min={0.05}
            max={1}
            step={0.01}
            v={input.throttle}
            hot={input.throttle > 0.92}
            onChange={(v) => props.onChange({ throttle: v })}
          />
          <Ctrl
            label="Ucus hizi"
            value={`${f(e.airspeed * 3.6, 0)} km/h`}
            min={0}
            max={95}
            step={1}
            v={e.airspeed}
            onChange={(v) => props.onEnv({ airspeed: v })}
          />
          <Ctrl
            label="Calisma suresi"
            value={`${f(e.runTime / 60, 1)} dk`}
            min={10}
            max={900}
            step={10}
            v={e.runTime}
            onChange={(v) => props.onEnv({ runTime: v })}
          />
          <div className="ctrl">
            <div className="ctrl-head">
              <label>Govde</label>
            </div>
            <div className="chips">
              {AIRFRAMES.map((a) => (
                <button
                  key={a.id}
                  className={`chip${input.airframeId === a.id ? ' on' : ''}`}
                  onClick={() => props.onChange({ airframeId: a.id })}
                  title={a.label}
                >
                  {a.id}
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--fg-dimmer)', fontSize: 10.5, margin: '6px 0 0', lineHeight: 1.45 }}>
              {sim.airframe.label}
            </p>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Cevre kosullari</h3>
        <div className="section-body">
          <Ctrl
            label="Sicaklik"
            value={`${f(e.tempC, 0)} °C`}
            min={-40}
            max={55}
            step={1}
            v={e.tempC}
            hot={e.tempC > 40}
            onChange={(v) => props.onEnv({ tempC: v })}
          />
          <Ctrl
            label="Irtifa"
            value={`${f(e.altitude, 0)} m`}
            min={0}
            max={6000}
            step={100}
            v={e.altitude}
            onChange={(v) => props.onEnv({ altitude: v })}
          />
          <Ctrl
            label="Bagil nem"
            value={`%${f(e.humidity, 0)}`}
            min={0}
            max={100}
            step={1}
            v={e.humidity}
            onChange={(v) => props.onEnv({ humidity: v })}
          />
          <Ctrl
            label="Yagis siddeti"
            value={e.rainRate > 0 ? `${f(e.rainRate, 0)} mm/h` : 'yok'}
            min={0}
            max={160}
            step={1}
            v={e.rainRate}
            hot={e.rainRate > 50}
            onChange={(v) => props.onEnv({ rainRate: v })}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={e.snow}
              onChange={(ev) => {
                if (ev.target.checked) {
                  props.onEnv({
                    snow: true,
                    tempC: Math.min(e.tempC, -6),
                    humidity: Math.max(e.humidity, 90),
                    rainRate: Math.max(e.rainRate, 12),
                  });
                } else {
                  props.onEnv({ snow: false, rainRate: 0 });
                }
              }}
            />
            Kar / kuru kar taneleri
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={input.antiIceOn}
              onChange={(ev) => props.onChange({ antiIceOn: ev.target.checked })}
            />
            Buz onleyici isitici acik
          </label>
        </div>
      </div>

      <div className="section">
        <h3>Kutle / yuk</h3>
        <div className="section-body">
          <Ctrl
            label="Faydali yuk"
            value={`${f(e.payload, 1)} kg`}
            min={0}
            max={40}
            step={0.5}
            v={e.payload}
            hot={e.payload > 20}
            onChange={(v) => props.onEnv({ payload: v })}
          />
          <Ctrl
            label="Manevra yuk faktoru"
            value={`${f(e.loadFactor, 1)} g`}
            min={1}
            max={6}
            step={0.1}
            v={e.loadFactor}
            hot={e.loadFactor > 4}
            onChange={(v) => props.onEnv({ loadFactor: v })}
          />
          <KV k="Motor kutlesi" v={f(sim.mass.engine, 2)} u="kg" />
          <KV k="Govde bos" v={f(sim.mass.airframe, 1)} u="kg" />
          <KV k="TOPLAM" v={f(sim.mass.total, 2)} u="kg" />
          <KV
            k="Itki / agirlik"
            v={f(sim.mass.thrustToWeight, 2)}
            tone={sim.mass.thrustToWeight >= 1 ? 'ok' : undefined}
          />
        </div>
      </div>

      <div className="section">
        <h3>Batarya durumu</h3>
        <div className="section-body">
          <Ctrl
            label="Sarj durumu (SOC)"
            value={`%${(input.soc * 100).toFixed(0)}`}
            min={0.1}
            max={1}
            step={0.01}
            v={input.soc}
            onChange={(v) => props.onChange({ soc: v })}
          />
          <Ctrl
            label="Paket yasi"
            value={`${input.cycles} cevrim`}
            min={0}
            max={600}
            step={10}
            v={input.cycles}
            hot={input.cycles > 400}
            onChange={(v) => props.onChange({ cycles: v })}
          />
          <Ctrl
            label="Sizdirmazlik kalitesi"
            value={input.sealing > 0.9 ? 'IP67' : input.sealing > 0.7 ? 'IP54' : 'zayif'}
            min={0.3}
            max={1}
            step={0.05}
            v={input.sealing}
            onChange={(v) => props.onChange({ sealing: v })}
          />
          <KV k="Paket" v={`${PACK.series}S${PACK.parallel}P`} u="21700" />
          <KV
            k="Kapasite"
            v={PACK_SUMMARY.kapasiteMah.toLocaleString('tr-TR')}
            u="mAh"
            tone="big"
          />
          <KV k="Enerji" v={f(PACK_SUMMARY.enerjiWh, 0)} u="Wh" />
          <KV k="Kullanilabilir" v={f(sim.battery.usableEnergy, 0)} u="Wh" />
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// SAG PANEL — sonuclar
// ===========================================================================

export function Results(props: { sim: SimResult; onScenario: (id: string) => void }) {
  const s = props.sim;
  const p = s.performance;
  const d = s.diagnostics;
  const r = s.risk;

  const motorTone =
    s.thermal.motor.tempC > s.thermal.motor.limitC
      ? 'danger'
      : s.thermal.motor.tempC > s.thermal.motor.limitC * 0.85
        ? 'warn'
        : 'ok';
  const battTone =
    s.thermal.battery.tempC > s.thermal.battery.limitC
      ? 'danger'
      : s.thermal.battery.tempC > 45
        ? 'warn'
        : 'ok';

  return (
    <>
      {/* ------------------------------------------------------ uyarilar */}
      {s.warnings.length > 0 && (
        <div className="section">
          <h3>
            Uyarilar
            <span className="pill">{s.warnings.length}</span>
          </h3>
          <div className="section-body">
            {s.warnings.map((w, i) => (
              <div key={i} className={`alert ${/patlama|kacak|muhafaza|asiyor|kritik/i.test(w) ? 'danger' : 'warn'}`}>
                <b>!</b>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- performans */}
      <div className="section">
        <h3>
          Performans
          <span className="pill">{d.rpmLimitedBy}</span>
        </h3>
        <div className="section-body">
          <KV k="MAKS. HIZ" v={f(p.maxSpeedKmh, 0)} u="km/h" tone="big" />
          <KV k="Jet cikis hizi" v={f(p.jetSpeedKmh, 0)} u="km/h" />
          <KV k="Maks. hizda Mach" v={f(p.maxMach, 3)} />
          <KV k="Itki" v={`${f(s.fan.thrust, 1)} N`} u={`${f(s.fan.thrust / 9.80665, 1)} kgf`} />
          <KV k="Devir" v={f(d.rpmAchieved, 0)} u="rpm" />
          <KV k="Kutle debisi" v={f(s.fan.massFlow, 2)} u="kg/s" />
          <KV k="Fan basinc orani" v={f(s.fan.pressureRatio, 3)} />
          <KV k="Fan verimi (net)" v={`%${f(s.fan.eff.net * 100, 1)}`} />
          <KV k="Merit figuru" v={f(s.fan.figureOfMerit, 3)} />
          <KV k="0 → %90 hizlanma" v={f(p.accelTime, 1)} u="s" />
          <KV k="Tirmanma hizi" v={f(p.climbRate, 1)} u="m/s" />
          <KV k="Gurultu (1 m)" v={f(s.fan.spl, 0)} u="dBA" tone={s.fan.spl > 95 ? 'warn' : undefined} />
        </div>
      </div>

      {/* ------------------------------------------------------- batarya */}
      <div className="section">
        <h3>Batarya tuketimi</h3>
        <div className="section-body">
          <KV k="Bu gaz kolunda sure" v={f(p.enduranceMin, 1)} u="dk" tone="big" />
          <KV k="En iyi dayaniklilik" v={f(p.bestEnduranceMin, 0)} u="dk" />
          <KV k="  bu gaz kolunda" v={`%${f(p.bestEnduranceThrottle * 100, 0)}`} />
          <KV k="Tuketim" v={f(p.mahPerMinute, 0)} u="mAh/dk" />
          <KV k="Enerji" v={f(p.energyPerMinute, 0)} u="Wh/dk" />
          <KV k="Enerji / mesafe" v={f(p.energyPerKm, 0)} u="Wh/km" />
          <KV k="Menzil" v={f(p.rangeKm, 1)} u="km" />
          <KV k="Cekilen akim" v={f(s.battery.current, 0)} u="A" />
          <KV k="Hucre C-orani" v={f(s.battery.cRate, 2)} u="C" tone={s.battery.cRate > 8 ? 'warn' : undefined} />
          <KV k="Paket gerilimi" v={f(s.battery.voltage, 1)} u="V" />
          <KV k="Gerilim dususu" v={f(s.battery.sag, 2)} u="V" />
          <KV k="Elektrik gucu" v={f(s.motor.busPower / 1000, 2)} u="kW" />
          <KV k="Itki / guc" v={f((s.fan.thrust / s.motor.busPower) * 1000, 1)} u="N/kW" />
        </div>
      </div>

      {/* -------------------------------------------------------- termal */}
      <div className="section">
        <h3>Termal</h3>
        <div className="section-body">
          <KV
            k={`Motor sargisi (limit ${s.thermal.motor.limitC}°)`}
            v={f(s.thermal.motor.tempC, 0)}
            u="°C"
            tone={motorTone}
          />
          <KV
            k={`ESC (limit ${s.thermal.esc.limitC}°)`}
            v={f(s.thermal.esc.tempC, 0)}
            u="°C"
            tone={s.thermal.esc.tempC > s.thermal.esc.limitC ? 'danger' : 'ok'}
          />
          <KV
            k={`Batarya (limit ${s.thermal.battery.limitC}°)`}
            v={f(s.thermal.battery.tempC, 0)}
            u="°C"
            tone={battTone}
          />
          <KV k="Denge sicakligi (motor)" v={f(s.thermal.motor.steadyTempC, 0)} u="°C" />
          <KV k="Zaman sabiti (motor)" v={f(s.thermal.motor.tau / 60, 1)} u="dk" />
          <KV k="Buharlasmali sogutma" v={f(s.thermal.evaporativeCooling, 0)} u="W" />
          {s.icing.active && (
            <>
              <KV k="Birikmis buz" v={f(s.icing.iceMass, 1)} u="g" tone="warn" />
              <KV
                k="Giris tikanmasi"
                v={`%${f(s.icing.blockage, 1)}`}
                tone={s.icing.blockage > 15 ? 'danger' : 'warn'}
              />
              <KV k="Buz tipi" v={s.icing.type} />
              <KV k="Buz birikme hizi" v={f(s.icing.accretionRate, 2)} u="g/s" />
              <KV k="Buz onleme gucu" v={f(s.icing.antiIcePower, 0)} u="W" />
              {s.icing.sheddingRisk && (
                <div className="alert danger" style={{ marginTop: 7 }}>
                  <b>!</b>
                  <span>
                    Buz atma (shedding) esigi asildi — kopan buz parcasi rotora
                    carparak kanat kirabilir.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- risk */}
      <div className="section">
        <h3>
          Patlama / ariza olasiligi
          <span className="pill">{r.riskLevel}</span>
        </h3>
        <div className="section-body">
          <KV
            k="PATLAMA/YANGIN (saat basina)"
            v={r.explosionPerHour.toExponential(1)}
            tone={r.explosionPerHour > 1e-4 ? 'danger' : r.explosionPerHour > 1e-5 ? 'warn' : 'ok'}
          />
          <KV k="  bu calisma icin" v={prob(r.explosionPerRun)} />
          <KV k="Rotor parcalanmasi" v={prob(r.burstPerRun)} />
          <KV k="Katastrofik olay (saat)" v={r.catastrophicPerHour.toExponential(1)} />
          <KV k="Arizalar arasi sure" v={life(r.mtbfHours)} />
          <div style={{ height: 8 }} />
          <KV k="Hucre sicakligi" v={f(r.runaway.cellTempC, 0)} u="°C" />
          <KV k="Kacak baslangici" v={f(r.runaway.onsetTempC, 0)} u="°C" />
          <KV
            k="Kacaga kalan marj"
            v={f(r.runaway.marginK, 0)}
            u="K"
            tone={r.runaway.marginK < 25 ? 'danger' : r.runaway.marginK < 50 ? 'warn' : 'ok'}
          />
          <KV k="Oz-isinma / sogutma" v={`${r.runaway.selfHeatRate.toExponential(1)} / ${f(r.runaway.coolingCapacity, 2)}`} u="°C/dk" />
          <KV k="Tek hucre enerjisi" v={f(r.runaway.cellEnergyKj, 0)} u="kJ" />
          <KV k="Tum paket enerjisi" v={f(r.runaway.packEnergyMj, 1)} u="MJ" tone="warn" />
          <KV k="Hucreler arasi yayilma" v={f(r.runaway.propagationDelayS, 0)} u="s" />
          <p style={{ color: 'var(--fg-dimmer)', fontSize: 10, lineHeight: 1.5, margin: '8px 0 0' }}>
            {r.certificationNote}
          </p>
        </div>
      </div>

      <div className="section">
        <h3>Ariza modlari</h3>
        <div className="section-body">
          <BarChart
            title="Saat basina olasilik"
            note="log olcek"
            log
            bars={r.modes.map((m) => ({
              label: `${m.label}`,
              value: m.perHour,
              text: `${m.perHour.toExponential(1)}  ×${f(m.margin, 1)}`,
              color:
                m.severity === 'katastrofik'
                  ? '#ff4d5e'
                  : m.severity === 'tehlikeli'
                    ? '#ff8c42'
                    : m.severity === 'ciddi'
                      ? '#ffb020'
                      : '#5d6878',
            }))}
          />
          <p style={{ color: 'var(--fg-dimmer)', fontSize: 10, lineHeight: 1.5, margin: 0 }}>
            Sagdaki sayi marjdir (×1 = tam sinirda). En kritik mod:{' '}
            <b style={{ color: 'var(--fg)' }}>{r.modes[0]?.label}</b> — {r.modes[0]?.mitigation}
          </p>
        </div>
      </div>

      {/* --------------------------------------------------- dayaniklilik */}
      <div className="section">
        <h3>
          Dayaniklilik
          <span className="pill">{s.durability.limitingComponent}</span>
        </h3>
        <div className="section-body">
          <KV k="Revizyon araligi (TBO)" v={life(s.durability.overhaulInterval)} tone="big" />
          <KV k="Kanat yorulma omru" v={life(s.durability.bladeLifeHours)} />
          <KV k="Yatak omru" v={life(s.durability.bearingLifeHours)} />
          <KV k="Motor omru" v={life(s.durability.motorLifeHours)} />
          <KV k="Batarya cevrim omru" v={f(s.durability.batteryCycles, 0)} u="cevrim" />
          <KV k="Batarya calisma omru" v={life(s.durability.batteryLifeHours)} />
          <div style={{ height: 10 }} />
          <table className="tbl">
            <thead>
              <tr>
                <th>Bakim</th>
                <th>Islem</th>
              </tr>
            </thead>
            <tbody>
              {s.durability.schedule.map((x, i) => (
                <tr key={i}>
                  <td>{x.at}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'normal', fontFamily: 'var(--sans)' }}>
                    {x.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------------- yapisal */}
      <div className="section">
        <h3>Yapisal</h3>
        <div className="section-body">
          <table className="tbl">
            <thead>
              <tr>
                <th>Sira</th>
                <th>σ tepe</th>
                <th>izin</th>
                <th>EK</th>
              </tr>
            </thead>
            <tbody>
              {s.bladeStresses.map((b) => (
                <tr key={b.rowId}>
                  <td>{b.rowId}</td>
                  <td>{f(b.peak, 2)}</td>
                  <td>{f(b.allowable, 0)}</td>
                  <td className={b.safetyFactor < 1.5 ? 'r' : b.safetyFactor < 3 ? 'y' : 'g'}>
                    {b.safetyFactor > 99 ? '>99' : f(b.safetyFactor, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ height: 8 }} />
          <KV
            k="Mil calisma/kritik devir"
            v={f(s.shaft.speedRatio, 2)}
            tone={s.shaft.speedRatio > 0.7 ? 'danger' : 'ok'}
          />
          <KV k="Mil kritik devri" v={f(s.shaft.criticalRpm, 0)} u="rpm" />
          <KV k="Kopan kanat enerjisi" v={f(s.containment.bladeEnergy, 0)} u="J" />
          <KV
            k="Basili cidar kapasitesi"
            v={f(s.containment.ductCapacity, 0)}
            u="J"
            tone={s.containment.containedByDuct ? 'ok' : 'danger'}
          />
          <KV k="Aramid sargili" v={f(s.containment.withAramid, 0)} u="J" tone="ok" />
          <KV k="Gerekli aramid kat" v={f(s.containment.aramidLayers, 0)} />
          <KV k="Firlama hizi" v={f(s.containment.fragmentVelocity, 0)} u="m/s" />
          <KV k="Stall marji" v={`%${f(s.diagnostics.stallMargin * 100, 0)}`} tone={s.diagnostics.stallRisk ? 'danger' : 'ok'} />
        </div>
      </div>

      {/* ------------------------------------------------------ grafikler */}
      <div className="section">
        <h3>Grafikler</h3>
        <div className="section-body">
          <LineChart
            title="Itki ve surukleme"
            note="maks. hizi kesisim belirler"
            xLabel="km/h"
            yLabel="N"
            series={[
              {
                label: 'Itki',
                color: '#39a7ff',
                fill: true,
                points: p.thrustCurve.map((c) => [c.speed * 3.6, c.thrust]),
              },
              {
                label: 'Surukleme',
                color: '#ff8c42',
                dashed: true,
                points: p.thrustCurve.map((c) => [c.speed * 3.6, c.drag]),
              },
            ]}
            marker={p.maxSpeedKmh}
          />
          <LineChart
            title="Gaz kolu — itki / guc"
            xLabel="%gaz"
            yLabel="N"
            yLabelRight="kW"
            series={[
              {
                label: 'Itki (N)',
                color: '#39a7ff',
                points: p.throttleSweep.map((t) => [t.throttle * 100, t.thrust]),
              },
              {
                label: 'Guc (kW)',
                color: '#ff4d5e',
                right: true,
                points: p.throttleSweep.map((t) => [t.throttle * 100, t.power / 1000]),
              },
            ]}
            marker={s.input.throttle * 100}
          />
          <LineChart
            title="Gaz kolu — dayaniklilik"
            note="verimlilik tepe noktasi"
            xLabel="%gaz"
            yLabel="dk"
            series={[
              {
                label: 'Sure (dk)',
                color: '#00d8a7',
                fill: true,
                points: p.throttleSweep.map((t) => [t.throttle * 100, Math.min(t.endurance, 120)]),
              },
            ]}
            marker={s.input.throttle * 100}
            thresholds={[{ y: p.enduranceMin, label: 'simdiki', color: '#ffb020' }]}
          />
          <LineChart
            title="Gaz kolu — gurultu"
            xLabel="%gaz"
            yLabel="dBA"
            yZero={false}
            series={[
              {
                label: 'SPL @ 1 m',
                color: '#c084fc',
                points: p.throttleSweep.map((t) => [t.throttle * 100, t.spl]),
              },
            ]}
            thresholds={[{ y: 85, label: 'kulak koruma siniri', color: '#ffb020' }]}
            marker={s.input.throttle * 100}
          />
          <CampbellChart
            rpmMax={DESIGN.rpmMax}
            rpm={d.rpmAchieved}
            modes={s.bladeModes.map((m, i) => ({
              label: m.rowId,
              freq: m.runningFreq,
              color: i === 0 ? '#39a7ff' : '#00d8a7',
            }))}
            orders={[...new Map(s.campbell.map((c) => [c.order, c])).values()].map((c) => ({
              order: c.order,
              severity: c.severity,
            }))}
            crossings={s.campbell}
          />
        </div>
      </div>

      {/* ------------------------------------------------- senaryo tablosu */}
      <div className="section">
        <h3>Senaryo karsilastirmasi</h3>
        <div className="section-body">
          <p style={{ color: 'var(--fg-dimmer)', fontSize: 10.5, margin: '0 0 8px', lineHeight: 1.5 }}>
            Ayni gaz kolunda tum hava kosullarini kiyaslar. Satira tiklayarak o
            senaryoyu yukleyin.
          </p>
          <div className="chips">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} className="chip" onClick={() => props.onScenario(sc.id)}>
                {sc.id}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
