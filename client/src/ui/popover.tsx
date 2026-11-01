import { Popover as Base } from "@base-ui/react/popover";
import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { popupClass } from "./popup";

/**
 * Details behind an info button: they show on hover, like a Tooltip, and a
 * click (or Enter or Space) opens them until the player clicks away or
 * presses Escape. Focus goes back to the button when it closes.
 */
export function InfoPopover(props: {
  /** The trigger: an element that takes a ref and props, such as a button. */
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Along that side: "start" lines up the popup's top (or left) edge with the trigger's. */
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Base.Root>
      <Base.Trigger openOnHover delay={300} render={props.children} />
      <Base.Portal>
        <Base.Positioner
          side={props.side ?? "bottom"}
          align={props.align ?? "center"}
          sideOffset={8}
        >
          <Base.Popup className={cn(popupClass, props.className)}>
            {props.content}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

/**
 * The round "i" that opens an InfoPopover. It passes its props and ref
 * through, as the popover's trigger needs.
 */
export function InfoButton({
  name,
  className,
  ...props
}: ComponentProps<"button"> & { name: string }) {
  return (
    <button
      type="button"
      aria-label={`About ${name}`}
      className={cn(
        "border-edge text-ink-3 hover:text-ink data-popup-open:text-ink data-popup-open:border-ink-3 flex size-5.5 flex-none cursor-pointer items-center justify-center rounded-full border bg-transparent p-0 font-serif text-xs italic",
        className,
      )}
      {...props}
    >
      i
    </button>
  );
}
