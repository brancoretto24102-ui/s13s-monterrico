export type Role = "administrador" | "editor" | "lector";
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  active: boolean;
  can_export: boolean;
  version: number;
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
  revision: string;
}
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
