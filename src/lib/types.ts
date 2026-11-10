export type Role = "administrador" | "editor" | "lector";
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  active: boolean;
  can_export: boolean;
  version: number;
  permissions?: string[];
  code?: number;
  username?: string | null;
  access_mode?: "base" | "custom";
  deleted_at?: string | null;
}
export interface AccessProfile {
  id: string;
  code: number;
  name: string;
  system_key: Role | null;
  active: boolean;
  deleted_at: string | null;
  permissions: string[];
  version: number;
  created_at: string;
  updated_at: string;
  users_count: number;
}
export interface ManagedUser extends Profile {
  code: number;
  username: string | null;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  access_mode: "base" | "custom";
  access_profile_ids: string[];
}
export interface Territory {
  id: string;
  territory_number: number;
  active: boolean;
  description: string | null;
  version: number;
}
export interface Assignment {
  id: string;
  territory_id: string;
  territory_number?: number;
  person_id?: string | null;
  assigned_name_snapshot: string;
  assigned_at: string;
  completed_at: string | null;
  version: number;
  source_order?: number;
  source_cell_reference?: string | null;
  notes?: string | null;
  voided_at?: string | null;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}
export interface Snapshot {
  territories: Territory[];
  assignments: Assignment[];
  people: { id: string; display_name: string }[];
  conductors?: Conductor[];
  visit_restrictions?: VisitRestriction[];
  visit_territories?: Pick<Territory, "id" | "territory_number" | "active">[];
  visit_restriction_summary?: VisitRestrictionSummary[];
  revision: string;
}
export interface VisitRestriction {
  id: string;
  code: number;
  territory_id: string;
  address_reference: string;
  reported_on: string;
  eligible_on: string;
  active: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  source_reference?: string | null;
}
export interface VisitRestrictionSummary {
  territory_id: string;
  blocking_count: number;
  eligible_count: number;
}
export type VisitRestrictionAction =
  "create" | "update" | "renew" | "archive" | "activate" | "delete" | "restore";
export interface Conductor {
  id: string;
  code: number;
  person_id: string;
  display_name: string;
  active: boolean;
  deleted_at: string | null;
  version: number;
}
export interface ConductorRecord extends Conductor {
  created_at: string;
  updated_at: string;
  assignments_count: number;
  open_assignments: number;
}
export type ConductorAction =
  "create" | "update" | "activate" | "deactivate" | "delete" | "restore";
export interface Period {
  start: string;
  end: string;
  label: string;
  mode: "service" | "custom" | "current";
  generatedOn: string;
}
export interface ImportRow {
  territory_number: number;
  assigned_name_snapshot: string;
  assigned_at: string;
  completed_at: string | null;
  source_order: number;
  source_cell_reference: string;
  migration_adjustment?: string;
}
export interface ImportIssue {
  severity: "error" | "warning" | "info";
  territory?: number;
  cell?: string;
  message: string;
}
export interface ImportPreview {
  fileName: string;
  fileHash: string;
  rows: ImportRow[];
  issues: ImportIssue[];
  sheets: { name: string; rows: number }[];
}
