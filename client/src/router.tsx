import {
    createBrowserRouter,
} from "react-router-dom";
import GameRoot from "./pages/GameRoot";
import ErrorPage from "./pages/ErrorPage";
import NodeView from "./pages/NodeView";
import UnitManagment from "./pages/node/UnitManagment";
import BuildingManagment from "./pages/node/BuildingManagment";
import UnitQueue from "./pages/node/UnitQueue";
import BuildingQueue from "./pages/node/BuildingQueue";
import PlanetInfo from "./pages/node/PlanetInfo";
import GameOver from "./pages/GameOver";
import Lobby from "./pages/Lobby";
import App from "./App";


export const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        errorElement: <ErrorPage />,
        children: [
            {
                path: "/",
                index: true,
                element: <Lobby />,
                errorElement: <ErrorPage />
            },
            {
                path: "/game",
                element: <GameRoot />,
                errorElement: <ErrorPage />,
                children: [
                    {
                        path: "/game/gameover",
                        element: <GameOver />,
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
                            {
                                path: "/game/view/node/:id/info",
                                element: <PlanetInfo />,
                                handle: {
                                    name: "Planet Info"
                                },
                                errorElement: <ErrorPage />
                            }
                        ]
                    }
                ]
            }
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