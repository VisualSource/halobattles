import { Outlet } from "react-router-dom";
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useRef } from "react";
import Engine from "@/lib/engine";

const Game: React.FC = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (container.current) Engine.Create(container.current)

    return () => {
      Engine.Destory();
    }
  }, []);

  return (
    <TooltipProvider>
      <Outlet />
      <div ref={container}></div>
    </TooltipProvider>
  );
}

export default Game;
