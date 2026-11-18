// Solmar Heat — pedestrians. About twenty-two walk the sidewalk graph at
// 1.2 m/s, turning at corners. They run from gunshots, from speeding cars
// and from a player with two or more stars. Hit by a car or shot, one falls
// and stays down — and if it was the player's doing, the heat goes up.
import * as THREE from 'three';
import { mulberry32, pick } from './palette.js';

const SHIRT_COLOURS = [0xe86a6a, 0x4fa8a0, 0xf0a830, 0x7fb3d5, 0xd97b4f, 0x9aa1a8, 0xf2e6c9];

export function createPeds(scene, city) {
  const rng = mulberry32(99);
  const nodes = city.sidewalkGraph.nodes;
  const edges = city.sidewalkGraph.edges;
  const neighbours = nodes.map(() => []);
  for (const [a, b] of edges) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  const peds = [];
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);

  function buildMesh(colour) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: colour });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2e4053 });
    const torso = new THREE.Mesh(bodyGeo, shirt);
    torso.scale.set(0.5, 0.62, 0.3); torso.position.y = 1.0;
    const head = new THREE.Mesh(bodyGeo, skin);
    head.scale.set(0.3, 0.3, 0.3); head.position.y = 1.5;
    const legL = new THREE.Mesh(bodyGeo, pants);
    legL.scale.set(0.18, 0.62, 0.22); legL.position.set(-0.13, 0.31, 0);
    const legR = legL.clone(); legR.position.x = 0.13;
    // A few carry a phone or an umbrella: one small box, held up.
    let prop = null;
    if (rng() < 0.3) {
      prop = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: rng() < 0.5 ? 0x222222 : 0xe86a6a }));
      prop.scale.set(0.3, 0.05, 0.3);
      prop.position.set(0.35, 1.45, 0);
      g.add(prop);
    }
    g.add(torso, head, legL, legR);
    scene.add(g);
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
    );
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
    scene.add(blob);
    return { group: g, legL, legR, blob };
  }

  function makePed(x, z) {
    const node = Math.floor(rng() * nodes.length);
    const parts = buildMesh(pick(rng, SHIRT_COLOURS));
    const ped = {
      mesh: parts.group, legL: parts.legL, legR: parts.legR, blob: parts.blob,
      pos: parts.group.position, yaw: rng() * Math.PI * 2,
      node, state: 'walk', speed: 1.2, fleeTimer: 0, down: false, downTimer: 0,
    };
    ped.pos.set(x, 0, z);
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < 22; i++) {
    const n = nodes[Math.floor(rng() * nodes.length)];
    makePed(n.x + (rng() - 0.5) * 2, n.z + (rng() - 0.5) * 2);
  }

  function fleeFrom(pos, G) {
    for (const p of peds) {
      if (p.down) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < 30) {
        p.state = 'flee';
        p.fleeTimer = 3 + rng() * 2;
        p.yaw = Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z);
      }
    }
    void G;
  }

  return {
    peds,
    spawnFleePed(x, z) {
      const ped = makePed(x + 1.5, z + 1.5);
      ped.state = 'flee';
      ped.fleeTimer = 5;
      ped.yaw = Math.atan2(1, 1);
      return ped;
    },
    fleeFrom,
    hitPed(ped, amount, G) {
      if (ped.down) return false;
      ped.down = true;
      ped.downTimer = 0;
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.25;
      ped.blob.visible = false;
      if (G && G.wanted) G.wanted.addStars(1, 'pedestrian harmed');
      return true;
    },
    step(dt, G) {
      for (const p of peds) {
        if (p.down) {
          p.downTimer += dt;
          // Down peds fade out after a while and get back up far away.
          if (p.downTimer > 25) {
            const n = nodes[Math.floor(rng() * nodes.length)];
            p.pos.set(n.x, 0, n.z);
            p.mesh.rotation.x = 0;
            p.mesh.position.y = 0;
            p.blob.visible = true;
            p.down = false;
            p.state = 'walk';
          }
          continue;
        }
        let speed = p.speed;
        if (p.state === 'flee') {
          speed = 3;
          p.fleeTimer -= dt;
          if (p.fleeTimer <= 0) p.state = 'walk';
        } else {
          const target = nodes[p.node];
          const dx = target.x - p.pos.x;
          const dz = target.z - p.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.6) {
            const opts = neighbours[p.node];
            if (opts.length) p.node = pick(rng, opts);
            continue;
          }
          p.yaw = Math.atan2(dx, dz);
        }
        // Flee from a speeding car or a hot player.
        const player = G.player;
        const pd = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (player && !player.onFoot && pd < 6) {
          const car = player.car;
          if (car && Math.abs(car.speed) > 6) {
            p.state = 'flee'; p.fleeTimer = 2;
            p.yaw = Math.atan2(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
          }
        }
        if (G.wanted && G.wanted.stars >= 2 && pd < 12) {
          p.state = 'flee'; p.fleeTimer = 2;
          p.yaw = Math.atan2(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        }
        p.pos.x += Math.sin(p.yaw) * speed * dt;
        p.pos.z += Math.cos(p.yaw) * speed * dt;
        const push = { x: 0, z: 0 };
        city.resolveCircle(p.pos, 0.4, push);
        p.mesh.rotation.y = p.yaw;
        const swing = Math.sin(G.time * 9 + p.pos.x) * 0.45;
        p.legL.rotation.x = swing;
        p.legR.rotation.x = -swing;
        p.blob.position.set(p.pos.x, 0.03, p.pos.z);
      }
    },
  };
}
