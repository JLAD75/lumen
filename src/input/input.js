// Entrées unifiées : clavier + zones tactiles multitouch + bouton de lancement.
// Chaque source maintient son propre état ; les commandes sont l'union des sources,
// ce qui évite qu'une source en relâche une autre. Tout est annulé à la perte de focus.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'launch', ArrowDown: 'launch',
};

export class Input {
  constructor() {
    this.keys = new Set();            // commandes tenues au clavier
    this.pointers = new Map();        // pointerId -> commande
    this.state = { left: false, right: false, launch: false };
    this.prev = { left: false, right: false, launch: false };
    this.edges = [];
    this.listeners = [];
    this.enabled = true;              // zones tactiles actives (désactivées dans les menus)
    this.haptics = true;
    this.lastSource = 'keyboard';
    this.onAnyInput = null;           // déverrouillage audio
    this.onCommand = null;            // (cmd) pour les menus : pause, confirm...
  }

  attach(touchLayer, launchBtn) {
    this._down = new Set();
    const on =(el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.listeners.push(() => el.removeEventListener(ev, fn, opt)); };

    on(window, 'keydown', (e) => {
      this.onAnyInput && this.onAnyInput();
      this.lastSource = 'keyboard';
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.onCommand && this.onCommand('pause'); e.preventDefault(); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (!e.repeat) this.onCommand && this.onCommand('confirm'); }
      const cmd = KEYMAP[e.code];
      if (cmd) {
        // ne pas intercepter la barre d'espace quand un champ de saisie a le focus
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        if (e.repeat) return;
        this.keys.add(cmd);
        this._sync();
        if (cmd === 'launch') this.onCommand && this.onCommand('launchKey');
      }
    });
    on(window, 'keyup', (e) => {
      const cmd = KEYMAP[e.code];
      if (cmd) {
        // une autre touche peut encore tenir la même commande (ex. A et ←)
        this.keys.delete(cmd);
        for (const [code, c] of Object.entries(KEYMAP)) if (c === cmd && this._down.has(code) && code !== e.code) this.keys.add(cmd);
        this._sync();
      }
      this._down.delete(e.code);
    });
    on(window, 'keydown', (e) => { if (KEYMAP[e.code]) this._down.add(e.code); });

    // zones tactiles : moitié gauche / moitié droite de l'écran
    on(touchLayer, 'pointerdown', (e) => {
      this.onAnyInput && this.onAnyInput();
      if (!this.enabled) return;
      e.preventDefault();
      const cmd = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      this.pointers.set(e.pointerId, cmd);
      this.lastSource = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      try { touchLayer.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (this.haptics && e.isTrusted && active && e.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(8); } catch (_) { /* ignore */ } }
      this._sync();
    }, { passive: false });
    const up = (e) => {
      if (this.pointers.delete(e.pointerId)) this._sync();
    };
    on(touchLayer, 'pointerup', up);
    on(touchLayer, 'pointercancel', up);
    on(touchLayer, 'lostpointercapture', up);
    on(touchLayer, 'contextmenu', (e) => e.preventDefault());

    // bouton de lancement (maintenir pour charger, relâcher pour lancer)
    if (launchBtn) {
      on(launchBtn, 'pointerdown', (e) => {
        this.onAnyInput && this.onAnyInput();
        e.preventDefault(); e.stopPropagation();
        this.pointers.set(e.pointerId, 'launch');
        try { launchBtn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this._sync();
      }, { passive: false });
      on(launchBtn, 'pointerup', up);
      on(launchBtn, 'pointercancel', up);
      on(launchBtn, 'lostpointercapture', up);
      on(launchBtn, 'contextmenu', (e) => e.preventDefault());
    }

    // empêcher défilement, zoom et gestes système pendant la partie
    const block = (e) => { if (e.target.closest && e.target.closest('.scrollable, input, select, button, label, a')) return; e.preventDefault(); };
    on(document, 'touchmove', block, { passive: false });
    on(document, 'gesturestart', (e) => e.preventDefault(), { passive: false });
    on(document, 'dblclick', (e) => e.preventDefault(), { passive: false });
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    on(window, 'pagehide', () => this.releaseAll());
  }

  releaseAll() {
    this.keys.clear();
    this.pointers.clear();
    if (this._down) this._down.clear();
    this._sync();
  }

  _sync() {
    const s = { left: false, right: false, launch: false };
    for (const k of this.keys) s[k] = true;
    for (const c of this.pointers.values()) s[c] = true;
    this.state = s;
  }

  // Appelé une fois par tick : renvoie l'état + les fronts (appui/relâchement).
  poll() {
    const s = this.state, p = this.prev;
    const out = {
      left: s.left, right: s.right, launch: s.launch,
      leftPressed: s.left && !p.left, rightPressed: s.right && !p.right, launchPressed: s.launch && !p.launch,
      leftReleased: !s.left && p.left, rightReleased: !s.right && p.right, launchReleased: !s.launch && p.launch,
    };
    this.prev = { ...s };
    return out;
  }

  // Bloque les fronts en cours (ex. après fermeture d'un menu) pour éviter un tir involontaire.
  swallow() { this.prev = { ...this.state }; }
}
