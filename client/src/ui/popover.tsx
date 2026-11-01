import { Popover as Base } from "@base-ui/react/popover";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";
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
