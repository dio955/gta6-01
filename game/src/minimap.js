// Solmar Heat — the minimap. A 2D canvas, north-up, redrawn from the game
// state every frame. It never touches the simulation: roads, blocks, water,
// the player arrow, the mission diamond, police and traffic dots, the
// landmarks and the convoy car.
export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const S = 200;
  const extent = 138;
  function toMap(x, z) {
    return [(x / extent) * 0.5 * S + S / 2, (z / extent) * 0.5 * S + S / 2];
  }
  function dot(x, z, r, colour) {
    const [mx, mz] = toMap(x, z);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(mx, mz, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    draw(G) {
      const city = G.city;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#20242b';
      ctx.fillRect(0, 0, S, S);
      // Water south.
      ctx.fillStyle = '#3d8fa8';
      ctx.fillRect(0, toMap(0, 138)[1], S, S - toMap(0, 138)[1]);
      // Blocks.
      ctx.fillStyle = '#3a3f45';
      for (const cx of [-92, -46, 0, 46, 92]) {
        for (const cz of [-92, -46, 0, 46, 92]) {
          const [x, z] = toMap(cx - 17, cz - 17);
          ctx.fillRect(x, z, 34 / 276 * S, 34 / 276 * S);
        }
      }
      // Roads.
      ctx.strokeStyle = '#6a6f75';
      ctx.lineWidth = 2;
      for (const s of city.streets) {
        const [x1] = toMap(s, -138); const [, z1] = toMap(0, s);
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, z1); ctx.lineTo(S, z1); ctx.stroke();
      }
      // Landmark icons: garage, safehouse, hospital, respray.
      const lm = city.landmarks;
      dot(lm.garage.x, lm.garage.z, 3, '#f0a830');
      dot(lm.safehouse.x, lm.safehouse.z, 3, '#7fae5a');
      dot(lm.hospital.x, lm.hospital.z, 3, '#f2f2f2');
      dot(lm.respray.x, lm.respray.z, 3, '#e86a6a');
      // Mission marker: yellow diamond.
      const target = G.missions.markerTarget;
      if (target) {
        const [mx, mz] = toMap(target.x, target.z);
        ctx.fillStyle = '#f0a830';
        ctx.save();
        ctx.translate(mx, mz);
        ctx.rotate(Math.PI / 4);
        const r = 5 + Math.sin(G.time * 4) * 1.2;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
      // Convoy car: orange dot.
      if (G.missions.convoy && !G.missions.convoyStalled) {
        const c = G.missions.convoy.group.position;
        dot(c.x, c.z, 3.5, '#ff7a1a');
      }
      // Traffic: grey dots. Police: red/blue dots.
      for (const t of G.traffic.cars) {
        const c = t.car.group.position;
        dot(c.x, c.z, 2, '#9aa1a8');
      }
      for (const car of G.police.policeCars) {
        const c = car.group.position;
        dot(c.x, c.z, 3, Math.floor(G.time * 2) % 2 === 0 ? '#c53030' : '#2b6cb0');
      }
      for (const cop of G.police.cops) {
        if (cop.down) continue;
        dot(cop.pos.x, cop.pos.z, 2, '#2b6cb0');
      }
      // Player arrow, rotated by heading.
      const p = G.player.pos;
      const [px, pz] = toMap(p.x, p.z);
      const heading = G.player.onFoot ? G.player.yaw : (G.player.car ? G.player.car.yaw : G.player.yaw);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Border.
      ctx.strokeStyle = 'rgba(236,231,219,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    },
  };
}
