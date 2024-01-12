import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Atom, PoundSterling, User2, Users2 } from "lucide-react";
import React, { Suspense, useEffect } from "react";
import { client } from "@/lib/trpc";

const PlayerInnerResouces: React.FC = () => {
    const queryClient = useQueryClient();
    const { data } = useSuspenseQuery({
        queryKey: ["PLAYER_RESOUCES"],
        networkMode: "always",
        refetchOnMount: "always",
        refetchInterval: 10_000,
        queryFn: async () => {
            return client.getPlayerState.query();
        },
        initialData: {
            credits: 0,
            energy: 0,
            units: 0,
            unit_cap: 0,
            leaders: 0,
            leader_cap: 0
        }
    });

    useEffect(() => {
        const onUpdate = client.onUpdateResouces.subscribe(undefined, {
            onData() {
                queryClient.invalidateQueries({ queryKey: ["PLAYER_RESOUCES"] })
            }
        });

        return () => {
            onUpdate.unsubscribe();
        }
    }, [queryClient]);

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