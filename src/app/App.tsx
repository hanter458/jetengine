/**
 * EDF-1000 web arayuzu — ana bilesen.
 * ===================================
 * Uc sekme:
 *   MODEL  — 3D goruntuleyici + parca katalogu + indirme
 *   SIMULASYON — cevre kosullari, performans, risk, dayaniklilik
 *   RAPOR  — tasarim gerekcesi ve kaynaklar
 *
 * Simulasyon her kontrol degisikliginde YENIDEN COZULUR (tam fizik modeli,
 * ~15 ms). Goruntuleyicideki rotor devri de simulasyonun cozdugu devirdir —
 * arayuzde uydurma bir animasyon yok.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Viewer, type ViewerHandle } from './Viewer';
import { Controls, Results } from './SimPanel';
import { PartsPanel } from './PartsPanel';
import { DesignReport } from './Report';
import { SCENARIOS, SIM_DEFAULT, simulate, type SimInput } from '../engine/physics/simulate';
import { ENGINE_NAME, TOTAL_LENGTH, DESIGN } from '../engine/spec';
import type { PartDef } from '../engine/parts';
import {
  downloadAllZip,
  downloadAssemblyOBJ,
  downloadOBJ,
  downloadSTL,
} from './download';
import { fullAssembly } from '../engine/parts';

type Tab = 'model' | 'sim' | 'report';

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export function App() {
  const [tab, setTab] = useState<Tab>('model');

  // ------------------------------------------------------------ simulasyon
  const [input, setInput] = useState<SimInput>(SIM_DEFAULT);
  const [scenario, setScenario] = useState('ISA');

  const sim = useMemo(() => simulate(input), [input]);

  const patch = useCallback((p: Partial<SimInput>) => {
    setInput((prev) => ({ ...prev, ...p }));
  }, []);

  const patchEnv = useCallback((p: Partial<SimInput['env']>) => {
    setScenario('SERBEST');
    setInput((prev) => ({ ...prev, env: { ...prev.env, ...p } }));
  }, []);

  const applyScenario = useCallback((id: string) => {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    setScenario(id);
    setInput((prev) => ({ ...prev, env: { ...prev.env, ...sc.env } }));
  }, []);

  // ------------------------------------------------------- goruntuleyici
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [isolate, setIsolate] = useState(false);
  const [explode, setExplode] = useState(0);
  const [section, setSection] = useState(false);
  const [spin, setSpin] = useState(true);
  const [showFlow, setShowFlow] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 1, label: 'baslatiliyor' });
  const [ready, setReady] = useState(false);
  const handle = useRef<ViewerHandle | null>(null);

  const [zipBusy, setZipBusy] = useState({ on: false, frac: 0, label: '' });

  const onProgress = useCallback((loaded: number, total: number, label: string) => {
    setProgress({ loaded, total, label });
  }, []);

  const onReady = useCallback((h: ViewerHandle) => {
    handle.current = h;
    setReady(true);
  }, []);

  const meshOf = useMemo(
    () => (ready ? (p: PartDef) => handle.current!.meshOf(p) : null),
    [ready],
  );

  const toggleHidden = useCallback((id: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleZip = useCallback(async () => {
    if (!meshOf) return;
    setZipBusy({ on: true, frac: 0, label: 'hazirlaniyor' });
    try {
      await downloadAllZip(meshOf, (frac, label) => setZipBusy({ on: true, frac, label }));
    } finally {
      setZipBusy({ on: false, frac: 0, label: '' });
    }
  }, [meshOf]);

  // ------------------------------------------------------------------ HUD
  const rpm = sim.diagnostics.rpmAchieved;
  const thrustKgf = sim.fan.thrust / 9.80665;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <b>{ENGINE_NAME}</b>
          <span>
            {TOTAL_LENGTH} mm elektrikli kanalli fan · {DESIGN.rpm.toLocaleString('tr-TR')} rpm ·
            20S6P 18 000 mAh
          </span>
        </div>
        <nav className="tabs">
          <button className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')}>
            Model & Parcalar
          </button>
          <button className={tab === 'sim' ? 'on' : ''} onClick={() => setTab('sim')}>
            Simulasyon
          </button>
          <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
            Tasarim Raporu
          </button>
        </nav>
      </header>

      {tab === 'report' ? (
        <div className="pane">
          <DesignReport sim={sim} />
        </div>
      ) : (
        <div className="main">
          {/* ----------------------------------------------------- sol */}
          <aside className="pane left">
            {tab === 'model' ? (
              <PartsPanel
                selected={selected}
                onSelect={setSelected}
                hidden={hidden}
                onToggleHidden={toggleHidden}
                meshOf={meshOf}
                onDownloadSTL={(p) => meshOf && downloadSTL(p, meshOf(p))}
                onDownloadOBJ={(p) => meshOf && downloadOBJ(p, meshOf(p))}
                onDownloadAll={handleZip}
                onDownloadAssembly={() => downloadAssemblyOBJ(fullAssembly())}
                zipBusy={zipBusy}
              />
            ) : (
              <Controls
                input={input}
                onChange={patch}
                onEnv={patchEnv}
                scenario={scenario}
                onScenario={applyScenario}
                sim={sim}
              />
            )}
          </aside>

          {/* --------------------------------------------------- sahne */}
          <div className="stage">
            <Viewer
              selected={selected}
              onSelect={setSelected}
              hidden={hidden}
              isolate={isolate}
              explode={explode}
              section={section}
              spin={spin}
              rpm={rpm}
              axialVelocity={sim.fan.axialVelocity}
              showFlow={showFlow}
              weather={{
                tempC: sim.input.env.tempC,
                rainRate: sim.input.env.rainRate,
                snow: sim.input.env.snow,
                humidity: sim.input.env.humidity,
                icingActive: sim.icing.active,
                icingType: sim.icing.type,
                blockage: sim.icing.blockage,
              }}
              wireframe={wireframe}
              onProgress={onProgress}
              onReady={onReady}
            />

            {!ready && (
              <div className="loading">
                <div className="lbl">
                  Geometri uretiliyor — {progress.loaded} / {progress.total} parca
                </div>
                <div className="bar">
                  <i style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
                </div>
                <div className="lbl" style={{ color: 'var(--fg-dimmer)' }}>
                  {progress.label}
                </div>
              </div>
            )}

            {/* HUD — canli calisma noktasi */}
            <div className="hud">
              <div className="hud-box">
                <div className="t">Calisma noktasi</div>
                <div className="r">
                  <span>devir</span>
                  <b>{f(rpm, 0)} rpm</b>
                </div>
                <div className="r">
                  <span>itki</span>
                  <b>
                    {f(sim.fan.thrust, 0)} N / {f(thrustKgf, 1)} kgf
                  </b>
                </div>
                <div className="r">
                  <span>guc</span>
                  <b>{f(sim.motor.busPower / 1000, 2)} kW</b>
                </div>
                <div className="r">
                  <span>debi</span>
                  <b>{f(sim.fan.massFlow, 2)} kg/s</b>
                </div>
                <div className="r">
                  <span>jet hizi</span>
                  <b>{f(sim.fan.exitVelocity * 3.6, 0)} km/h</b>
                </div>
              </div>
              <div className="hud-box">
                <div className="t">Cevre</div>
                <div className="r">
                  <span>hava</span>
                  <b>
                    {f(sim.input.env.tempC, 0)} °C · {f(sim.input.env.altitude, 0)} m
                  </b>
                </div>
                <div className="r">
                  <span>yogunluk</span>
                  <b>{f(sim.air.density, 3)} kg/m³</b>
                </div>
                <div className="r">
                  <span>yagis</span>
                  <b style={{ color: sim.input.env.snow || sim.input.env.rainRate > 0 ? '#8fd0ff' : undefined }}>
                    {sim.input.env.snow
                      ? `kar ${f(Math.max(sim.input.env.rainRate, 8), 0)} mm/h SWE`
                      : sim.input.env.rainRate > 0
                        ? `${f(sim.input.env.rainRate, 0)} mm/h yagmur`
                        : 'yok'}
                  </b>
                </div>
                <div className="r">
                  <span>{sim.icing.type === 'kuru kar' ? 'kar tikaci' : 'buz'}</span>
                  <b style={{ color: sim.icing.active ? '#ff4d5e' : undefined }}>
                    {sim.icing.active
                      ? `${sim.icing.type} · %${f(sim.icing.blockage, 0)}`
                      : 'yok'}
                  </b>
                </div>
                <div className="r">
                  <span>motor</span>
                  <b
                    style={{
                      color:
                        sim.thermal.motor.tempC > sim.thermal.motor.limitC ? '#ff4d5e' : undefined,
                    }}
                  >
                    {f(sim.thermal.motor.tempC, 0)} °C
                  </b>
                </div>
              </div>
              <div className="hud-box">
                <div className="t">Sonuc</div>
                <div className="r">
                  <span>maks. hiz</span>
                  <b style={{ color: '#39a7ff' }}>{f(sim.performance.maxSpeedKmh, 0)} km/h</b>
                </div>
                <div className="r">
                  <span>sure</span>
                  <b>{f(sim.performance.enduranceMin, 1)} dk</b>
                </div>
                <div className="r">
                  <span>tuketim</span>
                  <b>{f(sim.performance.mahPerMinute, 0)} mAh/dk</b>
                </div>
                <div className="r">
                  <span>patlama/sa</span>
                  <b
                    style={{
                      color:
                        sim.risk.explosionPerHour > 1e-4
                          ? '#ff4d5e'
                          : sim.risk.explosionPerHour > 1e-5
                            ? '#ffb020'
                            : '#2ecc71',
                    }}
                  >
                    {sim.risk.explosionPerHour.toExponential(1)}
                  </b>
                </div>
                <div className="r">
                  <span>T/W</span>
                  <b>{f(sim.mass.thrustToWeight, 2)}</b>
                </div>
              </div>
            </div>

            {/* sahne araclari */}
            <div className="stage-tools">
              <button className={`chip${spin ? ' on' : ''}`} onClick={() => setSpin(!spin)}>
                {spin ? '⏸ Donusu durdur' : '▶ Dondur'}
              </button>
              <button className={`chip${showFlow ? ' on' : ''}`} onClick={() => setShowFlow(!showFlow)}>
                Hava akisi
              </button>
              <button className={`chip${section ? ' on' : ''}`} onClick={() => setSection(!section)}>
                Kesit
              </button>
              <button
                className={`chip${isolate ? ' on' : ''}`}
                onClick={() => setIsolate(!isolate)}
                disabled={!selected}
              >
                Izole
              </button>
              <button className={`chip${wireframe ? ' on' : ''}`} onClick={() => setWireframe(!wireframe)}>
                Tel kafes
              </button>
              <button className="chip" onClick={() => handle.current?.frameAll()}>
                Kamerayi sifirla
              </button>
              {hidden.size > 0 && (
                <button className="chip" onClick={() => setHidden(new Set())}>
                  {hidden.size} gizli parcayi goster
                </button>
              )}
            </div>

            {/* alt: patlatma + secim bilgisi */}
            <div className="stage-foot">
              <div
                style={{
                  background: 'rgba(10,14,20,.86)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  width: 260,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <div className="ctrl-head">
                  <label>Patlatilmis gorunum</label>
                  <output>{(explode * 100).toFixed(0)}%</output>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explode}
                  onChange={(e) => setExplode(Number(e.target.value))}
                />
              </div>
              {selected && (
                <div
                  style={{
                    background: 'rgba(10,14,20,.86)',
                    border: '1px solid var(--accent)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  {selected}
                  <button
                    className="btn mini"
                    style={{ marginLeft: 9 }}
                    onClick={() => setSelected(null)}
                  >
                    secimi kaldir
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ----------------------------------------------------- sag */}
          {tab === 'sim' && (
            <aside className="pane right">
              <Results sim={sim} onScenario={applyScenario} />
            </aside>
          )}
          {tab === 'model' && (
            <aside className="pane right">
              <ViewerHelp />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function ViewerHelp() {
  return (
    <>
      <div className="section">
        <h3>Nasil kullanilir</h3>
        <div className="section-body">
          <ul style={{ paddingLeft: 17, margin: 0, color: 'var(--fg-dim)', fontSize: 11.5, lineHeight: 1.65 }}>
            <li>
              <b style={{ color: 'var(--fg)' }}>Dondurme</b>: sol tus surukle ·{' '}
              <b style={{ color: 'var(--fg)' }}>yakinlastirma</b>: tekerlek ·{' '}
              <b style={{ color: 'var(--fg)' }}>kaydirma</b>: sag tus
            </li>
            <li>
              Modelde bir parcaya <b style={{ color: 'var(--fg)' }}>tiklayin</b> — soldaki
              listede secilir, olculeri ve indirme dugmeleri gelir.
            </li>
            <li>
              <b style={{ color: 'var(--fg)' }}>Kesit</b> dugmesi motoru ortadan kesip ic
              akis yolunu, rotorlari ve batarya halkasini gosterir.
            </li>
            <li>
              <b style={{ color: 'var(--fg)' }}>Patlatilmis gorunum</b> kaydiricisi montaj
              sirasini anlamak icin parcalari ayirir.
            </li>
            <li>
              Rotor donus hizi uydurma degildir — Simulasyon sekmesinde cozulen{' '}
              <b style={{ color: 'var(--fg)' }}>gercek devirdir</b> (gorsel netlik icin
              1/9 olcekli gosterilir).
            </li>
          </ul>
        </div>
      </div>

      <div className="section">
        <h3>Renk kodu = malzeme</h3>
        <div className="section-body">
          <Swatch c="#26282c" t="PA6-CF" d="Kanat, rotor, yatak yuvasi — tavlanmis, 56 MPa" />
          <Swatch c="#31353b" t="CF-PETG" d="Kanal, giris, nozul — 60 MPa, boyut kararli" />
          <Swatch c="#1f2226" t="PC-CF" d="Motor bolmesi — HDT 148 °C" />
          <Swatch c="#8d949e" t="ASA" d="Dis kaporta — UV/ozon dayanimli" />
          <Swatch c="#15171a" t="TPU 95A" d="Conta, titresim yalitimi" />
          <Swatch c="#9aa5b4" t="Aluminyum / celik" d="Mil, kaplin, yatak (islenmis)" />
        </div>
      </div>

      <div className="section">
        <h3>Guvenlik</h3>
        <div className="section-body">
          <div className="alert danger">
            <b>!</b>
            <span>
              Rotor uc hizi ~130 m/s. Kopan bir kanat 53 J tasir; 4 mm basili cidar
              tam sinirda kalir. <b>Kanal cevresine 3 kat aramid sargi zorunludur.</b>
            </span>
          </div>
          <div className="alert danger">
            <b>!</b>
            <span>
              Paket 1296 Wh enerji tasir — tum paketin isil kacagi ~17 MJ aciga
              cikarir. BMS, hucre bazli sigorta ve yanmaz muhafaza atlanamaz.
            </span>
          </div>
          <div className="alert warn">
            <b>i</b>
            <span>
              Bu bir <b>deneysel egitim projesidir</b>. Ilk calistirmayi koruyucu kafes
              arkasindan, uzaktan gaz kolu ile yapin. Havacilikta kullanilamaz.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Swatch(props: { c: string; t: string; d: string }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '5px 0' }}>
      <div
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          background: props.c,
          border: '1px solid #3a4453',
          flexShrink: 0,
          marginTop: 1,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600 }}>{props.t}</div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-dimmer)', lineHeight: 1.4 }}>{props.d}</div>
      </div>
    </div>
  );
}
