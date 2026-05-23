export type DepartmentLevel =
  | "CHN"
  | "CHR"
  | "EPS1"
  | "EPS2"
  | "Centre de sante"
  | "Poste de sante";

export type EmployeeStatus = "actif" | "suspendu" | "archive";

export type ShiftType = "Matin" | "Apres-midi" | "Nuit" | "Garde 24h" | "Astreinte";

export type AttendanceStatus =
  | "present"
  | "retard"
  | "garde"
  | "astreinte"
  | "absence"
  | "repos"
  | "conge"
  | "mission";

export interface Department {
  id: number;
  name: string;
  level: DepartmentLevel;
  region: string;
  district: string;
  head: string;
}

export interface Employee {
  id: number;
  matricule: string;
  firstName: string;
  lastName: string;
  role: string;
  grade: string;
  departmentId: number;
  departmentName: string;
  phone: string;
  workRegime: string;
  status: EmployeeStatus;
  createdAt: string;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  matricule: string;
  role: string;
  departmentName: string;
  serviceDate: string;
  shift: ShiftType;
  expectedStart: string;
  expectedEnd: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  notes: string | null;
  createdAt: string;
}

export interface DashboardStats {
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  onDuty: number;
  absenceEstimate: number;
  coverageRate: number;
}

export interface DepartmentCoverage {
  departmentId: number;
  departmentName: string;
  region: string;
  district: string;
  activeEmployees: number;
  presentToday: number;
  onDuty: number;
  lateToday: number;
}

export interface DashboardSnapshot {
  today: string;
  databasePath: string;
  departments: Department[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  todayAttendance: AttendanceRecord[];
  activeAttendance: AttendanceRecord[];
  stats: DashboardStats;
  coverage: DepartmentCoverage[];
}

export interface NewEmployeeInput {
  matricule: string;
  firstName: string;
  lastName: string;
  role: string;
  grade: string;
  departmentId: number;
  phone: string;
  workRegime: string;
}

export interface ClockInInput {
  employeeId: number;
  shift: ShiftType;
  notes?: string;
}

export interface HospitalApi {
  getSnapshot(): Promise<DashboardSnapshot>;
  clockIn(input: ClockInInput): Promise<DashboardSnapshot>;
  clockOut(attendanceId: number): Promise<DashboardSnapshot>;
  addEmployee(input: NewEmployeeInput): Promise<DashboardSnapshot>;
  updateEmployeeStatus(employeeId: number, status: EmployeeStatus): Promise<DashboardSnapshot>;
}

export const SHIFT_RULES: Record<ShiftType, { start: string; end: string; status?: AttendanceStatus }> = {
  Matin: { start: "08:00", end: "14:00" },
  "Apres-midi": { start: "14:00", end: "20:00" },
  Nuit: { start: "20:00", end: "08:00", status: "garde" },
  "Garde 24h": { start: "08:00", end: "08:00", status: "garde" },
  Astreinte: { start: "18:00", end: "08:00", status: "astreinte" }
};

export const SENEGAL_REGIONS = [
  "Dakar",
  "Thies",
  "Saint-Louis",
  "Diourbel",
  "Kaolack",
  "Kolda",
  "Ziguinchor",
  "Tambacounda",
  "Louga",
  "Fatick",
  "Matam",
  "Kaffrine",
  "Kedougou",
  "Sedhiou"
] as const;
