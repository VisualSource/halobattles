import { ToastContainer } from 'react-toastify';
import { Outlet } from "react-router-dom";
import useThree from "./hooks/useThree";
import Overlay from './components/Overlay';

function App() {
  const { container, isReady } = useThree();
  return (
    <>
      <div ref={container}></div>
      <Outlet />
      {isReady ? <Overlay /> : null}
      <ToastContainer />
    </>
  )
}

export default App
