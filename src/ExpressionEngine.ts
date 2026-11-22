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
  /** Per-channel spring overrides; undefined = use the engine-wide option. */
  omega?: number;
  dampingRatio?: number;
}

export interface EngineOptions {
  /** Spring natural frequency (rad/s). */
  omega: number;
  /** Spring damping ratio ζ. 1 = critically damped, <1 overshoots then settles, >1 sluggish. */
  dampingRatio: number;
  /** Range written to morphTargetInfluences. A max above 1 lets overshoot show near full weight. */
  outputMin: number;
  outputMax: number;
  /** Largest dt used per update, in seconds. */
  maxDt: number;
  /** Requested name → model morph names, checked before automatic resolution. */
  aliases?: Record<string, string[]>;
}

/** Per-call spring overrides for setTarget. They stick to the channel until changed; null clears. */
export interface TargetOptions {
  dampingRatio?: number | null;
  omega?: number | null;
}

/**
 * Exact one-step solution of the damped spring x'' = ω²(goal − x) − 2ζω x'.
 * Stable for any dt, so frame hitches never make it explode.
 */
export function stepSpring(
  x: number,
  v: number,
  goal: number,
  omega: number,
  zeta: number,
  t: number,
): [number, number] {
  const d = x - goal;
  if (Math.abs(zeta - 1) < 1e-4) {
    const e = Math.exp(-omega * t);
    const k = v + omega * d;
    return [goal + (d + k * t) * e, (v - omega * k * t) * e];
  }
  if (zeta < 1) {
    // Underdamped: decaying oscillation.
    const a = zeta * omega;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-a * t);
    const c = Math.cos(wd * t);
    const s = Math.sin(wd * t);
    const b = (v + a * d) / wd;
    return [goal + e * (d * c + b * s), e * (v * c - ((a * v + omega * omega * d) / wd) * s)];
  }
  // Overdamped: sum of two decaying exponentials.
  const r = omega * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega + r;
  const r2 = -zeta * omega - r;
  const c1 = (v - r2 * d) / (r1 - r2);
  const c2 = d - c1;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return [goal + c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
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
 * Drives morph targets toward requested values with a damped spring
 * (critically damped by default; dampingRatio < 1 gives a small overshoot).
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

  /**
   * Sets the goal weight (0..1) for an ARKit-named expression.
   * Last write wins per channel: callers that blend several sources into one morph
   * (e.g. the stage E signal mapping) must sum them first and call this once.
   * `options` can give this channel its own damping ratio / ω (sticky; null resets to global).
   */
  setTarget(name: string, value: number, options?: TargetOptions): void {
    for (const ch of this.resolve(name)) {
      ch.target = value;
      if (options?.dampingRatio !== undefined) ch.dampingRatio = options.dampingRatio ?? undefined;
      if (options?.omega !== undefined) ch.omega = options.omega ?? undefined;
    }
  }

  /** Per-channel spring overrides currently in effect (undefined = global). */
  getSpring(name: string): { omega?: number; dampingRatio?: number } {
    const ch = this.resolve(name)[0];
    return { omega: ch?.omega, dampingRatio: ch?.dampingRatio };
  }

  /** Drops every per-channel spring override. */
  clearSpringOverrides(): void {
    for (const ch of this.channels) {
      ch.omega = undefined;
      ch.dampingRatio = undefined;
    }
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
    const { omega, dampingRatio, outputMin, outputMax } = this.options;
    for (const ch of this.channels) {
      const goal = clamp01(ch.target + ch.base);
      [ch.value, ch.velocity] = stepSpring(
        ch.value,
        ch.velocity,
        goal,
        ch.omega ?? omega,
        ch.dampingRatio ?? dampingRatio,
        t,
      );
      const out = Math.min(Math.max(ch.value, outputMin), outputMax);
      for (const s of ch.slots) s.influences[s.index] = out;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
