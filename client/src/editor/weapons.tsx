import type { ReactNode } from "react";
import {
  type Content,
  ContentPage,
  Field,
  input,
  label,
  Num,
  Section,
} from "./content";

// The Weapon Types page: a name and a multiplier for each layer it hits,
// what a 10-damage hit does to each, and the units that use it.

type WeaponType = {
  id: string;
  name: string;
  shield: number;
  armor: number;
  hp: number;
};
const LAYERS = [
  ["shield", "Shield", "bg-res-research"],
  ["armor", "Armor", "bg-ink-3"],
  ["hp", "HP", "bg-ok"],
] as const;

export function WeaponsPage(props: {
  tabs: ReactNode;
  data: Content;
  reload: () => Promise<void>;
}) {
  const { data } = props;
  const users = (id: string) =>
    data.units.filter(
      (u) => (u.value.combat as { weaponType?: string })?.weaponType === id,
    );
  const most = (w: WeaponType) => Math.max(1, w.shield, w.armor, w.hp);
  return (
    <ContentPage<WeaponType>
      tabs={props.tabs}
      noun="Weapon Type"
      items={
        data.weaponTypes as unknown as { file: string; value: WeaponType }[]
      }
      blank={() => ({ id: "", name: "", shield: 1, armor: 1, hp: 1 })}
      sub={(w) => `${users(w.id).length} units`}
      onSaved={props.reload}
      writes={(w, file) => [{ kind: "weaponTypes", file, value: w }]}
      form={(w, set) => (
        <Section title="Weapon Type">
          <div className="flex flex-wrap gap-3">
            <Field name="Id">
              <input
                className={`${input} w-36 font-mono`}
                value={w.id}
                pattern="[a-z0-9_\-]+"
                onChange={(e) => set((x) => ({ ...x, id: e.target.value }))}
              />
            </Field>
            <Field name="Name">
              <input
                className={`${input} w-44`}
                value={w.name}
                onChange={(e) => set((x) => ({ ...x, name: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            {LAYERS.map(([k, name]) => (
              <Field key={k} name={`× ${name}`}>
                <Num
                  step={0.05}
                  min={0}
                  value={w[k]}
                  onChange={(n) => set((x) => ({ ...x, [k]: n ?? 0 }))}
                />
              </Field>
            ))}
          </div>
        </Section>
      )}
      preview={(w) => (
        <>
          <span className={label}>A 10-damage hit</span>
          <div className="border-edge bg-panel flex flex-col gap-1.5 rounded-lg border p-3">
            {LAYERS.map(([k, name, colour]) => (
              <div
                key={k}
                className="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-2 text-xs"
              >
                <span className="text-ink-3">{name}</span>
                <span className="bg-well h-1.5 overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${colour}`}
                    style={{ width: `${(100 * w[k]) / most(w)}%` }}
                  />
                </span>
                <span className="text-ink-2 text-right font-mono">
                  {Math.round(w[k] * 100) / 10}
                </span>
              </div>
            ))}
          </div>
          <span className={label}>Used by</span>
          <span className="flex flex-wrap gap-1">
            {users(w.id).map((u) => (
              <span
                key={u.file}
                className="border-edge text-ink-2 rounded-full border px-1.75 text-[11.5px]"
              >
                {String(u.value.name)}
              </span>
            ))}
            {users(w.id).length === 0 && (
              <span className="text-ink-4 text-[13px]">No units yet.</span>
            )}
          </span>
        </>
      )}
    />
  );
}
