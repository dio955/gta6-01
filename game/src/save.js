// Solmar Heat — save games in localStorage. One key, one plain object.
// Auto-save runs after every completed mission; the pause menu saves on
// demand. "Continue" restores cash, missions and position; "New Game" wipes it.
const KEY = 'solmar-heat-save-v1';

export function createSave() {
  return {
    has() {
      try { return localStorage.getItem(KEY) !== null; } catch { return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data.cash !== 'number') return null;
        return data;
      } catch { return null; }
    },
    save(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
        return true;
      } catch { return false; }
    },
    clear() {
      try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    },
  };
}
