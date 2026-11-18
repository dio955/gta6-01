// Solmar Heat — the economy. Cash comes only from missions; the respray
// shop and the garage take it back. Cash is also the score: the final
// screen shows how much Rex earned across the five jobs.
import { MISSION_REWARDS } from './palette.js';

export function createEconomy() {
  let cash = 0;
  let totalEarned = 0;
  return {
    get cash() { return cash; },
    get totalEarned() { return totalEarned; },
    missionReward(index) { return MISSION_REWARDS[index] ?? 0; },
    add(n) { cash += n; totalEarned += n; },
    spend(n) {
      if (cash < n) return false;
      cash -= n;
      return true;
    },
    canAfford(n) { return cash >= n; },
    setCash(c, earned) { cash = c; totalEarned = earned; },
  };
}
