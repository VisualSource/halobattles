import { Suspense } from "react";
import Grid from "./Grid";
import { useSuspenseQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";

const Inner: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: ["PLANET_UNITS", node],
        networkMode: "always",
        refetchOnMount: "always",
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load planet units");
            return client.getPlanetUnits.query(key);
        }
    });
    return (
        <div className="h-full grid grid-cols-3 grid-rows-1 gap-2 p-1">
            <Grid canEdit={data.canEdit} units={data.units["0"]} nodeId={node} groupId={0} />
            <Grid canEdit={data.canEdit} units={data.units["1"]} nodeId={node} groupId={1} />
            <Grid canEdit={data.canEdit} units={data.units["2"]} nodeId={node} groupId={2} />
        </div>
    );
}


const UnitMangment: React.FC<{ node: string }> = ({ node }) => {
    return (
        <Suspense fallback={<></>}>
            <Inner node={node} />
        </Suspense>
    );
}

export default UnitMangment;