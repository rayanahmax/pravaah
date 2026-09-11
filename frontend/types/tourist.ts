/**
 * Phase 13 — frozen tourist-facing API contract.
 *
 * This is the single source of truth for the shapes the tourist UI consumes.
 * It is owned by the foundation/tech lead: during the Phase 13 sprint nobody
 * edits this file to suit their page. If a response shape genuinely needs to
 * change, that is a lead PR reviewed by all three owners, because the whole
 * point of freezing it is that Discovery, Permits and QR can be built in
 * parallel against a stable surface.
 *
 * These are the *wire* shapes returned by the `/api/v1` routes (verified against
 * the handlers, not invented). They are deliberately structural and client-safe:
 * only pure types are imported, so a Client Component can import this module
 * without pulling any server code into the browser bundle.
 */

import type { DestinationRow, AlertRow } from "@/types/rows";
import type { PermitStatus } from "@/lib/permit-rules";
import type { CapacityStatus } from "@/lib/capacity";

// Re-exported so consumers import the whole contract from one place.
export type { DestinationRow, AlertRow, PermitStatus, CapacityStatus };

/** Success envelope every route uses: { "data": ... }. */
export type ApiSuccess<T> = { data: T };

/** Error envelope every route uses: { "error": { code, message } }. */
export type ApiFailure = { error: { code: string; message: string } };

/** A call that may succeed or be refused. */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Capacity block — matches services/capacity toCapacityDto(). */
export type CapacityDto = {
  capacity: number;
  occupancy: number;
  remaining: number;
  percentage: number;
  status: CapacityStatus;
};

/** Quota block — matches services/quotas QuotaView. */
export type QuotaDto = {
  destination_id: string;
  date: string;
  quota: number | null;
  visitors_admitted: number | null;
  remaining: number;
};

/** Permit projection returned to a tourist — matches services/permits PermitSummary. Never carries the QR token or owner id. */
export type PermitDto = {
  id: string;
  destination_id: string;
  visit_date: string;
  group_size: number;
  status: PermitStatus;
  created_at: string;
  updated_at: string;
};

/** QR payload — matches GET /permits/{id}/qr. `token` is the opaque scannable reference. */
export type PermitQrDto = {
  permit_id: string;
  destination_id: string;
  visit_date: string;
  group_size: number;
  status: PermitStatus;
  token: string;
};

/** GET /api/v1/destinations */
export type DestinationsListResponse = ApiSuccess<DestinationRow[]>;

/** GET /api/v1/destinations/{id} — destination plus its live capacity, quota and alerts. */
export type DestinationDetailResponse = ApiSuccess<{
  destination: DestinationRow;
  capacity: CapacityDto;
  quota: QuotaDto;
  alerts: AlertRow[];
}>;

/** POST /api/v1/permits — 201 with the PENDING permit, or a refusal. */
export type PermitCreateResponse = ApiResponse<PermitDto>;

/** GET /api/v1/permits/my — the caller's own permits, newest first. */
export type MyPermitsResponse = ApiSuccess<PermitDto[]>;

/** GET /api/v1/permits/{id} — one owned permit, or NOT_FOUND. */
export type PermitDetailResponse = ApiResponse<PermitDto>;

/** POST /api/v1/permits/{id}/cancel — the cancelled permit, or a refusal. */
export type PermitCancelResponse = ApiResponse<PermitDto>;

/** GET /api/v1/permits/{id}/qr — the approved permit's token, or a refusal. */
export type PermitQrResponse = ApiResponse<PermitQrDto>;

/**
 * Tourist route paths (the URL contract between the three workstreams). They
 * are namespaced away from the operator console, which already owns /permits,
 * /capacity and /overview, so a tourist and an operator never collide on a path.
 */
export const TOURIST_ROUTES = {
  destinations: "/destinations",
  destinationDetail: (id: string) => `/destinations/${id}`,
  myPermits: "/my-permits",
  newPermit: "/my-permits/new",
  permitDetail: (id: string) => `/my-permits/${id}`,
  permitQr: (id: string) => `/my-permits/${id}/qr`,
} as const;
