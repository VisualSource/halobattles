import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import { playlist } from "./music";

const album = (name: string, ...titles: string[]) => ({
  name,
  artist: "Someone",
  tracks: titles.map((t) => ({ title: t, file: `__m__/${t}.mp3` })),
});

describe("Music playlist", () => {
  it("plays every Soundtrack album by album, skipping files the client lacks", () => {
    const content = {
      soundtracks: new Map([
        ["m:b", album("B", "b1")],
        ["m:a", album("A", "a1", "missing", "a2")],
      ]),
    } as unknown as Pick<ContentLookups, "soundtracks">;
    const url = (ref: string) =>
      ref.includes("missing") ? undefined : `/x/${ref}`;
    expect(playlist(content, url).map((t) => `${t.album}:${t.title}`)).toEqual([
      "A:a1",
      "A:a2",
      "B:b1",
    ]);
  });

  it("is empty without a Soundtrack, so the player hides", () => {
    expect(playlist({ soundtracks: new Map() }, () => "/x")).toEqual([]);
  });
});
