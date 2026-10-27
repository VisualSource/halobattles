import { type ReactNode, useEffect } from "react";
import { ToastContainer, toast } from "react-toastify";

export type NoteKind = "payday" | "battle" | "captured" | "player" | "rejected";

const KINDS: Record<NoteKind, { label: string; colour: string }> = {
  payday: { label: "Payday", colour: "text-ok" },
  battle: { label: "Battle", colour: "text-accent" },
  captured: { label: "Captured", colour: "text-ok" },
  player: { label: "Player", colour: "text-danger" },
  rejected: { label: "Rejected", colour: "text-danger" },
};

export type NoteAction = { label: string; onClick: () => void };

/** One toast's body. The notification history shows the same element. */
export function Note(props: {
  kind: NoteKind;
  action?: NoteAction;
  children: ReactNode;
}) {
  const k = KINDS[props.kind];
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`font-mono text-[11px] uppercase tracking-[0.08em] ${k.colour}`}
      >
        {k.label}
      </span>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex-1">{props.children}</span>
        {props.action && (
          <button
            type="button"
            onClick={props.action.onClick}
            className="min-h-8 rounded-md border-edge bg-raised px-3 text-sm"
          >
            {props.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export const notify = (kind: NoteKind, text: ReactNode, action?: NoteAction) =>
  toast(
    <Note kind={kind} action={action}>
      {text}
    </Note>,
  );

/** Toasts for every Match screen; each rejected command's reason is one. */
export function Toasts(props: { events: EventTarget }) {
  useEffect(() => {
    const onRejected = (e: Event) =>
      notify("rejected", (e as CustomEvent<string>).detail);
    props.events.addEventListener("rejected", onRejected);
    return () => props.events.removeEventListener("rejected", onRejected);
  }, [props.events]);

  return (
    <ToastContainer
      position="top-right"
      theme="dark"
      autoClose={5000}
      closeOnClick={false}
      newestOnTop
    />
  );
}
