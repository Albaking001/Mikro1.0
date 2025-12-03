type StationPopProps = {
    name: string;
    status: string;
    capacity: number;
    bikes_available: number;
    docks_available: number;
    update: string;
};

export default function StationPop(
    {
        name,
        status,
        capacity,
        bikes_available,
        docks_available,
        update
    }: StationPopProps) {

    const statusColor =
        status === "aktiv"
            ? "text-green-600 font-semibold"
            : "text-red-600 font-semibold";

    return (
        <div className="text-sm leading-tight min-w-[180px]">

            <strong className="block text-base mb-1">{name}</strong>

            <div className="mb-1">
                Status: <span className={statusColor}>{status}</span>
            </div>

            <div className="mb-1">
                🚲 Fahrräder verfügbar: <strong>{bikes_available}</strong>
            </div>

            <div className="mb-1">
                ⛽ freie Docks: <strong>{docks_available}</strong>
            </div>

            <div className="mb-1">
                📦 Kapazität: <strong>{capacity}</strong>
            </div>

            <div className="mt-2 text-xs text-gray-600">
                ⏱️ Letztes Update: {update}
            </div>
        </div>
    );
}