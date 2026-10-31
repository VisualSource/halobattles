import { Tooltip as Base } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { popupClass } from "./popup";

/**
 * A popup on hover or keyboard focus, from a short label to a building's
 * details. Screen readers don't read it, so the trigger still needs its
 * own accessible name. Touch isn't a supported input, so nothing opens on tap.
 */
export function Tooltip(props: {
  /** The trigger: an element that takes a ref and props, such as a button. */
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Base.Root>
      <Base.Trigger delay={300} render={props.children} />
      <Base.Portal>
        <Base.Positioner side={props.side ?? "bottom"} sideOffset={8}>
          <Base.Popup className={`${popupClass} ${props.className ?? ""}`}>
            {props.content}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
