// Per-model JSON files pasted back from the browser tools: src/data/<kind>.<modelKey>.json.
// Missing files are fine (the caller falls back to config defaults).
const files = import.meta.glob('./data/*.json', { eager: true, import: 'default' });

export function modelData<T>(kind: string, modelKey: string): T | null {
  return (files[`./data/${kind}.${modelKey}.json`] as T | undefined) ?? null;
}

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively overlays `over` onto a copy of `base` (only keys that exist in base). */
export function deepMerge<T>(base: T, ...overs: (unknown | null | undefined)[]): T {
  const out = structuredClone(base) as Plain;
  for (const over of overs) {
    if (!isPlain(over)) continue;
    for (const [k, v] of Object.entries(over)) {
      if (!(k in out)) continue;
      out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
    }
  }
  return out as T;
}
