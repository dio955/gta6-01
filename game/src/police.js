// Solmar Heat — the Solmar PD. Foot cops and police cars, counts scaled by
// wanted stars (foot 1★:2 … 5★:6; cars 1★:0 … 5★:4). Foot cops run the
// player down and bust them after two seconds within two metres; police
// cars chase and ram, and bust a stopped player car after three seconds
// within four metres. Lose them for eight seconds and they fall back to
// the last known position, then leave when the heat clears.
import * as THREE from 'three';
import { clamp } from './palette.js';

const FOOT_COPS = [0, 2, 3, 4, 5, 6];
const POLICE_CARS = [0, 0, 1, 2, 3, 4];

export function createPolice(scene, city, vehicles) {
  const cops = [];
  const policeCars = [];
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const navyMat = new THREE.MeshLambertMaterial({ color: 0x1d3a5f });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x12233a });

  function buildCop() {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(bodyGeo, navyMat);
    torso.scale.set(0.55, 0.7, 0.32); torso.position.y = 1.05;
    const head = new THREE.Mesh(bodyGeo, skinMat);
    head.scale.set(0.34, 0.3, 0.32); head.position.y = 1.6;
    const cap = new THREE.Mesh(bodyGeo, capMat);
    cap.scale.set(0.38, 0.1, 0.36); cap.position.y = 1.8;
    const legL = new THREE.Mesh(bodyGeo, navyMat);
    legL.scale.set(0.2, 0.7, 0.24); legL.position.set(-0.15, 0.35, 0);
    const legR = legL.clone(); legR.position.x = 0.15;
    g.add(torso, head, cap, legL, legR);
    scene.add(g);
    return { group: g, legL, legR };
  }

  function spawnFootCop(x, z) {
    const parts = buildCop();
    const cop = {
      mesh: parts.group, legL: parts.legL, legR: parts.legR,
      pos: parts.group.position, yaw: 0, health: 50,
      state: 'chase', lastSeen: new THREE.Vector3(x, 0, z),
      unseenTimer: 0, bustTimer: 0, down: false,
    };
    cop.pos.set(x, 0, z);
    cops.push(cop);
    return cop;
  }

  function spawnPoliceCar(x, z, yaw) {
    const car = vehicles.spawnCar('police', x, z, yaw, { npc: 'police' });
    car.targetSpeed = 0;
    policeCars.push(car);
    return car;
  }

  function removeCop(cop) {
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
    scene.remove(cop.mesh);
  }

  function removePoliceCar(car) {
    const i = policeCars.indexOf(car);
    if (i >= 0) policeCars.splice(i, 1);
    vehicles.removeCar(car);
  }

  function seesPlayer(copPos, G) {
    const p = G.player.pos;
    const d = Math.hypot(copPos.x - p.x, copPos.z - p.z);
    if (d > 70) return false;
    return city.hasLineOfSight(copPos, p);
  }

  return {
    cops, policeCars,
    spawnFootCop,
    anySeesPlayer(G) {
      for (const c of cops) if (!c.down && seesPlayer(c.pos, G)) return true;
      for (const car of policeCars) if (!car.wreck && seesPlayer(car.group.position, G)) return true;
      return false;
    },
    nearestCopDist(G) {
      let best = Infinity;
      for (const c of cops) {
        if (c.down) continue;
        best = Math.min(best, Math.hypot(c.pos.x - G.player.pos.x, c.pos.z - G.player.pos.z));
      }
      for (const car of policeCars) {
        if (car.wreck) continue;
        best = Math.min(best, Math.hypot(car.group.position.x - G.player.pos.x, car.group.position.z - G.player.pos.z));
      }
      return best;
    },
    damageCop(cop, amount, G) {
      if (cop.down) return;
      cop.health -= amount;
      if (cop.health <= 0) {
        cop.down = true;
        cop.mesh.rotation.x = Math.PI / 2;
        cop.mesh.position.y = 0.25;
        if (G.wanted) G.wanted.addStars(1, 'officer down');
        setTimeout(() => removeCop(cop), 1);
      }
    },
    step(dt, G) {
      const stars = G.wanted.stars;
      const player = G.player;
      // Keep the deployed counts matched to the wanted level.
      if (stars === 0) {
        while (cops.length) removeCop(cops[0]);
        while (policeCars.length) removePoliceCar(policeCars[0]);
        return;
      }
      while (cops.filter((c) => !c.down).length < FOOT_COPS[stars]) {
        const hq = city.landmarks.policeHQ;
        const near = Math.random() < 0.5;
        const x = near ? player.pos.x + (Math.random() - 0.5) * 70 : hq.x + (Math.random() - 0.5) * 20;
        const z = near ? player.pos.z + (Math.random() - 0.5) * 70 : hq.z + (Math.random() - 0.5) * 20;
        spawnFootCop(clamp(x, -135, 135), clamp(z, -135, 135));
      }
      while (policeCars.length < POLICE_CARS[stars]) {
        const node = city.roadGraph.nodes[Math.floor(Math.random() * city.roadGraph.nodes.length)];
        const dx = node.x - player.pos.x; const dz = node.z - player.pos.z;
        if (Math.hypot(dx, dz) < 25) continue;
        spawnPoliceCar(node.x, node.z, Math.atan2(dx, dz));
        break;
      }
      while (cops.filter((c) => !c.down).length > FOOT_COPS[stars]) removeCop(cops[cops.length - 1]);
      while (policeCars.length > POLICE_CARS[stars]) removePoliceCar(policeCars[policeCars.length - 1]);

      // Foot cops: run the player down.
      for (const cop of [...cops]) {
        if (cop.down) continue;
        const d = Math.hypot(player.pos.x - cop.pos.x, player.pos.z - cop.pos.z);
        const sees = seesPlayer(cop.pos, G);
        if (sees) { cop.unseenTimer = 0; cop.lastSeen.copy(player.pos); }
        else cop.unseenTimer += dt;
        if (cop.unseenTimer > 8 && d > 60) { removeCop(cop); continue; }
        const target = cop.unseenTimer > 8 ? cop.lastSeen : player.pos;
        const dx = target.x - cop.pos.x; const dz = target.z - cop.pos.z;
        const td = Math.hypot(dx, dz);
        if (td > 0.5) {
          cop.yaw = Math.atan2(dx, dz);
          cop.pos.x += Math.sin(cop.yaw) * 4.2 * dt;
          cop.pos.z += Math.cos(cop.yaw) * 4.2 * dt;
          city.resolveCircle(cop.pos, 0.45, null);
        }
        cop.mesh.rotation.y = cop.yaw;
        const swing = Math.sin(G.time * 11) * 0.55;
        cop.legL.rotation.x = swing;
        cop.legR.rotation.x = -swing;
        if (d < 2) {
          cop.bustTimer += dt;
          if (cop.bustTimer >= 2 && G.onBusted) G.onBusted();
        } else cop.bustTimer = 0;
      }

      // Police cars: pursuit steering toward the player's car (or the player
      // on foot, stopping nearby so the foot cops can take over).
      const playerCar = G.vehicles.playerCar;
      let sirenNear = false;
      for (const car of [...policeCars]) {
        if (car.wreck) { removePoliceCar(car); continue; }
        const tx = playerCar ? playerCar.group.position.x : player.pos.x;
        const tz = playerCar ? playerCar.group.position.z : player.pos.z;
        const dx = tx - car.group.position.x;
        const dz = tz - car.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 40) sirenNear = true;
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - car.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.steer = clamp(diff * 2, -0.55, 0.55);
        if (playerCar) {
          car.targetSpeed = d > 6 ? 38 : 12;
          if (d < 4 && Math.abs(playerCar.speed) < 1) {
            car.bustTimer = (car.bustTimer ?? 0) + dt;
            if (car.bustTimer >= 3 && G.onBusted) G.onBusted();
          } else car.bustTimer = 0;
        } else {
          car.targetSpeed = d > 15 ? 20 : 0;
          car.bustTimer = 0;
        }
      }
      if (G.audio) G.audio.siren(sirenNear && stars > 0);
    },
  };
}
