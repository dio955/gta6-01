// Solmar Heat — vehicles. Box-built cars, one job: definitions, spawning,
// arcade physics, damage and entering/exiting. The physics integrator runs
// here for EVERY car (player, traffic, police, convoy): each owner module
// only sets speed/steer targets, this module integrates, collides and
// handles wrecks, smoke, fire and explosions.
import * as THREE from 'three';
import { PALETTE, clamp } from './palette.js';

export const CAR_DEFS = {
  hatchback: { name: 'Hatchback', topSpeed: 28, accel: 10, handling: 1.0, health: 100, colours: [0xd97b4f, 0x4fa8a0, 0xe8d5a8, 0x9aa1a8] },
  sedan: { name: 'Sedan', topSpeed: 32, accel: 12, handling: 1.0, health: 100, colours: [0x2e4053, 0x7fb3d5, 0xf2e6c9, 0x5a6b7a] },
  sports: { name: 'Falcon GT', topSpeed: 45, accel: 18, handling: 1.25, health: 100, colours: [0xc53030, 0xf0a830] },
  van: { name: 'Van', topSpeed: 24, accel: 8, handling: 0.85, health: 140, colours: [0xe8d5a8, 0xb8b0a4] },
  police: { name: 'Interceptor', topSpeed: 38, accel: 15, handling: 1.1, health: 120, colours: [0x1a1a1a] },
};

let nextCarId = 1;

export function createVehicles(scene, city) {
  const cars = [];
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2b33 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 });
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 });

  function buildMesh(def, colour, isPolice) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colour });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1.9, 0.62, 4.2);
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(bodyGeo, isPolice ? bodyMat : glassMat);
    cabin.scale.set(1.6, 0.55, 2.1);
    cabin.position.set(0, 1.1, -0.2);
    g.add(body, cabin);
    const wheels = [];
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w);
      wheels.push(w);
    }
    for (const hx of [-0.6, 0.6]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
      h.position.set(hx, 0.55, 2.12);
      g.add(h);
    }
    let lightBar = null;
    let barRed = null;
    let barBlue = null;
    if (isPolice) {
      lightBar = new THREE.Group();
      barRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: PALETTE.policeRed }));
      barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: PALETTE.policeBlue }));
      barRed.position.x = -0.35; barBlue.position.x = 0.35;
      lightBar.add(barRed, barBlue);
      lightBar.position.set(0, 1.45, -0.2);
      g.add(lightBar);
      // White doors read: two pale door panels.
      const door = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      door.scale.set(1.92, 0.4, 1.6);
      door.position.set(0, 0.55, 0.1);
      g.add(door);
    }
    const blob = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(1, 2.1, 1);
    blob.position.y = 0.02;
    g.add(blob);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), smokeMat);
    smoke.position.set(0, 1.2, 1.6);
    smoke.visible = false;
    g.add(smoke);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 8), fireMat);
    fire.position.set(0, 1.3, 1.2);
    fire.visible = false;
    g.add(fire);
    scene.add(g);
    return { group: g, wheels, smoke, fire, barRed, barBlue, bodyMat };
  }

  function spawnCar(modelId, x, z, yaw = 0, opts = {}) {
    const def = CAR_DEFS[modelId];
    const colour = opts.colour ?? def.colours[Math.floor(Math.random() * def.colours.length)];
    const isPolice = modelId === 'police';
    const parts = buildMesh(def, colour, isPolice);
    const car = {
      id: nextCarId++, modelId, def, colour,
      group: parts.group, wheels: parts.wheels,
      smokeMesh: parts.smoke, fireMesh: parts.fire,
      barRed: parts.barRed, barBlue: parts.barBlue,
      yaw, speed: 0, steer: 0, slide: 0,
      targetSpeed: 0, health: def.health, maxHealth: def.health,
      wreck: false, isPolice, isPlayer: false,
      npc: opts.npc ?? null, driver: null, hitCooldown: 0, flash: 0,
    };
    car.group.position.set(x, 0, z);
    car.group.rotation.y = yaw;
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    scene.remove(car.group);
  }

  function explode(car, G) {
    car.wreck = true;
    car.speed = 0;
    car.fireMesh.visible = false;
    car.smokeMesh.visible = true;
    car.smokeMesh.scale.setScalar(2.2);
    if (G.audio) G.audio.crash();
    if (car.isPlayer && G.player.onFoot === false) {
      // Player ejected with damage; the wreck stays as an obstacle.
      G.player.takeDamage(30, G);
      exitCar(G);
    }
  }

  function damage(car, amount, G, source = null) {
    if (car.wreck || amount <= 0) return;
    car.health -= amount;
    car.flash = 0.12;
    if (car.health <= 0) {
      car.health = 0;
      explode(car, G);
    }
  }

  function enterCar(car, G) {
    if (car.wreck) return false;
    const stolen = car.npc === 'traffic' || (car.npc === null && !car.isPlayer);
    G.player.car = car;
    G.player.onFoot = false;
    G.player.mesh.visible = false;
    car.isPlayer = true;
    car.npc = null;
    if (G.traffic) G.traffic.onStolen(car);
    if (stolen && G.wanted) G.wanted.addStars(1, 'car stolen');
    if (G.hud && stolen) G.hud.flashStolen();
    return true;
  }

  function exitCar(G) {
    const car = G.player.car;
    if (!car) return;
    car.isPlayer = false;
    const p = G.player;
    p.onFoot = true;
    p.mesh.visible = true;
    const side = Math.cos(car.yaw);
    p.setPos(car.group.position.x + Math.sin(car.yaw + Math.PI / 2) * 2.4, car.group.position.z + Math.cos(car.yaw + Math.PI / 2) * 2.4, car.yaw);
    void side;
    p.car = null;
  }

  const tmpPush = new THREE.Vector3();

  return {
    cars, spawnCar, removeCar, damage, enterCar, exitCar,
    get playerCar() { return cars.find((c) => c.isPlayer) ?? null; },
    step(dt, G) {
      const player = G.player;
      const input = G.input;
      for (const car of cars) {
        car.hitCooldown = Math.max(0, car.hitCooldown - dt);
        car.flash = Math.max(0, car.flash - dt);
        if (car.wreck) continue;
        // --- drive inputs ---
        if (car.isPlayer) {
          const axes = input.axes();
          const def = car.def;
          if (axes.z > 0) {
            car.speed += def.accel * dt;
            if (car.speed > def.topSpeed) car.speed = def.topSpeed;
          } else if (axes.z < 0) {
            if (car.speed > 0.5) car.speed -= def.accel * 2.2 * dt;
            else { car.speed -= def.accel * 0.7 * dt; if (car.speed < -9) car.speed = -9; }
          } else {
            car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
          }
          const steerMax = 0.55 - Math.min(0.42, Math.abs(car.speed) / def.topSpeed * 0.42);
          const steerTarget = -axes.x * steerMax * def.handling;
          car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
          if (input.isDown('Space')) {
            car.steer *= 1.6;
            car.slide += -axes.x * 6 * dt;
            if (Math.abs(car.speed) > 8 && G.audio) G.audio.screech();
          }
        } else {
          // NPC: ease toward the target speed its owner set.
          const diff = car.targetSpeed - car.speed;
          car.speed += clamp(diff, -car.def.accel * 1.5 * dt, car.def.accel * dt);
        }
        // --- integrate ---
        const turnRate = car.steer * clamp(car.speed, -10, 45) * 0.32 * car.def.handling;
        car.yaw += turnRate * dt;
        const fx = Math.sin(car.yaw); const fz = Math.cos(car.yaw);
        const rx = Math.cos(car.yaw); const rz = -Math.sin(car.yaw);
        car.group.position.x += (fx * car.speed + rx * car.slide) * dt;
        car.group.position.z += (fz * car.speed + rz * car.slide) * dt;
        car.slide *= Math.max(0, 1 - 3 * dt);
        car.group.rotation.y = car.yaw;
        // --- building collision (circle vs colliders) ---
        tmpPush.set(0, 0, 0);
        const hitWall = city.resolveCircle(car.group.position, 1.7, tmpPush);
        if (hitWall) {
          const impact = Math.abs(car.speed);
          if (impact > 6) damage(car, (impact - 6) * 2.2, G);
          if (tmpPush.x !== 0) car.speed *= 0.35;
          if (tmpPush.z !== 0) car.speed *= 0.35;
          if (car.isPlayer && impact > 8 && G.audio) G.audio.crash();
        }
        // --- wheels, smoke, fire, light bar ---
        for (const w of car.wheels) w.rotation.x += car.speed * dt / 0.36;
        const smokeOn = car.health < 40;
        car.smokeMesh.visible = smokeOn || car.wreck;
        if (smokeOn) {
          const s = 0.7 + Math.sin(G.time * 9 + car.id) * 0.2;
          car.smokeMesh.scale.setScalar(s);
        }
        car.fireMesh.visible = car.health < 20 && car.health > 0;
        if (car.fireMesh.visible) car.fireMesh.scale.y = 0.8 + Math.sin(G.time * 13 + car.id) * 0.3;
        if (car.isPolice && car.barRed && car.barBlue) {
          const phase = Math.floor(G.time * 2.5 + car.id) % 2 === 0;
          car.barRed.visible = phase;
          car.barBlue.visible = !phase;
        }
      }
      // --- car vs car ---
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i]; const b = cars[j];
          if (a.wreck && b.wreck) continue;
          const dx = b.group.position.x - a.group.position.x;
          const dz = b.group.position.z - a.group.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01 && d < 3.6) {
            const push = (3.6 - d) / 2;
            const nx = dx / d; const nz = dz / d;
            a.group.position.x -= nx * push; a.group.position.z -= nz * push;
            b.group.position.x += nx * push; b.group.position.z += nz * push;
            const closing = Math.abs(a.speed - b.speed);
            if (closing > 7 && (a.hitCooldown <= 0 || b.hitCooldown <= 0)) {
              damage(a, (closing - 7) * 1.6, G);
              damage(b, (closing - 7) * 1.6, G);
              a.hitCooldown = 0.5; b.hitCooldown = 0.5;
              if ((a.isPlayer || b.isPlayer) && G.audio) G.audio.crash();
              if (G.missions) G.missions.onCarHit(a, b, G);
            } else {
              a.speed *= 0.9; b.speed *= 0.9;
            }
          }
        }
      }
    },
  };
}
