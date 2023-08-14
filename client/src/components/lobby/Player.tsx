import { UserX2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TypographyMuted } from "@/components/ui/typograph";
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";
import Username from './settings/Username';
import Faction from './settings/Faction';

const Player: React.FC<{ owner: boolean, isHost: boolean }> = ({ owner, isHost }) => {
    return (
        <li className={cn("bg-slate-800 flex items-center gap-4 shadow rounded-lg p-2", { "border border-slate-500": owner })}>
            <Avatar>
                <AvatarFallback>CN</AvatarFallback>
                <AvatarImage src="/Basic_Elements_(128).jpg" />
            </Avatar>
            <div>
                <h5 className="scroll-m-20 text-lg font-semibold tracking-tight">Username</h5>
                <TypographyMuted className="text-slate-500">Faction</TypographyMuted>
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
                            <DropdownMenuItem>
                                <UserX2 className="mr-2 h-4 w-4" />
                                <span>Kick</span>
                            </DropdownMenuItem>

                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </li>
    );
}

export default Player;