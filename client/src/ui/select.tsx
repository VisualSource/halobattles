import { Select as Base } from "@base-ui/react/select";
import { cn } from "cn";
import { popupClass } from "./popup";

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
        className={cn(
          "border-edge bg-well text-ink flex min-w-0 items-center justify-between gap-2 rounded border px-2 py-1 text-left text-sm data-disabled:opacity-50",
          props.className,
        )}
      >
        <Base.Value className="truncate" />
        <Base.Icon className="text-ink-3 flex-none text-xs">▾</Base.Icon>
      </Base.Trigger>
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
                  <Base.ItemText>{o.label}</Base.ItemText>
                </Base.Item>
              ))}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
