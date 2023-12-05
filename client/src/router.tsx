import {
    Outlet,
    createBrowserRouter,
} from "react-router-dom";
import ErrorPage from "@page/ErrorPage";
import Home from "@page/Home";
import Game from '@page/Game';
import NodeView from "./components/game/NodeView";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Outlet />,
        errorElement: <ErrorPage />,
        children: [
            {
                path: "/",
                index: true,
                element: <Home />,
                errorElement: <ErrorPage />
            },
            {
                path: "/game",
                element: <Game />,
                errorElement: <ErrorPage />,
                children: [
                    {
                        path: "/game/tech",
                        element: <>Tech</>,
                    },
                    {
                        path: "/game/node/:node",
                        element: <NodeView />
                    }
                ]
            }
        ]
    }
]);

/*window.addEventListener("game-over", ev => {
    const id = (ev as CustomEvent<{ winner: string; id: string; }>).detail;
    router.navigate(`/game/gameover?name=${id.winner}&uuid=${id.id}`);
});

window.addEventListener("node-selected", (ev) => {
    const id = (ev as CustomEvent<{ id: string }>).detail.id;
    router.navigate(`/game/view/node/${id}`);
});*/