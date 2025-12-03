import Header from "../components/Header"
import Navbar from "../components/Navbar"
import MapComponent from "../components/MapComponent"
import Footer from "../components/Footer"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <Header />
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8">
        <section className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
          <h2 className="text-xl font-semibold mb-4">
            Willkommen im Mikromobilitäts-Tool
          </h2>
          <p className="text-gray-600 mb-6">
            Dieses Dashboard hilft bei der Planung und Analyse von Bike-Sharing-Stationen.
          </p>
          <MapComponent />
          <p className="text-gray-600 mb-6">
            Hier drüber sollte die karte erscheinen.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  )
}
