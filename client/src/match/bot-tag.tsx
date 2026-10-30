import type { ContentLookups } from "../content";

/** "Bot · Hard": marks a Seat a Bot plays, with its difficulty's name. */
export function BotTag(props: { content: ContentLookups; difficulty: string }) {
  const name =
    props.content.rules.botDifficulties.find((d) => d.id === props.difficulty)
      ?.name ?? props.difficulty;
  return (
    <span className="bg-idle-wash text-idle rounded px-2 py-0.5 text-[11px] font-semibold tracking-widest whitespace-nowrap">
      BOT · {name.toUpperCase()}
    </span>
  );
}
