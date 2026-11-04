import { cn } from "cn";
import { useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { Dialog } from "./ui/dialog";

// The player's settings, kept in this browser. Battles is sent to the
// server on joining a Match and on each change (MatchConnection).

export type Settings = { battles: "auto" | "command" };

const KEY = "halobattles-settings";
const DEFAULTS: Settings = { battles: "auto" };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS; // storage blocked or garbled: the defaults will do
  }
}

export const settings = createStore<Settings>(load);
settings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not saved: it lasts this page only
  }
});

/**
 * The gear that opens Settings. quiet: a grey icon with no border, as on
 * the main menu and the lobby's header.
 */
export function SettingsButton(props: { quiet?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md p-0",
          props.quiet
            ? "text-ink-3 hover:text-ink-2 border-0 bg-transparent"
            : "border-edge text-ink-2 size-9 bg-transparent",
          props.className,
        )}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label="settings-title"
        className="bg-void text-ink m-0 h-screen max-h-none w-screen max-w-none"
      >
        <SettingsScreen onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

const SECTIONS = ["Battles"] as const;

function SettingsScreen(props: { onClose: () => void }) {
  const battles = useStore(settings, (s) => s.battles);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Battles");
  const choice = (value: Settings["battles"], name: string, hint: string) => (
    <label
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        battles === value
          ? "border-accent bg-accent-wash"
          : "border-edge bg-item",
      )}
    >
      <input
        type="radio"
        name="battles"
        checked={battles === value}
        onChange={() => settings.setState({ battles: value })}
        className="mt-1"
      />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{name}</span>
        <span className="text-ink-3 text-sm">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="border-line bg-ground flex items-center justify-between gap-4 border-b px-8 py-3">
        <h2
          id="settings-title"
          className="font-display text-xl font-bold tracking-[0.14em]"
        >
          SETTINGS
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          className="border-edge text-ink-2 inline-flex min-h-11 items-center rounded-md bg-transparent px-4 font-medium"
        >
          Back
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="border-line bg-bar flex w-65 flex-none flex-col gap-1.5 border-r px-4 py-6"
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={section === s}
              onClick={() => setSection(s)}
              className={cn(
                "min-h-11 rounded-md border px-3.5 text-left font-medium",
                section === s
                  ? "border-accent bg-accent-wash text-accent"
                  : "text-ink-2 border-transparent bg-transparent",
              )}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="flex max-w-190 flex-1 flex-col gap-6 overflow-y-auto px-12 py-8">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-ink-3 text-xs font-semibold tracking-[0.14em]">
              BATTLES
            </h3>
            <p className="text-ink-2">
              Who fights your Battles, when one starts.
            </p>
          </div>
          <fieldset className="m-0 grid grid-cols-2 gap-3 border-0 p-0">
            <legend className="sr-only">Who fights your Battles</legend>
            {choice(
              "auto",
              "Auto",
              "The AI fights them for you. You can open a Battle to watch, and still Retreat.",
            )}
            {choice(
              "command",
              "Command",
              "You give the orders. A Battle's window opens when it starts.",
            )}
          </fieldset>
          <p className="text-ink-3 text-sm">
            Applies to Battles that start from now on, and to your next Matches.
            An Army can override it in its own window.
          </p>
        </div>
      </div>
    </div>
  );
}
