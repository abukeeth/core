// Staff-facing (kitchen queue, driver view) commerce API client (Sprint 07).

export interface DriverAssignment {
  id: string;
  fulfillmentId: string;
  driverId: string;
  status: "OFFERED" | "ACCEPTED" | "DECLINED" | "EN_ROUTE" | "DELIVERED";
  currentLat: number | null;
  currentLng: number | null;
  fulfillment?: {
    id: string;
    method: string;
    status: string;
    order: { id: string; orderNumber: number; totalCents: number };
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}

export function listMyDriverAssignments() {
  return apiFetch<{ assignments: DriverAssignment[] }>("/api/restaurants/me/fulfillment/my-assignments");
}

export function respondToAssignment(id: string, accept: boolean) {
  return apiFetch<{ assignment: DriverAssignment }>(`/api/restaurants/me/fulfillment/assignments/${id}/respond`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });
}

export function updateFulfillmentStatus(fulfillmentId: string, status: string) {
  return apiFetch<{ fulfillment: { id: string; status: string } }>(`/api/restaurants/me/fulfillment/${fulfillmentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function postLocationPing(fulfillmentId: string, lat: number, lng: number) {
  return apiFetch<{ assignment: DriverAssignment }>(`/api/restaurants/me/fulfillment/${fulfillmentId}/location-ping`, {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}
