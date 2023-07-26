import { ToastContainer } from 'react-toastify';
import { Outlet } from "react-router-dom";
import useThree from "./hooks/useThree";

function App() {
  const { container } = useThree();
  return (
    <>
      <div ref={container}></div>
      <Outlet />
      <ToastContainer />
    </>
  )
}

export default App
