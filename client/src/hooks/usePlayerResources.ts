import { useSuspenseQuery } from '@tanstack/react-query';
import { PLAYER_RESOUCES_KEY } from "@lib/query_keys";
import { client } from '@/lib/trpc';

const usePlayerResources = () => {
    const { data } = useSuspenseQuery({
        queryKey: [PLAYER_RESOUCES_KEY],
        networkMode: "always",
        refetchOnMount: "always",
        refetchInterval: 10_000,
        queryFn: async () => {
            return client.getPlayerState.query();
        },
        initialData: {
            income_credits: 0,
            income_energy: 0,
            credits: 0,
            energy: 0,
            units: 0,
            unit_cap: 0,
            leaders: 0,
            leader_cap: 0
        }
    });

    return data;
}

export default usePlayerResources;