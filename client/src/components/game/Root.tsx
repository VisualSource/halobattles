import { Menu } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import PlayerIcon from "./PlayerIcon";
import PlayerResouces from "./PlayerResouces";


const GameUIRoot: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);

    const navigate = useNavigate();

    useEffect(() => {
        const handler = (ev: Event) => {
            const { id } = (ev as CustomEvent<{ id: string }>).detail;
            navigate(`/game/node/${id}`);
        }
        const loadingState = (ev: Event) => {
            const state = (ev as CustomEvent<boolean>).detail;
            setIsLoading(state);
        }

        window.addEventListener("event::loading-state", loadingState);

        window.addEventListener("event::selection", handler);

        return () => {
            window.removeEventListener("event::selection", handler);
            window.removeEventListener("event::loading-state", loadingState);
        }
    }, [navigate]);

    return (
        <>
            {isLoading ? (
                <div className="absolute z-50 top-0 left-0 w-full h-full bg-zinc-800">
                    <h1>Loading Game</h1>

                </div>
            ) : null}
            <div className="absolute top-0 left-0 w-full bg-zinc-700 h-16 flex gap-1 z-[49] items-center justify-between px-5">
                <div className="flex items-center gap-2">
                    <PlayerIcon />
                    <PlayerResouces />
                </div>
                <div className="flex items-center justify-center text-white">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Menu />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="text-white">
                            <DialogHeader>
                                <DialogTitle>Settings</DialogTitle>
                            </DialogHeader>
                            <div className="container space-y-4">
                                <Button className="w-full" variant="secondary">Exit</Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                </div>
            </div>
        </>
    );
}

export default GameUIRoot;