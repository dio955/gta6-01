// Solmar Heat — traffic. About fourteen cars cruise the road graph, turning
// at intersections, slowing for the car ahead, stopping at red lights, and
// giving way when the player comes at them fast. A hard hit stops one for
// eight seconds while its driver flees on foot; stealing one spawns a
// replacement at a far street so the density stays near fourteen.
import { mulberry32, pick } from './palette.js';

const MODELS = ['hatchback', 'sedan', 'sedan', 'hatchback', 'van', 'sedan'];

export function createTraffic(scene, city, vehicles) {
  const rng = mulberry32(42);
  const list = [];
  const nodes = city.roadGraph.nodes;

  function randomNodeFarFrom(playerPos, minDist = 60) {
    for (let tries = 0; tries < 20; tries++) {
      const n = nodes[Math.floor(rng() * nodes.length)];
      if (!playerPos) return n;
      const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
      if (d >= minDist) return n;
    }
    return nodes[Math.floor(rng() * nodes.length)];
  }

  function spawnOne(atNode) {
    const node = atNode ?? randomNodeFarFrom(null);
    const next = pick(rng, node.edges);
    const model = pick(rng, MODELS);
    const car = vehicles.spawnCar(model, node.x, node.z, 0, { npc: 'traffic' });
    const t = {
      car, node: node, next,
      speed: 8 + rng() * 4, state: 'drive', stopTimer: 0,
    };
    car.targetSpeed = t.speed;
    list.push(t);
    return t;
  }

  for (let i = 0; i < 14; i++) spawnOne();

  function nextNode(t) {
    const cur = nodes[t.next];
    const options = cur.edges.filter((e) => e !== t.node);
    const chosen = options.length ? pick(rng, options) : cur.edges[0];
    t.node = t.next;
    t.next = chosen;
  }

  return {
    cars: list,
    spawnOne,
    onStolen(car) {
      const i = list.findIndex((t) => t.car === car);
      if (i < 0) return;
      list.splice(i, 1);
      spawnOne();
    },
    step(dt, G) {
      const lights = city.lightState();
      const playerCar = G.vehicles.playerCar;
      const playerPos = G.player.pos;
      for (const t of list) {
        const car = t.car;
        if (car.wreck) continue;
        if (t.state === 'stopped') {
          car.targetSpeed = 0;
          t.stopTimer -= dt;
          if (t.stopTimer <= 0) t.state = 'drive';
          continue;
        }
        const target = nodes[t.next];
        const dx = target.x - car.group.position.x;
        const dz = target.z - car.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 3) { nextNode(t); continue; }
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - car.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.steer = Math.max(-0.5, Math.min(0.5, diff * 2));
        let want = t.speed;
        // Red light ahead at a central intersection: stop.
        const central = (Math.abs(target.x) === 23 || Math.abs(target.x) === 115) &&
          (Math.abs(target.z) === 23 || Math.abs(target.z) === 115);
        const isCentral = [target.x, target.z].every((v) => Math.abs(v) === 23);
        if (isCentral && dist < 14) {
          const goingNS = Math.abs(dx) < Math.abs(dz);
          const light = goingNS ? lights.ns : lights.ew;
          if (light !== 'green') want = 0;
        }
        void central;
        // Car ahead: slow down, stop if close.
        for (const o of G.vehicles.cars) {
          if (o === car || o.wreck) continue;
          const ox = o.group.position.x - car.group.position.x;
          const oz = o.group.position.z - car.group.position.z;
          const od = Math.hypot(ox, oz);
          if (od < 10) {
            const ahead = (ox * Math.sin(car.yaw) + oz * Math.cos(car.yaw)) / od;
            if (ahead > 0.7) want = Math.min(want, od < 5 ? 0 : o.speed * 0.85);
          }
        }
        // Player barrelling toward us: slow down.
        if (playerCar && playerCar !== car) {
          const px = playerCar.group.position.x - car.group.position.x;
          const pz = playerCar.group.position.z - car.group.position.z;
          const pd = Math.hypot(px, pz);
          if (pd < 18 && Math.abs(playerCar.speed) > 15) {
            const closing = (px * Math.sin(playerCar.yaw) + pz * Math.cos(playerCar.yaw)) / pd;
            if (closing > 0.6) want = Math.min(want, 4);
          }
        }
        void playerPos;
        car.targetSpeed = want;
      }
    },
    // Called by vehicles when a traffic car takes a hard hit.
    onHardHit(car, G) {
      const t = list.find((x) => x.car === car);
      if (!t || t.state === 'stopped') return;
      t.state = 'stopped';
      t.stopTimer = 8;
      car.targetSpeed = 0;
      if (G.peds) G.peds.spawnFleePed(car.group.position.x, car.group.position.z, G);
    },
  };
}
