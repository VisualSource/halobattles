import { useSuspenseQuery } from "@tanstack/react-query";

import { PLANET_UNIT_BUILD_OPTIONS } from "@/lib/query_keys";
import usePlayerResources from "@/hooks/usePlayerResources";
import BuildOption from "./BuildOption";
import { client } from "@/lib/trpc";

const UnitOptions: React.FC<{ node: string }> = ({ node }) => {
    const resouces = usePlayerResources();
    const { data } = useSuspenseQuery({
        queryKey: [PLANET_UNIT_BUILD_OPTIONS, node],
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load build options");
            return client.getBuildOptionsUnits.query(key);
        }
    });

    return (
        <>
            {data.map((item) => (
                <BuildOption id={item.id} node={node} type="unit" key={item.id} icon={item.icon} disabled={resouces.credits < item.supplies || resouces.energy < item.energy || (resouces.units + item.unit_cap) > resouces.unit_cap}>
                    <h4 className="text-sm font-semibold">{item.name}</h4>
                    <p className="text-sm">{item.unit_type}</p>
                    <div className="flex flex-col pt-2">
                        <div className="text-sm">Supplies Cost: {item.supplies}</div>
                        <div className="text-sm">Enegry Cost: {item.energy}</div>
                        <div className="text-sm">Build Time: {item.build_time}</div>

                        <h5 className="text-lg font-bold">Stats</h5>
                        <div className="text-sm">Weapon Type: {item.weapon_type}</div>
                        {item.max_unique !== -1 ? (<div className="text-sm">Max Unique: {item.max_unique}</div>) : null}
                        {item.leader_cap > 0 ? <div className="text-sm">Leader Cap Use: {item.leader_cap}</div> : null}
                        {item.unit_cap > 0 ? <div className="text-sm">Unit Cap Use: {item.unit_cap}</div> : null}
                        <div className="text-sm">Armor: {item.armor}</div>
                        <div className="text-sm">Shield: {item.shield}</div>
                        <div className="text-sm">Health: {item.health}</div>
                        <div className="text-sm">Damage: {item.damage}</div>
                        <div className="text-sm">Stats: {item.stat}</div>
                        <div className="text-sm">Attributes: {item.attributes}</div>
                    </div>
                </BuildOption>
            ))}
        </>
    );
}

export default UnitOptions;