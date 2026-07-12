import type { DeliveryZone } from "@prisma/client";

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** PURE — haversine great-circle distance in miles. */
export function distanceMilesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

export type RadiusGeometry = { type: "radius"; centerLat: number; centerLng: number; radiusMiles: number };
export type PolygonGeometry = { type: "polygon"; points: { lat: number; lng: number }[] };
export type ZoneGeometry = RadiusGeometry | PolygonGeometry;

/** PURE — radius-mode zone containment. */
export function isPointInRadiusZone(zone: RadiusGeometry, lat: number, lng: number): boolean {
  return distanceMilesBetween(zone.centerLat, zone.centerLng, lat, lng) <= zone.radiusMiles;
}

/** PURE — standard ray-casting point-in-polygon algorithm. */
export function isPointInPolygonZone(zone: PolygonGeometry, lat: number, lng: number): boolean {
  let inside = false;
  const points = zone.points;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].lng;
    const yi = points[i].lat;
    const xj = points[j].lng;
    const yj = points[j].lat;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** PURE — dispatches to the right containment check based on the zone's discriminated geometry. */
export function isPointInZone(zone: Pick<DeliveryZone, "geometry">, lat: number, lng: number): boolean {
  const geometry = zone.geometry as ZoneGeometry;
  if (geometry.type === "radius") {
    return isPointInRadiusZone(geometry, lat, lng);
  }
  return isPointInPolygonZone(geometry, lat, lng);
}
