// Solmar Heat — boot + the one loop. Owns the renderer/scene/camera, the
// game state machine (menu -> playing -> paused -> busted/wasted -> complete),
// the third-person camera, shooting, interactions (E), the wanted/police /
// mission wiring, and the deterministic ?shot= modes the screenshots use.
// Fixed 60 Hz sim, render at display rate; no new objects in hot loops.
import * as THREE from 'three';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createWanted } from './wanted.js';
import { createMissions } from './missions.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { PALETTE, angleLerp, clamp, fmtCash } from './palette.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') ?? 7);

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
scene.fog = new THREE.Fog(0xcfd8e6, 120, 420);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a7a5a, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
sun.position.set(-80, 140, 100);
scene.add(sun);

const city = createCity(scene);
const player = createPlayer(scene, city);
const vehicles = createVehicles(scene, city);
const traffic = createTraffic(scene, city, vehicles);
const peds = createPeds(scene, city);
const police = createPolice(scene, city, vehicles);
const wanted = createWanted();
const missions = createMissions(null);
const economy = createEconomy();
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));
const input = createInput(canvas);
const audio = createAudio();
const save = createSave();

const G = {
  scene, camera, renderer, city, player, vehicles, traffic, peds, police,
  wanted, missions, economy, hud, minimap, audio, save, input,
  time: 0, playTime: 0, camYaw: Math.PI, camPitch: 0.25, camDist: 9, camFar: false,
  shotCam: null,
  state: 'menu',
  onBusted: null, onWasted: null, onGameComplete: null, saveGame: null,
};

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
let lastRunOver = -99;
let pursuedCache = false;
let pursuedAt = -99;

// Tracer + muzzle flash (reused, never recreated).
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
tracer.visible = false;
tracer.frustumCulled = false;
scene.add(tracer);
let tracerUntil = 0;
const flash = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
);
flash.visible = false;
scene.add(flash);
let flashUntil = 0;

function saveGame() {
  save.save({
    cash: economy.cash, totalEarned: economy.totalEarned,
    missionsCompleted: missions.currentIndex, currentMission: missions.currentIndex,
    playerPos: { x: player.pos.x, z: player.pos.z },
    onFoot: player.onFoot, wanted: wanted.stars, playTimeSec: G.playTime,
  });
}
G.saveGame = saveGame;

function newGame() {
  save.clear();
  economy.setCash(0, 0);
  wanted.clear();
  missions.reset();
  if (player.car) vehicles.exitCar(G);
  player.setPos(0, 8, Math.PI);
  player.health = 100;
  player.onFoot = true;
  player.mesh.visible = true;
  G.playTime = 0;
  G.state = 'playing';
  hud.hideMenu(); hud.hideOverlay();
  hud.setObjective(`Go to the yellow marker to start 'First Wheels'`);
  input.requestLock();
}

function continueGame() {
  const data = save.load();
  if (!data) { newGame(); return; }
  economy.setCash(data.cash ?? 0, data.totalEarned ?? 0);
  missions.reset();
  missions.currentIndex = data.missionsCompleted ?? 0;
  wanted.setStars(0);
  player.setPos(data.playerPos?.x ?? 0, data.playerPos?.z ?? 8, Math.PI);
  player.health = 100;
  player.onFoot = data.onFoot !== false;
  player.mesh.visible = player.onFoot;
  G.playTime = data.playTimeSec ?? 0;
  G.state = 'playing';
  hud.hideMenu(); hud.hideOverlay();
  hud.setObjective(`Next job: ${missions.list[missions.currentIndex]?.name ?? 'Free roam'} — go to the yellow marker`);
  input.requestLock();
}

function respawnAt(x, z, fine) {
  const paid = Math.min(fine, economy.cash);
  economy.spend(paid);
  wanted.clear();
  if (player.car) vehicles.exitCar(G);
  player.setPos(x, z, Math.PI);
  player.health = 100;
  missions.restartFromBusted(G);
  G.state = 'playing';
  hud.hideOverlay();
  input.requestLock();
}

G.onBusted = () => {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  audio.busted();
  hud.showOverlay('BUSTED', `The Solmar PD has you. Fine: ${fmtCash(Math.min(150, economy.cash))}.`, 'Press E to continue');
  input.exitLock();
};
G.onWasted = () => {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  audio.busted();
  hud.showOverlay('WASTED', `You wake up at Solmar General. Fine: ${fmtCash(Math.min(150, economy.cash))}.`, 'Press E to continue');
  input.exitLock();
};
G.onGameComplete = () => {
  G.state = 'complete';
  audio.win();
  hud.showOverlay('GAME COMPLETE', `Rex pulled off all five jobs — ${fmtCash(economy.totalEarned)} earned in ${Math.round(G.playTime / 60)} minutes. Solmar is yours now.`, 'Press E to keep roaming');
  input.exitLock();
};

hud.onPlay(() => { audio.unlock(); newGame(); });
hud.onContinue(() => { audio.unlock(); continueGame(); });
hud.onResume(() => { G.state = 'playing'; hud.hidePause(); input.requestLock(); });
hud.onSave(() => { saveGame(); hud.banner('GAME SAVED', 'Progress stored', 2); });
hud.onRestart(() => {
  if (missions.currentDef) { missions.start(missions.currentIndex, G); }
  G.state = 'playing'; hud.hidePause(); input.requestLock();
});
hud.onQuit(() => { G.state = 'menu'; hud.hidePause(); hud.showMenu(save.has()); input.exitLock(); });
hud.onMute(() => { audio.setMuted(!audio.muted); hud.showPause(audio.muted); });

// Esc exits pointer lock on desktop; losing the lock while playing pauses.
input.setOnLockLost(() => {
  if (G.state === 'playing' && !SHOT) {
    G.state = 'paused';
    hud.showPause(audio.muted);
  }
});

function nearestCar(maxDist) {
  let best = null; let bestD = maxDist;
  for (const car of vehicles.cars) {
    if (car.wreck) continue;
    const d = Math.hypot(car.group.position.x - player.pos.x, car.group.position.z - player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function interact() {
  if (missions.interact(G)) return;
  if (G.state !== 'playing') return;
  if (player.onFoot) {
    const car = nearestCar(3);
    if (car) { vehicles.enterCar(car, G); audio.pickup(); return; }
    // Respray: clear the heat for $200 when no cop is near.
    const rs = city.landmarks.respray;
    if (wanted.stars > 0 && Math.hypot(player.pos.x - rs.x, player.pos.z - rs.z) < 10) {
      if (police.nearestCopDist(G) > 40) {
        if (economy.spend(200)) {
          wanted.clear();
          hud.banner('RESPRAY COMPLETE', 'Fresh coat, clean record — heat gone', 2.5);
          audio.jingle();
        } else hud.banner('NOT ENOUGH CASH', 'Respray costs $200', 2);
      } else hud.banner('TOO HOT', 'Lose the cops first', 2);
      return;
    }
  } else {
    const car = player.car;
    const garage = city.landmarks.garage;
    if (car && car.health < car.maxHealth && Math.hypot(car.group.position.x - garage.x, car.group.position.z - garage.z) < 12) {
      if (economy.spend(100)) {
        car.health = car.maxHealth;
        hud.banner('CAR REPAIRED', 'Good as new — $100', 2);
        audio.jingle();
      } else hud.banner('NOT ENOUGH CASH', 'Repairs cost $100', 2);
      return;
    }
    vehicles.exitCar(G);
  }
}

function shoot() {
  if (player.ammo <= 0) { hud.prompt('Press R to reload'); return; }
  if (player.fireTimer > 0 || player.reloadTimer > 0) return;
  player.fireTimer = 0.18;
  player.ammo -= 1;
  audio.shoot();
  // Peds flee from the shot.
  peds.fleeFrom(player.pos, G);
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 60;
  // Tag every live shootable now: traffic, cops and mission cars spawn and
  // despawn during play, so the tags must be fresh on every shot.
  tagShootables();
  const targets = [];
  for (const p of peds.peds) if (!p.down) targets.push(p.mesh);
  for (const c of police.cops) if (!c.down) targets.push(c.mesh);
  for (const car of vehicles.cars) if (!car.wreck) targets.push(car.group);
  for (const b of city.buildingMeshes) targets.push(b);
  const hits = raycaster.intersectObjects(targets, true);
  let end = tmpV2.copy(camera.position).addScaledVector(raycaster.ray.direction, 60);
  if (hits.length) {
    const hit = hits[0];
    end = hit.point;
    let obj = hit.object;
    let what = null;
    while (obj) {
      if (obj.userData && obj.userData.shot) { what = obj.userData.shot; break; }
      if (city.buildingMeshes.includes(obj)) { what = { type: 'wall' }; break; }
      obj = obj.parent;
    }
    if (what) {
      if (what.type === 'ped') peds.hitPed(what.ped, 34, G);
      else if (what.type === 'cop') {
        wanted.addStars(1, 'shot at an officer');
        police.damageCop(what.cop, 34, G);
      } else if (what.type === 'car') vehicles.damage(what.car, 34, G, player);
    }
  }
  // Tracer from the muzzle to the hit point.
  const pos = tracerGeo.attributes.position;
  tmpV.copy(camera.position).addScaledVector(raycaster.ray.direction, 0.7);
  tmpV.x += Math.cos(G.camYaw) * 0.25; tmpV.z -= Math.sin(G.camYaw) * 0.25; tmpV.y -= 0.22;
  pos.setXYZ(0, tmpV.x, tmpV.y, tmpV.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  tracer.visible = true;
  tracerUntil = G.time + 0.06;
  flash.position.copy(tmpV);
  flash.visible = true;
  flashUntil = G.time + 0.05;
  // Recoil: a small camera kick.
  G.camPitch = clamp(G.camPitch + 0.02, -0.15, 0.55);
}

function promptForContext() {
  if (G.state !== 'playing') { hud.prompt(null); return; }
  if (missions.missionState === 'failed') { hud.prompt('Press E to retry the mission'); return; }
  if (player.onFoot) {
    const car = nearestCar(3);
    if (car) { hud.prompt(car.npc === 'traffic' ? 'E — Steal car' : 'E — Enter car'); return; }
    if (missions.missionState === 'idle' && missions.currentIndex < missions.list.length) {
      const def = missions.list[missions.currentIndex];
      if (Math.hypot(player.pos.x - city.landmarks[def.start].x, player.pos.z - city.landmarks[def.start].z) < 10) {
        hud.prompt(`E — Start mission: ${def.name}`); return;
      }
    }
    if (missions.active) {
      const step = missions.currentDef?.steps[missions.stepIndex];
      if (step?.action === 'pickup' && step.marker) {
        const v = city.landmarks[step.marker];
        if (Math.hypot(player.pos.x - v.x, player.pos.z - v.z) < 6) { hud.prompt('E — Pick up the package'); return; }
      }
    }
    const rs = city.landmarks.respray;
    if (wanted.stars > 0 && Math.hypot(player.pos.x - rs.x, player.pos.z - rs.z) < 10) {
      hud.prompt('E — Respray $200 (clear wanted)'); return;
    }
  } else if (player.car) {
    const car = player.car;
    const garage = city.landmarks.garage;
    if (car.health < car.maxHealth && Math.hypot(car.group.position.x - garage.x, car.group.position.z - garage.z) < 12) {
      hud.prompt('E — Repair $100'); return;
    }
    hud.prompt('E — Exit car');
    return;
  }
  hud.prompt(null);
}

function objectiveText() {
  if (missions.missionState === 'active' && missions.currentDef) {
    const step = missions.currentDef.steps[missions.stepIndex];
    return `${missions.currentDef.name} — ${step ? step.text : ''}`;
  }
  if (missions.missionState === 'failed') return 'Mission failed — press E to retry';
  if (missions.missionState === 'done') return 'Solmar is yours — free roam';
  if (missions.currentIndex < missions.list.length) {
    return `Next job: ${missions.list[missions.currentIndex].name} — go to the yellow marker`;
  }
  return 'Free roam';
}

function stepSim(dt) {
  G.time += dt;
  G.playTime += dt;
  // Keys.
  if (input.pressed('KeyE')) {
    if (G.state === 'busted') respawnAt(0, -96, 150);
    else if (G.state === 'wasted') respawnAt(-108, 0, 150);
    else if (G.state === 'complete') { G.state = 'playing'; hud.hideOverlay(); input.requestLock(); }
    else if (G.state === 'playing') interact();
  }
  if (input.pressed('KeyR') && player.onFoot && player.reloadTimer <= 0 && player.ammo < player.ammoMax) {
    player.reloadTimer = 1.1;
    audio.reload();
    setTimeout(() => { player.ammo = player.ammoMax; }, 1100);
  }
  if (input.pressed('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.banner(audio.muted ? 'MUTED' : 'SOUND ON', '', 1.2);
  }
  if (input.pressed('KeyC') && !player.onFoot) G.camFar = !G.camFar;
  if (input.pressed('Escape') && !input.locked) {
    if (G.state === 'playing') { G.state = 'paused'; hud.showPause(audio.muted); input.exitLock(); }
    else if (G.state === 'paused') { G.state = 'playing'; hud.hidePause(); input.requestLock(); }
  }
  // Mouse look.
  const md = input.mouseDelta();
  if (input.locked) {
    G.camYaw -= md.x * 0.0025;
    G.camPitch = clamp(G.camPitch + md.y * 0.0025, -0.15, 0.55);
  }
  // Shooting (left click, semi-auto).
  if (input.pressed('Mouse0') || canvas.dataset.shooting === '1') {
    if (player.onFoot && (input.locked || input.lockFailed)) shoot();
    canvas.dataset.shooting = '0';
  }
  player.step(dt, G);
  vehicles.step(dt, G);
  traffic.step(dt, G);
  peds.step(dt, G);
  police.step(dt, G);
  wanted.step(dt, G);
  missions.step(dt, G);
  city.step(dt);
  // Car vs ped: the player's car (or any car) running someone over.
  const playerCar = vehicles.playerCar;
  for (const ped of peds.peds) {
    if (ped.down) continue;
    for (const car of vehicles.cars) {
      if (car.wreck || Math.abs(car.speed) < 4) continue;
      const d = Math.hypot(car.group.position.x - ped.pos.x, car.group.position.z - ped.pos.z);
      if (d < 1.9) {
        peds.hitPed(ped, 100, car.isPlayer ? G : null);
        break;
      }
    }
  }
  // A car running the player over.
  if (player.onFoot && player.health > 0 && G.time - lastRunOver > 1) {
    for (const car of vehicles.cars) {
      if (car.wreck || Math.abs(car.speed) < 3) continue;
      const d = Math.hypot(car.group.position.x - player.pos.x, car.group.position.z - player.pos.z);
      if (d < 1.6) {
        lastRunOver = G.time;
        player.takeDamage(25, G);
        player.pos.x += Math.sin(car.yaw + Math.PI / 2) * 1.5;
        player.pos.z += Math.cos(car.yaw + Math.PI / 2) * 1.5;
        break;
      }
    }
  }
  // Audio: engine follows the driven car.
  const driving = !!playerCar;
  audio.engine(driving ? Math.abs(playerCar.speed) / playerCar.def.topSpeed : 0);
  audio.step(dt, driving);
  if (tracer.visible && G.time > tracerUntil) tracer.visible = false;
  if (flash.visible && G.time > flashUntil) flash.visible = false;
}

function updateCamera() {
  // Staged shot camera (chase shot): a fixed viewpoint set by shotSetup,
  // looking back at the player's car so the pursuing police are in frame.
  if (G.shotCam) {
    camera.position.copy(G.shotCam.pos);
    camera.lookAt(G.shotCam.look);
    return;
  }
  const target = tmpV;
  if (player.onFoot) {
    const dist = 6.5;
    target.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    const cx = target.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
    const cz = target.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
    const cy = target.y + Math.sin(G.camPitch) * dist + 0.8;
    camera.position.set(cx, cy, cz);
    camera.lookAt(target);
  } else if (player.car) {
    const car = player.car;
    G.camYaw = angleLerp(G.camYaw, car.yaw, 0.06);
    const dist = G.camFar ? 13 : 9;
    const fx = Math.sin(car.yaw); const fz = Math.cos(car.yaw);
    target.set(car.group.position.x, 1.4, car.group.position.z);
    camera.position.set(
      car.group.position.x - fx * dist,
      3.4,
      car.group.position.z - fz * dist,
    );
    camera.lookAt(target.x + fx * 8, 1.4, target.z + fz * 8);
  }
  // Pull the camera in when a building is in the way.
  raycaster.set(target, tmpV2.copy(camera.position).sub(target).normalize());
  raycaster.far = camera.position.distanceTo(target);
  const hits = raycaster.intersectObjects(city.buildingMeshes, false);
  if (hits.length && hits[0].distance < raycaster.far - 0.4) {
    const d = Math.max(1.2, hits[0].distance - 0.4);
    camera.position.copy(target).addScaledVector(tmpV2, d);
  }
}

function updateHud() {
  hud.setHealth(player.health, player.maxHealth);
  hud.setCash(economy.cash);
  if (G.time - pursuedAt > 0.25) {
    pursuedCache = wanted.stars > 0 && police.anySeesPlayer(G);
    pursuedAt = G.time;
  }
  hud.setStars(wanted.stars, pursuedCache);
  hud.setObjective(objectiveText());
  hud.setTimer(missions.active ? missions.timerLeft : 0);
  const car = player.car;
  if (car) hud.setSpeed(car.speed * 3.6, car.def.name, (car.health / car.maxHealth) * 100);
  else hud.setSpeed(0, null, 0);
  hud.crosshair(G.state === 'playing' && player.onFoot);
  promptForContext();
  minimap.draw(G);
}

// Tag shootable meshes so the raycast knows what it hit.
function tagShootables() {
  for (const p of peds.peds) p.mesh.userData.shot = { type: 'ped', ped: p };
  for (const c of police.cops) c.mesh.userData.shot = { type: 'cop', cop: c };
  for (const car of vehicles.cars) car.group.userData.shot = { type: 'car', car };
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - last);
  last = now;
  if (G.state === 'playing') {
    acc += dtMs / 1000;
    let n = 0;
    while (acc >= STEP && n < 5) { stepSim(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  } else if (G.state === 'menu') {
    city.step(dtMs / 1000);
    G.camYaw += dtMs / 1000 * 0.02;
    camera.position.set(Math.sin(G.camYaw) * 90, 45, Math.cos(G.camYaw) * 90 + 40);
    camera.lookAt(0, 12, -20);
  }
  if (G.state !== 'menu') updateCamera();
  updateHud();
  renderer.render(scene, camera);
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (G.state === 'playing') {
    if (!input.locked && !input.lockFailed) input.requestLock();
    canvas.dataset.shooting = '1';
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Screenshot modes (?shot=start|drive|chase|mission&seed=N) ----
// Deterministic staged frames: fixed positions, a fixed number of sim
// steps, two renders, then window.__shotReady for the capture harness.
function shotSetup() {
  tagShootables();
  if (SHOT === 'start') {
    G.state = 'menu';
    camera.position.set(0, 42, 150);
    camera.lookAt(0, 14, -40);
    hud.showMenu(false);
    return;
  }
  G.state = 'playing';
  hud.hideMenu();
  if (SHOT === 'drive') {
    const car = vehicles.spawnCar('sedan', -23, 30, Math.PI, { npc: null });
    vehicles.enterCar(car, G);
    car.speed = 16;
    economy.setCash(0, 0);
    // Two traffic cars on the same avenue ahead, so the shot shows traffic.
    const nodes = city.roadGraph.nodes;
    const n1 = nodes.find((n) => n.x === -23 && n.z === -23);
    const n2 = nodes.find((n) => n.x === -23 && n.z === 23);
    if (n1) traffic.spawnOne(n1);
    if (n2) traffic.spawnOne(n2);
    G.camYaw = Math.PI;
    player.health = 100;
    for (let i = 0; i < 90; i++) stepSim(STEP);
  } else if (SHOT === 'chase') {
    const car = vehicles.spawnCar('sedan', 23, 10, Math.PI, { npc: null });
    vehicles.enterCar(car, G);
    car.speed = 22;
    car.health = 35;
    economy.setCash(1200, 1200);
    wanted.setStars(3);
    missions.start(2, G);
    const pc1 = vehicles.spawnCar('police', 23, 20, Math.PI, { npc: 'police' });
    const pc2 = vehicles.spawnCar('police', 20, 24, Math.PI, { npc: 'police' });
    police.policeCars.push(pc1, pc2);
    pc1.targetSpeed = 30; pc2.targetSpeed = 30;
    G.camYaw = Math.PI;
    for (let i = 0; i < 45; i++) stepSim(STEP);
    // Stage the camera ahead of the player's car, looking back south, so
    // the two pursuing Interceptors and their light bars are in the frame.
    const pp = car.group.position;
    G.shotCam = {
      pos: new THREE.Vector3(pp.x + 2, 3.6, pp.z - 11),
      look: new THREE.Vector3(pp.x, 1.2, pp.z + 8),
    };
  } else if (SHOT === 'mission') {
    economy.setCash(2400, 2400);
    const car = vehicles.spawnCar('van', 104, 6, Math.PI / 2, { npc: null });
    vehicles.enterCar(car, G);
    car.speed = 0;
    hud.banner('MISSION COMPLETE', '+$900 — The Convoy', 30);
    missions.currentIndex = 4;
    G.camYaw = Math.PI / 2;
    for (let i = 0; i < 30; i++) stepSim(STEP);
    hud.banner('MISSION COMPLETE', '+$900 — The Convoy', 30);
  }
}

if (SHOT) {
  void SEED;
  shotSetup();
  // The rAF loop never runs in shot mode, so position the camera here
  // (chase cam behind the car for drive/chase, staged view for mission)
  // before rendering; without this the camera stays at the origin (0,0,0).
  updateCamera();
  updateHud();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  tagShootables();
  hud.showMenu(save.has());
  hud.setObjective(`Go to the yellow marker to start 'First Wheels'`);
  requestAnimationFrame(frame);
}
