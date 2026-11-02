// Unit Variants in the editor: the form edits a variant merged over its
// parent, and Save writes back only what differs. Mirrors the loader's
// server/internal/content/variants.go.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** An RFC 7396 JSON Merge Patch: null drops a key, objects merge, the rest replaces. */
function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isObj(patch)) return patch;
  const out: Obj = isObj(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

/** The unit by id, merged over its parents; a missing parent or a cycle stops the merge. */
export function resolved(
  units: Map<string, Obj>,
  id: string,
  seen: string[] = [],
): Obj {
  const u = units.get(id) ?? {};
  const parent = u.variantOf;
  if (typeof parent !== "string" || !units.has(parent) || seen.includes(id))
    return u;
  return mergePatch(resolved(units, parent, [...seen, id]), u) as Obj;
}

/**
 * The variant file for draft: its id, name and variantOf, and each key
 * that differs from parent (objects key by key), null for one it dropped.
 */
export function overrides(draft: Obj, parent: Obj): Obj {
  const { id, name, variantOf } = draft;
  return { id, name, variantOf, ...diff(draft, parent) };
}

function diff(draft: Obj, parent: Obj): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(draft), ...Object.keys(parent)])) {
    if (["id", "name", "variantOf"].includes(k)) continue;
    const d = draft[k];
    const p = parent[k];
    if (d === undefined) {
      if (p !== undefined) out[k] = null;
    } else if (isObj(d) && isObj(p)) {
      const sub = diff(d, p);
      if (Object.keys(sub).length) out[k] = sub;
    } else if (JSON.stringify(d) !== JSON.stringify(p)) out[k] = d;
  }
  return out;
}

/** The value at path in o, if there's one. */
const at = (o: unknown, path: string[]) =>
  path.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);

/** Whether draft's value at path differs from parent's. */
export const overridden = (draft: Obj, parent: Obj, path: string[]) =>
  JSON.stringify(at(draft, path)) !== JSON.stringify(at(parent, path));

/** draft with its value at path put back to parent's. */
export function resetAt<T>(draft: T, parent: Obj, path: string[]): T {
  const next = structuredClone(draft) as Obj;
  let into = next;
  for (const k of path.slice(0, -1)) {
    if (!isObj(into[k])) into[k] = {};
    into = into[k] as Obj;
  }
  const from = at(parent, path);
  const last = path[path.length - 1] ?? "";
  if (from === undefined) delete into[last];
  else into[last] = structuredClone(from);
  return next as T;
}
