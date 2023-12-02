import { useContext } from 'react';
import { context } from './GameProvider';

const useGame = () => {
    const engine = useContext(context);
    if (!engine) throw new Error("No Engine context is avaliable");
    return engine;
}

export default useGame;