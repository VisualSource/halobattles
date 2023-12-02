import { createContext, useEffect, useRef } from 'react';
import Engine from '@/lib/engine';
import handle_network from '@/lib/init_network';

export const context = createContext<Engine | null>(null);

export const GameProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const engine = useRef<Engine>();

    useEffect(() => {
        if (!engine.current) {
            engine.current = Engine.Create();
        }
        return handle_network(engine.current);
    }, []);

    return (
        <context.Provider value={engine.current ?? null}>
            {children}
        </context.Provider>
    )
};


