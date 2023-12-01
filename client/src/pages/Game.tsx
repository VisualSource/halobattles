import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";

import { TooltipProvider } from '@/components/ui/tooltip';
import Engine, { type MapData } from "@/lib/engine";
import DebugMenu from "@/components/DebugMenu";
import { client } from '@lib/trpc';
import Node from "@/lib/game_objects/node";
import { UnitStackState } from "@/lib/game_objects/unit_stack";

const Game: React.FC = () => {
  const [debug, setDebug] = useState(true);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {

    const openDebugMenu = (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (ev.ctrlKey && ev.key === "d") setDebug(e => !e);
    };

    window.addEventListener("keydown", openDebugMenu);

    let sub: { unsubscribe: () => void } | undefined;
    if (container.current) {
      const engine = Engine.Create(container.current);

      sub = client.onMoveGroup.subscribe(undefined, {
        onData(value) {
          (Engine.Get().getObject((value as { uuid: string }).uuid) as Node).getStack(value.group).setState(UnitStackState.Full);

          console.log(value);
        },
      });

      client.getMap.query().then((state) => {
        engine.loadState(state as MapData);
      })

    }

    return () => {
      Engine.Destory();
      sub?.unsubscribe();
      window.removeEventListener("keypress", openDebugMenu);
    }
  }, []);

  return (
    <TooltipProvider>
      <Outlet />
      <div ref={container}></div>
      {debug ? <DebugMenu /> : null}
    </TooltipProvider>
  );
}

export default Game;
