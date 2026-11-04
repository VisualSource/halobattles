import { Select as Base } from "@base-ui/react/select";
import { cn } from "cn";
import { popupClass } from "./popup";

const trigger =
  "border-edge bg-well text-ink flex min-w-0 items-center justify-between gap-2 rounded border px-2 py-1 text-left text-sm data-disabled:opacity-50";

/**
 * A select in the game's look: a trigger showing the picked option's label,
 * and a popup list under it. Keyboard and screen readers work as for a
 * native select.
 */
export function Select<T extends string>(props: {
  label: string; // its accessible name
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Base.Root
      items={props.options}
      value={props.value}
      onValueChange={(v) => v !== null && props.onChange(v)}
      disabled={props.disabled}
    >
      <Base.Trigger
        aria-label={props.label}
        className={cn(trigger, props.className)}
      >
        <Base.Value className="truncate" />
        <Base.Icon className="text-ink-3 flex-none text-xs">▾</Base.Icon>
      </Base.Trigger>
      <Options options={props.options} />
    </Base.Root>
  );
}

/**
 * A Select that picks any number of its options: the popup stays open as
 * they're ticked, and the trigger lists them, or `none` with none picked.
 */
export function MultiSelect<T extends string>(props: {
  label: string; // its accessible name
  value: T[];
  options: { value: T; label: string }[];
  onChange: (v: T[]) => void;
  none: string;
  className?: string;
}) {
  const names = props.options
    .filter((o) => props.value.includes(o.value))
    .map((o) => o.label);
  return (
    <Base.Root
      multiple
      items={props.options}
      value={props.value}
      // In the options' order, however they were ticked.
      onValueChange={(v) =>
        props.onChange(
          props.options.map((o) => o.value).filter((x) => v.includes(x)),
        )
      }
    >
      <Base.Trigger
        aria-label={props.label}
        className={cn(trigger, props.className)}
      >
        <Base.Value className="truncate">
          {names.join(", ") || props.none}
        </Base.Value>
        <Base.Icon className="text-ink-3 flex-none text-xs">▾</Base.Icon>
      </Base.Trigger>
      <Options options={props.options} ticks />
    </Base.Root>
  );
}

/** The popup under a trigger; ticks marks the picked options, for a MultiSelect. */
function Options<T extends string>(props: {
  options: { value: T; label: string }[];
  ticks?: boolean;
}) {
  return (
    <Base.Portal>
      <Base.Positioner
        sideOffset={4}
        alignItemWithTrigger={false}
        className="z-50"
      >
        <Base.Popup
          className={cn(
            popupClass,
            "max-h-[min(20rem,var(--available-height))] min-w-(--anchor-width) overflow-y-auto p-1",
          )}
        >
          <Base.List>
            {props.options.map((o) => (
              <Base.Item
                key={o.value}
                value={o.value}
                className="data-highlighted:bg-raised data-selected:text-accent flex cursor-default items-center gap-2 rounded px-2 py-1 outline-none"
              >
                {props.ticks && (
                  <span className="w-3 flex-none">
                    <Base.ItemIndicator>✓</Base.ItemIndicator>
                  </span>
                )}
                <Base.ItemText>{o.label}</Base.ItemText>
              </Base.Item>
            ))}
          </Base.List>
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}
