import { DollarSign, Users2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { usePlayerCredits, usePlayerCap, usePlayerData, usePlayerIncome } from '../hooks/usePlayer';
import SettingsDialog from './game/SettingsDialog';

const Overlay: React.FC = () => {
    const credits = usePlayerCredits();
    const cap = usePlayerCap();
    const income = usePlayerIncome();
    const player = usePlayerData();

    return (
        <>
            <div className="bg-gray-900 flex text-white p-2 items-center gap-4 rounded-br-md shadow-lg absolute top-0 left-0 z-10">
                <img className="h-8 w-8 rounded-md" src="/Basic_Elements_(128).jpg" alt="icon" />
                <div className="flex flex-col">
                    <h1 className="font-bold text-lg">{player?.name}</h1>
                    <div className="flex text-white gap-2">

                        <Tooltip>
                            <TooltipTrigger className="flex items-center align-middle">
                                <DollarSign className="h-4 w-4 mr-0.5" /> <span className="text-sm h-4 flex items-center font-bold">{credits?.toLocaleString()}</span>
                            </TooltipTrigger>
                            <TooltipContent>Credits</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger className="flex items-center align-middle">
                                <DollarSign className="h-4 w-4 mr-0.5" /> <span className="text-sm h-4 flex items-center font-bold">{income?.toLocaleString()}</span>
                            </TooltipTrigger>
                            <TooltipContent>Income</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger className="flex items-center align-middle">
                                <Users2 className="h-4 w-4 mr-1" /> <span className="text-sm h-4 flex items-center font-bold">{cap?.current?.toLocaleString()}/{cap?.max.toLocaleString()}</span>
                            </TooltipTrigger>
                            <TooltipContent>Current Cap/Max Cap</TooltipContent>
                        </Tooltip>

                    </div>
                </div>
            </div>
            <div className="absolute top-0 right-0 p-2 rounded-es-md">
                <SettingsDialog />
            </div>
        </>
    );
}

export default Overlay;