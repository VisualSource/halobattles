import { useEffect, useState } from "react";

const TOAST_MS = 5000;

type Toast = { id: number; text: string };

/** Shows each rejected command's reason for a few seconds. */
export function Toasts(props: { events: EventTarget }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) =>
    setToasts((ts) => ts.filter((t) => t.id !== id));

  useEffect(() => {
    let id = 0;
    const onRejected = (e: Event) => {
      const toast = { id: ++id, text: (e as CustomEvent<string>).detail };
      setToasts((ts) => [...ts, toast]);
      setTimeout(
        () => setToasts((ts) => ts.filter((t) => t.id !== toast.id)),
        TOAST_MS,
      );
    };
    props.events.addEventListener("rejected", onRejected);
    return () => props.events.removeEventListener("rejected", onRejected);
  }, [props.events]);

  return (
    <ul role="status" aria-live="polite">
      {toasts.map((t) => (
        <li key={t.id}>
          {t.text}{" "}
          <button type="button" onClick={() => dismiss(t.id)}>
            Dismiss
          </button>
        </li>
      ))}
    </ul>
  );
}
