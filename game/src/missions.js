// Solmar Heat — the five chained jobs Mara Voss hands Rex, then free roam.
// Each mission is a list of steps with a marker (yellow diamond), HUD text
// and a minimap marker. Timers, the convoy and the Falcon GT live here too:
// the convoy loops the ring road until rammed to a stall, the Falcon waits
// in the marina lot under guard. Completing a mission pays out, clears the
// heat and auto-saves; failing (timer, BUSTED, WASTED) offers a retry.
import * as THREE from 'three';
import { fmtCash } from './palette.js';

function near(G, v, r) {
  const p = G.player.pos;
  return Math.hypot(p.x - v.x, p.z - v.z) < r;
}

export function createMissions(onEvent) {
  const defs = [
    {
      id: 'm1', name: 'First Wheels', reward: 300,
      briefing: 'Steal any car and bring it to Voss Auto on 5th Street.',
      start: 'plaza',
      steps: [
        { text: 'Steal any car — press E near one', check: (G) => !G.player.onFoot },
        { text: 'Drive it to Voss Auto', marker: 'garage', radius: 12, check: (G) => near(G, G.city.landmarks.garage, 12) },
      ],
    },
    {
      id: 'm2', name: 'The Drop', reward: 500,
      briefing: 'Pick up the package at the marina docks, deliver it to the meet in Old Town. Keep it quiet.',
      start: 'docks',
      steps: [
        { text: 'Pick up the package at the docks (E)', marker: 'docks', radius: 6, action: 'pickup' },
        { text: 'Deliver to the meet in Old Town', marker: 'oldTownMeet', radius: 10, check: (G) => near(G, G.city.landmarks.oldTownMeet, 10) },
      ],
    },
    {
      id: 'm3', name: 'Getaway', reward: 700, timeLimit: 120,
      briefing: 'The deal went south. Cops are all over you — lose them and get to the safehouse in Uptown.',
      start: 'plaza',
      steps: [
        { text: 'Lose the cops — get wanted to 0 stars', check: (G) => G.wanted.stars === 0 },
        { text: 'Reach the safehouse in Uptown', marker: 'safehouse', radius: 10, check: (G) => near(G, G.city.landmarks.safehouse, 10) },
      ],
    },
    {
      id: 'm4', name: 'The Convoy', reward: 900,
      briefing: 'A convoy car is running the ring road with cargo. Ram it to a stop, take it, bring it to the garage.',
      start: 'garage',
      steps: [
        { text: 'Find the convoy car on the ring road', check: (G) => G.missions.convoy && Math.hypot(G.missions.convoy.group.position.x - G.player.pos.x, G.missions.convoy.group.position.z - G.player.pos.z) < 25 },
        { text: 'Ram the convoy until it stalls', check: (G) => G.missions.convoyStalled },
        { text: 'Take the convoy car (E)', check: (G) => G.player.car === G.missions.convoy },
        { text: 'Deliver it to Voss Auto', marker: 'garage', radius: 12, check: (G) => G.player.car === G.missions.convoy && near(G, G.city.landmarks.garage, 12) },
      ],
    },
    {
      id: 'm5', name: 'The Big Score', reward: 1500, timeLimit: 150,
      briefing: 'The Falcon GT is parked in the marina lot, guarded. Take it, lose the heat, deliver it to the docks. This is the one, Rex.',
      start: 'marinaLot',
      steps: [
        { text: 'Reach the marina lot', marker: 'marinaLot', radius: 12, check: (G) => near(G, G.city.landmarks.marinaLot, 12) },
        { text: 'Steal the Falcon GT (E)', check: (G) => G.player.car === G.missions.falcon },
        { text: 'Lose the heat — get wanted to 0 stars', check: (G) => G.wanted.stars === 0 },
        { text: 'Deliver the Falcon to the docks', marker: 'docks', radius: 12, check: (G) => G.player.car === G.missions.falcon && near(G, G.city.landmarks.docks, 12) },
      ],
    },
  ];

  const state = {
    list: defs,
    currentIndex: 0,
    current: null,
    stepIndex: 0,
    state: 'idle', // idle | active | failed | done
    timer: 0,
    convoy: null,
    convoyStalled: false,
    convoySpotted: false,
    falcon: null,
    markerMesh: null,
    beamMesh: null,
    markerTarget: null,
  };

  function ensureMarker(scene) {
    if (state.markerMesh) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xf0a830 });
    state.markerMesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), mat);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.25 });
    state.beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 30, 12, 1, true), beamMat);
    scene.add(state.markerMesh);
    scene.add(state.beamMesh);
  }

  function ringNodes(G) {
    return G.city.roadGraph.nodes.filter((n) => Math.abs(n.x) === 115 || Math.abs(n.z) === 115);
  }

  function spawnConvoy(G) {
    const ring = ringNodes(G);
    const node = ring[Math.floor(Math.random() * ring.length)];
    const car = G.vehicles.spawnCar('van', node.x, node.z, 0, { npc: 'convoy' });
    car.health = 300; car.maxHealth = 300;
    car.targetSpeed = 14;
    state.convoy = car;
    state.convoyStalled = false;
    state.convoySpotted = false;
    state.convoyNode = node;
    state.convoyRing = ring;
  }

  function spawnFalcon(G) {
    const lot = G.city.landmarks.marinaLot;
    const car = G.vehicles.spawnCar('sports', lot.x + 6, lot.z + 4, Math.PI / 2, { npc: null, colour: 0xc53030 });
    car.targetSpeed = 0;
    state.falcon = car;
    // Two guards on the lot; spotting the player puts one star on Rex.
    for (const [gx, gz] of [[lot.x - 4, lot.z - 6], [lot.x + 12, lot.z + 8]]) {
      G.police.spawnFootCop(gx, gz);
    }
  }

  function startMission(index, G) {
    const def = defs[index];
    if (!def) return;
    state.currentIndex = index;
    state.current = def;
    state.stepIndex = 0;
    state.state = 'active';
    state.timer = def.timeLimit ?? 0;
    if (def.id === 'm3') G.wanted.setStars(3);
    if (def.id === 'm4') spawnConvoy(G);
    if (def.id === 'm5') spawnFalcon(G);
    G.audio.phone();
    G.hud.banner(def.name.toUpperCase(), def.briefing, 4);
    G.hud.setObjective(`${def.name} — ${def.steps[0].text}`);
    if (onEvent) onEvent('mission-start', def);
  }

  function completeMission(G) {
    const def = state.current;
    G.economy.add(def.reward);
    G.audio.jingle();
    G.wanted.clear();
    G.hud.banner('MISSION COMPLETE', `+${fmtCash(def.reward)} — ${def.name}`, 3.5);
    if (onEvent) onEvent('mission-complete', def);
    if (G.saveGame) G.saveGame();
    if (state.convoy) { state.convoy = null; state.convoyStalled = false; }
    if (state.falcon) state.falcon = null;
    state.currentIndex += 1;
    state.current = null;
    if (state.currentIndex >= defs.length) {
      state.state = 'done';
      if (G.onGameComplete) G.onGameComplete();
    } else {
      state.state = 'idle';
      const next = defs[state.currentIndex];
      G.hud.setObjective(`Next job: ${next.name} — go to the yellow marker`);
    }
  }

  function failMission(reason, G) {
    if (state.state !== 'active') return;
    state.state = 'failed';
    G.audio.busted();
    G.hud.banner('MISSION FAILED', `${reason} — press E to retry`, 4);
    if (onEvent) onEvent('mission-failed', reason);
  }

  return {
    list: defs,
    get currentIndex() { return state.currentIndex; },
    set currentIndex(v) { state.currentIndex = v; },
    get current() { return state.current; },
    get stepIndex() { return state.stepIndex; },
    get missionState() { return state.state; },
    get timer() { return state.timer; },
    get convoy() { return state.convoy; },
    get convoyStalled() { return state.convoyStalled; },
    get convoySpotted() { return state.convoySpotted; },
    get falcon() { return state.falcon; },
    get markerTarget() { return state.markerTarget; },
    get currentDef() { return state.current; },
    get active() { return state.state === 'active'; },
    get timerLeft() { return state.timer; },
    start(index, G) { startMission(index, G); },
    reset() {
      state.currentIndex = 0; state.current = null; state.stepIndex = 0;
      state.state = 'idle'; state.timer = 0;
      state.convoy = null; state.convoyStalled = false; state.falcon = null;
    },
    restartFromBusted(G) {
      // BUSTED/WASTED restarts the current mission from its start.
      if (state.current) {
        state.state = 'idle';
        state.current = null;
        state.stepIndex = 0;
        state.timer = 0;
        if (state.convoy) { G.vehicles.removeCar(state.convoy); state.convoy = null; }
        if (state.falcon) { G.vehicles.removeCar(state.falcon); state.falcon = null; }
      }
    },
    fail(reason, G) { failMission(reason, G); },
    // E pressed: retry a failed mission, start one at its marker, or do a
    // pickup step. Returns true when the press was consumed.
    interact(G) {
      if (state.state === 'failed' && state.current) {
        startMission(state.currentIndex, G);
        return true;
      }
      if (state.state === 'idle') {
        const def = defs[state.currentIndex];
        if (def && near(G, G.city.landmarks[def.start], 10)) {
          startMission(state.currentIndex, G);
          return true;
        }
        return false;
      }
      if (state.state === 'active' && state.current) {
        const step = state.current.steps[state.stepIndex];
        if (step && step.action === 'pickup' && step.marker) {
          const v = G.city.landmarks[step.marker];
          if (near(G, v, step.radius ?? 6)) {
            G.audio.pickup();
            state.stepIndex += 1;
            if (state.current.id === 'm2' && state.stepIndex === 1) {
              G.wanted.addStars(1, 'spotted the handoff');
            }
            return true;
          }
        }
      }
      return false;
    },
    onCarHit(a, b, G) {
      if (state.state !== 'active' || !state.current) return;
      if (state.current.id === 'm4' && state.convoy) {
        const playerCar = G.vehicles.playerCar;
        if (!playerCar) return;
        const hitConvoy = (a === state.convoy && b === playerCar) || (b === state.convoy && a === playerCar);
        if (hitConvoy && !state.convoySpotted) {
          state.convoySpotted = true;
          G.wanted.setStars(Math.max(G.wanted.stars, 2));
          G.hud.banner('HEAT UP', 'The convoy called it in — 2 stars', 2.5);
        }
      }
    },
    step(dt, G) {
      ensureMarker(G.scene);
      // Convoy loops the ring road.
      if (state.convoy && !state.convoyStalled && !state.convoy.wreck) {
        const car = state.convoy;
        const target = state.convoyRing[state.convoyRing.indexOf(state.convoyNode)];
        const tx = target.x; const tz = target.z;
        const dx = tx - car.group.position.x; const dz = tz - car.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 4) {
          const idx = state.convoyRing.indexOf(state.convoyNode);
          state.convoyNode = state.convoyRing[(idx + 1) % state.convoyRing.length];
        } else {
          const desiredYaw = Math.atan2(dx, dz);
          let diff = desiredYaw - car.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          car.steer = Math.max(-0.5, Math.min(0.5, diff * 2));
          car.targetSpeed = 14;
        }
        if (car.health <= 30) {
          state.convoyStalled = true;
          car.targetSpeed = 0;
          car.invulnerable = true;
          if (G.peds) G.peds.spawnFleePed(car.group.position.x, car.group.position.z);
          G.hud.banner('CONVOY STOPPED', 'Take the car — press E near it', 3);
        }
      }
      // Falcon steal raises the heat to four stars.
      if (state.state === 'active' && state.current && state.current.id === 'm5' && state.falcon) {
        if (G.player.car === state.falcon && G.wanted.stars < 4) {
          G.wanted.setStars(4);
          G.hud.banner('HEAT UP', 'Four stars — lose them and run', 2.5);
        }
      }
      // Marker follows the current target: start marker, objective marker,
      // or nothing once the game is complete.
      let target = null;
      if (state.state === 'idle' && state.currentIndex < defs.length) {
        target = G.city.landmarks[defs[state.currentIndex].start];
      } else if (state.state === 'active' && state.current) {
        const step = state.current.steps[state.stepIndex];
        if (step && step.marker) target = G.city.landmarks[step.marker];
      }
      state.markerTarget = target;
      if (target) {
        state.markerMesh.visible = true;
        state.beamMesh.visible = true;
        state.markerMesh.position.set(target.x, 3 + Math.sin(G.time * 2) * 0.4, target.z);
        state.markerMesh.rotation.y = G.time;
        state.beamMesh.position.set(target.x, 15, target.z);
      } else {
        state.markerMesh.visible = false;
        state.beamMesh.visible = false;
      }
      // Walk into a start marker to begin the next job.
      if (state.state === 'idle' && state.currentIndex < defs.length) {
        const def = defs[state.currentIndex];
        if (near(G, G.city.landmarks[def.start], 8)) startMission(state.currentIndex, G);
      }
      if (state.state !== 'active' || !state.current) return;
      // Timer.
      if (state.timer > 0) {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.timer = 0;
          failMission('Out of time', G);
          return;
        }
      }
      // Step checks.
      const step = state.current.steps[state.stepIndex];
      if (step && !step.action && step.check && step.check(G)) {
        state.stepIndex += 1;
        const next = state.current.steps[state.stepIndex];
        if (next) {
          G.hud.setObjective(`${state.current.name} — ${next.text}`);
          G.audio.pickup();
        } else {
          completeMission(G);
        }
      }
    },
  };
}
