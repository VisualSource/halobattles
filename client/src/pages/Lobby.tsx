import { Dropdown } from 'flowbite-react';

const Player: React.FC<{ name: string; factionName: string; }> = ({ name, factionName }) => {
    return (
        <div className="flex p-2 bg-gray-800 rounded-md shadow">
            <div className="mr-4">
                <h3 className="font-bold">{name}</h3>
                <span className="text-sm">{factionName}</span>
            </div>
            <div>
                <Dropdown label="" arrowIcon={false} renderTrigger={() => (
                    <button id="dropdownButton" data-dropdown-toggle="dropdown" className="inline-block text-gray-400 hover:bg-gray-700 focus:ring-4 focus:outline-none focus:ring-gray-700 rounded-lg text-sm p-1.5" type="button">
                        <span className="sr-only">Open dropdown</span>
                        <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 3">
                            <path d="M2 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6.041 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM14 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
                        </svg>
                    </button>
                )}>
                    <Dropdown.Item>TEST</Dropdown.Item>
                </Dropdown>

            </div>
        </div>
    );
}

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
            <section data-name="player-list" className="col-start-2 col-end-2 bg-red-500 flex flex-col">
                <h1 className="font-bold p-1 text-lg">Players</h1>
                <hr />
                <div className="flex flex-wrap p-2 gap-2 overflow-y-scroll">
                    {Array.from({ length: 200 }).map((_, i) => (
                        <Player key={i} name={`Username${i}`} factionName='FactionName' />
                    ))}
                </div>
            </section>
            <section data-name="chat" className="flex flex-col col-start-2 col-end-2 bg-green-600">
                <h1 className="font-bold p-1 text-lg">Chat</h1>
                <hr />
                <ul className="flex-grow overflow-y-scroll ml-4">
                    {Array.from({ length: 200 }).map((_, i) => (
                        <li key={i} className="p-1">
                            <span className="font-bold mr-1">Username:</span>
                            Message
                        </li>
                    ))}
                </ul>
                <form className="flex">
                    <input className="w-full text-gray-900" type="text" />
                    <button type="submit">Send</button>
                </form>
            </section>
        </div>
    );
}

export default Lobby;