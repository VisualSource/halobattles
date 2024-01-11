import {
    createRoutesFromElements,
    createBrowserRouter,
    Route,
} from "react-router-dom";
import NodeView from "./components/game/NodeView";
import ErrorPage from "@page/ErrorPage";
import Lobby from "@page/Lobby";
import Home from "@page/Home";
import Game from '@page/Game';

export const router = createBrowserRouter(
    createRoutesFromElements(
        <Route path="/" errorElement={<ErrorPage />}>
            <Route index element={<Home />} />
            <Route path="game" element={<Game />}>
                <Route path="node/:node" element={<NodeView />} />
            </Route>
            <Route path="lobby" element={<Lobby />} />
        </Route>
    ));