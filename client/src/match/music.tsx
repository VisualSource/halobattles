import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "../assets";
import type { ContentLookups } from "../content";

export type PlaylistTrack = {
  title: string;
  album: string;
  artist: string;
  url?: string;
  src: string;
};

/** Every Soundtrack's tracks, album by album in id order, skipping files the client lacks. */
export function playlist(
  content: Pick<ContentLookups, "soundtracks">,
  url: (ref: string) => string | undefined = assetUrl,
): PlaylistTrack[] {
  return [...content.soundtracks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, s]) =>
      s.tracks.flatMap((t) => {
        const src = url(t.file);
        return src
          ? [
              {
                title: t.title,
                album: s.name,
                artist: s.artist,
                url: s.url,
                src,
              },
            ]
          : [];
      }),
    );
}

const KEY = "halobattles-music";
type Prefs = { volume: number; muted: boolean; folded: boolean };
const DEFAULTS: Prefs = { volume: 0.3, muted: false, folded: false };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

const icon = "size-3.5 fill-current";

/** The Match's music, bottom-right: plays every Soundtrack in order, looping. */
export function MusicPlayer(props: { content: ContentLookups }) {
  const tracks = useMemo(() => playlist(props.content), [props.content]);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [n, setN] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    if (audio.current) {
      audio.current.volume = prefs.volume;
      audio.current.muted = prefs.muted;
    }
  }, [prefs]);

  const at = n % Math.max(tracks.length, 1);
  const track = tracks[at];
  if (!track) return null;
  const step = (by: number) =>
    setN((x) => (x + by + tracks.length) % tracks.length);
  const set = (p: Partial<Prefs>) => setPrefs((x) => ({ ...x, ...p }));
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };

  return (
    <>
      {/* autoPlay starts each track; a browser that blocks it leaves the play button. */}
      {/* biome-ignore lint/a11y/useMediaCaption: background music has no words to caption. */}
      <audio
        ref={audio}
        src={track.src}
        autoPlay
        // One track: stepping to itself changes nothing, so the element loops it instead.
        loop={tracks.length === 1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => step(1)}
        onLoadedMetadata={(e) => {
          e.currentTarget.volume = prefs.volume;
          e.currentTarget.muted = prefs.muted;
        }}
      />
      {prefs.folded ? (
        <button
          type="button"
          aria-label={`Open the music player: ${track.title}`}
          onClick={() => set({ folded: false })}
          className="border-edge bg-panel/95 text-accent absolute right-4 bottom-4 z-30 flex size-10 items-center justify-center rounded-lg border p-0 shadow-[0_12px_32px_#000a]"
        >
          <svg viewBox="0 0 18 18" className="size-4.5" aria-hidden="true">
            <path
              d="M7 13.5V3l8-1.5V12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="5" cy="13.5" r="2" fill="currentColor" />
            <circle cx="13" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <section
          aria-label="Music"
          className="border-edge bg-panel/95 absolute right-4 bottom-4 z-30 flex h-24 w-72 flex-col gap-2 rounded-lg border px-3 py-2.5 shadow-[0_12px_32px_#000a]"
        >
          <div className="flex items-center gap-2">
            {playing && (
              <span aria-hidden="true" className="flex h-3.5 items-end gap-0.5">
                {/* Out of step, so they bounce like a level meter; still bars under reduced motion. */}
                {[
                  ["0.8s", "-0.2s", "motion-reduce:scale-y-[0.43]"],
                  ["1.1s", "-0.6s", ""],
                  ["0.95s", "-0.4s", "motion-reduce:scale-y-[0.64]"],
                ].map(([duration, delay, still]) => (
                  <i
                    key={delay}
                    className={cn(
                      "bg-ok motion-safe:animate-eq h-3.5 w-0.75 origin-bottom rounded-[1px]",
                      still,
                    )}
                    style={{
                      animationDuration: duration,
                      animationDelay: delay,
                    }}
                  />
                ))}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-display truncate text-[15px] font-semibold">
                {track.title}
              </span>
              <span className="text-ink-3 truncate text-xs">
                {track.artist} ·{" "}
                {track.url ? (
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-3 hover:text-host"
                  >
                    {track.album} ↗
                  </a>
                ) : (
                  track.album
                )}{" "}
                · {at + 1} / {tracks.length}
              </span>
            </div>
            <button
              type="button"
              aria-label="Fold the music player"
              onClick={() => set({ folded: true })}
              className="text-ink-3 flex size-7 flex-none items-center justify-center border-0 bg-transparent p-0"
            >
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
                <path
                  d="m2 4 4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous track"
              onClick={() => step(-1)}
              className="border-edge text-ink-2 flex size-7 items-center justify-center rounded border bg-transparent p-0"
            >
              <svg viewBox="0 0 14 14" className={icon} aria-hidden="true">
                <path d="M2.5 2h1.5v10H2.5zM12 2 5 7l7 5z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={toggle}
              className="bg-accent text-accent-ink flex size-8 items-center justify-center rounded-full border-0 p-0"
            >
              <svg viewBox="0 0 14 14" className={icon} aria-hidden="true">
                <path
                  d={
                    playing ? "M3 2h3v10H3zM8 2h3v10H8z" : "M3 1.5 12 7l-9 5.5z"
                  }
                />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next track"
              onClick={() => step(1)}
              className="border-edge text-ink-2 flex size-7 items-center justify-center rounded border bg-transparent p-0"
            >
              <svg viewBox="0 0 14 14" className={icon} aria-hidden="true">
                <path d="M10 2h1.5v10H10zM2 2l7 5-7 5z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Mute"
              aria-pressed={prefs.muted}
              onClick={() => set({ muted: !prefs.muted })}
              className="text-ink-3 ml-1.5 flex size-7 flex-none items-center justify-center border-0 bg-transparent p-0"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                {prefs.muted ? (
                  <path
                    d="m11 6 4 4m0-4-4 4"
                    className="stroke-danger"
                    strokeWidth="1.4"
                  />
                ) : (
                  <path
                    d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                )}
              </svg>
            </button>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              className={cn(
                "accent-accent min-w-0 flex-1",
                prefs.muted && "opacity-40",
              )}
            />
          </div>
        </section>
      )}
    </>
  );
}
