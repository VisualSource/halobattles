import { useSearchParams, Link } from 'react-router-dom';

const GameOver: React.FC = () => {
    const [query,] = useSearchParams();

    return (
        <div className="absolute top-0 left-0 flex bg-gray-800 bg-opacity-50 w-full h-screen z-50 flex-col justify-center items-center">
            <div id="popup-modal" className="p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full">
                <div className="relative w-full max-w-md max-h-full">
                    <div className="relative rounded-lg shadow bg-gray-700">
                        <div className="p-6 text-center">
                            <svg className="mx-auto mb-4 w-12 h-12 text-gray-200" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11V6m0 8h.01M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <h1 className="text-xl font-bold text-gray-400">Gameover.</h1>
                            <h3 className="mb-5 text-lg font-normal text-gray-400">{query.get("name") ?? "Unknown"} has won the game.</h3>
                            <Link to="/" replace data-modal-hide="popup-modal" type="button" className="focus:ring-4 focus:outline-none rounded-lg border text-sm font-medium px-5 py-2.5 focus:z-10 bg-gray-700 text-gray-300 border-gray-500 hover:text-white hover:bg-gray-600 focus:ring-gray-600">Ok</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default GameOver;