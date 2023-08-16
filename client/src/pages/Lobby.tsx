import { useNavigate, useLocation } from 'react-router-dom';
import PlayerList from '@/components/lobby/PlayerList';
import Chat from '@/components/lobby/Chat';
import MapData from '@/components/lobby/MapData';
import { trpc } from '@/lib/network';
import { user } from '@/lib/user';

const Lobby: React.FC = () => {
    const location = useLocation();

    const isHost = location.state?.isHost ?? false;

    const navigate = useNavigate();
    trpc.onLobbyEvent.useSubscription(undefined, {
        onData(data) {
            switch (data.type) {
                case 'kick-event': {
                    if (data.uuid !== user.id) return;
                    navigate(`/?kicked=true`);
                    break;
                }
                case 'start-event': {
                    navigate(`/game`);
                    break;
                }
                default:
                    break;
            }
        },
    });

    return (
        <div className="grid h-screen grid-cols-4 grid-rows-4 dark:bg-slate-950 dark:text-white">
            <PlayerList isHost={isHost} />
            <MapData isHost={isHost} />
            <Chat />
        </div>
    );
}

export default Lobby;