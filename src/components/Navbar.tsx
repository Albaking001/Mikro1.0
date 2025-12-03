export default function Navbar() {
    return (
        <nav className="bg-blue-500 text-white py-2">
            <div className="max-w-6xl mx-auto px-6 flex space-x-4">
                <button className="hover:bg-blue-400 px-3 py-1 rounded transition">Karte</button>
                <button className="hover:bg-blue-400 px-3 py-1 rounded transition">Analyse</button>
                <button className="hover:bg-blue-400 px-3 py-1 rounded transition">KI-Vorschläge</button>
            </div>
        </nav>
    )
}
