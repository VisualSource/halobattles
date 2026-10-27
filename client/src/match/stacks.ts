import type { UnitSlot } from "./store";

/**
 * What MoveUnits does when a whole Unit Slot is dragged to a cell, so the
 * grid shows it before the server answers. It mirrors the server's rules:
 * an empty cell takes the slot, a slot of the same unit merges with it up
 * to the unit's slotLimit (0 is none), and another unit's slot swaps places.
 */
export function moveSlot(
  stacks: UnitSlot[][],
  from: { stack: number; cell: number },
  to: { stack: number; cell: number },
  limit = 0,
): UnitSlot[][] {
  const out = stacks.map((st) => st.map((u) => ({ ...u })));
  const moved = out[from.stack]?.find((u) => u.cell === from.cell);
  const dst = out[to.stack];
  if (!moved || !dst) return stacks;
  const there = dst.find((u) => u.cell === to.cell);
  const drop = () => {
    out[from.stack] = (out[from.stack] ?? []).filter((u) => u !== moved);
  };
  if (!there) {
    if (limit && moved.count > limit) return stacks;
    drop();
    (out[to.stack] ?? []).push({ ...moved, cell: to.cell });
  } else if (there === moved) {
    return stacks;
  } else if (there.unit === moved.unit) {
    const n = limit ? Math.min(moved.count, limit - there.count) : moved.count;
    if (n < 1) return stacks;
    there.count += n;
    moved.count -= n;
    if (!moved.count) drop();
  } else {
    [moved.unit, there.unit] = [there.unit, moved.unit];
    [moved.count, there.count] = [there.count, moved.count];
  }
  return out;
}

/** The first cell of a Stack with no Unit Slot, or -1 when it's full. */
export function freeCell(stack: UnitSlot[], cells: number) {
  for (let c = 0; c < cells; c++) {
    if (!stack.some((u) => u.cell === c)) return c;
  }
  return -1;
}
