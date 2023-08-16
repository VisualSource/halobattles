import {
    createBrowserRouter,
} from "react-router-dom";
import Game from "./pages/Game";
import ErrorPage from "./pages/ErrorPage";
import Lobby from "./pages/Lobby";
import App from "./App";
import Home from "./pages/Home";
import NodeView from "./pages/NodeView";
import PlanetInfo from "./pages/node/PlanetInfo";
import UnitManagment from "./pages/node/UnitManagment";
import BuildingManagment from "./pages/node/BuildingManagment";
import UnitQueue from "./pages/node/UnitQueue";
import BuildingQueue from "./pages/node/BuildingQueue";
import GameOver from "./pages/GameOver";


export const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        errorElement: <ErrorPage />,
        children: [
            {
                path: "/",
                index: true,
                element: <Home />,
                errorElement: <ErrorPage />
            },
            {
                path: "/lobby",
                element: <Lobby />,
                errorElement: <ErrorPage />
            },
            {
                path: "/game",
                element: <Game />,
                errorElement: <ErrorPage />,
                children: [
                    {
                        path: "/game/gameover",
                        element: <GameOver />,
                        errorElement: <ErrorPage />
                    },
                    {
                        path: "/game/view/node/:id",
                        element: <NodeView />,
                        children: [
                            {
                                element: <UnitManagment />,
                                index: true,
                                handle: {
                                    name: "Unit Managment"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/buildings",
                                element: <BuildingManagment />,
                                handle: {
                                    name: "Building and tech Managment"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/info",
                                element: <PlanetInfo />,
                                handle: {
                                    name: "Planet Info"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/queue-units",
                                element: <UnitQueue />,
                                handle: {
                                    name: "Unit Queue"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/queue-buildings",
                                element: <BuildingQueue />,
                                handle: {
                                    name: "Building Queue"
                                },
                                errorElement: <ErrorPage />
                            },
                        ]
                    }
                ]
            },
        ]
    }
]);

window.addEventListener("game-over", ev => {
    const id = (ev as CustomEvent<{ winner: string; id: string; }>).detail;
    router.navigate(`/game/gameover?name=${id.winner}&uuid=${id.id}`);
});

window.addEventListener("node-selected", (ev) => {
    const id = (ev as CustomEvent<{ id: string }>).detail.id;
    router.navigate(`/game/view/node/${id}`);
});