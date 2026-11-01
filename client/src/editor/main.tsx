import { cn } from "cn";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { ClassesPage } from "./classes";
import { useContent } from "./content";
import { Editor } from "./editor";
import { FactionsPage } from "./factions";
import { UnitsPage } from "./units";
import { WeaponsPage } from "./weapons";

const PAGES = [
  ["maps", "Maps"],
  ["units", "Units"],
  ["weapons", "Weapons"],
  ["classes", "Classes"],
  ["factions", "Factions"],
] as const;
type Page = (typeof PAGES)[number][0];

/** The editor's pages, behind one switch in each page's header. */
function Shell() {
  const [page, setPage] = useState<Page>("maps");
  const content = useContent();
  const tabs = (
    <span className="mr-1 flex items-center gap-3">
      <h1 className="font-display text-base font-bold tracking-widest">
        EDITOR
      </h1>
      <span
        role="tablist"
        className="bg-well border-line flex gap-0.5 rounded-md border p-0.5"
      >
        {PAGES.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={page === id}
            onClick={() => setPage(id)}
            className={cn(
              "font-display rounded border-0 bg-transparent px-3 py-0.5 text-xs font-semibold tracking-wider uppercase",
              page === id ? "bg-raised text-ink" : "text-ink-3",
            )}
          >
            {name}
          </button>
        ))}
      </span>
    </span>
  );
  // Every page stays mounted, hidden when not shown, so switching keeps unsaved work.
  const data = content.data;
  return (
    <>
      <div hidden={page !== "maps"}>
        <Editor tabs={tabs} active={page === "maps"} />
      </div>
      {page !== "maps" && !data && (
        <p className="text-ink-3 p-6">{content.error || "Loading content…"}</p>
      )}
      {data && (
        <>
          <div hidden={page !== "units"}>
            <UnitsPage tabs={tabs} data={data} reload={content.reload} />
          </div>
          <div hidden={page !== "weapons"}>
            <WeaponsPage tabs={tabs} data={data} reload={content.reload} />
          </div>
          <div hidden={page !== "classes"}>
            <ClassesPage tabs={tabs} data={data} reload={content.reload} />
          </div>
          <div hidden={page !== "factions"}>
            <FactionsPage tabs={tabs} data={data} reload={content.reload} />
          </div>
        </>
      )}
    </>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Shell />
    </StrictMode>,
  );
