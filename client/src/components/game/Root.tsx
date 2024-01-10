import { Atom, Menu, PoundSterling, User2, Users2 } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";

const GameUIRoot: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handler = (ev: Event) => {
            const { id } = (ev as CustomEvent<{ id: string }>).detail;
            navigate(`/game/node/${id}`);
        }

        window.addEventListener("event::selection", handler);

        return () => {
            window.removeEventListener("event::selection", handler);
        }
    }, [navigate]);

    return (
        <>
            <div className="absolute top-0 left-0 w-full bg-zinc-700 h-16 flex gap-1 z-50 items-center justify-between px-5">
                <div className="flex items-center gap-2">
                    <div id="player-icon" className="relative p-2 rounded-xl">
                        <div className="h-12 w-12">
                            <img className="object-cover rounded-md" src="https://avatars.steamstatic.com/af1cf9cf15be50bc6eda5a5c35bb1698bbf77ecd_medium.jpg" alt="palyername" />
                        </div>
                    </div>

                    <div className="flex flex-col text-white gap-1">
                        <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><Atom className="h-4" /> <span className="text-sm text-gray-400">1000</span></div>
                        <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><PoundSterling className="h-4" /> <span className="text-sm text-gray-400">1000</span></div>
                    </div>
                    <div className="flex flex-col text-white gap-1">
                        <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><Users2 className="h-4" /> <span className="text-sm text-gray-400">100/100</span></div>
                        <div className="flex items-center gap-1 bg-zinc-800 pl-0.5 pr-2 py-1"><User2 className="h-4" /> <span className="text-sm text-gray-400">2/2</span></div>
                    </div>

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