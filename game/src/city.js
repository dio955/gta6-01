// Solmar Heat — the city of Solmar. A compact 5x5-block grid (pitch 46 m)
// inside [-138, 138], streets exactly at x,z in {-115,-69,-23,23,69,115},
// districts, landmarks, props, the marina and its water, traffic lights,
// and the two graphs the AI drives on: the road graph (traffic, police,
// convoy) and the sidewalk graph (pedestrians). All placement is seeded, so
// the city is identical on every load.
import * as THREE from 'three';
import { BUILDING_COLOURS, CITY, PALETTE, mulberry32, pick } from './palette.js';

const STREETS = CITY.streets;
const BLOCK_CENTRES = [-92, -46, 0, 46, 92];

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e2d2'; g.fillRect(0, 0, 128, 128);
  const rng = mulberry32(7);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      g.fillStyle = rng() < 0.16 ? '#ffcf6e' : '#2c3e50';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f45'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f5f2ea'; g.fillRect(30, 6, 4, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function crosswalkTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f45'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f5f2ea';
  for (let i = 0; i < 5; i++) {
    g.fillRect(8 + i * 24, 4, 12, 20);
    g.fillRect(8 + i * 24, 104, 12, 20);
    g.fillRect(4, 8 + i * 24, 20, 12);
    g.fillRect(104, 8 + i * 24, 20, 12);
  }
  return new THREE.CanvasTexture(c);
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7ec0ee');
  grad.addColorStop(0.55, '#a8d0ef');
  grad.addColorStop(0.8, '#ffd9a0');
  grad.addColorStop(1, '#ffcf8e');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

function districtOf(cx, cz) {
  if (cz === 92) return 'marina';
  if ((cx === -46 || cx === 0) && (cz === -46 || cz === 0)) return 'downtown';
  if (cx === -46 && cz === -92) return 'park';
  if (cx >= 46) return 'industrial';
  if (cz <= -46) return 'uptown';
  if (cx <= -46) return 'oldtown';
  return cz > 0 ? 'oldtown' : 'uptown';
}

function heightFor(district, rng) {
  if (district === 'downtown') return 20 + rng() * 25;
  if (district === 'marina') return 6 + rng() * 6;
  if (district === 'oldtown') return 8 + rng() * 6;
  if (district === 'uptown') return 6 + rng() * 6;
  if (district === 'industrial') return 10 + rng() * 6;
  return 8 + rng() * 8;
}

export function createCity(scene) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const buildingMeshes = [];

  const winTex = windowTexture();
  const roadTex = roadTexture();
  const walkTex = crosswalkTexture();
  const buildingMats = BUILDING_COLOURS.map((col) =>
    new THREE.MeshLambertMaterial({ map: winTex, color: col }));
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x9a8f7a });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const crossMat = new THREE.MeshLambertMaterial({ map: walkTex });
  const waterMat = new THREE.MeshLambertMaterial({ color: PALETTE.water });
  const beachMat = new THREE.MeshLambertMaterial({ color: PALETTE.beach });
  const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.leaf });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8763e });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const cabinMat = new THREE.MeshLambertMaterial({ color: PALETTE.teal });

  // Sky dome: vertical gradient, no fog.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  sky.position.y = 0;
  group.add(sky);

  // Ground, beach, water.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0);
  group.add(ground);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(276, 10), beachMat);
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.01, 133);
  group.add(beach);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 120), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.02, 198);
  group.add(water);

  // Sidewalk slabs under every block, roads along every street.
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const district = districtOf(cx, cz);
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(38, 38),
        district === 'park' ? grassMat : walkMat,
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.02, cz);
      group.add(slab);
    }
  }
  for (const s of STREETS) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 288), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? s : 0, 0.04, vertical ? 0 : s);
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, 18);
      road.material = new THREE.MeshLambertMaterial({ map: tex });
      group.add(road);
    }
  }
  // Crosswalk squares at every intersection.
  for (const x of STREETS) {
    for (const z of STREETS) {
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), crossMat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x, 0.06, z);
      group.add(cw);
    }
  }

  // Buildings, one block at a time. Plaza (0,0) stays open; the park block
  // gets trees instead; the marina row gets low sheds plus docks.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function addBuilding(x, z, w, d, h, colourIdx) {
    const mesh = new THREE.Mesh(boxGeo, buildingMats[colourIdx % buildingMats.length]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    const tex = winTex;
    void tex;
    group.add(mesh);
    buildingMeshes.push(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, h, z + d / 2),
    ));
    // Rooftop clutter: an AC box or an antenna on some roofs.
    if (rng() < 0.5) {
      const ac = new THREE.Mesh(boxGeo, poleMat);
      ac.scale.set(1.6, 0.9, 1.6);
      ac.position.set(x + w * 0.2, h + 0.45, z - d * 0.2);
      group.add(ac);
    }
    return mesh;
  }

  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const district = districtOf(cx, cz);
      if (cx === 0 && cz === 0) continue; // Central Plaza: open.
      if (district === 'park') continue; // Park: trees, no buildings.
      const quadrants = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]];
      for (const [qx, qz] of quadrants) {
        if (rng() < 0.3) continue;
        const w = 9 + rng() * 7;
        const d = 8 + rng() * 6;
        const h = heightFor(district, rng);
        addBuilding(cx + qx, cz + qz, w, d, h, Math.floor(rng() * BUILDING_COLOURS.length));
      }
    }
  }

  // Police HQ tower (downtown north) and the garage, hospital, safehouse
  // houses are part of the seeded blocks; the landmarks below are the
  // markers the missions and the HUD point at.
  const landmarks = {
    docks: new THREE.Vector3(0, 0, 122),
    plaza: new THREE.Vector3(0, 0, 0),
    policeHQ: new THREE.Vector3(0, 0, -100),
    garage: new THREE.Vector3(112, 0, 0),
    safehouse: new THREE.Vector3(-69, 0, -110),
    hospital: new THREE.Vector3(-112, 0, 0),
    respray: new THREE.Vector3(66, 0, 66),
    marinaLot: new THREE.Vector3(30, 0, 118),
    oldTownMeet: new THREE.Vector3(-92, 0, 23),
  };

  // Park trees.
  function addTree(x, z, s = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.2 * s, 6), trunkMat);
    trunk.position.set(x, 1.1 * s, z);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6 * s, 8, 6), leafMat);
    canopy.position.set(x, 3 * s, z);
    group.add(trunk); group.add(canopy);
  }
  for (let i = 0; i < 14; i++) {
    addTree(-46 + (rng() - 0.5) * 30, -92 + (rng() - 0.5) * 30, 0.8 + rng() * 0.6);
  }
  for (let i = 0; i < 8; i++) {
    const cx = pick(rng, BLOCK_CENTRES); const cz = pick(rng, BLOCK_CENTRES);
    addTree(cx + (rng() - 0.5) * 30, cz + (rng() - 0.5) * 30, 0.7 + rng() * 0.5);
  }

  // Industrial crates.
  for (let i = 0; i < 12; i++) {
    const cx = pick(rng, [46, 92]); const cz = pick(rng, BLOCK_CENTRES);
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = 1 + rng() * 1.4;
    crate.scale.set(s, s, s);
    crate.position.set(cx + (rng() - 0.5) * 26, s / 2, cz + (rng() - 0.5) * 26);
    crate.rotation.y = rng() * Math.PI;
    group.add(crate);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(crate.position.x - s / 2, 0, crate.position.z - s / 2),
      new THREE.Vector3(crate.position.x + s / 2, s, crate.position.z + s / 2),
    ));
  }

  // Marina: piers, boats, bobbing on the water.
  const boats = [];
  function addPier(x, z, w, len) {
    const pier = new THREE.Mesh(boxGeo, woodMat);
    pier.scale.set(w, 0.5, len);
    pier.position.set(x, 0.25, z);
    group.add(pier);
  }
  addPier(0, 146, 12, 16);
  addPier(-44, 144, 8, 12);
  function addBoat(x, z) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo, hullMat);
    hull.scale.set(3, 1, 7); hull.position.y = 0.4;
    const cabin = new THREE.Mesh(boxGeo, cabinMat);
    cabin.scale.set(2, 1.2, 3); cabin.position.set(0, 1.4, -0.5);
    boat.add(hull); boat.add(cabin);
    boat.position.set(x, 0, z);
    boat.rotation.y = rng() * Math.PI;
    group.add(boat);
    boats.push(boat);
    return boat;
  }
  addBoat(-20, 152); addBoat(24, 158); addBoat(-58, 150); addBoat(52, 148); addBoat(8, 168);

  // Streetlights along the two main avenues.
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const s of [-23, 23]) {
    for (const z of [-92, -46, 0, 46, 92]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(s + 7, 3, z);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(s + 7, 6.1, z);
      group.add(pole); group.add(lamp);
    }
  }

  // Edge barriers: north, west, east walls; south wall with a pier gap.
  function addWall(x, z, w, d, h = 4) {
    const wall = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6a6f75 }));
    wall.scale.set(w, h, d);
    wall.position.set(x, h / 2, z);
    group.add(wall);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, h, z + d / 2),
    ));
  }
  addWall(0, -139, 280, 2);
  addWall(-139, 0, 2, 280);
  addWall(139, 0, 2, 280);
  addWall(-72, 139, 132, 2, 1.4);
  addWall(72, 139, 132, 2, 1.4);
  // Pier side rails.
  addWall(-6.5, 146, 1, 16, 1);
  addWall(6.5, 146, 1, 16, 1);

  // Traffic lights at the four central intersections.
  const trafficLights = [];
  const lampOn = { red: new THREE.MeshBasicMaterial({ color: 0xff3b30 }), yellow: new THREE.MeshBasicMaterial({ color: 0xffcc00 }), green: new THREE.MeshBasicMaterial({ color: 0x34c759 }) };
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x333333 });
  for (const [ix, iz] of [[-23, -23], [-23, 23], [23, -23], [23, 23]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 5.5, 6), poleMat);
    pole.position.set(ix + 8, 2.75, iz + 8);
    group.add(pole);
    const head = new THREE.Group();
    const lamps = {};
    ['red', 'yellow', 'green'].forEach((col, i) => {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampOff);
      lamp.position.set(0, 1 - i * 0.6, 0);
      head.add(lamp);
      lamps[col] = lamp;
    });
    head.position.set(ix + 8, 5.6, iz + 8);
    group.add(head);
    trafficLights.push({ x: ix, z: iz, lamps });
  }

  // Road graph: nodes at every intersection, edges along streets.
  const roadNodes = [];
  const nodeIndex = new Map();
  for (const x of STREETS) {
    for (const z of STREETS) {
      nodeIndex.set(`${x},${z}`, roadNodes.length);
      roadNodes.push({ x, z, edges: [] });
    }
  }
  for (let i = 0; i < roadNodes.length; i++) {
    const n = roadNodes[i];
    const xi = STREETS.indexOf(n.x); const zi = STREETS.indexOf(n.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = STREETS[xi + dx]; const nz = STREETS[zi + dz];
      if (nx === undefined || nz === undefined) continue;
      n.edges.push(nodeIndex.get(`${nx},${nz}`));
    }
  }
  const roadGraph = { nodes: roadNodes };

  // Sidewalk graph: eight ring points per block, ring edges plus crossings
  // across streets so pedestrians can cross at the crosswalks.
  const walkNodes = [];
  const walkEdges = [];
  const ringOffsets = [[-15, -15], [0, -15], [15, -15], [15, 0], [15, 15], [0, 15], [-15, 15], [-15, 0]];
  const blockNodeBase = new Map();
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const base = walkNodes.length;
      blockNodeBase.set(`${cx},${cz}`, base);
      for (const [ox, oz] of ringOffsets) walkNodes.push({ x: cx + ox, z: cz + oz });
      for (let k = 0; k < 8; k++) {
        walkEdges.push([base + k, base + ((k + 1) % 8)]);
      }
    }
  }
  for (let bi = 0; bi < BLOCK_CENTRES.length; bi++) {
    for (let bj = 0; bj < BLOCK_CENTRES.length; bj++) {
      const cx = BLOCK_CENTRES[bi]; const cz = BLOCK_CENTRES[bj];
      const base = blockNodeBase.get(`${cx},${cz}`);
      if (bi + 1 < BLOCK_CENTRES.length) {
        const east = blockNodeBase.get(`${BLOCK_CENTRES[bi + 1]},${cz}`);
        for (const k of [2, 3, 4]) walkEdges.push([base + k, east + [6, 7, 0][k - 2]]);
      }
      if (bj + 1 < BLOCK_CENTRES.length) {
        const south = blockNodeBase.get(`${cx},${BLOCK_CENTRES[bj + 1]}`);
        for (const k of [4, 5, 6]) walkEdges.push([base + k, south + [0, 1, 2][k - 4]]);
      }
    }
  }
  const sidewalkGraph = { nodes: walkNodes, edges: walkEdges };

  let time = 0;

  function lightState() {
    const t = time % 30;
    if (t < 12) return { ns: 'green', ew: 'red' };
    if (t < 15) return { ns: 'yellow', ew: 'red' };
    if (t < 27) return { ns: 'red', ew: 'green' };
    return { ns: 'red', ew: 'yellow' };
  }

  // Push a circle (XZ position, radius) out of every collider. Returns true
  // when it was pushed, and the push direction in `out` (for damage math).
  function resolveCircle(pos, r, out) {
    let pushed = false;
    for (const b of colliders) {
      if (pos.y > b.max.y || pos.y < b.min.y - 2) continue;
      const minX = b.min.x - r; const maxX = b.max.x + r;
      const minZ = b.min.z - r; const maxZ = b.max.z + r;
      if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ) continue;
      const dxl = pos.x - minX; const dxr = maxX - pos.x;
      const dzl = pos.z - minZ; const dzr = maxZ - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) { pos.x = minX; if (out) out.x = -1; }
      else if (m === dxr) { pos.x = maxX; if (out) out.x = 1; }
      else if (m === dzl) { pos.z = minZ; if (out) out.z = -1; }
      else { pos.z = maxZ; if (out) out.z = 1; }
      pushed = true;
    }
    return pushed;
  }

  function hasLineOfSight(a, b) {
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const box of colliders) {
        if (box.max.y < 2) continue;
        if (x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z) return false;
      }
    }
    return true;
  }

  return {
    group, colliders, buildingMeshes,
    streets: STREETS, landmarks, districts: districtOf,
    roadGraph, sidewalkGraph, water,
    trafficLights,
    step(dt) {
      time += dt;
      const state = lightState();
      for (const tl of trafficLights) {
        const active = state.ns;
        for (const col of ['red', 'yellow', 'green']) {
          tl.lamps[col].material = col === active ? lampOn[col] : lampOff;
        }
      }
      for (let i = 0; i < boats.length; i++) {
        boats[i].position.y = Math.sin(time * 0.7 + i * 1.3) * 0.15;
        boats[i].rotation.z = Math.sin(time * 0.5 + i) * 0.02;
      }
    },
    lightState,
    resolveCircle,
    hasLineOfSight,
  };
}
