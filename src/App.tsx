import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PlanningView from "./pages/PlanningView";
import LandingMock from "./pages/LandingMock"; // ✅ زيدها

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <div className="app-brand">Mikromobilitaet</div>
            <nav className="app-nav">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive ? "app-nav__link app-nav__link--active" : "app-nav__link"
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/planning"
                className={({ isActive }) =>
                  isActive ? "app-nav__link app-nav__link--active" : "app-nav__link"
                }
              >
                Planning
              </NavLink>
              <NavLink
                to="/landing-test"
                className={({ isActive }) =>
                  isActive ? "app-nav__link app-nav__link--active" : "app-nav__link"
                }
              >
                LandingTest
              </NavLink>
            </nav>
          </div>
        </header>

        <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/planning" element={<PlanningView />} />

        
          <Route path="/landing-test" element={<LandingMock />} />
        </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
