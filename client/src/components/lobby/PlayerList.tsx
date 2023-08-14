import { Play } from 'lucide-react';
import { Suspense } from 'react';
import { TypographyH3 } from "@/components/ui/typograph";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from "@/components/ui/separator";
import { Button } from '@/components/ui/button';
import Player from './Player';
import { trpc } from '@/lib/network';
import { user } from '@/lib/user';

const List: React.FC = () => {
    const [players, query] = trpc.getPlayerList.useSuspenseQuery();
    trpc.onPlayerListUpdate.useSubscription(undefined, {
        onData() {
            query.refetch();
        },
    });

    return (
        <ul className="space-y-2">
            {players.map((value => (
                <Player key={value.uuid} username={value.username} faction={value.faction} isHost={value.isHost} owner={user.id === value.uuid} />
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
                <Suspense>
                    <List />
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