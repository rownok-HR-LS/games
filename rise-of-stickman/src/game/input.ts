// Keyboard + mouse + touch input, collected into "held" and "pressed this frame" action sets.
export type Action = "attack" | "shoot" | "dash" | "parry" | "wrath" | "special" | "reload" | "pause" | "interact";

const KEYS: Record<string, Action> = {
  Space: "dash",
  ShiftLeft: "parry",
  ShiftRight: "parry",
  KeyQ: "wrath",
  KeyE: "special",
  KeyR: "reload",
  Escape: "pause",
  KeyP: "pause",
  KeyF: "interact",
  KeyJ: "attack",
  KeyK: "shoot",
};

export class Input {
  readonly held = new Set<Action>();
  readonly pressed = new Set<Action>();
  /** Screen-space move vector: x right, y up, length ≤ 1. */
  readonly move = { x: 0, y: 0 };
  /** Mouse position in normalised device coordinates. */
  readonly aim = { x: 0, y: 0 };
  /** True once a touch is seen: aim switches to auto-target. */
  touch = false;
  /** Time the attack button went down (for charged attacks). */
  attackDownAt = 0;
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private el: HTMLElement;
  private off: (() => void)[] = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window) => {
      target.addEventListener(t, f as EventListener, { passive: false });
      this.off.push(() => target.removeEventListener(t, f as EventListener));
    };
    on("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYS[e.code];
      if (a) {
        this.down(a);
        if (e.code === "Space") e.preventDefault();
      }
    });
    on("keyup", (e) => {
      this.keys.delete(e.code);
      const a = KEYS[e.code];
      if (a) this.up(a);
    });
    on("blur", () => {
      this.keys.clear();
      this.held.clear();
    });
    on(
      "mousedown",
      (e) => {
        this.touch = false;
        if (e.button === 0) this.down("attack");
        if (e.button === 2) this.down("shoot");
        if (e.button === 1) this.down("special");
      },
      el,
    );
    on("mouseup", (e) => {
      if (e.button === 0) this.up("attack");
      if (e.button === 2) this.up("shoot");
    });
    on("mousemove", (e) => {
      const r = this.el.getBoundingClientRect();
      this.aim.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.aim.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });
    on("contextmenu", (e) => e.preventDefault(), el);
    on("touchstart", () => (this.touch = true), el);
  }

  down(a: Action) {
    if (!this.held.has(a)) this.pressed.add(a);
    this.held.add(a);
    if (a === "attack") this.attackDownAt = performance.now();
  }
  up(a: Action) {
    this.held.delete(a);
  }

  setStick(x: number, y: number) {
    this.stick.x = x;
    this.stick.y = y;
  }

  /** Call once per frame before the game reads input. */
  poll() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    x += this.stick.x;
    y += this.stick.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.move.x = x;
    this.move.y = y;
  }

  endFrame() {
    this.pressed.clear();
  }

  dispose() {
    for (const f of this.off) f();
  }
}
