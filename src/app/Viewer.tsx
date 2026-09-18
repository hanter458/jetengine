/**
 * Three.js 3D goruntuleyici.
 * ==========================
 * Motor geometrisi `parts.ts` uzerinden ISTEMCIDE uretilir (hazir model
 * dosyasi yok). Parcalar tek tek yuklenir; boylece 1.1 milyon ucgen
 * arayuzu kilitlemez ve kullanici "montaj oluyor" gorur.
 *
 * Ozellikler
 *   - yorunge (orbit) kamerasi, parca secimi, izole etme
 *   - patlatilmis gorunum (explode) kaydiricisi
 *   - yarim kesit (section) modu — ic akis yolunu gosterir
 *   - donen rotorlar: hiz simulasyonun COZDUGU devirle birebir
 *   - akis cizgileri (streamlines): hiz ve yogunluk debiye bagli
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PARTS, type PartDef } from '../engine/parts';
import { MATERIALS } from '../engine/materials';
import { TOTAL_LENGTH } from '../engine/spec';
import type { MeshData } from '../engine/geom/mesh';

export interface ViewerHandle {
  /** Secili parcanin mesh'ini dondurur (indirme icin). */
  meshOf: (p: PartDef) => MeshData;
  frameAll: () => void;
}

export interface ViewerProps {
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Gizlenen parca kimlikleri. */
  hidden: Set<string>;
  /** Yalnizca bu parca gosterilsin (izole). */
  isolate: boolean;
  explode: number;
  section: boolean;
  spin: boolean;
  /** Simulasyondan gelen GERCEK devir [rpm]. */
  rpm: number;
  /** Akis gosterimi icin eksenel hiz [m/s] (0 = akis yok). */
  axialVelocity: number;
  showFlow: boolean;
  wireframe: boolean;
  onProgress: (loaded: number, total: number, label: string) => void;
  onReady: (h: ViewerHandle) => void;
}

/** Donen parcalar — simulasyon devriyle dondurulur. */
const ROTATING = new Set(['ROTOR-01', 'ROTOR-02', 'SPINNER', 'SHAFT', 'HUB-ADAPTER', 'COUPLING']);

/** MeshData -> THREE.BufferGeometry (duz gölgeleme icin normaller hesaplanir). */
function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}

export function Viewer(props: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState<null | {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
    groups: Map<string, THREE.Group>;
    meshes: Map<string, MeshData>;
    rotors: THREE.Object3D[];
    flow: THREE.Points | null;
    clip: THREE.Plane;
  }>(null);

  const state = useRef(props);
  state.current = props;

  // ---------------------------------------------------------------- kurulum
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c11);
    scene.fog = new THREE.Fog(0x090c11, 1400, 3400);

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 9000);
    camera.position.set(820, 520, 980);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(TOTAL_LENGTH / 2, 0, 0);
    controls.maxDistance = 4200;
    controls.minDistance = 90;

    // --- isiklar: teknik urun gorseli duzeni ---
    scene.add(new THREE.HemisphereLight(0x9fc4e8, 0x0c1016, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(700, 900, 800);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x89b6e8, 0.85);
    fill.position.set(-600, 200, -500);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x5fd8ff, 0.7);
    rim.position.set(-200, -400, 600);
    scene.add(rim);

    // --- zemin izgarasi ---
    const grid = new THREE.GridHelper(3000, 60, 0x1c2534, 0x141a24);
    grid.position.set(TOTAL_LENGTH / 2, -280, 0);
    scene.add(grid);

    // --- eksen / olcek cubugu (1000 mm) ---
    const scaleBar = new THREE.Group();
    const barMat = new THREE.LineBasicMaterial({ color: 0x39a7ff });
    const barGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -272, 260),
      new THREE.Vector3(TOTAL_LENGTH, -272, 260),
    ]);
    scaleBar.add(new THREE.Line(barGeo, barMat));
    for (const x of [0, TOTAL_LENGTH]) {
      const t = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -292, 260),
        new THREE.Vector3(x, -252, 260),
      ]);
      scaleBar.add(new THREE.Line(t, barMat));
    }
    scene.add(scaleBar);

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

    const groups = new Map<string, THREE.Group>();
    const meshes = new Map<string, MeshData>();
    const rotors: THREE.Object3D[] = [];

    // --- akis parcaciklari ---
    const N_FLOW = 2600;
    const flowPos = new Float32Array(N_FLOW * 3);
    const flowSeed = new Float32Array(N_FLOW * 3); // r, theta, hiz katsayisi
    for (let i = 0; i < N_FLOW; i++) {
      const r = 18 + Math.sqrt(Math.random()) * 82;
      const th = Math.random() * Math.PI * 2;
      flowSeed[i * 3] = r;
      flowSeed[i * 3 + 1] = th;
      flowSeed[i * 3 + 2] = 0.75 + Math.random() * 0.5;
      flowPos[i * 3] = Math.random() * (TOTAL_LENGTH + 500) - 180;
      flowPos[i * 3 + 1] = r * Math.cos(th);
      flowPos[i * 3 + 2] = r * Math.sin(th);
    }
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
    flowGeo.setAttribute('aSeed', new THREE.BufferAttribute(flowSeed, 3));
    const flow = new THREE.Points(
      flowGeo,
      new THREE.PointsMaterial({
        size: 3.4,
        color: 0x6fd6ff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    flow.visible = false;
    scene.add(flow);

    const g = { scene, camera, controls, renderer, groups, meshes, rotors, flow, clip };

    // ------------------------------------------------------- kademeli yukleme
    let cancelled = false;
    let i = 0;
    const order = [...PARTS].sort((a, b) => {
      // gorsel olarak onemli parcalari once yukle
      const w = (p: PartDef) => (p.group === 'fan' ? 0 : p.group === 'duct' ? 1 : p.process === 'COTS' ? 4 : 2);
      return w(a) - w(b);
    });

    const step = () => {
      if (cancelled) return;
      const budgetEnd = performance.now() + 26; // kare butcesi
      while (i < order.length && performance.now() < budgetEnd) {
        const p = order[i++];
        const mat = MATERIALS[p.material];
        const single = p.build();
        meshes.set(p.id, single);
        const geo = toGeometry(p.buildAll ? p.buildAll() : single);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(mat.color),
          metalness: mat.metalness,
          roughness: mat.roughness,
          clippingPlanes: [clip],
          clipShadows: true,
          side: THREE.DoubleSide,
          flatShading: false,
        });
        const mesh = new THREE.Mesh(geo, material);
        mesh.userData.partId = p.id;
        const group = new THREE.Group();
        group.add(mesh);
        group.userData.partId = p.id;
        group.userData.explode = p.explode;
        scene.add(group);
        groups.set(p.id, group);
        if (ROTATING.has(p.id)) rotors.push(group);
      }
      state.current.onProgress(i, order.length, i < order.length ? order[i].id : 'hazir');
      if (i < order.length) requestAnimationFrame(step);
      else {
        setGl(g);
        state.current.onReady({
          meshOf: (p) => meshes.get(p.id) ?? p.build(),
          frameAll: () => {
            camera.position.set(820, 520, 980);
            controls.target.set(TOTAL_LENGTH / 2, 0, 0);
          },
        });
      }
    };
    requestAnimationFrame(step);

    // ------------------------------------------------------------ boyutlanma
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ------------------------------------------------------------ tiklama
    const ray = new THREE.Raycaster();
    let downAt = { x: 0, y: 0, t: 0 };
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      // suruklemeyi secim sayma
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      if (performance.now() - downAt.t > 420) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hits = ray.intersectObjects([...groups.values()], true);
      const hit = hits.find((h) => (h.object as THREE.Mesh).visible);
      state.current.onSelect(hit ? (hit.object.userData.partId as string) : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // ----------------------------------------------------------- render dongusu
    let raf = 0;
    let angle = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = state.current;

      // rotor donusu: rpm -> rad/s. Gorsel netlik icin 1/9'a olceklenir,
      // yoksa 12 500 rpm 60 fps'de stroboskopik takilma yapar.
      if (s.spin && s.rpm > 0) {
        angle += ((s.rpm * Math.PI * 2) / 60) * dt * 0.111;
        for (const r of rotors) r.rotation.x = angle;
      }

      // akis parcaciklari
      if (flow.visible && s.axialVelocity > 0) {
        const pos = flowGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let k = 0; k < N_FLOW; k++) {
          const seed = flowSeed[k * 3 + 2];
          // Kanal icinde hizlanir, cikista jet hizinda
          const x = arr[k * 3];
          const inDuct = x > 0 && x < TOTAL_LENGTH;
          const vScale = inDuct ? 1 : x <= 0 ? 0.42 : 1.15;
          arr[k * 3] += s.axialVelocity * seed * vScale * dt * 2.2;
          if (arr[k * 3] > TOTAL_LENGTH + 460) arr[k * 3] -= TOTAL_LENGTH + 640;
          // fan arkasinda burulma (swirl artigi)
          if (x > 520) {
            const r = flowSeed[k * 3];
            flowSeed[k * 3 + 1] += dt * 1.15 * seed;
            arr[k * 3 + 1] = r * Math.cos(flowSeed[k * 3 + 1]);
            arr[k * 3 + 2] = r * Math.sin(flowSeed[k * 3 + 1]);
          }
        }
        pos.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------- gorunurluk / vurgu / patlatma
  useLayoutEffect(() => {
    if (!gl) return;
    const { groups, clip, flow } = gl;
    clip.constant = props.section ? 0.5 : 1e6;
    if (flow) flow.visible = props.showFlow;

    for (const [id, group] of groups) {
      const visible =
        !props.hidden.has(id) && (!props.isolate || !props.selected || id === props.selected);
      group.visible = visible;
      const e = group.userData.explode as [number, number, number];
      const k = props.explode;
      group.position.set(e[0] * k * 300, e[1] * k * 180, e[2] * k * 180);

      const mesh = group.children[0] as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.wireframe = props.wireframe;
      const sel = props.selected === id;
      const dim = props.selected !== null && !sel && !props.isolate;
      mat.emissive.setHex(sel ? 0x1f5f96 : 0x000000);
      mat.emissiveIntensity = sel ? 0.9 : 0;
      mat.opacity = dim ? 0.18 : 1;
      mat.transparent = dim;
      mat.depthWrite = !dim;
    }
  }, [gl, props.hidden, props.isolate, props.selected, props.explode, props.section, props.wireframe, props.showFlow]);

  return <div ref={host} style={{ position: 'absolute', inset: 0 }} />;
}
