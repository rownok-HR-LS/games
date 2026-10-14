// DOM heads-up display, updated straight from the game loop (no React re-renders per frame).
import type { Loadout } from "./boons";
import type { Game } from "./game";
import { RANKS } from "./style";
import { iconCanvas, ICON_COLOR, type IconKind } from "./textures";

function el(tag: string, cls: string, parent?: HTMLElement, html = "") {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class Hud {
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
    for (let i = 0; i < 12; i++) this.ammo.push(el("i", "", ammo));
    const dash = el("div", "rs-dash", row);
    for (let i = 0; i < 4; i++) this.dash.push(el("i", "", dash));
    this.special = el("div", "rs-special", row, "<span>E</span>");
    this.boonRow = el("div", "rs-boons", tl);

    const tr = el("div", "rs-tr", root);
    this.souls = el("div", "rs-souls", tr);
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
    this.set("souls", Math.round(g.souls), () => (this.souls.innerHTML = `<i></i>${Math.round(g.souls)}`));
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
    const add = (icon: IconKind, title: string) => {
      const c = iconCanvas(icon);
      const i = el("i", "", this.boonRow);
      i.style.backgroundImage = `url(${c.toDataURL()})`;
      i.style.borderColor = ICON_COLOR[icon];
      i.title = title;
    };
    for (const b of Object.values(l.slots)) if (b) add(b.element, `${b.name}: ${b.text}`);
    for (const r of l.relics) add("relic", `${r.name}: ${r.boon} ${r.curse}`);
    for (const m of l.moves) add("move", m);
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
