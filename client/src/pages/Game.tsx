import { Outlet } from "react-router-dom";
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useRef } from "react";
import Engine, { type MapData } from "@/lib/engine";
import DebugMenu from "@/components/DebugMenu";

import { client } from '@lib/trpc';

const Game: React.FC = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (container.current) {
      const engine = Engine.Create(container.current);

      client.getMap.query().then((state) => {
        engine.loadState(state as MapData);
      })




    }

    return () => {
      Engine.Destory();
    }
  }, []);

  return (
    <TooltipProvider>
      <Outlet />
      <div ref={container}></div>
      <DebugMenu />
    </TooltipProvider>
  );
}

export default Game;
