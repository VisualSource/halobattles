import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { client } from "@/lib/trpc";
import { SelectValue } from "@radix-ui/react-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Team } from "halobattles-shared";
import { UserMinus } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Lobby: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data, isLoading, isError } = useQuery({
        queryKey: ["LOBBY_PLAYERS"],
        queryFn: async () => {
            return client.getPlayers.query();
        }
    });

    useEffect(() => {
        const onGameStart = client.onStartGame.subscribe(undefined, {
            onData() {
                navigate("/game");
            },
        });

        const onAddPlayer = client.onAddPlayer.subscribe(undefined, {
            onData() {
                queryClient.invalidateQueries({ queryKey: ["LOBBY_PLAYERS"] });
            },
        });

        const onUpdatePlayer = client.onUpdatePlayer.subscribe(undefined, {
            onData() {
                queryClient.invalidateQueries({ queryKey: ["LOBBY_PLAYERS"] })
            }
        });

        const onRemovePlayer = client.onRemovePlayer.subscribe(undefined, {
            onData() {
                queryClient.invalidateQueries({ queryKey: ["LOBBY_PLAYERS"] });
            },
        });

        return () => {
            onUpdatePlayer.unsubscribe();
            onAddPlayer.unsubscribe();
            onRemovePlayer.unsubscribe();
            onGameStart.unsubscribe();
        }
    }, [queryClient, navigate]);

    if (isError) {
        return (<div>Error</div>)
    }
    if (isLoading || !data) {
        return (<div>Loading</div>);
    }

    return (
        <div className="bg-zinc-800 h-full flex flex-col gap-2 justify-center items-center">
            <div className="flex flex-col gap-4">
                {data.map(value => (
                    <div key={value.profile.steamid} className="flex items-center gap-2 text-zinc-50">
                        <Avatar>
                            <AvatarImage src={value.profile.avatar_medium} />
                            <AvatarFallback></AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <h5>{value.profile.displayname}</h5>
                            <Select defaultValue={value.team}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(Team).map((team, i) => (
                                        <SelectItem key={i} value={team}>{team}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button title="Kick player" size="icon" onClick={() => client.removePlayer.mutate({ id: value.profile.steamid })}>
                            <UserMinus />
                        </Button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <Button onClick={() => client.addPlayer.mutate({ color: "#ffffff", team: Team.UNSC })}>Join</Button>
                <Button onClick={() => client.startGame.mutate()}>Start</Button>
            </div>

        </div>
    );
}

export default Lobby;