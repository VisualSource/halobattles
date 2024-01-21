import usePlayerResources from "@/hooks/usePlayerResources";
import { PLANET_BUILDING_OPTIONS } from "@/lib/query_keys";
import { client } from "@/lib/trpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import BuildOption from "./BuildOption";

const BuildingOptions: React.FC<{ node: string }> = ({ node }) => {
    const resouces = usePlayerResources();
    const { data } = useSuspenseQuery({
        queryKey: [PLANET_BUILDING_OPTIONS, node],
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load build options");
            return client.getBuildOptionsBuildings.query(key);
        }
    });

    return (
        <>
            {data.map((item) => (
                <BuildOption id={item.id} node={node} type="building" key={item.id} icon={item.icon} disabled={resouces.credits < item.supplies || resouces.energy < item.energy}>
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-sm text-zinc-400/50">
                        {item.description}
                    </p>
                    <div className="flex flex-col pt-2">
                        <div className="text-sm">Supplies Cost: {item.supplies}</div>
                        <div className="text-sm">Enegry Cost: {item.energy}</div>
                        <div className="text-sm">Build Time: {item.build_time}</div>
                    </div>
                    {item.max_global_instances > 0 ? (<div className="text-sm">Max buildable Globaly: {item.max_global_instances}</div>) : null}
                    {item.max_global_instances > 0 ? (<div className="text-sm">Max buildable Localy: {item.max_local_instances}</div>) : null}
                    {item.upkeep_supplies > 0 ? <div className="text-sm">Upkeep Supplies: {item.upkeep_supplies}</div> : null}
                    {item.upkeep_energy > 0 ? <div className="text-sm">Upkeep Energy: {item.upkeep_energy}</div> : null}
                    <div className="text-zinc-500/50">{item.attributes}</div>
                </BuildOption>
            ))}
        </>
    );
}

export default BuildingOptions;