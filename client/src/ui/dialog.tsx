import { Dialog as Base } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ReactNode } from "react";

const fade =
  "transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0";

/**
 * A modal dialog over a dimmed screen: it traps focus, closes on Escape or a
 * click outside, and hands focus back when it closes. It's centred and fits
 * its content up to 80% of the screen's height; className sizes and styles
 * the panel, and can make it fill the screen.
 */
export function Dialog(props: {
  open: boolean;
  onClose: () => void;
  /** The id of the dialog's title. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Base.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Base.Portal>
        <Base.Backdrop className={cn("bg-scrim/70 fixed inset-0", fade)} />
        <Base.Popup
          aria-labelledby={props.label}
          className={cn(
            "fixed inset-0 m-auto h-fit max-h-[80vh] overflow-hidden",
            fade,
            props.className,
          )}
        >
          {props.children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
