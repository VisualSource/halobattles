import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@component/ui/avatar";
import { Skeleton } from "@component/ui/skeleton";
import { client } from "@/lib/trpc";

const PlayerInnerIcon: React.FC = () => {
    const { data } = useSuspenseQuery({
        queryKey: ["PLAYER_ICON"],
        queryFn: async () => {
            const user = await client.getSelf.query();
            return user.avatar_medium
        }
    });

    return (
        <div id="player-icon" className="relative p-2">
            <Avatar className="h-12 w-12 rounded-md">
                <AvatarFallback></AvatarFallback>
                <AvatarImage src={data} />
            </Avatar>
        </div>
    );
}

const PlayerIcon: React.FC = () => {
    return (
        <Suspense fallback={(
            <div id="player-icon" className="relative p-2 rounded-xl">
                <div className="h-12 w-12">
                    <Skeleton className="h-full w-full rounded-md" />
                </div>
            </div>
        )}>
            <PlayerInnerIcon />
        </Suspense>
    );
}

export default PlayerIcon;