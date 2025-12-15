import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("leaflet", () => ({
  icon: () => ({}),
  Marker: function Marker() {},
}));

const mapEventHandlers: Record<string, (payload: unknown) => void> = {};

vi.mock("react-leaflet", () => {
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="map">{children}</div>
    ),
    TileLayer: () => <div data-testid="tile" />,
    Marker: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="marker">{children}</div>
    ),
    Popup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
    useMapEvents: (handlers: Record<string, (payload: unknown) => void>) => {
      Object.assign(mapEventHandlers, handlers);
      return null;
    },
  };
});

// eslint-disable-next-line react-refresh/only-export-components
import PlanningMap from "../PlanningMap";

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ display_name: "Mocked Address" }),
});

describe("PlanningMap", () => {
  beforeEach(() => {
    mapEventHandlers.click = () => {};
    vi.stubGlobal("fetch", mockFetch);
  });

  it("creates a marker when the map is clicked", () => {
    render(<PlanningMap />);

    mapEventHandlers.click?.({ latlng: { lat: 50.0, lng: 8.27 } });

    const markers = screen.getAllByTestId("marker");
    expect(markers.length).toBe(1);
    expect(screen.getByText(/Planungskarte/)).toBeInTheDocument();
  });

  it("shows popup content with coordinates and created timestamp", () => {
    render(<PlanningMap />);

    mapEventHandlers.click?.({ latlng: { lat: 50.0, lng: 8.27 } });

    const coordinateText = screen.getByText(/Koordinaten/);
    expect(coordinateText.textContent).toContain("50.00000");
    expect(coordinateText.textContent).toContain("8.27000");
  });
});
