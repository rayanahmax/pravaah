/**
 * Row shapes for the tables this layer reads.
 *
 * `docs/DATABASE.md` is the source of truth; these mirror it so the service
 * layer is typed without pretending to have generated Supabase types.
 * Column additions must be made in the migration first.
 */

import type { AccessOverride } from "@/lib/capacity";

export type ProfileRole = "TOURIST" | "DEPARTMENT_OPERATOR";

export type DestinationRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  difficulty: string | null;
  elevation: number | null;
  estimated_duration_minutes: number | null;
  access_status: AccessOverride;
  created_at: string;
  updated_at: string;
};

export type CapacityConfigurationRow = {
  id: string;
  destination_id: string;
  maximum_capacity: number;
  available_threshold: number | null;
  near_capacity_threshold: number | null;
  restricted_threshold: number | null;
  created_at: string;
  updated_at: string;
};

export type DailyQuotaRow = {
  id: string;
  destination_id: string;
  quota_date: string;
  quota: number;
  visitors_admitted: number | null;
};

export type CheckInRow = {
  id: string;
  permit_id: string;
  destination_id: string;
  group_size: number;
};

export type CheckOutRow = {
  id: string;
  permit_id: string;
  destination_id: string;
  group_size: number;
};

export type AlertRow = {
  id: string;
  destination_id: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};
