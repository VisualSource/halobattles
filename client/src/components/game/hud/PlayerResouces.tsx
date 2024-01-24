import { Atom, PoundSterling, User2, Users2 } from "lucide-react";
import React, { Suspense } from "react";
import usePlayerResources from "@/hooks/usePlayerResources";

const PlayerInnerResouces: React.FC = () => {
    const data = usePlayerResources();

    return (
        <>
            <div className="flex flex-col text-white gap-1">
                <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><Atom className="h-4" /> <span className="text-sm text-gray-400">{data.energy}</span></div>
                <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><PoundSterling className="h-4" /> <span className="text-sm text-gray-400">{data.credits}</span></div>
            </div>
            <div className="flex flex-col text-white gap-1">
                <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><Users2 className="h-4" /> <span className="text-sm text-gray-400">{data.units}/{data.unit_cap}</span></div>
                <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><User2 className="h-4" /> <span className="text-sm text-gray-400">{data.leaders}/{data.leader_cap}</span></div>
            </div>

            <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1">
                <PoundSterling className="h-4 text-white" /> <span className="text-sm text-gray-400">{data.income_credits} <span className="text-zinc-50">+</span></span>
            </div>
            <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1">
                <Atom className="h-4 text-white" /> <span className="text-sm text-gray-400">{data.income_energy} <span className="text-zinc-50">+</span></span>
            </div>
        </>
    );
}

const PlayerResouces: React.FC = () => {
    return (
        <Suspense fallback={<div>Loading</div>}>
            <PlayerInnerResouces />
        </Suspense>
    );
}

export default PlayerResouces;