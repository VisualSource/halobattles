import { useNotificationCenter } from "react-toastify/addons/use-notification-center";
import { useSuspenseQuery } from "@tanstack/react-query";
import { formatRelative } from 'date-fns/formatRelative'
import { Suspense } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@component/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@component/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PLAYER_ICON } from "@/lib/query_keys";
import { Badge } from "@/components/ui/badge";
import { client } from "@/lib/trpc";

const PlayerInnerIcon: React.FC<{ count: number }> = ({ count }) => {
    const { data } = useSuspenseQuery({
        queryKey: [PLAYER_ICON],
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
            {count > 0 ? <Badge className="absolute top-0 right-0" variant="destructive">{count}</Badge> : null}
        </div>
    );
}

const PlayerIcon: React.FC = () => {
    const {
        notifications,
        clear,
        markAllAsRead,
        markAsRead,
        unreadCount
    } = useNotificationCenter();
    return (
        <Dialog>
            <DialogTrigger>
                <Suspense fallback={(
                    <div id="player-icon" className="relative p-2 rounded-xl">
                        <div className="h-12 w-12 relative">
                            <Skeleton className="h-full w-full rounded-md" />
                        </div>
                    </div>
                )}>
                    <PlayerInnerIcon count={unreadCount} />
                </Suspense>
            </DialogTrigger>
            <DialogContent className="text-zinc-50">
                <DialogHeader>
                    <DialogTitle>Notifications</DialogTitle>
                </DialogHeader>
                <Separator />
                <div>
                    <Button size="sm" onClick={() => markAllAsRead()}>Mark all as Read</Button>
                    <Button size="sm" onClick={() => clear()}>Clear</Button>
                </div>
                <ScrollArea>
                    {notifications.length > 0 ? notifications.map(value => (
                        <div key={value.id} className="p-2 rounded-md bg-zinc-800 shadow">
                            {value.icon as never}
                            <div>
                                {value.content as never}
                                {formatRelative(value.createdAt, new Date())}
                            </div>
                            <div>
                                <button onClick={() => markAsRead(value.id)}>L</button>
                            </div>
                        </div>
                    )) : (
                        <div>
                            No Notifications
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

export default PlayerIcon;