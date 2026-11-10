import {
  Database,
  ChevronDown,
  Home,
  Layers,
  MapPinned,
  Map,
  UsersRound,
  FileText,
  Upload,
  ShieldCheck,
  Users,
  History,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { can } from "../lib/permissions";
import type { Profile } from "../lib/types";
export type AppView =
  | "overview"
  | "territories"
  | "export"
  | "import"
  | "audit"
  | "users"
  | "access-profiles"
  | "conductors"
  | "settings";
export const viewInfo: Record<
  AppView,
  { label: string; section: string; permission?: string; admin?: boolean }
> = {
  overview: {
    label: "Inicio",
    section: "INICIO",
    permission: "territories.view",
  },
  territories: {
    label: "Registro de asignaciones",
    section: "TERRITORIOS / PROCESOS",
    permission: "territories.view",
  },
  export: {
    label: "Formulario S-13-S",
    section: "TERRITORIOS / REPORTES",
    permission: "reports.view",
  },
  import: {
    label: "Importar historial",
    section: "TERRITORIOS / PROCESOS",
    permission: "imports.view",
  },
  conductors: {
    label: "Conductores",
    section: "CONFIGURACIÓN / MAESTROS",
    permission: "conductors.view",
  },
  audit: {
    label: "Auditoría",
    section: "SEGURIDAD / REPORTES",
    permission: "audit.view",
  },
  users: { label: "Usuarios", section: "SEGURIDAD / MAESTROS", admin: true },
  "access-profiles": {
    label: "Perfiles",
    section: "SEGURIDAD / MAESTROS",
    admin: true,
  },
  settings: {
    label: "Ajustes del sistema",
    section: "CONFIGURACIÓN / MAESTROS",
    admin: true,
  },
};
export const viewAllowed = (p: Profile | null, v: AppView) =>
  !!p?.active &&
  (viewInfo[v].admin
    ? p.role === "administrador"
    : can(p, viewInfo[v].permission!));
export const firstView = (p: Profile) =>
  (Object.keys(viewInfo) as AppView[]).find((v) => viewAllowed(p, v)) ??
  "overview";
export default function AppSidebar({
  profile,
  view,
  menu,
  onClose,
  navigate,
  logout,
}: {
  profile: Profile;
  view: AppView;
  menu: boolean;
  onClose: () => void;
  navigate: (v: AppView) => void;
  logout: () => void;
}) {
  const item = (id: AppView, Icon = Map) =>
    viewAllowed(profile, id) && (
      <button
        type="button"
        key={id}
        title={viewInfo[id].label}
        className={`nav-leaf ${view === id ? "active" : ""}`}
        aria-current={view === id ? "page" : undefined}
        onClick={() => navigate(id)}
      >
        <Icon size={16} />
        <span>{viewInfo[id].label}</span>
      </button>
    );
  const config = ["conductors", "settings"] as AppView[],
    territory = ["territories", "import", "export"] as AppView[],
    security = ["access-profiles", "users", "audit"] as AppView[];
  return (
    <>
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <MapPinned size={31} />
          </span>
          <span>
            Territorios<small>MONTERRICO</small>
          </span>
          <button
            className="mobile-close icon"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Navegación principal">
          {item("overview", Home)}
          {config.some((v) => viewAllowed(profile, v)) && (
            <section className="nav-module">
              <h2>CONFIGURACIÓN</h2>
              <details open>
                <summary>
                  <Database size={17} />
                  <span>Maestros</span>
                  <ChevronDown size={13} />
                </summary>
                <div>
                  {item("conductors", UsersRound)}
                  {item("settings", Settings)}
                </div>
              </details>
            </section>
          )}
          {territory.some((v) => viewAllowed(profile, v)) && (
            <section className="nav-module">
              <h2>TERRITORIOS</h2>
              {["territories", "import"].some((v) =>
                viewAllowed(profile, v as AppView),
              ) && (
                <details open>
                  <summary>
                    <Layers size={17} />
                    <span>Procesos</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div>
                    {item("territories", Map)}
                    {item("import", Upload)}
                  </div>
                </details>
              )}
              {viewAllowed(profile, "export") && (
                <details open>
                  <summary>
                    <FileText size={17} />
                    <span>Reportes</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div>{item("export", FileText)}</div>
                </details>
              )}
            </section>
          )}
          {security.some((v) => viewAllowed(profile, v)) && (
            <section className="nav-module">
              <h2>SEGURIDAD</h2>
              {profile.role === "administrador" && (
                <details open>
                  <summary>
                    <ShieldCheck size={17} />
                    <span>Maestros</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div>
                    {item("access-profiles", ShieldCheck)}
                    {item("users", Users)}
                  </div>
                </details>
              )}
              {viewAllowed(profile, "audit") && (
                <details open>
                  <summary>
                    <History size={17} />
                    <span>Reportes</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div>{item("audit", History)}</div>
                </details>
              )}
            </section>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <ShieldCheck size={17} />
            <span>
              Registro privado<small>Solo usuarios autorizados</small>
            </span>
          </div>
          <button
            className="sidebar-logout"
            onClick={logout}
            title="Cerrar sesión"
          >
            <LogOut size={18} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar menú"
          onClick={onClose}
        />
      )}
    </>
  );
}
