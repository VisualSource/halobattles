import { Outlet } from "react-router-dom";
import useThree from "../hooks/useThree";
import Overlay from '../components/Overlay';
import { TooltipProvider } from '@/components/ui/tooltip';

function Game() {
  const { container, isReady } = useThree();
  return (
    <TooltipProvider>
      <div ref={container}></div>
      <Outlet />
      {isReady ? <Overlay /> : null}
    </TooltipProvider>
  )
}

export default Game;
