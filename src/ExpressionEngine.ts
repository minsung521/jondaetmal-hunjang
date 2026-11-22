import type * as THREE from 'three';

/** Which side of the face a morph name refers to (character's own left/right). */
type Side = 'L' | 'R' | null;

/** One morph channel = the same morph name across every mesh that has it. */
interface Channel {
  name: string;
  slots: { influences: number[]; index: number }[];
  target: number;
  base: number;
  value: number;
  velocity: number;
}

export interface EngineOptions {
  /** Spring natural frequency (rad/s). */
  omega: number;
  /** Largest dt used per update, in seconds. */
  maxDt: number;
  /** Requested name → model morph names, checked before automatic resolution. */
  aliases?: Record<string, string[]>;
}

// Suffixes seen in the wild: ARKit (browDownLeft), facecap (browDown_L), Blender (browDown.L).
const SIDE_PATTERNS: [RegExp, Side][] = [
  [/(?:Left|_L|\.L|_left)$/, 'L'],
  [/(?:Right|_R|\.R|_right)$/, 'R'],
];

// ARKit names where Left/Right is a direction of movement, not a side of the face.
const DIRECTIONAL_BASES = new Set(['jaw', 'mouth']);

function splitSide(name: string): { base: string; side: Side } {
  for (const [re, side] of SIDE_PATTERNS) {
    if (!re.test(name)) continue;
    const base = name.replace(re, '');
    if (DIRECTIONAL_BASES.has(base)) break;
    return { base, side };
  }
  return { base: name, side: null };
}

/** Turns any model naming style into the ARKit spelling (browDown_L → browDownLeft). */
export function toArkitName(name: string): string {
  const { base, side } = splitSide(name);
  return side === 'L' ? `${base}Left` : side === 'R' ? `${base}Right` : base;
}

/**
 * Drives morph targets toward requested values with a critically damped spring.
 *
 * Requests use ARKit names. An alias layer maps them onto whatever the model has:
 * - model has only a combined key (browDown): browDownLeft/Right requests go to it.
 * - model has only side keys (browDown_L/_R): a combined request (browDown) goes to both.
 */
export class ExpressionEngine {
  readonly channels: Channel[] = [];
  private byName = new Map<string, Channel>();
  /** base name → channels for each side ('' = no side). */
  private byBase = new Map<string, { L?: Channel; R?: Channel; both?: Channel }>();
  private resolveCache = new Map<string, Channel[]>();

  constructor(
    meshes: THREE.Mesh[],
    public options: EngineOptions,
  ) {
    for (const mesh of meshes) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dict || !influences) continue;
      for (const [name, index] of Object.entries(dict)) {
        let ch = this.byName.get(name);
        if (!ch) {
          ch = { name, slots: [], target: 0, base: 0, value: influences[index] ?? 0, velocity: 0 };
          this.byName.set(name, ch);
          this.channels.push(ch);
          const { base, side } = splitSide(name);
          const entry = this.byBase.get(base) ?? {};
          entry[side ?? 'both'] = ch;
          this.byBase.set(base, entry);
        }
        ch.slots.push({ influences, index });
      }
    }
  }

  /** ARKit-style names this model can respond to (for UIs). */
  get arkitNames(): string[] {
    return this.channels.map((c) => toArkitName(c.name));
  }

  /** Model morph channels a requested name maps to. Empty if the model can't express it. */
  resolve(name: string): Channel[] {
    const cached = this.resolveCache.get(name);
    if (cached) return cached;

    let result: Channel[] = [];
    const alias = this.options.aliases?.[name];
    if (alias) {
      result = alias.map((n) => this.byName.get(n)).filter((c): c is Channel => !!c);
    } else if (this.byName.has(name)) {
      result = [this.byName.get(name)!];
    } else {
      const { base, side } = splitSide(name);
      const entry = this.byBase.get(base);
      if (entry) {
        if (side) {
          const exact = entry[side] ?? entry.both;
          if (exact) result = [exact];
        } else if (entry.both) {
          result = [entry.both];
        } else {
          result = [entry.L, entry.R].filter((c): c is Channel => !!c);
        }
      }
    }
    this.resolveCache.set(name, result);
    return result;
  }

  /** Sets the goal weight (0..1) for an ARKit-named expression. Last write wins per channel. */
  setTarget(name: string, value: number): void {
    for (const ch of this.resolve(name)) ch.target = value;
  }

  getTarget(name: string): number {
    return this.resolve(name)[0]?.target ?? 0;
  }

  /** Clears every target back to 0 (base weights stay). */
  resetTargets(): void {
    for (const ch of this.channels) ch.target = 0;
  }

  /** Base weights are always added to the target (e.g. a resting frown). */
  setBaseWeights(weights: Record<string, number>): void {
    for (const ch of this.channels) ch.base = 0;
    for (const [name, value] of Object.entries(weights)) {
      for (const ch of this.resolve(name)) ch.base = value;
    }
  }

  setBaseWeight(name: string, value: number): void {
    for (const ch of this.resolve(name)) ch.base = value;
  }

  getBaseWeight(name: string): number {
    return this.resolve(name)[0]?.base ?? 0;
  }

  /** Advances every channel by dt seconds and writes morphTargetInfluences. */
  update(dt: number): void {
    const t = Math.min(Math.max(dt, 0), this.options.maxDt);
    const w = this.options.omega;
    const e = Math.exp(-w * t);
    for (const ch of this.channels) {
      const goal = clamp01(ch.target + ch.base);
      // Exact solution of x'' = w²(goal - x) - 2w x' over one step (stable for any dt).
      const d = ch.value - goal;
      const k = ch.velocity + w * d;
      ch.value = goal + (d + k * t) * e;
      ch.velocity = (ch.velocity - w * k * t) * e;
      const out = clamp01(ch.value);
      for (const s of ch.slots) s.influences[s.index] = out;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
