import { useNavigate } from 'react-router-dom';
import PlayerList from '@/components/lobby/PlayerList';
import Chat from '../components/lobby/Chat';
import MapData from '@/components/lobby/MapData';
import { trpc } from '@/lib/network';
import { user } from '@/lib/user';

const Lobby: React.FC = () => {
    const navigate = useNavigate();
    trpc.onKick.useSubscription(undefined, {
        onData(data) {
            if (user.id !== data) return;
            navigate(`/?kicked=true`);
        },
    })

    return (
        <div className="grid h-screen grid-cols-4 grid-rows-4 bg-slate-950 text-white">
            <PlayerList isHost={true} />
            <MapData isHost={true} />
            <Chat />
        </div>
    );
}

export default Lobby;