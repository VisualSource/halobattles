import { Atom, FlaskConical, PoundSterling, User2, Users2 } from "lucide-react";
import { Link } from 'react-router-dom';

const GameUIRoot: React.FC = () => {
    return (
        <>
            <div className="absolute top-12 left-0 w-8 h-2/3 bg-zinc-700 text-white z-50">
                <Link to="/game/tech" replace>
                    <FlaskConical />
                </Link>
            </div>
            <div className="absolute top-0 left-0 w-full bg-zinc-700 h-12 flex gap-1 z-50">
                <div id="player-icon" className="relative p-2 rounded-xl">

                    <div className="h-12 w-12">
                        <img className="object-cover" src="https://avatars.steamstatic.com/af1cf9cf15be50bc6eda5a5c35bb1698bbf77ecd_medium.jpg" alt="palyername" />
                    </div>

                </div>
                <div className="flex flex-col text-white gap-1">
                    <div className="flex items-center gap-1 bg-zinc-800 p-0.5"><Atom className="h-4" /> <span className="text-sm">1000</span></div>
                    <div className="flex items-center gap-1 bg-zinc-800 p-0.5"><PoundSterling className="h-4" /> <span className="text-sm">1000</span></div>
                </div>
                <div className="flex flex-col text-white gap-1">
                    <div className="flex items-center gap-1 bg-zinc-800 p-0.5"><Users2 className="h-4" /> <span className="text-sm">100/100</span></div>
                    <div className="flex items-center gap-1 bg-zinc-800 p-0.5"><User2 className="h-4" /> <span className="text-sm">2/2</span></div>
                </div>
            </div>
        </>
    );
}

export default GameUIRoot;