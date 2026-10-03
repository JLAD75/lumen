// Sauvegarde locale (réglages, meilleurs scores). Toujours protégée : le jeu
// fonctionne même si le stockage est indisponible (navigation privée, etc.).

const PREFIX = 'lumen-null.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_) { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

export const DEFAULT_SETTINGS = {
  music: 0.6,
  sfx: 0.85,
  voice: 0.7,
  muted: false,
  reducedFx: false,
  reducedMotion: false,
  haptics: true,
  showZones: true,
};

export function loadSettings() {
  const s = load('settings', {});
  const out = { ...DEFAULT_SETTINGS, ...s };
  // respecter la préférence système au premier lancement
  if (s.reducedMotion === undefined && typeof matchMedia !== 'undefined') {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { out.reducedMotion = true; out.reducedFx = true; } } catch (_) { /* ignore */ }
  }
  return out;
}

export function saveSettings(s) { save('settings', s); }

export class Scores {
  constructor() {
    const list = load('scores', []);
    this.list = Array.isArray(list) ? list.filter(e => e && typeof e.score === 'number').slice(0, 10) : [];
  }
  get best() { return this.list.length ? this.list[0].score : 0; }
  // position qu'occuperait ce score (0 = record), -1 si hors classement
  rank(score) {
    if (score <= 0) return -1;
    let i = 0;
    while (i < this.list.length && this.list[i].score >= score) i++;
    return i < 10 ? i : -1;
  }
  add(name, score, level) {
    const entry = { name: (name || 'OPR').toUpperCase().slice(0, 3), score: Math.floor(score), level, date: new Date().toISOString().slice(0, 10) };
    this.list.push(entry);
    this.list.sort((a, b) => b.score - a.score);
    this.list = this.list.slice(0, 10);
    save('scores', this.list);
    return this.list.indexOf(entry);
  }
}
