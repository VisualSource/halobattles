import { Play } from 'lucide-react';
import { Suspense } from 'react';
import { TypographyH3 } from "@/components/ui/typograph";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from "@/components/ui/separator";
import { Button } from '@/components/ui/button';
import Player, { PlayerFallback } from './Player';
import { trpc } from '@/lib/network';
import { user } from '@/lib/user';

const FallbackList: React.FC = () => {
    return (
        <ul className="space-y-2">
            <PlayerFallback />
            <PlayerFallback />
            <PlayerFallback />
            <PlayerFallback />
        </ul>
    );
}

const List: React.FC<{ isHost: boolean }> = ({ isHost }) => {
    const [players, query] = trpc.getPlayerList.useSuspenseQuery();
    trpc.onPlayerListUpdate.useSubscription(undefined, {
        onData() {
            query.refetch();
        },
    });

    return (
        <ul className="space-y-2">
            {players.map(((value) => (
                <Player uuid={value.uuid} key={value.uuid} username={value.username} faction={value.faction} isHost={isHost} owner={user.id === value.uuid} />
            )))}
        </ul>
    );
}


const PlayerList: React.FC<{ isHost: boolean }> = ({ isHost }) => {
    return (
        <section data-name="player-list" className="flex flex-col col-end-3 row-end-4 col-start-3 row-start-2 px-2">
            <TypographyH3>Players</TypographyH3>
            <Separator className="my-4" />
            <ScrollArea className="mb-2">
                <Suspense fallback={<FallbackList />}>
                    <List isHost={isHost} />
                </Suspense>
            </ScrollArea>
            <div className="mt-auto flex justify-end">
                <Button disabled={!isHost}>
                    <Play className="mr-2 h-4 w-4" />
                    Start
                </Button>
            </div>
        </section>
    );
}

export default PlayerList;