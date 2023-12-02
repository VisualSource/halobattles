import { useEffect, useState, lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";

import { TooltipProvider } from '@/components/ui/tooltip';
import { GameProvider } from "@/hooks/GameProvider";

const DebugMenu = lazy(() => import("@/components/debug/Menu"));

const Game: React.FC = () => {
  const [debug, setDebug] = useState(true);

  useEffect(() => {
    const openDebugMenu = (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (ev.ctrlKey && ev.code === "KeyD") setDebug(e => !e);
    };

    document.addEventListener("keydown", openDebugMenu);

    return () => {
      document.removeEventListener("keydown", openDebugMenu);
    }
  }, []);

  return (
    <TooltipProvider>
      <div id="game-container"></div>
      <GameProvider>
        {debug ? <Suspense fallback={<></>}><DebugMenu /></Suspense> : <Outlet />}
      </GameProvider>
    </TooltipProvider>
  );
}

export default Game;
