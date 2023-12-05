import { useContext } from 'react';
import { context } from './GameProvider';

const useGame = () => {
    const engine = useContext(context);
    return engine;
}

export default useGame;