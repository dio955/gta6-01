// Solmar Heat — the player on foot. Third-person: WASD moves camera-relative,
// mouse orbits the camera, Shift sprints. Health regenerates after 5 s
// without damage. The pistol (12 rounds, infinite reserve) is fired from
// main.js; this module owns movement, health and the on-foot body.
import * as THREE from 'three';
import { clamp } from './palette.js';

export function createPlayer(scene, city) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshLambertMaterial({ color: 0xe8703a });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2e4053 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), torsoMat);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
  head.position.y = 1.62;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), pantsMat);
  legL.position.set(-0.15, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(torso, head, legL, legR);
  scene.add(group);
  // Blob shadow under the player.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  scene.add(blob);

  const pos = group.position;
  pos.set(0, 0, 8);
  const vel = new THREE.Vector3();
  const push = new THREE.Vector3();

  const state = {
    pos, vel, yaw: Math.PI, health: 100, maxHealth: 100,
    onFoot: true, car: null, ammo: 12, ammoMax: 12,
    fireTimer: 0, reloadTimer: 0, lastHurt: -99, sprinting: false,
    mesh: group, legL, legR,
    setPos(x, z, yaw = Math.PI) { pos.set(x, 0, z); state.yaw = yaw; vel.set(0, 0, 0); },
    takeDamage(n, G) {
      if (state.health <= 0) return;
      state.health = Math.max(0, state.health - n);
      state.lastHurt = G.time;
      if (state.health <= 0 && G.onWasted) G.onWasted();
    },
    heal(dt, G) {
      if (G.time - state.lastHurt > 5 && state.health > 0 && state.health < 100) {
        state.health = Math.min(100, state.health + 5 * dt);
      }
    },
    step(dt, G) {
      if (!state.onFoot || state.health <= 0) return;
      const input = G.input;
      const axes = input.axes();
      const camYaw = G.camYaw;
      const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      state.sprinting = sprint;
      const speed = sprint ? 7 : 4;
      // Camera-relative movement: forward is where the camera looks.
      const fx = Math.sin(camYaw); const fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw); const rz = -Math.sin(camYaw);
      let mx = fx * axes.z + rx * axes.x;
      let mz = fz * axes.z + rz * axes.x;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= len; mz /= len;
        state.yaw = Math.atan2(mx, mz);
      }
      vel.x = mx * speed * (len > 0.01 ? 1 : 0);
      vel.z = mz * speed * (len > 0.01 ? 1 : 0);
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      push.set(0, 0, 0);
      city.resolveCircle(pos, 0.45, push);
      // Walk-cycle leg swing.
      const swing = len > 0.01 ? Math.sin(G.time * (sprint ? 14 : 9)) * 0.5 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      group.rotation.y = state.yaw;
      blob.position.set(pos.x, 0.03, pos.z);
      state.fireTimer = Math.max(0, state.fireTimer - dt);
      state.reloadTimer = Math.max(0, state.reloadTimer - dt);
      state.heal(dt, G);
    },
  };
  return state;
}
