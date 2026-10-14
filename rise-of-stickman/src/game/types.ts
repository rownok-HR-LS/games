import type * as THREE from "three";
import type { Element } from "./boons";

export type HitKind = "blade" | "gun" | "special" | "execute" | "wrath" | "dot" | "element" | "reflect" | "splitter" | "dash";

export type Hit = {
  dmg: number;
  /** Horizontal push direction (normalised). */
  dir: THREE.Vector3;
  kind: HitKind;
  /** Style id of the move (variety is rewarded). */
  move: string;
  knock?: number;
  launch?: number;
  /** Heavy hits stagger armoured enemies and play hit-stop. */
  heavy?: boolean;
  element?: Element | null;
  /** Elemental procs (chain lightning etc.) don't trigger further procs. */
  proc?: boolean;
  crit?: boolean;
  /** Point of impact for effects. */
  at?: THREE.Vector3;
  /** Executioner / execution kills. */
  execute?: boolean;
};

export interface Target {
  readonly id: number;
  readonly pos: THREE.Vector3;
  readonly radius: number;
  /** Chest height for effects. */
  readonly chest: number;
  readonly isBoss: boolean;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Height above the floor (juggles). */
  air: number;
  takeHit(h: Hit): void;
  /** Called when the hero parries this target's attack. */
  parried(): void;
  chill(amount: number): void;
  freeze(sec: number): void;
  ignite(dps: number, sec: number): void;
  frozen(): boolean;
}

export type AttackResult = "hit" | "parried" | "dodged" | "perfect";

export type AttackOpts = {
  parryable: boolean;
  kind: "melee" | "projectile" | "aoe";
  knock?: number;
};
