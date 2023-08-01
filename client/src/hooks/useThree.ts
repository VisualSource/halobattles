import { useEffect, useRef, useState } from "react";
import Runtime from "../lib/runtime";

const useThree = () => {
    const [isReady, setIsReady] = useState(false);
    const runtime = useRef<Runtime>();
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (container.current && !runtime.current) {
            runtime.current = Runtime.get(container.current);
            setIsReady(true);
        }
    }, []);

    return {
        container,
        isReady
    }
}

export default useThree;