import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  HeartPulse,
  Hospital,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  TimerReset,
  UsersRound,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import {
  AttendanceRecord,
  DashboardSnapshot,
  Employee,
  NewEmployeeInput,
  SHIFT_RULES,
  ShiftType
} from "../shared/types";

type TabKey = "dashboard" | "pointage" | "agents" | "rapports";

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "dashboard", label: "Pilotage", icon: <Activity className="h-4 w-4" /> },
  { key: "pointage", label: "Pointage", icon: <Clock3 className="h-4 w-4" /> },
  { key: "agents", label: "Agents", icon: <UsersRound className="h-4 w-4" /> },
  { key: "rapports", label: "Rapports", icon: <FileSpreadsheet className="h-4 w-4" /> }
];

const initialEmployeeForm: NewEmployeeInput = {
  matricule: "",
  firstName: "",
  lastName: "",
  role: "",
  grade: "",
  departmentId: 0,
  phone: "",
  workRegime: "Journee continue"
};

function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [clockForm, setClockForm] = useState<{ employeeId: number; shift: ShiftType; notes: string }>({
    employeeId: 0,
    shift: "Matin",
    notes: ""
  });
  const [employeeForm, setEmployeeForm] = useState<NewEmployeeInput>(initialEmployeeForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!window.hospitalApi) {
      setMessage({ type: "error", text: "L'API hospitaliere n'est pas disponible. Lancez l'application via Electron (npm run dev) et non directement dans un navigateur." });
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setSnapshot(await window.hospitalApi.getSnapshot());
    } catch (error) {
      setMessage({ type: "error", text: errorToMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot || clockForm.employeeId) {
      return;
    }
    const firstActive = snapshot.employees.find((employee) => employee.status === "actif");
    if (firstActive) {
      setClockForm((current) => ({ ...current, employeeId: firstActive.id }));
    }
  }, [clockForm.employeeId, snapshot]);

  const filteredEmployees = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = employeeSearch.trim().toLowerCase();
    return snapshot.employees.filter((employee) => {
      const haystack = `${employee.matricule} ${employee.firstName} ${employee.lastName} ${employee.role} ${employee.departmentName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [employeeSearch, snapshot]);

  const monthlyRecords = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.attendance.filter((record) => record.serviceDate.startsWith(reportMonth));
  }, [reportMonth, snapshot]);

  const reportRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.employees.map((employee) => {
      const records = monthlyRecords.filter((record) => record.employeeId === employee.id);
      return {
        employee,
        present: records.filter((record) => ["present", "garde", "astreinte"].includes(record.status)).length,
        late: records.filter((record) => record.status === "retard").length,
        onDuty: records.filter((record) => record.checkIn && !record.checkOut).length,
        total: records.length
      };
    });
  }, [monthlyRecords, snapshot]);

  async function runAction(action: () => Promise<DashboardSnapshot>, successText: string) {
    if (!window.hospitalApi) {
      setMessage({ type: "error", text: "L'API hospitaliere n'est pas disponible. Lancez l'application via Electron (npm run dev)." });
      return;
    }
    try {
      setBusy(true);
      setMessage(null);
      setSnapshot(await action());
      setMessage({ type: "success", text: successText });
    } catch (error) {
      setMessage({ type: "error", text: errorToMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function handleClockIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clockForm.employeeId) {
      setMessage({ type: "error", text: "Selectionnez un agent avant de pointer." });
      return;
    }
    runAction(
      () =>
        window.hospitalApi.clockIn({
          employeeId: clockForm.employeeId,
          shift: clockForm.shift,
          notes: clockForm.notes
        }),
      "Entree en service enregistree."
    );
    setClockForm((current) => ({ ...current, notes: "" }));
  }

  function handleEmployeeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runAction(() => window.hospitalApi.addEmployee(employeeForm), "Agent ajoute au registre.");
    setEmployeeForm(initialEmployeeForm);
  }

  function exportCsv() {
    const header = ["Matricule", "Agent", "Service", "Presence", "Retards", "Gardes ouvertes", "Pointages"];
    const rows = reportRows.map(({ employee, present, late, onDuty, total }) => [
      employee.matricule,
      `${employee.firstName} ${employee.lastName}`,
      employee.departmentName,
      present,
      late,
      onDuty,
      total
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rapport-pointage-${reportMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-3xl px-10 py-8 text-center">
          <HeartPulse className="mx-auto h-12 w-12 animate-pulse text-hospital-600" />
          <p className="mt-4 text-lg font-semibold text-slate-800">Initialisation du registre de pointage...</p>
          <p className="mt-2 text-sm text-slate-500">Chargement de sql.js et des donnees embarquees.</p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-panel max-w-xl rounded-3xl px-10 py-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-lg font-semibold text-slate-800">Impossible de charger l'application.</p>
          <p className="mt-2 text-sm text-slate-500">{message?.text}</p>
          <button className="mt-6 rounded-2xl bg-hospital-600 px-5 py-3 font-semibold text-white" onClick={loadSnapshot}>
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  const activeEmployees = snapshot.employees.filter((employee) => employee.status === "actif");

  return (
    <div className="min-h-screen p-5 text-slate-900">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[280px_1fr] gap-5">
        <aside className="glass-panel sticky top-5 h-[calc(100vh-2.5rem)] rounded-[2rem] p-5">
          <div className="flex items-center gap-3 rounded-3xl bg-midnight-900 p-4 text-white">
            <div className="rounded-2xl bg-hospital-500 p-3">
              <Hospital className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-hospital-100">Ministere de la Sante</p>
              <h1 className="text-xl font-black leading-tight">Pointage Hopital</h1>
            </div>
          </div>

          <nav className="mt-7 space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                  activeTab === tab.key
                    ? "bg-hospital-600 text-white shadow-lg shadow-hospital-600/20"
                    : "text-slate-600 hover:bg-white hover:text-slate-950"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-3xl bg-white/75 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ShieldCheck className="h-4 w-4 text-hospital-600" />
              Cadre sanitaire SN
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Registre adapte aux EPS, CHN, CHR, centres et postes de sante avec suivi par region medicale et
              district sanitaire.
            </p>
          </div>

          <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-hospital-100" />
              Base embarquee sql.js
            </div>
            <p className="mt-2 break-all text-xs leading-5 text-slate-300">{snapshot.databasePath}</p>
          </div>
        </aside>

        <main className="space-y-5">
          <header className="glass-panel rounded-[2rem] p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.25em] text-hospital-700">
                  <span className="status-dot bg-emerald-500" />
                  Region medicale de reference
                </div>
                <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                  Supervision du pointage hospitalier
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                  Tableau de bord centralise pour les gardes, astreintes, retards et disponibilites des personnels de
                  sante, selon l'organisation sanitaire senegalaise.
                </p>
              </div>
              <div className="rounded-3xl bg-white px-5 py-4 text-right shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Date de service</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{formatDate(snapshot.today)}</p>
              </div>
            </div>

            {message && (
              <div
                className={`mt-5 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {message.text}
              </div>
            )}
          </header>

          {activeTab === "dashboard" && (
            <DashboardView snapshot={snapshot} recentRecords={snapshot.todayAttendance.slice(0, 6)} />
          )}

          {activeTab === "pointage" && (
            <PointageView
              activeEmployees={activeEmployees}
              busy={busy}
              clockForm={clockForm}
              setClockForm={setClockForm}
              snapshot={snapshot}
              onClockIn={handleClockIn}
              onClockOut={(attendanceId) =>
                runAction(() => window.hospitalApi.clockOut(attendanceId), "Sortie de service enregistree.")
              }
            />
          )}

          {activeTab === "agents" && (
            <AgentsView
              busy={busy}
              employeeForm={employeeForm}
              employeeSearch={employeeSearch}
              filteredEmployees={filteredEmployees}
              setEmployeeForm={setEmployeeForm}
              setEmployeeSearch={setEmployeeSearch}
              snapshot={snapshot}
              onSubmit={handleEmployeeSubmit}
              onArchive={(employee) =>
                runAction(
                  () => window.hospitalApi.updateEmployeeStatus(employee.id, employee.status === "actif" ? "archive" : "actif"),
                  employee.status === "actif" ? "Agent archive." : "Agent reactive."
                )
              }
            />
          )}

          {activeTab === "rapports" && (
            <ReportsView
              month={reportMonth}
              monthlyRecords={monthlyRecords}
              reportRows={reportRows}
              setMonth={setReportMonth}
              onExport={exportCsv}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardView({ snapshot, recentRecords }: { snapshot: DashboardSnapshot; recentRecords: AttendanceRecord[] }) {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-5 gap-4">
        <StatCard icon={<UsersRound />} label="Agents actifs" value={snapshot.stats.activeEmployees} tone="slate" />
        <StatCard icon={<CheckCircle2 />} label="Presents aujourd'hui" value={snapshot.stats.presentToday} tone="emerald" />
        <StatCard icon={<TimerReset />} label="Retards" value={snapshot.stats.lateToday} tone="amber" />
        <StatCard icon={<Stethoscope />} label="En service" value={snapshot.stats.onDuty} tone="cyan" />
        <StatCard icon={<Activity />} label="Couverture" value={`${snapshot.stats.coverageRate}%`} tone="green" />
      </section>

      <section className="grid grid-cols-[1.25fr_0.75fr] gap-5">
        <div className="soft-card rounded-[2rem] p-6">
          <SectionTitle
            icon={<MapPin className="h-5 w-5" />}
            title="Couverture par district sanitaire"
            subtitle="Lecture operationnelle des effectifs presents par service."
          />
          <div className="mt-5 space-y-4">
            {snapshot.coverage.map((department) => {
              const rate =
                department.activeEmployees === 0
                  ? 0
                  : Math.round((department.presentToday / department.activeEmployees) * 100);
              return (
                <div key={department.departmentId} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-slate-900">{department.departmentName}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {department.region} - District {department.district}
                      </p>
                    </div>
                    <Badge tone={rate >= 70 ? "green" : rate >= 40 ? "amber" : "rose"}>{rate}%</Badge>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-white">
                    <div className="h-2 rounded-full bg-hospital-500" style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
                    <Metric label="Effectif" value={department.activeEmployees} />
                    <Metric label="Presents" value={department.presentToday} />
                    <Metric label="Garde" value={department.onDuty} />
                    <Metric label="Retards" value={department.lateToday} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="soft-card rounded-[2rem] p-6">
          <SectionTitle
            icon={<ClipboardList className="h-5 w-5" />}
            title="Flux du jour"
            subtitle="Derniers mouvements d'entree et sortie."
          />
          <div className="mt-5 space-y-3">
            {recentRecords.map((record) => (
              <div key={record.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">{record.employeeName}</p>
                    <p className="mt-1 text-sm text-slate-500">{record.departmentName}</p>
                  </div>
                  <StatusBadge status={record.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
                  <span>Entree: {formatTime(record.checkIn)}</span>
                  <span>Sortie: {formatTime(record.checkOut)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function PointageView({
  activeEmployees,
  busy,
  clockForm,
  setClockForm,
  snapshot,
  onClockIn,
  onClockOut
}: {
  activeEmployees: Employee[];
  busy: boolean;
  clockForm: { employeeId: number; shift: ShiftType; notes: string };
  setClockForm: Dispatch<SetStateAction<{ employeeId: number; shift: ShiftType; notes: string }>>;
  snapshot: DashboardSnapshot;
  onClockIn: (event: FormEvent<HTMLFormElement>) => void;
  onClockOut: (attendanceId: number) => void;
}) {
  return (
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-5">
      <form className="soft-card rounded-[2rem] p-6" onSubmit={onClockIn}>
        <SectionTitle
          icon={<CalendarClock className="h-5 w-5" />}
          title="Nouveau pointage"
          subtitle="Enregistrer une entree de service ou de garde."
        />

        <div className="mt-6 space-y-4">
          <FieldLabel label="Agent">
            <select
              className="input"
              value={clockForm.employeeId || ""}
              onChange={(event) => setClockForm((current) => ({ ...current, employeeId: Number(event.target.value) }))}
            >
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.matricule} - {employee.firstName} {employee.lastName} ({employee.departmentName})
                </option>
              ))}
            </select>
          </FieldLabel>

          <FieldLabel label="Vacation">
            <select
              className="input"
              value={clockForm.shift}
              onChange={(event) => setClockForm((current) => ({ ...current, shift: event.target.value as ShiftType }))}
            >
              {Object.keys(SHIFT_RULES).map((shift) => (
                <option key={shift} value={shift}>
                  {shift} - {SHIFT_RULES[shift as ShiftType].start}/{SHIFT_RULES[shift as ShiftType].end}
                </option>
              ))}
            </select>
          </FieldLabel>

          <FieldLabel label="Observation">
            <textarea
              className="input min-h-28 resize-none"
              placeholder="Ex: renfort urgences, garde obstetricale, astreinte district..."
              value={clockForm.notes}
              onChange={(event) => setClockForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </FieldLabel>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-hospital-600 px-5 py-4 font-black text-white shadow-xl shadow-hospital-600/20 transition hover:bg-hospital-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            <Clock3 className="h-5 w-5" />
            Pointer l'entree
          </button>
        </div>
      </form>

      <div className="soft-card rounded-[2rem] p-6">
        <SectionTitle
          icon={<LogOut className="h-5 w-5" />}
          title="Agents actuellement en service"
          subtitle="Cloturer la sortie lorsque la vacation est terminee."
        />
        <div className="mt-6 space-y-3">
          {snapshot.activeAttendance.length === 0 && (
            <EmptyState text="Aucun pointage ouvert pour cette date de service." />
          )}
          {snapshot.activeAttendance.map((record) => (
            <div key={record.id} className="rounded-3xl border border-slate-100 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-slate-950">{record.employeeName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {record.role} - {record.departmentName}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="blue">{record.shift}</Badge>
                    <Badge tone="green">Entree {formatTime(record.checkIn)}</Badge>
                    <StatusBadge status={record.status} />
                  </div>
                </div>
                <button
                  onClick={() => onClockOut(record.id)}
                  disabled={busy}
                  className="rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Pointer sortie
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentsView({
  busy,
  employeeForm,
  employeeSearch,
  filteredEmployees,
  setEmployeeForm,
  setEmployeeSearch,
  snapshot,
  onSubmit,
  onArchive
}: {
  busy: boolean;
  employeeForm: NewEmployeeInput;
  employeeSearch: string;
  filteredEmployees: Employee[];
  setEmployeeForm: Dispatch<SetStateAction<NewEmployeeInput>>;
  setEmployeeSearch: Dispatch<SetStateAction<string>>;
  snapshot: DashboardSnapshot;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (employee: Employee) => void;
}) {
  return (
    <div className="grid grid-cols-[0.8fr_1.2fr] gap-5">
      <form className="soft-card rounded-[2rem] p-6" onSubmit={onSubmit}>
        <SectionTitle
          icon={<Plus className="h-5 w-5" />}
          title="Ajouter un agent"
          subtitle="Registre RH compatible avec les services hospitaliers."
        />
        <div className="mt-6 grid grid-cols-2 gap-4">
          <FieldLabel label="Matricule">
            <input
              className="input"
              placeholder="MSAS-009"
              value={employeeForm.matricule}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, matricule: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Telephone">
            <input
              className="input"
              placeholder="+221 ..."
              value={employeeForm.phone}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Prenom">
            <input
              className="input"
              value={employeeForm.firstName}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Nom">
            <input
              className="input"
              value={employeeForm.lastName}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Fonction">
            <input
              className="input"
              placeholder="Infirmier d'Etat"
              value={employeeForm.role}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Grade">
            <input
              className="input"
              placeholder="Technicien superieur"
              value={employeeForm.grade}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, grade: event.target.value }))}
            />
          </FieldLabel>
          <FieldLabel label="Service">
            <select
              className="input"
              value={employeeForm.departmentId || ""}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, departmentId: Number(event.target.value) }))}
            >
              <option value="">Choisir...</option>
              {snapshot.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Regime">
            <input
              className="input"
              value={employeeForm.workRegime}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, workRegime: event.target.value }))}
            />
          </FieldLabel>
        </div>
        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-hospital-600 px-5 py-4 font-black text-white shadow-xl shadow-hospital-600/20 disabled:opacity-60"
          disabled={busy}
        >
          <Plus className="h-5 w-5" />
          Enregistrer l'agent
        </button>
      </form>

      <div className="soft-card rounded-[2rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <SectionTitle
            icon={<UsersRound className="h-5 w-5" />}
            title="Repertoire des personnels"
            subtitle={`${filteredEmployees.length} agent(s) affiches`}
          />
          <div className="relative w-80">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-11"
              placeholder="Rechercher matricule, service..."
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-950">
                      {employee.firstName} {employee.lastName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {employee.matricule} - {employee.role}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{employee.departmentName}</td>
                  <td className="px-4 py-4 text-slate-600">{employee.workRegime}</td>
                  <td className="px-4 py-4">
                    <Badge tone={employee.status === "actif" ? "green" : "slate"}>{employee.status}</Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-slate-700" onClick={() => onArchive(employee)}>
                      {employee.status === "actif" ? "Archiver" : "Reactiver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReportsView({
  month,
  monthlyRecords,
  reportRows,
  setMonth,
  onExport
}: {
  month: string;
  monthlyRecords: AttendanceRecord[];
  reportRows: Array<{ employee: Employee; present: number; late: number; onDuty: number; total: number }>;
  setMonth: (month: string) => void;
  onExport: () => void;
}) {
  const totals = {
    records: monthlyRecords.length,
    late: monthlyRecords.filter((record) => record.status === "retard").length,
    guards: monthlyRecords.filter((record) => ["garde", "astreinte"].includes(record.status)).length
  };

  return (
    <div className="space-y-5">
      <div className="soft-card rounded-[2rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <SectionTitle
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="Rapport mensuel de presence"
            subtitle="Synthese exportable pour direction RH, surveillants de service et districts."
          />
          <div className="flex items-center gap-3">
            <input className="input w-48" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            <button
              className="flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white"
              onClick={onExport}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatCard icon={<ClipboardList />} label="Pointages" value={totals.records} tone="slate" />
          <StatCard icon={<TimerReset />} label="Retards" value={totals.late} tone="amber" />
          <StatCard icon={<Stethoscope />} label="Gardes/Astreintes" value={totals.guards} tone="cyan" />
        </div>
      </div>

      <div className="soft-card rounded-[2rem] p-6">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Presences</th>
                <th className="px-4 py-3">Retards</th>
                <th className="px-4 py-3">Gardes ouvertes</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportRows.map(({ employee, present, late, onDuty, total }) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-950">
                      {employee.firstName} {employee.lastName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{employee.matricule}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{employee.departmentName}</td>
                  <td className="px-4 py-4 font-bold text-emerald-700">{present}</td>
                  <td className="px-4 py-4 font-bold text-amber-700">{late}</td>
                  <td className="px-4 py-4 font-bold text-cyan-700">{onDuty}</td>
                  <td className="px-4 py-4 font-bold text-slate-900">{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone: "slate" | "emerald" | "amber" | "cyan" | "green";
}) {
  const tones = {
    slate: "bg-slate-950 text-white",
    emerald: "bg-emerald-600 text-white",
    amber: "bg-amber-500 text-white",
    cyan: "bg-cyan-600 text-white",
    green: "bg-hospital-600 text-white"
  };

  return (
    <div className="soft-card rounded-[2rem] p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div>
      <p className="mt-5 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-hospital-50 p-3 text-hospital-700">{icon}</div>
      <div>
        <h3 className="text-xl font-black text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "rose" | "blue" | "slate" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    blue: "bg-sky-50 text-sky-700",
    slate: "bg-slate-100 text-slate-700"
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tones[tone]}`}>{children}</span>;
}

function StatusBadge({ status }: { status: AttendanceRecord["status"] }) {
  const tone = status === "retard" ? "amber" : status === "absence" ? "rose" : status === "present" ? "green" : "blue";
  return <Badge tone={tone}>{status}</Badge>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">{text}</div>;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-SN", { dateStyle: "full" }).format(new Date(`${date}T00:00:00`));
}

function formatTime(value: string | null) {
  if (!value) {
    return "--:--";
  }
  return value.slice(11, 16);
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}

export default App;
