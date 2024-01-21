import { HoverCard, HoverCardContent, HoverCardTrigger } from "@component/ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { client } from "@/lib/trpc";

type BuildOptionProps = {
    disabled: boolean;
    icon: string;
    node: string;
    type: "unit" | "building",
    id: string;
};

const BuildOption: React.FC<React.PropsWithChildren<BuildOptionProps>> = ({ id, node, type, icon, disabled, children }) => {
    return (
        <HoverCard>
            <HoverCardTrigger asChild>
                <button onClick={() => {
                    client.buyItem.mutate({
                        item: id,
                        node,
                        type
                    }).catch((err) => {
                        console.error(err);
                    })
                }} disabled={disabled} type="button" className="h-20 w-20 group bg-zinc-400 disabled:bg-zinc-400/50 hover:bg-zinc-400/50 rounded-md p-2">
                    <img className="h-full w-full object-cover rounded-md group-disabled:grayscale" src={icon} alt="build-option" />
                </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
                <div className="flex justify-between space-x-4">
                    <Avatar>
                        <AvatarImage src={icon} />
                        <AvatarFallback>VC</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        {children}
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}

export default BuildOption;