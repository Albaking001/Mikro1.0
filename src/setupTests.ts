import "@testing-library/jest-dom";

// Provide a minimal mock for the Leaflet marker prototype to avoid jsdom errors.
const mockMarkerPrototype = { options: {} } as unknown as typeof import("leaflet").Marker.prototype;
try {
  // @ts-expect-error prototype override for tests
  import("leaflet").then((L) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L as any).Marker.prototype = mockMarkerPrototype;
  });
} catch {
  // ignore
}
