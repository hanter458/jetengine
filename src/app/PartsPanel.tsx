/**
 * Parca katalogu paneli (BOM).
 * ============================
 * Gruplanmis parca listesi, gerçek mesh hacminden hesaplanan kutleler,
 * baskiya sigma kontrolu ve tek tek / toplu indirme.
 */

import { useMemo, useState } from 'react';
import {
  GROUP_LABELS,
  PARTS,
  allMetrics,
  massBudget,
  type PartDef,
  type PartGroup,
} from '../engine/parts';
import { MATERIALS } from '../engine/materials';
import { meshDiagnostics } from '../engine/exporters/stl';
import type { MeshData } from '../engine/geom/mesh';
import { BarChart } from './Charts';

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export function PartsPanel(props: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  hidden: Set<string>;
  onToggleHidden: (id: string) => void;
  meshOf: ((p: PartDef) => MeshData) | null;
  onDownloadSTL: (p: PartDef) => void;
  onDownloadOBJ: (p: PartDef) => void;
  onDownloadAll: () => void;
  onDownloadAssembly: () => void;
  zipBusy: { on: boolean; frac: number; label: string };
}) {
  const metrics = useMemo(() => allMetrics(), []);
  const budget = useMemo(() => massBudget(), []);
  const [open, setOpen] = useState<Set<PartGroup>>(
    () => new Set(['fan', 'duct'] as PartGroup[]),
  );
  const [filter, setFilter] = useState<'all' | 'FDM' | 'CNC' | 'COTS'>('all');

  const byId = useMemo(
    () => new Map(metrics.map((m) => [m.def.id, m])),
    [metrics],
  );

  const sel = props.selected ? byId.get(props.selected) : null;
  const selDef = sel?.def;

  const diag = useMemo(() => {
    if (!selDef || !props.meshOf || selDef.process === 'COTS') return null;
    return meshDiagnostics(props.meshOf(selDef));
  }, [selDef, props.meshOf]);

  const groups = (Object.keys(GROUP_LABELS) as PartGroup[])
    .map((g) => ({
      g,
      parts: PARTS.filter((p) => p.group === g && (filter === 'all' || p.process === filter)),
    }))
    .filter((x) => x.parts.length > 0);

  return (
    <>
      {/* ------------------------------------------------------- indirme */}
      <div className="section">
        <h3>
          Indirme
          <span className="pill">{budget.partTypes} tip</span>
        </h3>
        <div className="section-body">
          <button
            className="btn primary"
            onClick={props.onDownloadAll}
            disabled={props.zipBusy.on || !props.meshOf}
            style={{ marginBottom: 6 }}
          >
            {props.zipBusy.on
              ? `${(props.zipBusy.frac * 100).toFixed(0)}% — ${props.zipBusy.label}`
              : `TUM PARCALARI INDIR (${budget.partTypes} STL + OBJ)`}
          </button>
          {props.zipBusy.on && (
            <div className="bar" style={{ height: 3, background: '#2f3b4d', borderRadius: 2, marginBottom: 8 }}>
              <div
                style={{
                  width: `${props.zipBusy.frac * 100}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 2,
                }}
              />
            </div>
          )}
          <button className="btn" onClick={props.onDownloadAssembly} disabled={!props.meshOf}>
            Tam montaji indir (.obj)
          </button>
          <p style={{ color: 'var(--fg-dimmer)', fontSize: 10.5, lineHeight: 1.5, margin: '9px 0 0' }}>
            ZIP icinde her parca tipi: STL (baski yonunde) + OBJ (montaj
            konumunda), COTS referans modelleri, <code style={{ fontSize: 10 }}>BOM.csv</code>,
            baski ayarlari. Eksik parca birakilmaz.
          </p>
        </div>
      </div>

      {/* --------------------------------------------------- kutle butcesi */}
      <div className="section">
        <h3>Kutle butcesi</h3>
        <div className="section-body">
          <BarChart
            title="Gruba gore"
            note={`${f(budget.totalMass / 1000, 2)} kg`}
            bars={budget.byGroup.map((b) => ({
              label: b.label,
              value: b.mass,
              text: `${f(b.mass / 1000, 2)} kg`,
            }))}
          />
          <KVRow k="Basili (FDM)" v={`${f(budget.printedMass / 1000, 2)} kg`} />
          <KVRow k="Hazir alinan (COTS)" v={`${f(budget.cotsMass / 1000, 2)} kg`} />
          <KVRow k="Islenmis (CNC)" v={`${f(budget.machinedMass / 1000, 2)} kg`} />
          <KVRow k="Filament hacmi" v={`${f(budget.printedVolumeCm3, 0)} cm³`} />
          <KVRow k="Fiziksel parca" v={`${budget.physicalPieces} adet`} />
          <KVRow k="Tahmini maliyet" v={`${budget.totalCost.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`} />
        </div>
      </div>

      {/* ------------------------------------------------- secili parca */}
      {selDef && sel && (
        <div className="section">
          <h3>
            {selDef.id}
            <span className="pill">{selDef.process}</span>
          </h3>
          <div className="section-body">
            <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45 }}>{selDef.name}</p>
            <KVRow k="Malzeme" v={MATERIALS[selDef.material].name} small />
            <KVRow k="Adet" v={`${selDef.qty}`} />
            <KVRow k="Birim kutle" v={`${f(sel.massEach, 1)} g`} />
            <KVRow k="Toplam kutle" v={`${f(sel.massTotal, 1)} g`} />
            {selDef.process === 'FDM' && (
              <KVRow k="Dolgu" v={`%${(selDef.infill * 100).toFixed(0)}`} />
            )}
            <KVRow
              k="Olcu (montaj eksende)"
              v={`${sel.size.map((v) => v.toFixed(1)).join(' × ')} mm`}
              small
            />
            <KVRow k="Ucgen" v={sel.triangles.toLocaleString('tr-TR')} />
            <KVRow
              k="256 mm tablaya sigar"
              v={sel.fitsBuildVolume ? 'evet' : 'HAYIR'}
              tone={sel.fitsBuildVolume ? 'ok' : 'danger'}
            />
            {diag && (
              <KVRow
                k="Mesh su gecirmez"
                v={diag.watertight ? 'evet' : `${diag.openEdges} acik kenar`}
                tone={diag.watertight ? 'ok' : 'warn'}
              />
            )}

            {selDef.printNote && (
              <div className="alert info" style={{ marginTop: 9 }}>
                <b>⬆</b>
                <span>{selDef.printNote}</span>
              </div>
            )}
            {selDef.note && (
              <p style={{ color: 'var(--fg-dim)', fontSize: 10.5, lineHeight: 1.5, margin: '2px 0 9px' }}>
                {selDef.note}
              </p>
            )}
            {selDef.critical && (
              <div className="alert danger">
                <b>!</b>
                <span>
                  KRITIK PARCA — arizasi motor kaybina yol acar. Baski ayarlarindan
                  taviz vermeyin, basim sonrasi gozle kontrol edin.
                </span>
              </div>
            )}
            {selDef.process === 'COTS' && (
              <div className="alert warn">
                <b>i</b>
                <span>
                  Bu parca HAZIR ALINIR (katalog urunu). Modeli yalnizca yerlesim
                  kontrolu icindir — basmayin.
                </span>
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 4 }}>
              <button
                className="btn"
                onClick={() => props.onDownloadSTL(selDef)}
                disabled={!props.meshOf}
              >
                .STL indir
              </button>
              <button
                className="btn"
                onClick={() => props.onDownloadOBJ(selDef)}
                disabled={!props.meshOf}
              >
                .OBJ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- parca listesi */}
      <div className="section">
        <h3>Parca listesi</h3>
        <div className="section-body">
          <div className="chips">
            {(['all', 'FDM', 'CNC', 'COTS'] as const).map((x) => (
              <button
                key={x}
                className={`chip${filter === x ? ' on' : ''}`}
                onClick={() => setFilter(x)}
              >
                {x === 'all' ? 'Tumu' : x === 'FDM' ? 'Basilacak' : x === 'CNC' ? 'Islenecek' : 'Hazir'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groups.map(({ g, parts }) => {
        const isOpen = open.has(g);
        const mass = parts.reduce((s, p) => s + (byId.get(p.id)?.massTotal ?? 0), 0);
        return (
          <div key={g}>
            <button
              className="group-head"
              onClick={() =>
                setOpen((prev) => {
                  const n = new Set(prev);
                  if (n.has(g)) n.delete(g);
                  else n.add(g);
                  return n;
                })
              }
            >
              <span>{isOpen ? '▾' : '▸'}</span>
              {GROUP_LABELS[g]}
              <span className="n">
                {parts.length} · {f(mass / 1000, 2)} kg
              </span>
            </button>
            {isOpen &&
              parts.map((p) => {
                const m = byId.get(p.id)!;
                const isSel = props.selected === p.id;
                const isHidden = props.hidden.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`part${isSel ? ' sel' : ''}`}
                    style={{ opacity: isHidden ? 0.42 : 1 }}
                    onClick={() => props.onSelect(isSel ? null : p.id)}
                  >
                    <div className="pid">
                      {p.id}
                      {p.qty > 1 && (
                        <span style={{ color: 'var(--fg-dimmer)', fontWeight: 400 }}>×{p.qty}</span>
                      )}
                      <span className={`tag ${p.process.toLowerCase()}`}>{p.process}</span>
                      {p.critical && <span className="tag crit">KRITIK</span>}
                      {!m.fitsBuildVolume && <span className="tag big">BUYUK</span>}
                    </div>
                    <div className="pmeta">
                      {f(m.massTotal, 0)} g
                      <button
                        className="btn mini"
                        style={{ marginLeft: 6, padding: '2px 6px' }}
                        title={isHidden ? 'Goster' : 'Gizle'}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onToggleHidden(p.id);
                        }}
                      >
                        {isHidden ? '○' : '●'}
                      </button>
                    </div>
                    <div className="pname">{p.name}</div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

function KVRow(props: { k: string; v: string; tone?: 'ok' | 'warn' | 'danger'; small?: boolean }) {
  return (
    <div className={`kv${props.tone ? ` ${props.tone}` : ''}`}>
      <span>{props.k}</span>
      <b style={props.small ? { fontSize: 10, whiteSpace: 'normal', textAlign: 'right' } : undefined}>
        {props.v}
      </b>
    </div>
  );
}
