import Chat from './lobby/Chat';

const Lobby: React.FC = () => {
    return (
        <div className="grid h-screen grid-cols-3 grid-rows-3">
            <section data-name="game-data" className="bg-blue-600 col-start-2 col-end-2 grid grid-cols-2">
                <div data-name="player-self">
                    <h1>Username</h1>
                    <button>Select Faction</button>
                    <button>Change name</button>
                </div>
                <div data-name="map-options">
                    <h1>Map Details</h1>

                    <select>
                        <option>test_map</option>
                    </select>

                </div>
            </section>
            <Chat />
        </div>
    );
}

export default Lobby;