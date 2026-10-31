// shortcut: Mod assets are bundled at build time, so a Mod only the server has (one uploaded to a host) shows no assets; serve them from the server when that's needed.
const ROOT = "../../mods/";
// vite.config.ts narrows this to the enabled Mods (HALO_MODS), so a local-only one stays out of builds.
const bundled = import.meta.glob("../../mods/*/assets/**/*", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The URL of an asset reference, `__mod__/icons/x.svg`, if it's bundled. */
export function assetUrl(ref?: string): string | undefined {
  const m = ref?.match(/^__([a-z0-9_-]+)__\/(.+)$/);
  return m ? bundled[`${ROOT}${m[1]}/assets/${m[2]}`] : undefined;
}
