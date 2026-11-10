import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPinned,
  LayoutDashboard,
  Map,
  FileText,
  Upload,
  History,
  Users,
  Settings,
  LogOut,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Check,
  RefreshCw,
  Clock3,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  MessageSquare,
  WifiOff,
  Menu,
  X,
  UsersRound,
} from "lucide-react";
import AppSidebar, {
  firstView,
  viewAllowed,
  viewInfo,
  type AppView,
} from "./components/AppSidebar";
import SecurityPanel, { initialDemoSecurity } from "./components/SecurityPanel";
import DataPager from "./components/DataPager";
import { can } from "./lib/permissions";
import Access from "./components/Access";
import Modal from "./components/Modal";
import ExportPanel from "./components/ExportPanel";
import ImportPanel from "./components/ImportPanel";
import ConductorsPanel from "./components/ConductorsPanel";
import ConductorSelect from "./components/ConductorSelect";
import { requireAssignableConductor } from "./lib/conductors";
import { AuditPanel, SettingsPanel } from "./components/AdminPanels";
import { getProfile, loadSnapshot, rpc, supabase } from "./lib/client";
import { demoProfile, demoSnapshot } from "./lib/demo";
import {
  displayDate,
  normalizeName,
  servicePeriod,
  todayLima,
} from "./lib/dates";
import { sequenceErrors } from "./lib/report";
import type {
  Assignment,
  Conductor,
  Profile,
  Snapshot,
  Territory,
} from "./lib/types";
type View = AppView;
type Action = {
  kind: "assign" | "complete" | "correct" | "observe";
  territory: Territory;
  assignment?: Assignment;
};
const empty: Snapshot = {
  territories: [],
  assignments: [],
  people: [],
  revision: "",
};
export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(!!supabase),
    [view, setView] = useState<View>("overview"),
    [sync, setSync] = useState("connecting"),
    [notice, setNotice] = useState(""),
    [recovery, setRecovery] = useState(() =>
      /type=(invite|recovery)/.test(location.hash),
    ),
    [menu, setMenu] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [detail, setDetail] = useState<string | null>(null),
    [action, setAction] = useState<Action | null>(null),
    [busy, setBusy] = useState(false),
    [observations, setObservations] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [creatingTerritory, setCreatingTerritory] = useState(false);
  const [demoSecurity, setDemoSecurity] = useState(initialDemoSecurity);
  const [territoryPage, setTerritoryPage] = useState(1),
    [territorySize, setTerritorySize] = useState(20);
  const epoch = useRef(0);
  const accessSignature = useRef("");
  const today = todayLima();
  const [year, setYear] = useState(
    +today.slice(0, 4) - (+today.slice(5, 7) < 9 ? 1 : 0),
  );
  const canAssign = can(profile, "territories.assign");
  const canComplete = can(profile, "territories.complete");
  const canCorrect =
    can(profile, "territories.correct") || can(profile, "territories.void");
  const isAdmin = profile?.role === "administrador";
  const clear = useCallback(() => {
    epoch.current++;
    setProfile(null);
    setSnapshot(empty);
    setAction(null);
    setDetail(null);
    setObservations([]);
    setNotice("");
    setView("overview");
    setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    if (demo) return;
    const current = ++epoch.current;
    try {
      const p = await getProfile();
      if (current !== epoch.current) return;
      if (!p) {
        clear();
        return;
      }
      if (!p.active) {
        setProfile(p);
        setSnapshot(empty);
        setAction(null);
        setDetail(null);
        setObservations([]);
        setSync("blocked");
        return;
      }
      const data = await loadSnapshot();
      if (current !== epoch.current) return;
      setProfile(p);
      setSnapshot(data);
      setView((v) => (viewAllowed(p, v) ? v : firstView(p)));
      const signature = JSON.stringify([
        p.active,
        p.role,
        p.permissions,
        p.can_export,
      ]);
      if (accessSignature.current && accessSignature.current !== signature) {
        setAction(null);
        setDetail(null);
        setObservations([]);
      }
      accessSignature.current = signature;
      setSync("live");
    } catch (e) {
      if (current === epoch.current) {
        setSync("offline");
        setNotice((e as Error).message);
      }
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, [demo, clear]);
  useEffect(() => {
    if (demo || !supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!session) {
        clear();
        setLoading(false);
      } else setTimeout(() => void refresh(), 0);
    });
    return () => subscription.unsubscribe();
  }, [demo, refresh, clear]);
  useEffect(() => {
    if (demo || !profile?.active || !supabase) return;
    const channel = supabase
      .channel(`s13-updates-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "territories" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conductors" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profile.id}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setSync("polling");
      });
    const timer = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      void supabase!.removeChannel(channel);
    };
  }, [demo, profile?.id, profile?.active, refresh]);
  useEffect(() => {
    if (!detail || demo || !supabase) {
      setObservations([]);
      return;
    }
    let active = true;
    void supabase
      .from("territory_observations")
      .select("*")
      .eq("territory_id", detail)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (active) {
          setObservations(data ?? []);
          if (error) setNotice(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [detail, snapshot.revision, demo]);
  const openFor = (id: string) =>
    snapshot.assignments.find((a) => a.territory_id === id && !a.completed_at);
  const lastFor = (id: string) =>
    snapshot.assignments
      .filter((a) => a.territory_id === id)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
  const selected = snapshot.territories.find((t) => t.id === detail);
  const selectedHistory = snapshot.assignments
    .filter((a) => a.territory_id === detail)
    .sort(
      (a, b) =>
        b.assigned_at.localeCompare(a.assigned_at) || b.id.localeCompare(a.id),
    );
  const period = servicePeriod(year);
  const activeTerritories = snapshot.territories.filter((t) => t.active);
  const assigned = activeTerritories.filter((t) => openFor(t.id)).length;
  const completed = snapshot.assignments.filter(
    (a) =>
      a.completed_at &&
      a.completed_at >= period.start &&
      a.completed_at <= period.end,
  ).length;
  const filtered = useMemo(
    () =>
      snapshot.territories.filter((t) => {
        const records = snapshot.assignments.filter(
          (a) => a.territory_id === t.id,
        );
        const open = records.find((a) => !a.completed_at);
        const match =
          !query ||
          normalizeName(
            `${t.territory_number} ${t.description ?? ""} ${records.map((a) => a.assigned_name_snapshot).join(" ")}`,
          ).includes(normalizeName(query));
        return (
          match &&
          (filter === "all" ||
            (filter === "assigned" && !!open) ||
            (filter === "available" && t.active && !open) ||
            (filter === "inactive" && !t.active))
        );
      }),
    [snapshot, query, filter],
  );
  async function logout() {
    if (demo) {
      setDemo(false);
      clear();
      setLoading(false);
      return;
    }
    clear();
    await supabase?.auth.signOut();
  }
  function startDemo() {
    epoch.current++;
    setDemo(true);
    setProfile(demoProfile);
    setSnapshot(demoSnapshot());
    setSync("demo");
    setLoading(false);
    setView("overview");
    setDemoSecurity(initialDemoSecurity());
  }
  function navigate(v: View) {
    if (!viewAllowed(profile, v)) return;
    setTerritoryPage(1);
    setView(v);
    setMenu(false);
    setDetail(null);
    setQuery("");
    setFilter("all");
    setNotice("");
    window.scrollTo({ top: 0 });
  }
  async function saveAction(values: {
    name: string;
    personId: string;
    date: string;
    completed: string;
    reason: string;
    voided: boolean;
    body: string;
  }) {
    if (!action) return;
    setBusy(true);
    setNotice("");
    try {
      const { kind, territory: t, assignment: a } = action;
      const conductor =
        kind === "assign"
          ? requireAssignableConductor(
              snapshot.conductors ?? [],
              values.personId,
            )
          : null;
      if (demo) {
        if (kind === "observe") {
          setObservations((prev) => [
            {
              id: crypto.randomUUID(),
              body: values.body,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        } else {
          let records = [...snapshot.assignments];
          const live = snapshot.territories.find((x) => x.id === t.id)!;
          if (live.version !== t.version)
            throw new Error(
              "El territorio cambió. Abre el formulario de nuevo.",
            );
          if (kind === "assign") {
            records.push({
              id: crypto.randomUUID(),
              territory_id: t.id,
              person_id: conductor!.person_id,
              assigned_name_snapshot: conductor!.display_name,
              assigned_at: values.date,
              completed_at: null,
              version: 1,
            });
          } else
            records = records.flatMap((x) =>
              x.id !== a!.id
                ? [x]
                : values.voided
                  ? []
                  : [
                      {
                        ...x,
                        person_id:
                          kind === "correct" &&
                          values.name.trim() !== x.assigned_name_snapshot
                            ? null
                            : x.person_id,
                        assigned_name_snapshot:
                          kind === "correct"
                            ? values.name
                            : x.assigned_name_snapshot,
                        assigned_at:
                          kind === "correct" ? values.date : x.assigned_at,
                        completed_at: values.completed || null,
                        version: x.version + 1,
                      },
                    ],
            );
          const errors = sequenceErrors(
            records.filter((x) => x.territory_id === t.id),
          );
          if (errors.length) throw new Error(errors[0]);
          setSnapshot({
            ...snapshot,
            assignments: records,
            territories: snapshot.territories.map((x) =>
              x.id === t.id ? { ...x, version: x.version + 1 } : x,
            ),
            revision: new Date().toISOString(),
          });
        }
      } else {
        if (kind === "assign")
          await rpc("assign_territory", {
            p_territory_id: t.id,
            p_expected_version: t.version,
            p_name: conductor!.display_name,
            p_assigned_at: values.date,
            p_person_id: conductor!.person_id,
          });
        if (kind === "complete")
          await rpc("complete_assignment", {
            p_id: a!.id,
            p_expected_version: a!.version,
            p_territory_version: t.version,
            p_completed_at: values.completed,
          });
        if (kind === "correct")
          await rpc("correct_assignment", {
            p_id: a!.id,
            p_expected_version: a!.version,
            p_territory_version: t.version,
            p_name: values.name,
            p_assigned_at: values.date,
            p_completed_at: values.completed || null,
            p_reason: values.reason,
            p_void: values.voided,
          });
        if (kind === "observe")
          await rpc("add_observation", {
            p_territory_id: t.id,
            p_body: values.body,
          });
        await refresh();
      }
      setAction(null);
      setNotice(
        demo
          ? "Cambio guardado solo en esta sesión de ejemplo."
          : "Cambio guardado y registrado en auditoría.",
      );
    } catch (e) {
      setNotice((e as Error).message);
      if (!demo) await refresh();
    } finally {
      setBusy(false);
    }
  }
  function openAction(next: Action) {
    setNotice("");
    setAction(next);
  }
  const closeAction = useCallback(() => {
    if (!busy) setAction(null);
  }, [busy]);
  if (recovery)
    return (
      <Access
        recovery
        onRecovered={() => setRecovery(false)}
        onDemo={startDemo}
      />
    );
  if (loading)
    return (
      <div className="loading-screen">
        <MapPinned size={35} />
        <p>Comprobando el acceso…</p>
      </div>
    );
  if (!profile)
    return (
      <Access recovery={false} onRecovered={() => {}} onDemo={startDemo} />
    );
  if (!profile.active)
    return (
      <div className="loading-screen">
        <ShieldCheck size={35} />
        <h1>Acceso pendiente de autorización</h1>
        <p>
          Tu administrador debe activar el perfil y asignar los permisos
          correspondientes.
        </p>
        <button className="secondary" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </div>
    );
  function territoryTable(limit?: number) {
    const currentPage = Math.min(
      territoryPage,
      Math.max(1, Math.ceil(filtered.length / territorySize)),
    );
    const list = limit
      ? filtered.slice(0, limit)
      : filtered.slice(
          (currentPage - 1) * territorySize,
          currentPage * territorySize,
        );
    return (
      <div className="table-wrap">
        <table className="territory-table">
          <thead>
            <tr>
              <th>Territorio</th>
              <th>Estado</th>
              <th>Responsable</th>
              <th>Fecha de Inicio</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const a = openFor(t.id);
              return (
                <tr key={t.id}>
                  <td>
                    <button
                      className="territory-link"
                      onClick={() => setDetail(t.id)}
                    >
                      <span className="territory-number">
                        {String(t.territory_number).padStart(2, "0")}
                      </span>
                      <span>
                        Territorio {t.territory_number}
                        {t.description && <small>{t.description}</small>}
                      </span>
                    </button>
                  </td>
                  <td>
                    <Status active={t.active} assigned={!!a} />
                  </td>
                  <td>
                    {a ? (
                      <span className="person-cell">
                        <span className="avatar small-avatar">
                          {a.assigned_name_snapshot.slice(0, 1)}
                        </span>
                        {a.assigned_name_snapshot}
                      </span>
                    ) : (
                      <span className="muted">Sin asignación activa</span>
                    )}
                  </td>
                  <td>{displayDate(a?.assigned_at)}</td>
                  <td>
                    <button
                      className="row-action"
                      aria-label={`Ver territorio ${t.territory_number}`}
                      onClick={() => setDetail(t.id)}
                    >
                      Ver detalle
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty-inline">
            No se encontraron territorios con estos filtros.
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={`app-shell enterprise-shell ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <AppSidebar
        profile={profile}
        view={view}
        menu={menu}
        onClose={() => setMenu(false)}
        navigate={navigate}
        logout={() => void logout()}
      />
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="menu-toggle icon"
              aria-label="Mostrar u ocultar menú"
              onClick={() => {
                if (window.matchMedia("(max-width: 850px)").matches)
                  setMenu(!menu);
                else setCollapsed(!collapsed);
              }}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              <span>{viewInfo[view].section}</span>
              <ChevronRight size={13} />
              <strong>
                {selected
                  ? `Territorio ${selected.territory_number}`
                  : viewInfo[view].label}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className={`sync ${sync === "offline" ? "warning" : ""}`}>
              <i />
              {demo
                ? "Datos ficticios"
                : sync === "offline"
                  ? "Sin conexión"
                  : sync === "polling"
                    ? "Actualización cada 30 s"
                    : "Sincronizado"}
            </span>
            <button
              className="icon"
              aria-label="Actualizar datos"
              disabled={demo}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
            <span className="top-user">
              <span>
                <strong>MONTERRICO</strong>
                <small>{profile.display_name}</small>
              </span>
            </span>
            <span className="avatar top-avatar">
              {profile.display_name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <ShieldCheck size={15} />
              Vista de ejemplo · Datos ficticios · Cambios temporales
            </span>
            <button onClick={() => void logout()}>
              Volver al acceso
              <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {sync === "offline" && !demo && (
          <div className="offline-banner">
            <WifiOff size={16} />
            No se pudo actualizar. Revise la conexión antes de guardar.
          </div>
        )}
        <main className="main-content">
          {notice && (
            <div className="notice global-notice" role="status">
              {notice}
              <button
                className="icon"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {selected ? (
            <>
              <button
                className="text-button back-button"
                onClick={() => setDetail(null)}
              >
                <ArrowLeft size={16} />
                Volver a territorios
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">HISTORIAL DEL TERRITORIO</span>
                  <h1>Territorio {selected.territory_number}</h1>
                  <p>
                    {selected.description ??
                      "Asignaciones, fechas y observaciones en un solo lugar."}
                  </p>
                </div>
                <Status
                  active={selected.active}
                  assigned={!!openFor(selected.id)}
                />
              </div>
              <div className="detail-layout">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      Historial de asignaciones{" "}
                      <span className="count">{selectedHistory.length}</span>
                    </h2>
                    {((openFor(selected.id) && canComplete) ||
                      (!openFor(selected.id) && canAssign)) &&
                      selected.active &&
                      (openFor(selected.id) ? (
                        <button
                          className="primary"
                          onClick={() =>
                            openAction({
                              kind: "complete",
                              territory: selected,
                              assignment: openFor(selected.id),
                            })
                          }
                        >
                          <Check size={16} />
                          Marcar completado
                        </button>
                      ) : (
                        <button
                          className="primary"
                          onClick={() =>
                            openAction({ kind: "assign", territory: selected })
                          }
                        >
                          <Plus size={16} />
                          Asignar territorio
                        </button>
                      ))}
                  </div>
                  {!selectedHistory.length ? (
                    <div className="empty-inline">
                      Este territorio aún no tiene asignaciones.
                    </div>
                  ) : (
                    <ol className="timeline">
                      {selectedHistory.map((a) => (
                        <li key={a.id}>
                          <span
                            className={`timeline-dot ${a.completed_at ? "closed" : ""}`}
                          >
                            {a.completed_at ? (
                              <Check size={12} />
                            ) : (
                              <Clock3 size={12} />
                            )}
                          </span>
                          <div>
                            <strong>{a.assigned_name_snapshot}</strong>
                            <span>
                              Asignado: {displayDate(a.assigned_at)}
                              <span className="timeline-separator">·</span>
                              {a.completed_at
                                ? `Completado: ${displayDate(a.completed_at)}`
                                : "Pendiente de completar"}
                            </span>
                            {a.source_cell_reference && (
                              <small className="muted">
                                Origen: {a.source_cell_reference}
                              </small>
                            )}
                            {a.updated_at && (
                              <small className="muted">
                                Último cambio:{" "}
                                {new Date(a.updated_at).toLocaleString(
                                  "es-PE",
                                  { timeZone: "America/Lima" },
                                )}
                                {a.updated_by
                                  ? ` · Usuario ${a.updated_by.slice(0, 8)}`
                                  : ""}
                              </small>
                            )}
                          </div>
                          {canCorrect && (
                            <button
                              className="text-button"
                              onClick={() =>
                                openAction({
                                  kind: "correct",
                                  territory: selected,
                                  assignment: a,
                                })
                              }
                            >
                              Corregir
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="panel observations">
                  <div className="panel-heading">
                    <h2>
                      <MessageSquare size={18} />
                      Observaciones
                    </h2>
                    {can(profile, "territories.observe") && (
                      <button
                        className="icon"
                        aria-label="Agregar observación"
                        onClick={() =>
                          openAction({ kind: "observe", territory: selected })
                        }
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                  {observations.length ? (
                    observations.map((o) => (
                      <article key={o.id}>
                        <p>{o.body}</p>
                        <small>
                          {new Date(o.created_at).toLocaleDateString("es-PE", {
                            timeZone: "America/Lima",
                          })}
                        </small>
                      </article>
                    ))
                  ) : (
                    <p className="muted">Sin observaciones registradas.</p>
                  )}
                  {can(profile, "territories.edit") && (
                    <details className="territory-admin">
                      <summary>Administrar territorio</summary>
                      <p className="small muted">
                        El número se conserva y no puede reutilizarse.
                      </p>
                      <TerritorySettings
                        territory={selected}
                        demo={demo}
                        onDone={refresh}
                      />
                    </details>
                  )}
                </section>
              </div>
            </>
          ) : (
            <>
              {view === "overview" && can(profile, "territories.view") && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        REGISTRO DE ASIGNACIÓN DE TERRITORIOS
                      </span>
                      <h1>Resumen de territorios</h1>
                      <p>
                        Una vista clara del trabajo y los territorios de
                        Monterrico.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={!canAssign}
                      onClick={() => {
                        navigate("territories");
                        setFilter("available");
                      }}
                    >
                      <Plus size={17} />
                      Asignar territorio
                    </button>
                  </div>
                  <div className="period-toolbar">
                    <span>
                      <CalendarIcon />
                      Año de servicio
                    </span>
                    <select
                      aria-label="Año de servicio del resumen"
                      value={year}
                      onChange={(e) => setYear(+e.target.value)}
                    >
                      {Array.from(
                        { length: 6 },
                        (_, i) => +today.slice(0, 4) - 3 + i,
                      ).map((y) => (
                        <option key={y} value={y}>
                          {y}-{y + 1}
                        </option>
                      ))}
                    </select>
                    <span className="muted small">
                      {displayDate(period.start)} — {displayDate(period.end)}
                    </span>
                  </div>
                  <div className="stats">
                    <article>
                      <span>
                        Territorios activos <Map size={18} />
                      </span>
                      <strong>{activeTerritories.length}</strong>
                      <small>Un historial para cada territorio</small>
                    </article>
                    <article>
                      <span>
                        Asignados <Clock3 size={18} />
                      </span>
                      <strong>
                        {assigned}
                        <i className="stat-dot amber" />
                      </strong>
                      <small>Pendientes de completar</small>
                    </article>
                    <article>
                      <span>
                        Disponibles <CheckCircle2 size={18} />
                      </span>
                      <strong>
                        {activeTerritories.length - assigned}
                        <i className="stat-dot" />
                      </strong>
                      <small>Listos para una nueva asignación</small>
                    </article>
                    <article>
                      <span>
                        Completados en el periodo <Check size={18} />
                      </span>
                      <strong>{completed}</strong>
                      <small>Según las fechas de finalización</small>
                    </article>
                  </div>
                  <div className="overview-grid">
                    <section className="panel territory-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Territorios</h2>
                          <p className="small muted">
                            Consulta su estado y continúa el trabajo.
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("territories")}
                        >
                          Ver todos <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <TerritoryFilters
                        query={query}
                        setQuery={setQuery}
                        filter={filter}
                        setFilter={setFilter}
                      />
                      {territoryTable(6)}
                      <div className="table-footer">
                        <span>
                          Mostrando {Math.min(6, filtered.length)} de{" "}
                          {filtered.length} territorios
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("territories")}
                        >
                          Abrir listado
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </section>
                    <aside className="overview-aside">
                      <section className="report-callout">
                        <span className="callout-icon">
                          <FileText size={25} />
                        </span>
                        <span className="eyebrow">LISTO PARA IMPRIMIR</span>
                        <h2>
                          Tu registro,
                          <br />
                          en el formato oficial.
                        </h2>
                        <p>
                          Genera el S-13-S por año de servicio o por el periodo
                          que necesites.
                        </p>
                        <button onClick={() => navigate("export")}>
                          Preparar formulario
                          <ArrowUpRight size={17} />
                        </button>
                        <div className="callout-circles" />
                      </section>
                      <section className="panel mini-activity">
                        <h2>Últimos movimientos</h2>
                        {[...snapshot.assignments]
                          .sort((a, b) =>
                            (b.completed_at ?? b.assigned_at).localeCompare(
                              a.completed_at ?? a.assigned_at,
                            ),
                          )
                          .slice(0, 3)
                          .map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setDetail(a.territory_id)}
                            >
                              <span className="activity-icon">
                                {a.completed_at ? (
                                  <Check size={14} />
                                ) : (
                                  <Clock3 size={14} />
                                )}
                              </span>
                              <span>
                                <strong>
                                  Territorio{" "}
                                  {
                                    snapshot.territories.find(
                                      (t) => t.id === a.territory_id,
                                    )?.territory_number
                                  }
                                </strong>
                                <small>
                                  {a.completed_at ? "Completado" : "Asignado"} ·{" "}
                                  {displayDate(a.completed_at ?? a.assigned_at)}
                                </small>
                              </span>
                            </button>
                          ))}
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {view === "territories" && can(profile, "territories.view") && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">REGISTRO CENTRAL</span>
                      <h1>Territorios</h1>
                      <p>
                        Consulta el estado y el historial completo de cada
                        territorio.
                      </p>
                    </div>
                    <div className="button-row">
                      <span className="soft-tag">
                        {snapshot.territories.length} territorios
                      </span>
                      {can(profile, "territories.create") && (
                        <button
                          className="primary"
                          onClick={() => setCreatingTerritory(true)}
                        >
                          <Plus size={16} />
                          Nuevo territorio
                        </button>
                      )}
                    </div>
                  </div>
                  <section className="panel territory-panel">
                    <TerritoryFilters
                      query={query}
                      setQuery={setQuery}
                      filter={filter}
                      setFilter={setFilter}
                    />
                    {territoryTable()}
                    <DataPager
                      total={filtered.length}
                      page={territoryPage}
                      size={territorySize}
                      onPage={setTerritoryPage}
                      onSize={setTerritorySize}
                    />
                  </section>
                </>
              )}
              {view === "export" && can(profile, "reports.view") && (
                <ExportPanel
                  snapshot={snapshot}
                  demo={demo}
                  canExport={can(profile, "reports.export")}
                />
              )}
              {view === "import" && can(profile, "imports.view") && (
                <ImportPanel
                  demo={demo}
                  onImported={refresh}
                  canImport={can(profile, "imports.execute")}
                />
              )}
              {view === "audit" && can(profile, "audit.view") && (
                <AuditPanel demo={demo} />
              )}
              {(view === "users" || view === "access-profiles") && isAdmin && (
                <SecurityPanel
                  kind={view === "users" ? "users" : "profiles"}
                  demo={demo}
                  demoData={demoSecurity}
                  onDemoChange={setDemoSecurity}
                  onChanged={refresh}
                  revision={snapshot.revision}
                />
              )}
              {view === "conductors" && can(profile, "conductors.view") && (
                <ConductorsPanel
                  demo={demo}
                  profile={profile}
                  demoRows={snapshot.conductors ?? []}
                  demoAssignments={snapshot.assignments}
                  revision={snapshot.revision}
                  onChanged={refresh}
                  onDemoChange={(conductors) =>
                    setSnapshot((current) => ({
                      ...current,
                      conductors,
                      people: conductors
                        .filter((c) => c.active && !c.deleted_at)
                        .map((c) => ({
                          id: c.person_id,
                          display_name: c.display_name,
                        })),
                      revision: new Date().toISOString(),
                    }))
                  }
                />
              )}
              {view === "settings" && isAdmin && (
                <SettingsPanel
                  demo={demo}
                  snapshot={snapshot}
                  onRefresh={refresh}
                />
              )}
            </>
          )}
          {!viewAllowed(profile, view) && (
            <section className="panel empty-inline">
              <ShieldCheck size={25} />
              <h2>No tienes accesos activos</h2>
              <p>
                Solicita al administrador que revise los perfiles asignados a tu
                cuenta.
              </p>
            </section>
          )}
          <footer className="content-footer">
            <span>Monterrico · Registro S-13-S</span>
            <span>
              <ShieldCheck size={12} />
              Información de acceso restringido
            </span>
          </footer>
        </main>
      </div>
      {creatingTerritory && can(profile, "territories.create") && (
        <Modal
          title={`Nuevo territorio · ${Math.max(0, ...snapshot.territories.map((t) => t.territory_number)) + 1}`}
          onClose={() => setCreatingTerritory(false)}
        >
          <p className="small muted">
            El número se genera después del mayor existente. No se reutilizan
            números.
          </p>
          <TerritorySettings
            territory={{
              id: "",
              territory_number:
                Math.max(
                  0,
                  ...snapshot.territories.map((t) => t.territory_number),
                ) + 1,
              active: true,
              description: "",
              version: 0,
            }}
            demo={demo}
            onDone={async () => {
              await refresh();
              setCreatingTerritory(false);
            }}
          />
        </Modal>
      )}
      {action && (
        <ActionModal
          action={action}
          busy={busy}
          message={notice}
          onClose={closeAction}
          onSave={saveAction}
          canCorrect={can(profile, "territories.correct")}
          canVoid={can(profile, "territories.void")}
          conductors={snapshot.conductors ?? []}
          names={[
            ...new Set(
              snapshot.assignments.map((a) => a.assigned_name_snapshot),
            ),
          ]}
        />
      )}
    </div>
  );
}
function Status({ assigned, active }: { assigned: boolean; active: boolean }) {
  return (
    <span
      className={`status ${!active ? "inactive" : assigned ? "assigned" : "available"}`}
    >
      <i />
      {!active ? "Inactivo" : assigned ? "Asignado" : "Disponible"}
    </span>
  );
}
function CalendarIcon() {
  return <History size={15} />;
}
function TerritoryFilters({
  query,
  setQuery,
  filter,
  setFilter,
}: {
  query: string;
  setQuery: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
}) {
  return (
    <div className="filters">
      <label className="search">
        <Search size={17} />
        <input
          aria-label="Buscar territorio o responsable"
          placeholder="Buscar territorio o responsable…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <select
        aria-label="Filtrar por estado"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">Todos los estados</option>
        <option value="assigned">Asignados</option>
        <option value="available">Disponibles</option>
        <option value="inactive">Inactivos</option>
      </select>
    </div>
  );
}
function ActionModal({
  canCorrect,
  canVoid,
  action,
  busy,
  message,
  onClose,
  onSave,
  names,
  conductors,
}: {
  canCorrect: boolean;
  canVoid: boolean;
  action: Action;
  busy: boolean;
  message: string;
  onClose: () => void;
  onSave: (v: any) => Promise<void>;
  names: string[];
  conductors: Conductor[];
}) {
  const a = action.assignment;
  const [name, setName] = useState(a?.assigned_name_snapshot ?? ""),
    [personId, setPersonId] = useState(""),
    [date, setDate] = useState(a?.assigned_at ?? todayLima()),
    [completed, setCompleted] = useState(
      action.kind === "complete" ? todayLima() : (a?.completed_at ?? ""),
    ),
    [reason, setReason] = useState(""),
    [voided, setVoided] = useState(!canCorrect && canVoid),
    [body, setBody] = useState("");
  useEffect(() => {
    if (personId) {
      const selected = conductors.find((c) => c.person_id === personId);
      if (selected) setName(selected.display_name);
    }
  }, [personId, conductors]);
  const titles = {
    assign: "Asignar territorio",
    complete: "Marcar como completado",
    correct: canCorrect ? "Corrección administrativa" : "Anulación de registro",
    observe: "Agregar observación",
  };
  return (
    <Modal
      title={`${titles[action.kind]} · ${action.territory.territory_number}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            name,
            personId,
            date,
            completed,
            reason,
            voided,
            body,
          });
        }}
      >
        {action.kind === "observe" ? (
          <label>
            Observación
            <textarea
              rows={5}
              required
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        ) : (
          <>
            {action.kind !== "complete" && (
              <>
                {action.kind === "assign" ? (
                  <ConductorSelect
                    conductors={conductors}
                    value={personId}
                    disabled={busy}
                    onChange={(id, displayName) => {
                      setPersonId(id);
                      setName(displayName);
                    }}
                  />
                ) : (
                  <label>
                    Nombre del responsable
                    <input
                      list="responsibles"
                      required
                      maxLength={200}
                      value={name}
                      readOnly={!canCorrect}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Escribe o selecciona un nombre"
                    />
                    <datalist id="responsibles">
                      {names.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </label>
                )}
                <label>
                  Fecha de Inicio
                  <input
                    type="date"
                    required
                    max={todayLima()}
                    disabled={action.kind === "correct" && !canCorrect}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </>
            )}
            {action.kind === "assign" && (
              <p className="small muted">
                La fecha debe ser estrictamente posterior al cierre de la
                asignación anterior.
              </p>
            )}
            {action.kind !== "assign" && (
              <label>
                Fecha de finalización
                <input
                  type="date"
                  disabled={action.kind === "correct" && !canCorrect}
                  required={action.kind === "complete"}
                  min={date}
                  max={todayLima()}
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                />
              </label>
            )}
            {action.kind === "complete" && (
              <div className="notice">
                {a!.assigned_name_snapshot} · Asignado el{" "}
                {displayDate(a!.assigned_at)}. Se permite completar el mismo
                día.
              </div>
            )}
            {action.kind === "correct" && (
              <>
                <label>
                  Motivo de la corrección
                  <textarea
                    minLength={8}
                    maxLength={2000}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explica qué se corrige y por qué"
                  />
                </label>
                {canVoid && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={voided}
                      onChange={(e) => setVoided(e.target.checked)}
                    />
                    Anular este registro conservando su auditoría
                  </label>
                )}
              </>
            )}
          </>
        )}
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              (action.kind === "assign" &&
                !conductors.some(
                  (c) => c.person_id === personId && c.active && !c.deleted_at,
                ))
            }
          >
            {busy
              ? "Guardando…"
              : action.kind === "correct"
                ? "Guardar corrección"
                : action.kind === "complete"
                  ? "Confirmar finalización"
                  : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TerritorySettings({
  territory,
  demo,
  onDone,
}: {
  territory: Territory;
  demo: boolean;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [description, setDescription] = useState(territory.description ?? ""),
    [active, setActive] = useState(territory.active),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await rpc("manage_territory", {
            p_number: territory.territory_number,
            p_expected_version: territory.version,
            p_active: active,
            p_description: description,
            p_reason: reason,
          });
          await onDone();
          setMessage("Territorio actualizado.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Descripción
        <input
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Territorio activo
      </label>
      <label>
        Motivo
        <input
          required
          minLength={8}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="secondary" disabled={demo || busy}>
        Guardar configuración
      </button>
      {message && <p className="notice">{message}</p>}
    </form>
  );
}
