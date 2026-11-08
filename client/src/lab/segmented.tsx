import { cn } from "cn";
import type { ReactNode } from "react";

export function Segmented<T extends string | number>(props: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="border-edge flex overflow-hidden rounded-md border">
      {props.options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={props.value === v}
          onClick={() => props.onChange(v)}
          className={cn(
            "min-h-8 rounded-none border-0 px-2.5",
            props.value === v ? "bg-accent-wash text-accent" : "bg-transparent",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
