// Solmar Heat — the wanted level, 0 to 5 stars. Crimes raise it; when no
// cop has line of sight to the player for 10 seconds it drops by one star,
// again and again until the heat is gone. Missions and the respray clear it.
import { clamp } from './palette.js';

export function createWanted() {
  let stars = 0;
  let unseenTimer = 0;
  let lastReason = '';

  return {
    get stars() { return stars; },
    get lastReason() { return lastReason; },
    addStars(n, reason = '') {
      if (n <= 0) return;
      stars = clamp(stars + n, 0, 5);
      lastReason = reason;
      unseenTimer = 0;
    },
    setStars(n) {
      stars = clamp(n, 0, 5);
      unseenTimer = 0;
    },
    clear() { stars = 0; unseenTimer = 0; },
    isPursued() { return stars > 0; },
    step(dt, G) {
      if (stars <= 0) { unseenTimer = 0; return; }
      const seen = G.police ? G.police.anySeesPlayer(G) : false;
      if (seen) {
        unseenTimer = 0;
      } else {
        unseenTimer += dt;
        if (unseenTimer >= 10) {
          stars -= 1;
          unseenTimer = 0;
          G.hud.banner(`HEAT DOWN — ${stars} STAR${stars === 1 ? '' : 'S'}`, 'Stay out of sight', 2);
        }
      }
    },
  };
}
