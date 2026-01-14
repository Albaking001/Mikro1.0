import { useNavigate } from "react-router-dom";
import "./LandingMock.css";

export default function LandingMock() {
  const navigate = useNavigate();

  return (
    <div className="lm-page">
      {/* TOP BAR */}
      <header className="lm-topbar">
        <div className="lm-container lm-topbarInner">
          <div className="lm-brand">
            <span className="lm-brandIcon">📍</span>
            <span className="lm-brandText">MikroPlan</span>
          </div>

          <nav className="lm-nav">
            <button className="lm-navLink" type="button">Planning</button>
            <button className="lm-navLink" type="button">Stations</button>
            <button className="lm-navLink" type="button">Analytics</button>
            <button className="lm-navLink" type="button">About</button>
          </nav>

          <button
            className="lm-btn lm-btnPrimary"
            type="button"
            onClick={() => navigate("/planning")}
          >
            Planung starten
          </button>
        </div>
      </header>

      {/* HERO */}
      <main className="lm-hero">
        <div className="lm-heroBg" aria-hidden="true" />

        <div className="lm-container lm-heroInner">
          <div className="lm-heroContent">
            <h1 className="lm-title">Plane Mikromobilität in Minuten.</h1>
            <p className="lm-subtitle">
              Wähle Ort, Radius und Stationen – speichere dein Szenario.
            </p>

            <div className="lm-actions">
              <button
                className="lm-btn lm-btnPrimary lm-btnLarge"
                type="button"
                onClick={() => navigate("/planning")}
              >
                Planung starten
              </button>

              <button
                className="lm-btn lm-btnGhost lm-btnLarge"
                type="button"
              >
                Stationen ansehen
              </button>
            </div>

            <div className="lm-cards">
              <div className="lm-card">
                <div className="lm-cardIcon">🗺️</div>
                <div className="lm-cardTitle">Interaktive Karte</div>
                <div className="lm-cardText">Planen direkt auf der Karte.</div>
              </div>

              <div className="lm-card">
                <div className="lm-cardIcon">📍</div>
                <div className="lm-cardTitle">Nearby Stations</div>
                <div className="lm-cardText">Finde Stationen in deiner Nähe.</div>
              </div>

              <div className="lm-card">
                <div className="lm-cardIcon">💾</div>
                <div className="lm-cardTitle">Szenarien speichern</div>
                <div className="lm-cardText">Szenarien sichern & vergleichen.</div>
              </div>
            </div>
          </div>

          {/* HOW IT WORKS (bottom) */}
          <section className="lm-steps">
            <div className="lm-stepsGrid">
              <div className="lm-step">
                <div className="lm-stepNr">1</div>
                <div>
                  <div className="lm-stepTitle">Ort wählen</div>
                  <div className="lm-stepText">
                    Klicke auf die Karte und setze den Mittelpunkt.
                  </div>
                </div>
              </div>

              <div className="lm-step">
                <div className="lm-stepNr">2</div>
                <div>
                  <div className="lm-stepTitle">Radius & Stationen</div>
                  <div className="lm-stepText">
                    Wähle Radius und passende Stationen aus.
                  </div>
                </div>
              </div>

              <div className="lm-step">
                <div className="lm-stepNr">3</div>
                <div>
                  <div className="lm-stepTitle">Speichern</div>
                  <div className="lm-stepText">
                    Szenario speichern und analysieren.
                  </div>
                </div>
              </div>
            </div>

            <footer className="lm-footer">
              © {new Date().getFullYear()} MikroPlan — Mikromobilitätsplanung
            </footer>
          </section>
        </div>
      </main>
    </div>
  );
}
