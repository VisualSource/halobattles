// The game's version and changelog, from the repo's CHANGELOG.md, which the
// build bundles with the commit it was built from (see vite.config.ts).

export type Release = { version: string; date: string; notes: string };

/** A release heading: "## 0.4.0 - 2026-11-02". */
export const RELEASE = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/;

/** A changelog's releases, newest first: Unreleased and the preamble are left out. */
export function releases(text: string): Release[] {
  const out: Release[] = [];
  let current: Release | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const m = RELEASE.exec(line);
      current = m ? { version: m[1] ?? "", date: m[2] ?? "", notes: "" } : null;
      if (current) out.push(current);
    } else if (current) {
      current.notes += `${line}\n`;
    }
  }
  return out.map((r) => ({ ...r, notes: r.notes.trim() }));
}

export const RELEASES = releases(__CHANGELOG__);
/** The game's version: the newest release's. */
export const VERSION = RELEASES[0]?.version ?? "0.0.0";
/** The version and the commit built from, where the build knew it. */
export const BUILD = __COMMIT__ ? `${VERSION}+${__COMMIT__}` : VERSION;
