import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PlanningView from "./pages/PlanningView";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 12 }}>
        <nav style={{ marginBottom: 12 }}>
          <Link to="/" style={{ marginRight: 12 }}>Home</Link>
          <Link to="/planning">Planning</Link>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/planning" element={<PlanningView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
