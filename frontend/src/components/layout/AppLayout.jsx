import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <div className="main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
