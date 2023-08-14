import PlayerList from '@/components/lobby/PlayerList';
import Chat from '../components/lobby/Chat';
import MapData from '@/components/lobby/MapData';

const Lobby: React.FC = () => {
    return (
        <div className="grid h-screen grid-cols-4 grid-rows-4 bg-slate-950 text-white">
            <PlayerList isHost={true} />
            <MapData isHost={true} />
            <Chat />
        </div>
    );
}

export default Lobby;