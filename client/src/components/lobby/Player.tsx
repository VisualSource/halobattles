import { UserX2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Factions } from 'server/src/object/GameState';
import { TypographyMuted } from "@/components/ui/typograph";
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from '@/components/ui/button';
import Username from './settings/Username';
import Faction from './settings/Faction';
import { trpc } from '@/lib/network';
import type { UUID } from 'server';
import { cn } from "@/lib/utils";

export const PlayerFallback: React.FC = () => {
    return (
        <li className='bg-slate-800 flex items-center gap-4 shadow rounded-lg p-2'>
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
            </div>
        </li>
    );
}

const KickPlayerOption: React.FC<{ uuid: UUID }> = ({ uuid }) => {
    const kick = trpc.kickPlayer.useMutation();
    return (
        <DropdownMenuItem onClick={async () => {
            try {
                await kick.mutateAsync(uuid);
            } catch (error) {
                console.error(error);
            }
        }}>
            <UserX2 className="mr-2 h-4 w-4" />
            <span>Kick</span>
        </DropdownMenuItem>
    );
}

const Player: React.FC<{ owner: boolean, isHost: boolean, uuid: UUID, username: string; faction: Factions | "unknown" }> = ({ uuid, owner, isHost, username, faction }) => {
    return (
        <li className={cn("bg-slate-800 flex items-center gap-4 shadow rounded-lg p-2", { "border border-slate-500": owner })}>
            <Avatar>
                <AvatarFallback>CN</AvatarFallback>
                <AvatarImage src="/Basic_Elements_(128).jpg" />
            </Avatar>
            <div>
                <h5 className="scroll-m-20 text-lg font-semibold tracking-tight">{username}</h5>
                <TypographyMuted className="text-slate-500">{faction}</TypographyMuted>
            </div>
            {owner || isHost ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild className="ml-auto">
                        <Button variant="outline">
                            Options
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                        <DropdownMenuLabel>User Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {owner ? (
                            <>
                                <Username />
                                <Faction /></>
                        ) : null}
                        {owner && isHost ? (<DropdownMenuSeparator />) : null}
                        {isHost ? (
                            <KickPlayerOption uuid={uuid} />
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </li>
    );
}

export default Player;