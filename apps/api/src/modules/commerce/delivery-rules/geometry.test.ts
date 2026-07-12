import { describe, expect, it } from "vitest";
import { distanceMilesBetween, isPointInPolygonZone, isPointInRadiusZone, isPointInZone } from "./geometry";

describe("distanceMilesBetween", () => {
  it("returns ~0 for identical points", () => {
    expect(distanceMilesBetween(41.8781, -87.6298, 41.8781, -87.6298)).toBeCloseTo(0, 5);
  });

  it("computes a known distance (Chicago to Springfield, IL, ~185 miles)", () => {
    const distance = distanceMilesBetween(41.8781, -87.6298, 39.7817, -89.6501);
    expect(distance).toBeGreaterThan(170);
    expect(distance).toBeLessThan(200);
  });
});

describe("isPointInRadiusZone", () => {
  const zone = { type: "radius" as const, centerLat: 41.8781, centerLng: -87.6298, radiusMiles: 5 };

  it("is true for a point inside the radius", () => {
    expect(isPointInRadiusZone(zone, 41.88, -87.63)).toBe(true);
  });

  it("is false for a point well outside the radius", () => {
    expect(isPointInRadiusZone(zone, 39.7817, -89.6501)).toBe(false);
  });
});

describe("isPointInPolygonZone", () => {
  const square = {
    type: "polygon" as const,
    points: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ],
  };

  it("is true for a point inside the polygon", () => {
    expect(isPointInPolygonZone(square, 0.5, 0.5)).toBe(true);
  });

  it("is false for a point outside the polygon", () => {
    expect(isPointInPolygonZone(square, 5, 5)).toBe(false);
  });
});

describe("isPointInZone dispatch", () => {
  it("dispatches to radius containment", () => {
    const zone = { geometry: { type: "radius", centerLat: 0, centerLng: 0, radiusMiles: 100 } };
    expect(isPointInZone(zone, 0.1, 0.1)).toBe(true);
  });

  it("dispatches to polygon containment", () => {
    const zone = {
      geometry: {
        type: "polygon",
        points: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 1 },
          { lat: 1, lng: 0 },
        ],
      },
    };
    expect(isPointInZone(zone, 0.5, 0.5)).toBe(true);
  });
});
