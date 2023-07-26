import { useEffect, useRef } from "react";
import Runtime from "../lib/runtime";

const useThree = () => {
    const runtime = useRef<Runtime>();
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {

        if (container.current && !runtime.current) {
            runtime.current = Runtime.get(container.current);
        }
    }, []);

    return {
        container
    }
}

export default useThree;