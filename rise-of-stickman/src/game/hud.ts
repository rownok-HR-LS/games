// DOM heads-up display, updated straight from the game loop (no React re-renders per frame).
import * as THREE from "three";
import { ELEMENT_COLOR, type Loadout } from "./boons";
import type { Game } from "./game";
import { MAG } from "./player";
import { RANKS } from "./style";
import { iconCanvas, ICON_COLOR, type IconKind } from "./textures";
import { sigilSvg } from "./sigils";
import { ANVIL } from "./anvil";

function el(tag: string, cls: string, parent?: HTMLElement, html = "") {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export type Marker = {
  x: number;
  y: number;
  icon: IconKind;
  title: string;
  sub: string;
  color: string;
  /** Radians, when the target is off-screen (arrow points toward it). */
  arrow: number | null;
};

/** An enemy health bar, already projected to screen space. */
export type EnemyBar = { id: number; x: number; y: number; hp: number; shield: number; wide: boolean; elite: string | null };

type BarEl = { el: HTMLElement; fill: HTMLElement; lag: HTMLElement; sh: HTMLElement; lagF: number; f: number; used: boolean };
type Floater = { el: HTMLElement; pos: THREE.Vector3; t: number; dur: number; dx: number };

export class Hud {
  private bars = new Map<number, BarEl>();
  private floaters: Floater[] = [];
  private floatLayer!: HTMLElement;
  private markerEls: HTMLElement[] = [];
  private iconUrls = new Map<IconKind, string>();
  private root: HTMLElement;
  private hpFill: HTMLElement;
  private hpLag: HTMLElement;
  private hpText: HTMLElement;
  private wrathFill: HTMLElement;
  private wrathBox: HTMLElement;
  private ammo: HTMLElement[] = [];
  private dash: HTMLElement[] = [];
  private special: HTMLElement;
  private souls: HTMLElement;
  private coins: HTMLElement;
  private embers: HTMLElement;
  private wine: HTMLElement;
  private defiance: HTMLElement;
  private promptEl: HTMLElement;
  private sayEl: HTMLElement;
  private sayT: ReturnType<typeof setTimeout> | null = null;
  private roomLbl: HTMLElement;
  private rankBox: HTMLElement;
  private rankLetter: HTMLElement;
  private rankName: HTMLElement;
  private rankBar: HTMLElement;
  private bossBox: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private toasts: HTMLElement;
  private boonRow: HTMLElement;
  private reload: HTMLElement;
  private reloadMark: HTMLElement;
  private reloadZone: HTMLElement;
  private hurtV: HTMLElement;
  private lbTop: HTMLElement;
  private lbBot: HTMLElement;
  private fadeEl: HTMLElement;
  private flashEl: HTMLElement;
  private wrathFl: HTMLElement;
  private lagHp = 1;
  private lagBoss = 1;
  private last = new Map<string, string | number>();

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = "";
    const tl = el("div", "rs-tl", root);
    const hp = el("div", "rs-hp", tl);
    this.hpLag = el("i", "rs-hp-lag", hp);
    this.hpFill = el("i", "rs-hp-fill", hp);
    this.hpText = el("span", "rs-hp-text", hp);
    this.wrathBox = el("div", "rs-wrath", tl);
    this.wrathFill = el("i", "rs-wrath-fill", this.wrathBox);
    el("span", "rs-wrath-text", this.wrathBox, "WRATH <b>Q</b>");
    const row = el("div", "rs-row", tl);
    const ammo = el("div", "rs-ammo", row);
    for (let i = 0; i < MAG; i++) this.ammo.push(el("i", "", ammo));
    const dash = el("div", "rs-dash", row);
    for (let i = 0; i < 4; i++) this.dash.push(el("i", "", dash));
    this.special = el("div", "rs-special", row, "<span>E</span>");
    this.boonRow = el("div", "rs-boons", tl);

    const tr = el("div", "rs-tr", root);
    this.souls = el("div", "rs-souls", tr);
    this.coins = el("div", "rs-coins", tr);
    this.embers = el("div", "rs-embers", tr);
    this.wine = el("div", "rs-wine", tr);
    this.defiance = el("div", "rs-defiance", tl);
    this.roomLbl = el("div", "rs-roomlbl", tr);

    this.rankBox = el("div", "rs-rank", root);
    this.rankLetter = el("div", "rs-rank-letter", this.rankBox);
    this.rankName = el("div", "rs-rank-name", this.rankBox);
    const rb = el("div", "rs-rank-bar", this.rankBox);
    this.rankBar = el("i", "", rb);

    this.bossBox = el("div", "rs-boss", root);
    this.bossName = el("div", "rs-boss-name", this.bossBox);
    const bb = el("div", "rs-boss-bar", this.bossBox);
    this.bossLag = el("i", "rs-boss-lag", bb);
    this.bossFill = el("i", "rs-boss-fill", bb);

    this.reload = el("div", "rs-reload", root);
    this.reloadZone = el("i", "rs-reload-zone", this.reload);
    this.reloadMark = el("b", "rs-reload-mark", this.reload);
    el("span", "rs-reload-hint", this.reload, "R");

    this.toasts = el("div", "rs-toasts", root);
    this.promptEl = el("div", "rs-prompt", root);
    this.sayEl = el("div", "rs-say", root);
    this.hurtV = el("div", "rs-hurt", root);
    this.lbTop = el("div", "rs-lb rs-lb-top", root);
    this.lbBot = el("div", "rs-lb rs-lb-bot", root);
    this.flashEl = el("div", "rs-inkflash", root);
    this.wrathFl = el("div", "rs-wrathflash", root);
    this.fadeEl = el("div", "rs-fade", root);
    this.rank(0, false);
  }

  private set(key: string, v: string | number, f: () => void) {
    if (this.last.get(key) === v) return;
    this.last.set(key, v);
    f();
  }

  update(g: Game, real: number) {
    const p = g.player;
    const hpf = Math.max(0, p.hp / p.maxHp);
    this.lagHp = Math.max(hpf, this.lagHp - real * 0.5);
    this.set("hp", Math.round(hpf * 1000), () => {
      this.hpFill.style.width = `${hpf * 100}%`;
      this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      this.hpFill.classList.toggle("low", hpf < 0.3);
    });
    this.set("hplag", Math.round(this.lagHp * 1000), () => (this.hpLag.style.width = `${this.lagHp * 100}%`));
    const wf = p.inWrath ? p.wrathT / g.mods.wrathDur : p.wrath / 100;
    this.set("wrath", Math.round(wf * 500) + (p.inWrath ? 1000 : 0) + (p.wrath >= 100 ? 2000 : 0), () => {
      this.wrathFill.style.width = `${wf * 100}%`;
      this.wrathBox.classList.toggle("full", p.wrath >= 100 && !p.inWrath);
      this.wrathBox.classList.toggle("active", p.inWrath);
    });
    const ammoKey = p.ammo * 2 + (p.perfectShots > 0 ? 1 : 0);
    this.set("ammo", ammoKey, () => this.ammo.forEach((a, i) => (a.className = i < p.ammo ? (p.perfectShots > 0 ? "on gold" : "on") : "")));
    this.set("dash", p.dashCharges * 10 + p.dashMax, () =>
      this.dash.forEach((d, i) => {
        d.style.display = i < p.dashMax ? "" : "none";
        d.className = i < p.dashCharges ? "on" : "";
      }),
    );
    const sp = p.specialCd / p.specialMax;
    this.set("sp", Math.round(sp * 50), () => {
      this.special.style.setProperty("--cd", `${(1 - sp) * 360}deg`);
      this.special.classList.toggle("ready", sp <= 0);
    });
    const souls = Math.round(g.inHub ? g.save.souls : g.souls);
    this.set("souls", souls, () => (this.souls.innerHTML = `<i></i>${souls}`));
    this.set("embers", g.save.embers, () => (this.embers.innerHTML = `<i></i>${g.save.embers}`));
    this.set("wine", g.save.wine, () => {
      this.wine.innerHTML = `<i></i>${g.save.wine}`;
      this.wine.style.display = g.save.wine > 0 ? "" : "none";
    });
    this.set("coins", g.coins, () => (this.coins.innerHTML = `<i></i>${g.coins}`));
    this.set("def", p.defiance * 10 + p.defianceMax, () => {
      this.defiance.innerHTML = Array.from({ length: p.defianceMax }, (_, i) => `<i class="${i < p.defiance ? "on" : ""}" title="Death Defiance"></i>`).join("");
    });
    // Style rank.
    this.set("rankbar", Math.round(g.style.frac * 200), () => (this.rankBar.style.width = `${g.style.frac * 100}%`));
    this.rankBox.classList.toggle("idle", g.style.points < 5);
    // Boss.
    const b = g.boss;
    if (b && b.state !== "intro") {
      const f = b.hp / b.maxHp;
      this.lagBoss = Math.max(f, this.lagBoss - real * 0.25);
      this.set("boss", Math.round(f * 1000), () => {
        this.bossBox.classList.add("on");
        this.bossFill.style.width = `${f * 100}%`;
        this.bossName.textContent = b.name;
      });
      this.set("bosslag", Math.round(this.lagBoss * 1000), () => (this.bossLag.style.width = `${this.lagBoss * 100}%`));
    } else this.set("boss", -1, () => this.bossBox.classList.remove("on"));
    // Reload bar with the perfect-reload sweet spot.
    const r = p.reloadInfo;
    if (r.t >= 0) {
      this.reload.classList.add("on");
      this.reloadZone.style.left = `${(r.lo / r.dur) * 100}%`;
      this.reloadZone.style.width = `${((r.hi - r.lo) / r.dur) * 100}%`;
      this.reloadMark.style.left = `${Math.max(0, Math.min(1, r.t / r.dur)) * 100}%`;
    } else this.set("reloadoff", r.t, () => this.reload.classList.remove("on"));
  }

  rank(r: number, up: boolean) {
    const R = RANKS[r];
    this.rankLetter.textContent = R.letter;
    this.rankName.textContent = R.name;
    this.rankBox.style.setProperty("--rank", R.color);
    this.rankBox.dataset.rank = String(r);
    if (up) {
      this.rankBox.classList.remove("pop");
      void this.rankBox.offsetWidth;
      this.rankBox.classList.add("pop");
    }
  }

  /** In the Forsaken Stable the combat widgets step aside. */
  mode(hub: boolean) {
    this.root.classList.toggle("hub", hub);
  }

  room(label: string) {
    this.roomLbl.textContent = label;
  }

  boss(name: string | null, _f: number) {
    if (!name) this.bossBox.classList.remove("on");
    this.lagBoss = 1;
    this.last.delete("boss");
  }

  boons(l: Loadout) {
    this.boonRow.innerHTML = "";
    const add = (icon: IconKind, title: string, id: string, color = ICON_COLOR[icon]) => {
      const i = el("i", "", this.boonRow);
      const svg = sigilSvg(id);
      if (svg) {
        i.innerHTML = svg;
        i.style.color = color;
      } else i.style.backgroundImage = `url(${iconCanvas(icon).toDataURL()})`;
      i.style.borderColor = color;
      i.title = title;
    };
    for (const b of Object.values(l.slots)) if (b) add(b.element, `${b.name}: ${b.text}`, b.id, ELEMENT_COLOR[b.element]);
    for (const r of l.relics) add("relic", `${r.name}: ${r.boon} ${r.curse}`, r.id, "#5dff9a");
    for (const m of l.moves) add("move", m, m, "#ffffff");
    for (const id of l.anvil) {
      const u = Object.values(ANVIL).flat().find((x) => x.id === id);
      add("anvil", u ? `${u.name}: ${u.text}` : id, id, "#c57bff");
    }
  }

/** Interaction hint above the hero (null hides it). */
  prompt(text: string | null) {
    this.set("prompt", text ?? "", () => {
      this.promptEl.classList.toggle("on", !!text);
      if (text) this.promptEl.innerHTML = `<b>F</b> ${text}`;
    });
  }

  /** A line of dialogue at the bottom of the screen. */
  say(who: string, line: string) {
    this.sayEl.innerHTML = `<b>${who}</b>${line}`;
    this.sayEl.classList.add("on");
    if (this.sayT) clearTimeout(this.sayT);
    this.sayT = setTimeout(() => this.sayEl.classList.remove("on"), 3800);
  }

/** Screen-space labels for doors and shop items (always readable, pinned to the edge when off-screen). */
  markers(list: Marker[]) {
    while (this.markerEls.length < list.length) {
      const m = el("div", "rs-marker", this.root, "<i></i><div><b></b><span></span></div><em></em>");
      this.markerEls.push(m);
    }
    this.markerEls.forEach((m, i) => {
      const k = list[i];
      if (!k) {
        if (m.style.display !== "none") m.style.display = "none";
        return;
      }
      m.style.display = "";
      m.style.transform = `translate(${Math.round(k.x)}px, ${Math.round(k.y)}px) translate(-50%, -50%)`;
      const key = k.icon + k.title + k.sub + k.color;
      if (m.dataset.key !== key) {
        m.dataset.key = key;
        let url = this.iconUrls.get(k.icon);
        if (!url) {
          url = iconCanvas(k.icon).toDataURL();
          this.iconUrls.set(k.icon, url);
        }
        (m.children[0] as HTMLElement).style.backgroundImage = `url(${url})`;
        m.querySelector("b")!.textContent = k.title;
        m.querySelector("span")!.textContent = k.sub;
        m.style.setProperty("--c", k.color);
      }
      const arrow = m.querySelector("em") as HTMLElement;
      arrow.style.display = k.arrow === null ? "none" : "";
      if (k.arrow !== null) arrow.style.transform = `rotate(${k.arrow}rad)`;
    });
  }

/** Health bars over enemies: red fill, a white chip trail that drains after the hit, gold shield on top. */
  enemyBars(list: EnemyBar[], real: number) {
    if (!this.floatLayer) this.floatLayer = el("div", "rs-floats", this.root);
    for (const b of this.bars.values()) b.used = false;
    for (const k of list) {
      let b = this.bars.get(k.id);
      if (!b) {
        const e = el("div", "rs-ebar", this.floatLayer, "<i class=lag></i><i class=fill></i><i class=sh></i>");
        b = { el: e, lag: e.children[0] as HTMLElement, fill: e.children[1] as HTMLElement, sh: e.children[2] as HTMLElement, lagF: k.hp, f: -1, used: true };
        this.bars.set(k.id, b);
        e.classList.toggle("wide", k.wide);
        if (k.elite) {
          e.classList.add("elite");
          e.style.setProperty("--e", k.elite);
        }
      }
      b.used = true;
      // The chip trail waits a moment, then drains toward the real value.
      if (k.hp < b.f) b.lagF = Math.max(b.lagF, b.f);
      b.lagF = Math.max(k.hp, b.lagF - real * 0.9);
      if (b.f !== k.hp) {
        b.fill.style.width = `${k.hp * 100}%`;
        b.f = k.hp;
      }
      b.lag.style.width = `${b.lagF * 100}%`;
      b.sh.style.width = `${k.shield * 100}%`;
      b.el.style.transform = `translate(${Math.round(k.x)}px, ${Math.round(k.y)}px) translate(-50%, -100%)`;
    }
    for (const [id, b] of this.bars)
      if (!b.used) {
        b.el.remove();
        this.bars.delete(id);
      }
  }

  /** Floating damage number at a world position (style: "", "crit", "heavy", "gun", "dot", "shield"). */
  popNumber(pos: THREE.Vector3, amount: number, style: string, color?: string) {
    if (!this.floatLayer) this.floatLayer = el("div", "rs-floats", this.root);
    if (this.floaters.length > 48) this.floaters.shift()!.el.remove();
    const e = el("div", `rs-dmg ${style}`, this.floatLayer);
    e.textContent = `${Math.max(1, Math.round(amount))}`;
    if (color) e.style.color = color;
    this.floaters.push({ el: e, pos: pos.clone(), t: 0, dur: style === "crit" ? 1.0 : 0.8, dx: (Math.random() - 0.5) * 36 });
  }

  /** Moves damage numbers each frame (project returns false when off-screen). */
  updateNumbers(real: number, project: (v: THREE.Vector3, out: { x: number; y: number }) => boolean) {
    const o = { x: 0, y: 0 };
    this.floaters = this.floaters.filter((f) => {
      f.t += real;
      if (f.t >= f.dur || !project(f.pos, o)) {
        f.el.remove();
        return false;
      }
      const u = f.t / f.dur;
      const rise = 46 * (1 - (1 - u) * (1 - u));
      const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.75 : u < 0.25 ? 1.35 - ((u - 0.12) / 0.13) * 0.35 : 1;
      f.el.style.opacity = `${u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4}`;
      f.el.style.transform = `translate(${Math.round(o.x + f.dx * u)}px, ${Math.round(o.y - rise)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
      return true;
    });
  }

  clearFloaters() {
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    for (const b of this.bars.values()) b.el.remove();
    this.bars.clear();
  }

  toast(text: string, color: string) {
    const t = el("div", "rs-toast", this.toasts, text);
    t.style.setProperty("--c", color);
    setTimeout(() => t.remove(), 1500);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  hurt() {
    this.hurtV.classList.remove("on");
    void this.hurtV.offsetWidth;
    this.hurtV.classList.add("on");
  }

  letterbox(on: boolean) {
    this.lbTop.classList.toggle("on", on);
    this.lbBot.classList.toggle("on", on);
  }

  inkFlash() {
    this.flashEl.classList.remove("on");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("on");
  }

  wrathFlash() {
    this.wrathFl.classList.remove("on");
    void this.wrathFl.offsetWidth;
    this.wrathFl.classList.add("on");
  }

  fade(on: boolean) {
    this.fadeEl.classList.toggle("on", on);
  }

  show(on: boolean) {
    this.root.style.display = on ? "" : "none";
  }
}
