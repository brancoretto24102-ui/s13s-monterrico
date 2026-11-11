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
  Pencil,
  Trash2,
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
import VisitRestrictionsPanel, {
  TerritoryVisitNotice,
} from "./components/VisitRestrictionsPanel";
import { visitSummary } from "./lib/visitRestrictions";
import { useLimaToday } from "./lib/useLimaToday";
import ConductorSelect from "./components/ConductorSelect";
import PreachingSchedulePanel from "./components/PreachingSchedulePanel";
import {
  scheduleExceptionBody,
  territoryPlanStatus,
  type PreachingWeek,
} from "./lib/preachingSchedule";
import TerritoryCoverage, {
  CoverageDate,
} from "./components/TerritoryCoverage";
import {
  coveragePriority,
  emptyCoverageOptions,
  filterCoverageTerritories,
  latestCompletedDates,
  type CoverageOptions,
} from "./lib/territoryCoverage";
import {
  requireAssignmentAction,
  type AssignmentActionKind,
} from "./lib/assignmentActions";
import AssignmentTimingNotice from "./components/AssignmentTimingNotice";
import {
  assignmentDeadline,
  assignmentTimingIssues,
  nextAssignmentDate,
  timingObservation,
  validateTimingException,
  validTimingReason,
  TIMING_OVERRIDE_PERMISSION,
} from "./lib/assignmentTiming";
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
  VisitRestriction,
  VisitRestrictionSummary,
} from "./lib/types";
type View = AppView;
type Action = {
  kind: AssignmentActionKind;
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
  const [demoObservations, setDemoObservations] = useState<any[]>([]);
  const [demoPreachingWeeks, setDemoPreachingWeeks] = useState<
    Record<string, PreachingWeek>
  >({});
  const [collapsed, setCollapsed] = useState(false);
  const [creatingTerritory, setCreatingTerritory] = useState(false);
  const [demoSecurity, setDemoSecurity] = useState(initialDemoSecurity);
  const [territoryPage, setTerritoryPage] = useState(1),
    [territorySize, setTerritorySize] = useState(20);
  const [coverageOptions, setCoverageOptions] =
    useState<CoverageOptions>(emptyCoverageOptions);
  const epoch = useRef(0);
  const accessSignature = useRef("");
  const today = useLimaToday();
  const [visitFilter, setVisitFilter] = useState({
    territory: "",
    eligible: false,
    key: 0,
  });
  const visitRows = snapshot.visit_restrictions ?? [];
  const canViewVisits = can(profile, "visits.view");
  const visitCounts = canViewVisits
    ? visitSummary(visitRows, today)
    : (snapshot.visit_restriction_summary ?? []);
  const eligibleVisits = visitCounts.reduce(
    (sum, row) => sum + row.eligible_count,
    0,
  );
  const [year, setYear] = useState(
    +today.slice(0, 4) - (+today.slice(5, 7) < 9 ? 1 : 0),
  );
  const canAssign = can(profile, "territories.assign");
  const canComplete = can(profile, "territories.complete");
  const canCorrect = can(profile, "territories.correct");
  const canVoid = can(profile, "territories.void");
  const isAdmin = profile?.role === "administrador";
  const clear = useCallback(() => {
    epoch.current++;
    setProfile(null);
    setSnapshot(empty);
    setDemoObservations([]);
    setDemoPreachingWeeks({});
    setAction(null);
    setDetail(null);
    setObservations([]);
    setNotice("");
    setCoverageOptions(emptyCoverageOptions);
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
        { event: "*", schema: "public", table: "visit_restrictions" },
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
    if (demo) {
      setObservations(
        demoObservations.filter((o) => o.territory_id === detail),
      );
      return;
    }
    if (!detail || !supabase) {
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
  }, [detail, snapshot.revision, demo, demoObservations]);
  const openFor = (id: string) =>
    snapshot.assignments.find((a) => a.territory_id === id && !a.completed_at);
  const lastFor = (id: string) =>
    snapshot.assignments
      .filter((a) => a.territory_id === id)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
  const nextFor = (id: string) =>
    nextAssignmentDate(
      snapshot.assignments.filter((a) => a.territory_id === id),
    );
  const resting = (id: string) =>
    !openFor(id) && !!nextFor(id) && nextFor(id)! > today;
  const overdue = (id: string) =>
    !!openFor(id) && assignmentDeadline(openFor(id)!.assigned_at) < today;
  const selected = snapshot.territories.find((t) => t.id === detail);
  const selectedObservations = observations.filter(
    (o) => o.territory_id === detail,
  );
  const selectedHistory = snapshot.assignments
    .filter((a) => a.territory_id === detail)
    .sort(
      (a, b) =>
        b.assigned_at.localeCompare(a.assigned_at) || b.id.localeCompare(a.id),
    );
  const period = servicePeriod(year);
  const activeTerritories = snapshot.territories.filter((t) => t.active);
  const assigned = activeTerritories.filter((t) => openFor(t.id)).length;
  const availableTerritories = activeTerritories.filter(
    (t) => !openFor(t.id) && !resting(t.id),
  ).length;
  const restingCount = activeTerritories.filter((t) => resting(t.id)).length;
  const overdueCount = activeTerritories.filter((t) => overdue(t.id)).length;
  const completed = snapshot.assignments.filter(
    (a) =>
      a.completed_at &&
      a.completed_at >= period.start &&
      a.completed_at <= period.end,
  ).length;
  const coverageDates = useMemo(
    () => latestCompletedDates(snapshot.assignments, today),
    [snapshot.assignments, today],
  );
  useEffect(() => setTerritoryPage(1), [query, filter, coverageOptions]);
  const filtered = useMemo(
    () =>
      filterCoverageTerritories(
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
              (filter === "available" && t.active && !open && !resting(t.id)) ||
              (filter === "resting" && t.active && resting(t.id)) ||
              (filter === "overdue" && t.active && overdue(t.id)) ||
              (filter === "inactive" && !t.active))
          );
        }),
        coverageDates,
        coverageOptions,
        today,
      ),
    [snapshot, query, filter, today, coverageDates, coverageOptions],
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
    setDemoObservations([]);
    setDemoPreachingWeeks({});
    setCoverageOptions(emptyCoverageOptions);
    setSync("demo");
    setLoading(false);
    setView("overview");
    setDemoSecurity(initialDemoSecurity());
  }
  function navigate(v: View) {
    if (!viewAllowed(profile, v)) return;
    setTerritoryPage(1);
    if (v === "visit-restrictions")
      setVisitFilter((current) => ({
        territory: "",
        eligible: false,
        key: current.key + 1,
      }));
    setView(v);
    setMenu(false);
    setDetail(null);
    setQuery("");
    setFilter("all");
    setCoverageOptions(emptyCoverageOptions);
    setNotice("");
    window.scrollTo({ top: 0 });
  }
  function openVisits(territory = "", eligible = false) {
    if (!canViewVisits) return;
    navigate("visit-restrictions");
    setVisitFilter((current) => ({
      territory,
      eligible,
      key: current.key + 1,
    }));
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
      requireAssignmentAction(profile, kind);
      const voiding = kind === "void";
      // A dedicated cancellation cannot silently change the record being voided.
      if (voiding) {
        if (!a) throw new Error("Registro no disponible.");
        values = {
          ...values,
          name: a.assigned_name_snapshot,
          date: a.assigned_at,
          completed: a.completed_at ?? "",
          voided: true,
        };
      } else values = { ...values, voided: false };
      if ((kind === "correct" || voiding) && !validTimingReason(values.reason))
        throw new Error("Indica un motivo entre 8 y 2000 caracteres.");
      const history = snapshot.assignments.filter(
        (row) => row.territory_id === t.id,
      );
      const datesChanged =
        a &&
        (values.date !== a.assigned_at ||
          (values.completed || null) !== a.completed_at);
      const issues =
        kind === "assign"
          ? assignmentTimingIssues(history, values.date, null, undefined, today)
          : kind === "complete"
            ? assignmentTimingIssues(
                [],
                a!.assigned_at,
                values.completed || null,
                undefined,
                today,
              )
            : kind === "correct" && !values.voided && datesChanged
              ? assignmentTimingIssues(
                  history,
                  values.date,
                  values.completed || null,
                  a!.id,
                  today,
                  values.date !== a!.assigned_at,
                )
              : [];
      validateTimingException(
        issues,
        can(profile, TIMING_OVERRIDE_PERMISSION),
        values.reason,
      );
      let savedAssignmentId = a?.id ?? "";
      const conductor =
        kind === "assign"
          ? requireAssignableConductor(
              snapshot.conductors ?? [],
              values.personId,
            )
          : null;
      if (demo) {
        if (kind === "observe") {
          setDemoObservations((prev) => [
            {
              id: crypto.randomUUID(),
              body: values.body,
              territory_id: t.id,
              kind: "general",
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
            savedAssignmentId = crypto.randomUUID();
            records.push({
              id: savedAssignmentId,
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
          if (issues.length)
            setDemoObservations((prev) => [
              {
                id: crypto.randomUUID(),
                territory_id: t.id,
                assignment_id: savedAssignmentId,
                kind: "timing_exception",
                body: timingObservation(
                  kind === "assign"
                    ? "Inicio de asignación"
                    : kind === "complete"
                      ? "Finalización de asignación"
                      : "Corrección administrativa",
                  issues,
                  values.reason,
                ),
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);
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
          await rpc("assign_territory_with_reason", {
            p_territory_id: t.id,
            p_expected_version: t.version,
            p_name: conductor!.display_name,
            p_assigned_at: values.date,
            p_person_id: conductor!.person_id,
            p_exception_reason: values.reason || null,
          });
        if (kind === "complete")
          await rpc("complete_assignment_with_reason", {
            p_id: a!.id,
            p_expected_version: a!.version,
            p_territory_version: t.version,
            p_completed_at: values.completed,
            p_exception_reason: values.reason || null,
          });
        if (kind === "correct" || voiding)
          await rpc("correct_assignment", {
            p_id: a!.id,
            p_expected_version: a!.version,
            p_territory_version: t.version,
            p_name: values.name,
            p_assigned_at: values.date,
            p_completed_at: values.completed || null,
            p_reason: values.reason,
            p_void: voiding,
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
        onPasswordUpdateRequired={() => setRecovery(true)}
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
      <Access
        recovery={false}
        onRecovered={() => {}}
        onPasswordUpdateRequired={() => setRecovery(true)}
        onDemo={startDemo}
      />
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
              <th>Última vez predicado</th>
              <th>Estado</th>
              <th>Responsable</th>
              <th>Fecha de Inicio</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const a = openFor(t.id);
              const lastCompleted = coverageDates.get(t.id) ?? null;
              const priority = coveragePriority(lastCompleted, today);
              return (
                <tr key={t.id}>
                  <td>
                    <button
                      className="territory-link"
                      onClick={() => setDetail(t.id)}
                    >
                      <span
                        className={`territory-number coverage-${priority.color}`}
                      >
                        {String(t.territory_number).padStart(2, "0")}
                      </span>
                      <span>
                        Territorio {t.territory_number}
                        {t.description && <small>{t.description}</small>}
                      </span>
                    </button>
                  </td>
                  <td>
                    <CoverageDate date={lastCompleted} today={today} />
                  </td>
                  <td>
                    <Status
                      active={t.active}
                      assigned={!!a}
                      resting={resting(t.id)}
                      overdue={overdue(t.id)}
                    />
                    {a && (
                      <small
                        className={`assignment-deadline ${overdue(t.id) ? "overdue" : ""}`}
                      >
                        Cierre hasta{" "}
                        {displayDate(assignmentDeadline(a.assigned_at))}
                      </small>
                    )}
                    {!a && resting(t.id) && (
                      <small className="assignment-deadline">
                        Desde {displayDate(nextFor(t.id))}
                      </small>
                    )}
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
                    <div className="territory-row-actions">
                      {!a && t.active && canAssign && (
                        <button
                          className="quick-assign"
                          aria-label={`Asignar territorio ${t.territory_number}`}
                          onClick={() =>
                            openAction({ kind: "assign", territory: t })
                          }
                        >
                          <Plus size={13} />
                          Asignar
                        </button>
                      )}
                      {a && canCorrect && (
                        <button
                          className="quick-edit"
                          aria-label={`Editar inicio del territorio ${t.territory_number}`}
                          onClick={() =>
                            openAction({
                              kind: "correct",
                              territory: t,
                              assignment: a,
                            })
                          }
                        >
                          <Pencil size={13} />
                          Editar inicio
                        </button>
                      )}
                      {a && canVoid && (
                        <button
                          className="quick-void"
                          aria-label={`Eliminar inicio del territorio ${t.territory_number}`}
                          onClick={() =>
                            openAction({
                              kind: "void",
                              territory: t,
                              assignment: a,
                            })
                          }
                        >
                          <Trash2 size={13} />
                          Eliminar inicio
                        </button>
                      )}
                      <button
                        className="row-action"
                        aria-label={`Ver territorio ${t.territory_number}`}
                        onClick={() => setDetail(t.id)}
                      >
                        Ver detalle
                        <ChevronRight size={15} />
                      </button>
                    </div>
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
          {!selected && view === "overview" && eligibleVisits > 0 && (
            <div className="visit-alert" role="status">
              <Clock3 size={20} />
              <div>
                <strong>
                  {eligibleVisits}{" "}
                  {eligibleVisits === 1
                    ? "domicilio cumplió"
                    : "domicilios cumplieron"}{" "}
                  el año sin visitas.
                </strong>
                <p>Revisa la fecha desde la que puede visitarse cada casa.</p>
              </div>
              {canViewVisits && (
                <button
                  className="text-button"
                  onClick={() => openVisits("", true)}
                >
                  Revisar avisos
                </button>
              )}
            </div>
          )}
          {!selected && view === "overview" && overdueCount > 0 && (
            <div className="timing-overdue-alert" role="status">
              <strong>
                {overdueCount}{" "}
                {overdueCount === 1
                  ? "asignación superó"
                  : "asignaciones superaron"}{" "}
                el plazo de 3 meses.
              </strong>{" "}
              Revisa la fecha real de finalización. El cierre fuera de plazo
              requiere autorización y motivo.
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
                  resting={resting(selected.id)}
                  overdue={overdue(selected.id)}
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
                  <div className="territory-timing-info">
                    {openFor(selected.id) ? (
                      <>
                        Fecha límite de cierre:{" "}
                        <b>
                          {displayDate(
                            assignmentDeadline(
                              openFor(selected.id)!.assigned_at,
                            ),
                          )}
                        </b>{" "}
                        · 3 meses calendario.
                      </>
                    ) : nextFor(selected.id) ? (
                      <>
                        Primer inicio permitido:{" "}
                        <b>{displayDate(nextFor(selected.id))}</b> · 14 días
                        desde la finalización anterior.
                      </>
                    ) : (
                      <>
                        Espera entre asignaciones: 14 días. Plazo máximo por
                        asignación: 3 meses calendario.
                      </>
                    )}
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
                            {!a.completed_at && (
                              <small
                                className={`assignment-deadline ${assignmentDeadline(a.assigned_at) < today ? "overdue" : ""}`}
                              >
                                Fecha límite de cierre:{" "}
                                {displayDate(assignmentDeadline(a.assigned_at))}
                              </small>
                            )}
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
                          <div className="timeline-actions">
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
                            {canVoid && (
                              <button
                                className="text-button void-link"
                                onClick={() =>
                                  openAction({
                                    kind: "void",
                                    territory: selected,
                                    assignment: a,
                                  })
                                }
                              >
                                Anular
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <aside className="territory-side">
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
                    {selectedObservations.length ? (
                      selectedObservations.map((o) => (
                        <article key={o.id}>
                          {(o.kind === "timing_exception" ||
                            o.kind === "schedule_exception") && (
                            <span className="observation-exception-label">
                              {o.kind === "schedule_exception"
                                ? "Excepción de cronograma"
                                : "Excepción autorizada de plazos"}
                            </span>
                          )}
                          <p className="observation-body">{o.body}</p>
                          <small>
                            {new Date(o.created_at).toLocaleDateString(
                              "es-PE",
                              {
                                timeZone: "America/Lima",
                              },
                            )}
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
                  <TerritoryVisitNotice
                    rows={visitRows}
                    summary={visitCounts.find(
                      (r) => r.territory_id === selected.id,
                    )}
                    territoryId={selected.id}
                    today={today}
                    canView={canViewVisits}
                    onManage={
                      canViewVisits ? () => openVisits(selected.id) : undefined
                    }
                  />
                </aside>
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
                        {availableTerritories}
                        <i className="stat-dot" />
                      </strong>
                      <small>
                        Listos para una nueva asignación · {restingCount} en
                        descanso
                      </small>
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
                      <TerritoryCoverage
                        options={coverageOptions}
                        onChange={setCoverageOptions}
                        today={today}
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
                    <TerritoryCoverage
                      options={coverageOptions}
                      onChange={setCoverageOptions}
                      today={today}
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
              {view === "preaching-schedule" &&
                can(profile, "schedules.view") && (
                  <PreachingSchedulePanel
                    profile={profile}
                    snapshot={snapshot}
                    demo={demo}
                    today={today}
                    demoWeeks={demoPreachingWeeks}
                    onDemoSave={(week, context) => {
                      setDemoPreachingWeeks((prev) => ({
                        ...prev,
                        [week.week_start]: week,
                      }));
                      const notes = week.rows.flatMap((row) =>
                        row.territories.flatMap((t) => {
                          const status = territoryPlanStatus(
                            context.assignments,
                            t.territory_id,
                            new Date(
                              new Date(
                                `${week.week_start}T12:00:00Z`,
                              ).getTime() +
                                row.day * 86400000,
                            )
                              .toISOString()
                              .slice(0, 10),
                          );
                          return status.kind === "rest"
                            ? [
                                {
                                  id: crypto.randomUUID(),
                                  territory_id: t.territory_id,
                                  kind: "schedule_exception",
                                  schedule_id: week.id,
                                  schedule_entry_id: row.id,
                                  body: scheduleExceptionBody(
                                    week.week_start,
                                    row,
                                    t,
                                    status,
                                  ),
                                  created_at: new Date().toISOString(),
                                },
                              ]
                            : [];
                        }),
                      );
                      setDemoObservations((prev) => [
                        ...notes.filter(
                          (n) =>
                            !prev.some(
                              (o) =>
                                o.body === n.body &&
                                o.territory_id === n.territory_id &&
                                o.schedule_id === n.schedule_id &&
                                o.schedule_entry_id === n.schedule_entry_id,
                            ),
                        ),
                        ...prev,
                      ]);
                    }}
                    onTerritory={(id) => {
                      navigate("territories");
                      setDetail(id);
                    }}
                    onSaved={refresh}
                  />
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
              {view === "visit-restrictions" && canViewVisits && (
                <VisitRestrictionsPanel
                  key={visitFilter.key}
                  rows={visitRows}
                  territories={
                    snapshot.visit_territories ?? snapshot.territories
                  }
                  profile={profile}
                  today={today}
                  demo={demo}
                  onChanged={refresh}
                  initialTerritory={visitFilter.territory}
                  onlyEligible={visitFilter.eligible}
                  onTerritory={(id) => {
                    navigate("territories");
                    setDetail(id);
                  }}
                  onDemoChange={(visit_restrictions) =>
                    setSnapshot((current) => ({
                      ...current,
                      visit_restrictions,
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
          conductors={snapshot.conductors ?? []}
          timingHistory={snapshot.assignments.filter(
            (a) => a.territory_id === action.territory.id,
          )}
          canOverrideTiming={can(profile, TIMING_OVERRIDE_PERMISSION)}
          visitRows={visitRows}
          visitCounts={visitCounts}
          canViewVisits={canViewVisits}
          today={today}
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
function Status({
  assigned,
  active,
  resting = false,
  overdue = false,
}: {
  assigned: boolean;
  active: boolean;
  resting?: boolean;
  overdue?: boolean;
}) {
  const state = !active
    ? "inactive"
    : overdue
      ? "overdue"
      : assigned
        ? "assigned"
        : resting
          ? "resting"
          : "available";
  return (
    <span className={`status ${state}`}>
      <i />
      {!active
        ? "Inactivo"
        : overdue
          ? "Plazo vencido"
          : assigned
            ? "Asignado"
            : resting
              ? "En descanso"
              : "Disponible"}
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
        <option value="resting">En descanso (14 días)</option>
        <option value="overdue">Plazo de 3 meses vencido</option>
        <option value="available">Disponibles</option>
        <option value="inactive">Inactivos</option>
      </select>
    </div>
  );
}
function ActionModal({
  action,
  busy,
  message,
  onClose,
  onSave,
  names,
  conductors,
  timingHistory,
  canOverrideTiming,
  visitRows,
  visitCounts,
  canViewVisits,
  today,
}: {
  timingHistory: Assignment[];
  canOverrideTiming: boolean;
  visitRows: VisitRestriction[];
  visitCounts: VisitRestrictionSummary[];
  canViewVisits: boolean;
  today: string;
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
    [body, setBody] = useState("");
  const voided = action.kind === "void";
  useEffect(() => {
    if (personId) {
      const selected = conductors.find((c) => c.person_id === personId);
      if (selected) setName(selected.display_name);
    }
  }, [personId, conductors]);
  const datesChanged =
    a && (date !== a.assigned_at || (completed || null) !== a.completed_at);
  const timingIssues =
    action.kind === "assign"
      ? assignmentTimingIssues(timingHistory, date, null, undefined, today)
      : action.kind === "complete"
        ? completed
          ? assignmentTimingIssues(
              [],
              a!.assigned_at,
              completed,
              undefined,
              today,
            )
          : []
        : action.kind === "correct" && !voided && datesChanged
          ? assignmentTimingIssues(
              timingHistory,
              date,
              completed || null,
              a!.id,
              today,
              date !== a!.assigned_at,
            )
          : [];
  const timingBlocked =
    timingIssues.length > 0 &&
    (!canOverrideTiming || !validTimingReason(reason));
  const previous = timingHistory
    .filter((row) => !row.voided_at)
    .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
  const chronologyBlocked =
    action.kind === "assign" &&
    !!previous?.completed_at &&
    date <= previous.completed_at;
  const titles = {
    assign: "Asignar territorio",
    complete: "Marcar como completado",
    correct: a?.completed_at
      ? "Corrección administrativa"
      : "Editar inicio de asignación",
    void: a?.completed_at ? "Anular registro" : "Eliminar inicio de asignación",
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
          const fields = new FormData(e.currentTarget);
          void onSave({
            name,
            personId,
            date: String(fields.get("assigned_at") ?? date),
            completed: String(fields.get("completed_at") ?? completed),
            reason: String(fields.get("reason") ?? reason),
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
        ) : voided ? (
          <>
            <div className="void-summary">
              <strong>{a!.assigned_name_snapshot}</strong>
              <p>
                Fecha de Inicio: {displayDate(a!.assigned_at)}
                {a!.completed_at && (
                  <> · Finalización: {displayDate(a!.completed_at)}</>
                )}
              </p>
              <p>
                Se anulará esta asignación. El territorio y sus otros registros
                se conservan; el cambio y su motivo quedan en auditoría.
              </p>
            </div>
            <label>
              Motivo de la anulación
              <textarea
                name="reason"
                rows={3}
                required
                minLength={8}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica por qué se elimina este inicio o registro"
              />
            </label>
          </>
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
                    name="assigned_at"
                    required
                    max={today}
                    value={date}
                    onInput={(e) => setDate(e.currentTarget.value)}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </>
            )}

            {action.kind !== "assign" && (
              <label>
                Fecha de finalización
                <input
                  type="date"
                  name="completed_at"
                  required={action.kind === "complete"}
                  min={date}
                  max={todayLima()}
                  value={completed}
                  onInput={(e) => setCompleted(e.currentTarget.value)}
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
                    name="reason"
                    minLength={8}
                    maxLength={2000}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explica qué se corrige y por qué"
                  />
                </label>
              </>
            )}
          </>
        )}
        {action.kind !== "observe" && !voided && (
          <AssignmentTimingNotice
            history={timingHistory}
            start={action.kind === "complete" ? a!.assigned_at : date}
            issues={timingIssues}
            allowed={canOverrideTiming}
            assigning={action.kind === "assign"}
          />
        )}
        {(action.kind === "assign" || action.kind === "complete") &&
          timingIssues.length > 0 &&
          canOverrideTiming && (
            <label>
              Motivo de la excepción
              <textarea
                name="reason"
                rows={3}
                required
                minLength={8}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explica por qué se inicia antes de los 14 días o se supera el plazo de 3 meses"
              />
            </label>
          )}
        {action.kind === "assign" && (
          <TerritoryVisitNotice
            compact
            rows={visitRows}
            summary={visitCounts.find(
              (r) => r.territory_id === action.territory.id,
            )}
            territoryId={action.territory.id}
            today={today}
            canView={canViewVisits}
          />
        )}
        {chronologyBlocked && (
          <p className="error" role="alert">
            El inicio debe ser posterior a la finalización anterior. Los
            solapamientos y el inicio el mismo día del cierre no admiten
            excepción.
          </p>
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
              chronologyBlocked ||
              timingBlocked ||
              ((action.kind === "correct" || voided) &&
                !validTimingReason(reason)) ||
              (action.kind === "assign" &&
                !conductors.some(
                  (c) => c.person_id === personId && c.active && !c.deleted_at,
                ))
            }
          >
            {busy
              ? "Guardando…"
              : voided
                ? "Confirmar anulación"
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
