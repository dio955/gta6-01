// Solmar Heat — the DOM HUD. All elements live in index.html; this module
// only writes text, widths and visibility. Banners are queued and expire on
// their own; the start and pause menus are overlays with button callbacks.
import { fmtCash } from './palette.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    objective: $('objective-text'), objTitle: $('objective-title'), cash: $('cash'),
    stars: $('stars'), healthFill: $('health-fill'), healthNum: $('health-num'),
    speed: $('speed'), carName: $('car-name'), carHealthFill: $('car-health-fill'),
    driveInfo: $('drive-info'), crosshair: $('crosshair'), prompt: $('prompt'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    stolen: $('stolen-flash'), menu: $('menu'), pause: $('pause'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'),
    overlaySub: $('overlay-sub'), overlayHint: $('overlay-hint'),
    btnNew: $('btn-new'), btnContinue: $('btn-continue'),
    btnResume: $('btn-resume'), btnSave: $('btn-save'),
    btnRestart: $('btn-restart'), btnQuit: $('btn-quit'), btnMute: $('btn-mute'),
    timer: $('timer'),
  };
  let bannerUntil = 0;
  let bannerTimer = null;
  let stolenTimer = null;
  const callbacks = { onPlay: null, onContinue: null, onResume: null, onSave: null, onRestart: null, onQuit: null, onMute: null };

  // show() must set an explicit display: several HUD elements are
  // display:none in the stylesheet, so clearing the inline style ('')
  // would leave them hidden. Overlays need flex for their centring.
  function show(el) {
    if (!el) return;
    el.style.display = el.classList.contains('overlay') ? 'flex' : 'block';
  }
  function hide(el) { if (el) el.style.display = 'none'; }

  const hud = {
    setHealth(h, max) {
      const pct = Math.max(0, Math.min(100, (h / max) * 100));
      els.healthFill.style.width = `${pct}%`;
      els.healthFill.style.background = pct > 50 ? '#7fae5a' : pct > 25 ? '#f0a830' : '#c53030';
      els.healthNum.textContent = `${Math.ceil(h)}`;
    },
    setCash(c) { els.cash.textContent = fmtCash(c); },
    setStars(n, pursued) {
      let s = '';
      for (let i = 0; i < 5; i++) s += `<span class="star${i < n ? ' on' : ''}">${i < n ? '★' : '☆'}</span>`;
      els.stars.innerHTML = s;
      els.stars.classList.toggle('pursued', !!pursued && n > 0);
    },
    setObjective(text, title = 'OBJECTIVE') {
      els.objTitle.textContent = title;
      els.objective.textContent = text;
    },
    setSpeed(kmh, name, carHealth) {
      if (name) {
        show(els.driveInfo);
        els.speed.textContent = `${Math.round(Math.abs(kmh))} km/h`;
        els.carName.textContent = name;
        els.carHealthFill.style.width = `${Math.max(0, Math.min(100, carHealth))}%`;
      } else hide(els.driveInfo);
    },
    setTimer(sec) {
      if (sec > 0) { show(els.timer); els.timer.textContent = `⏱ ${fmtTime(sec)}`; }
      else hide(els.timer);
    },
    prompt(text) {
      if (text) { els.prompt.textContent = text; show(els.prompt); }
      else hide(els.prompt);
    },
    crosshair(showIt) { els.crosshair.style.display = showIt ? 'block' : 'none'; },
    banner(title, sub = '', dur = 3) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      show(els.banner);
      els.banner.classList.remove('show');
      void els.banner.offsetWidth;
      els.banner.classList.add('show');
      bannerUntil = performance.now() + dur * 1000;
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => hide(els.banner), dur * 1000);
    },
    flashStolen() {
      show(els.stolen);
      if (stolenTimer) clearTimeout(stolenTimer);
      stolenTimer = setTimeout(() => hide(els.stolen), 1600);
    },
    showMenu(hasSave) {
      show(els.menu);
      els.btnContinue.style.display = hasSave ? '' : 'none';
      hide(els.pause); hide(els.overlay);
    },
    showPause(muted) {
      show(els.pause);
      els.btnMute.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
    },
    hidePause() { hide(els.pause); },
    showOverlay(title, sub, hint) {
      els.overlayTitle.textContent = title;
      els.overlaySub.textContent = sub;
      els.overlayHint.textContent = hint;
      show(els.overlay);
    },
    hideOverlay() { hide(els.overlay); },
    hideMenu() { hide(els.menu); },
    onPlay(cb) { callbacks.onPlay = cb; },
    onContinue(cb) { callbacks.onContinue = cb; },
    onResume(cb) { callbacks.onResume = cb; },
    onSave(cb) { callbacks.onSave = cb; },
    onRestart(cb) { callbacks.onRestart = cb; },
    onQuit(cb) { callbacks.onQuit = cb; },
    onMute(cb) { callbacks.onMute = cb; },
    get bannerActive() { return performance.now() < bannerUntil; },
  };

  function bind(el, cb) { if (el) el.addEventListener('click', () => cb && cb()); }
  bind(els.btnNew, () => callbacks.onPlay && callbacks.onPlay());
  bind(els.btnContinue, () => callbacks.onContinue && callbacks.onContinue());
  bind(els.btnResume, () => callbacks.onResume && callbacks.onResume());
  bind(els.btnSave, () => callbacks.onSave && callbacks.onSave());
  bind(els.btnRestart, () => callbacks.onRestart && callbacks.onRestart());
  bind(els.btnQuit, () => callbacks.onQuit && callbacks.onQuit());
  bind(els.btnMute, () => callbacks.onMute && callbacks.onMute());

  return hud;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
