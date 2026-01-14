import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PlanningView from "./pages/PlanningView";
import LandingMock from "./pages/LandingMock"; // ✅ زيدها

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 12 }}>
        <nav style={{ marginBottom: 12 }}>
          <Link to="/" style={{ marginRight: 12 }}>Home</Link>
          <Link to="/planning" style={{ marginRight: 12 }}>Planning</Link>

          
          <Link to="/landing-test">LandingTest</Link>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/planning" element={<PlanningView />} />

        
          <Route path="/landing-test" element={<LandingMock />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
