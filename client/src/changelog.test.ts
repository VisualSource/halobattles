import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELEASE, releases } from "./changelog";

const changelog = readFileSync(
  new URL("../../CHANGELOG.md", import.meta.url),
  "utf8",
);

// "1.10.0" after "1.9.2": compared number by number.
const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) {
    const d = (x?.[i] ?? 0) - (y?.[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

describe("CHANGELOG.md", () => {
  it('heads every release as "## <version> - <date>", besides Unreleased', () => {
    const headings = changelog
      .split(/\r?\n/)
      .filter((l) => l.startsWith("## "));
    for (const h of headings) {
      if (h !== "## Unreleased") expect(h).toMatch(RELEASE);
    }
  });

  it("goes newest first: each version and date older than the one above", () => {
    const rs = releases(changelog);
    expect(rs.length).toBeGreaterThan(0);
    for (let i = 1; i < rs.length; i++) {
      const [above, below] = [rs[i - 1], rs[i]];
      expect(
        newer(above?.version ?? "", below?.version ?? ""),
        `${above?.version} above ${below?.version}`,
      ).toBe(true);
      expect((above?.date ?? "") >= (below?.date ?? "")).toBe(true);
    }
  });
});

describe("releases", () => {
  it("leaves out Unreleased and the preamble, and keeps each release's notes", () => {
    const rs = releases(
      "# Changelog\n\nIntro.\n\n## Unreleased\n\n- soon\n\n## 0.2.0 - 2026-11-02\n\n### Fixed\n\n- a bug\n\n## 0.1.0 - 2026-11-01\n\nFirst.\n",
    );
    expect(rs).toEqual([
      { version: "0.2.0", date: "2026-11-02", notes: "### Fixed\n\n- a bug" },
      { version: "0.1.0", date: "2026-11-01", notes: "First." },
    ]);
  });
});
