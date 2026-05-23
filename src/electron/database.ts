import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import initSqlJs = require("sql.js");
import {
  AttendanceRecord,
  ClockInInput,
  DashboardSnapshot,
  Department,
  DepartmentCoverage,
  Employee,
  EmployeeStatus,
  NewEmployeeInput,
  SHIFT_RULES
} from "../shared/types";

type SqlDatabase = initSqlJs.Database;
type SqlJsStatic = initSqlJs.SqlJsStatic;
type SqlValue = initSqlJs.SqlValue;
type SqlParams = initSqlJs.BindParams;

type SqlRow = Record<string, SqlValue>;

const DB_FILE_NAME = "pointage-hopital-senegal.sqlite";
const LATE_THRESHOLD_MINUTES = 15;

export class HospitalDatabase {
  private SQL: SqlJsStatic | null = null;
  private db: SqlDatabase | null = null;
  private readonly dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath("userData"), DB_FILE_NAME);
  }

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    this.SQL = await initSqlJs({
      locateFile: (file) => this.resolveSqlJsFile(file)
    });

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    if (fs.existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new this.SQL.Database();
    }

    this.migrate();
    this.seedIfEmpty();
    this.persist();
  }

  getSnapshot(): DashboardSnapshot {
    const today = this.todayInDakar();
    const departments = this.query<Department>(
      `SELECT id, name, level, region, district, head
       FROM departments
       ORDER BY region, name`
    );

    const employees = this.query<Employee>(
      `SELECT e.id, e.matricule, e.first_name AS firstName, e.last_name AS lastName,
              e.role, e.grade, e.department_id AS departmentId, d.name AS departmentName,
              e.phone, e.work_regime AS workRegime, e.status, e.created_at AS createdAt
       FROM employees e
       JOIN departments d ON d.id = e.department_id
       ORDER BY e.last_name, e.first_name`
    );

    const attendance = this.fetchAttendance();
    const todayAttendance = attendance.filter((record) => record.serviceDate === today);
    const activeAttendance = todayAttendance.filter((record) => record.checkIn && !record.checkOut);
    const activeEmployees = employees.filter((employee) => employee.status === "actif");
    const presentEmployeeIds = new Set(todayAttendance.filter((record) => record.checkIn).map((record) => record.employeeId));
    const lateToday = todayAttendance.filter((record) => record.status === "retard").length;
    const presentToday = presentEmployeeIds.size;
    const absenceEstimate = Math.max(activeEmployees.length - presentToday, 0);
    const coverageRate = activeEmployees.length === 0 ? 0 : Math.round((presentToday / activeEmployees.length) * 100);

    return {
      today,
      databasePath: this.dbPath,
      departments,
      employees,
      attendance,
      todayAttendance,
      activeAttendance,
      stats: {
        activeEmployees: activeEmployees.length,
        presentToday,
        lateToday,
        onDuty: activeAttendance.length,
        absenceEstimate,
        coverageRate
      },
      coverage: this.buildCoverage(departments, activeEmployees, todayAttendance)
    };
  }

  clockIn(input: ClockInInput): DashboardSnapshot {
    const employee = this.query<Employee>(
      `SELECT e.id, e.matricule, e.first_name AS firstName, e.last_name AS lastName,
              e.role, e.grade, e.department_id AS departmentId, d.name AS departmentName,
              e.phone, e.work_regime AS workRegime, e.status, e.created_at AS createdAt
       FROM employees e
       JOIN departments d ON d.id = e.department_id
       WHERE e.id = :employeeId`,
      { ":employeeId": input.employeeId }
    )[0];

    if (!employee || employee.status !== "actif") {
      throw new Error("Agent introuvable ou inactif.");
    }

    const openRecord = this.query<{ id: number }>(
      `SELECT id
       FROM attendance
       WHERE employee_id = :employeeId AND check_in IS NOT NULL AND check_out IS NULL`,
      { ":employeeId": input.employeeId }
    )[0];

    if (openRecord) {
      throw new Error("Cet agent a deja un pointage ouvert.");
    }

    const now = this.nowInDakar();
    const shiftRule = SHIFT_RULES[input.shift];
    const minutesNow = this.timeToMinutes(now.time);
    const minutesExpected = this.timeToMinutes(shiftRule.start);
    const status =
      shiftRule.status ?? (minutesNow > minutesExpected + LATE_THRESHOLD_MINUTES ? "retard" : "present");

    this.run(
      `INSERT INTO attendance (
        employee_id, service_date, shift, expected_start, expected_end,
        check_in, check_out, status, notes, created_at
      ) VALUES (
        :employeeId, :serviceDate, :shift, :expectedStart, :expectedEnd,
        :checkIn, NULL, :status, :notes, :createdAt
      )`,
      {
        ":employeeId": input.employeeId,
        ":serviceDate": now.date,
        ":shift": input.shift,
        ":expectedStart": shiftRule.start,
        ":expectedEnd": shiftRule.end,
        ":checkIn": now.isoLike,
        ":status": status,
        ":notes": input.notes?.trim() || null,
        ":createdAt": now.isoLike
      }
    );

    this.persist();
    return this.getSnapshot();
  }

  clockOut(attendanceId: number): DashboardSnapshot {
    const record = this.query<{ id: number }>(
      `SELECT id FROM attendance WHERE id = :attendanceId AND check_in IS NOT NULL AND check_out IS NULL`,
      { ":attendanceId": attendanceId }
    )[0];

    if (!record) {
      throw new Error("Aucun pointage ouvert ne correspond a cette sortie.");
    }

    this.run(
      `UPDATE attendance
       SET check_out = :checkOut
       WHERE id = :attendanceId`,
      {
        ":attendanceId": attendanceId,
        ":checkOut": this.nowInDakar().isoLike
      }
    );

    this.persist();
    return this.getSnapshot();
  }

  addEmployee(input: NewEmployeeInput): DashboardSnapshot {
    const matricule = input.matricule.trim().toUpperCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    if (!matricule || !firstName || !lastName || !input.departmentId) {
      throw new Error("Matricule, prenom, nom et service sont obligatoires.");
    }

    const existing = this.query<{ id: number }>("SELECT id FROM employees WHERE matricule = :matricule", {
      ":matricule": matricule
    })[0];

    if (existing) {
      throw new Error("Ce matricule existe deja.");
    }

    this.run(
      `INSERT INTO employees (
        matricule, first_name, last_name, role, grade, department_id,
        phone, work_regime, status, created_at
      ) VALUES (
        :matricule, :firstName, :lastName, :role, :grade, :departmentId,
        :phone, :workRegime, 'actif', :createdAt
      )`,
      {
        ":matricule": matricule,
        ":firstName": firstName,
        ":lastName": lastName,
        ":role": input.role.trim() || "Personnel de sante",
        ":grade": input.grade.trim() || "Agent",
        ":departmentId": input.departmentId,
        ":phone": input.phone.trim(),
        ":workRegime": input.workRegime.trim() || "Journee continue",
        ":createdAt": this.nowInDakar().isoLike
      }
    );

    this.persist();
    return this.getSnapshot();
  }

  updateEmployeeStatus(employeeId: number, status: EmployeeStatus): DashboardSnapshot {
    this.run("UPDATE employees SET status = :status WHERE id = :employeeId", {
      ":employeeId": employeeId,
      ":status": status
    });
    this.persist();
    return this.getSnapshot();
  }

  private migrate(): void {
    this.ensureDb().exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        level TEXT NOT NULL,
        region TEXT NOT NULL,
        district TEXT NOT NULL,
        head TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL,
        grade TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        work_regime TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'actif',
        created_at TEXT NOT NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        service_date TEXT NOT NULL,
        shift TEXT NOT NULL,
        expected_start TEXT NOT NULL,
        expected_end TEXT NOT NULL,
        check_in TEXT,
        check_out TEXT,
        status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_service_date ON attendance(service_date);
      CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, service_date);
      CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
    `);
  }

  private seedIfEmpty(): void {
    const hasDepartments = this.query<{ count: number }>("SELECT COUNT(*) AS count FROM departments")[0]?.count ?? 0;
    if (hasDepartments > 0) {
      return;
    }

    const departments = [
      ["Urgences medico-chirurgicales", "CHN", "Dakar", "Dakar Centre", "Dr Awa Ndiaye"],
      ["Maternite et neonatologie", "EPS2", "Dakar", "Pikine", "Pr Fatou Diop"],
      ["Medecine interne", "CHR", "Thies", "Thies Nord", "Dr Mamadou Fall"],
      ["Pediatrie", "EPS1", "Saint-Louis", "Saint-Louis", "Dr Aminata Sow"],
      ["Bloc operatoire", "CHN", "Dakar", "Dakar Ouest", "Dr Cheikh Gueye"],
      ["Laboratoire et imagerie", "Centre de sante", "Kaolack", "Kaolack Commune", "Mme Marieme Ba"]
    ];

    departments.forEach(([name, level, region, district, head]) => {
      this.run(
        `INSERT INTO departments (name, level, region, district, head)
         VALUES (:name, :level, :region, :district, :head)`,
        { ":name": name, ":level": level, ":region": region, ":district": district, ":head": head }
      );
    });

    const employees = [
      ["MSAS-001", "Aissatou", "Sarr", "Medecin urgentiste", "Medecin specialiste", 1, "+221 77 100 10 01", "Garde 12/24"],
      ["MSAS-002", "Moussa", "Diagne", "Infirmier d'Etat", "Technicien superieur", 1, "+221 78 100 10 02", "Rotation 3x8"],
      ["MSAS-003", "Khady", "Ndao", "Sage-femme", "Sage-femme d'Etat", 2, "+221 76 100 10 03", "Garde 12/24"],
      ["MSAS-004", "Ibrahima", "Ba", "Pediatre", "Medecin specialiste", 4, "+221 77 100 10 04", "Journee continue"],
      ["MSAS-005", "Mame", "Kane", "Aide-soignante", "Agent sanitaire", 3, "+221 78 100 10 05", "Rotation 2x8"],
      ["MSAS-006", "Oumar", "Faye", "Technicien de laboratoire", "Technicien superieur", 6, "+221 70 100 10 06", "Journee continue"],
      ["MSAS-007", "Ndella", "Seck", "Anesthesiste", "Medecin specialiste", 5, "+221 77 100 10 07", "Astreinte"],
      ["MSAS-008", "Boubacar", "Diallo", "Gestionnaire RH", "Administrateur hospitalier", 3, "+221 76 100 10 08", "Journee administrative"]
    ];

    const createdAt = this.nowInDakar().isoLike;
    employees.forEach(([matricule, firstName, lastName, role, grade, departmentId, phone, workRegime]) => {
      this.run(
        `INSERT INTO employees (
          matricule, first_name, last_name, role, grade, department_id,
          phone, work_regime, status, created_at
        ) VALUES (
          :matricule, :firstName, :lastName, :role, :grade, :departmentId,
          :phone, :workRegime, 'actif', :createdAt
        )`,
        {
          ":matricule": matricule,
          ":firstName": firstName,
          ":lastName": lastName,
          ":role": role,
          ":grade": grade,
          ":departmentId": departmentId,
          ":phone": phone,
          ":workRegime": workRegime,
          ":createdAt": createdAt
        }
      );
    });

    const today = this.todayInDakar();
    const seededAttendance = [
      [1, "Matin", "08:00", "14:00", `${today} 07:54`, null, "present", "Prise de service urgences"],
      [2, "Matin", "08:00", "14:00", `${today} 08:21`, null, "retard", "Retard declare au surveillant"],
      [3, "Garde 24h", "08:00", "08:00", `${today} 07:45`, null, "garde", "Garde obstetricale"],
      [6, "Matin", "08:00", "14:00", `${today} 07:58`, `${today} 14:06`, "present", "Prelevements termines"]
    ];

    seededAttendance.forEach(([employeeId, shift, expectedStart, expectedEnd, checkIn, checkOut, status, notes]) => {
      this.run(
        `INSERT INTO attendance (
          employee_id, service_date, shift, expected_start, expected_end,
          check_in, check_out, status, notes, created_at
        ) VALUES (
          :employeeId, :serviceDate, :shift, :expectedStart, :expectedEnd,
          :checkIn, :checkOut, :status, :notes, :createdAt
        )`,
        {
          ":employeeId": employeeId,
          ":serviceDate": today,
          ":shift": shift,
          ":expectedStart": expectedStart,
          ":expectedEnd": expectedEnd,
          ":checkIn": checkIn,
          ":checkOut": checkOut,
          ":status": status,
          ":notes": notes,
          ":createdAt": createdAt
        }
      );
    });
  }

  private fetchAttendance(): AttendanceRecord[] {
    return this.query<AttendanceRecord>(
      `SELECT a.id, a.employee_id AS employeeId,
              e.first_name || ' ' || e.last_name AS employeeName,
              e.matricule, e.role, d.name AS departmentName,
              a.service_date AS serviceDate, a.shift, a.expected_start AS expectedStart,
              a.expected_end AS expectedEnd, a.check_in AS checkIn, a.check_out AS checkOut,
              a.status, a.notes, a.created_at AS createdAt
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       JOIN departments d ON d.id = e.department_id
       ORDER BY a.service_date DESC, COALESCE(a.check_in, a.created_at) DESC
       LIMIT 500`
    );
  }

  private buildCoverage(
    departments: Department[],
    activeEmployees: Employee[],
    todayAttendance: AttendanceRecord[]
  ): DepartmentCoverage[] {
    return departments.map((department) => {
      const departmentEmployees = activeEmployees.filter((employee) => employee.departmentId === department.id);
      const departmentAttendance = todayAttendance.filter((record) => record.departmentName === department.name);

      return {
        departmentId: department.id,
        departmentName: department.name,
        region: department.region,
        district: department.district,
        activeEmployees: departmentEmployees.length,
        presentToday: new Set(departmentAttendance.filter((record) => record.checkIn).map((record) => record.employeeId)).size,
        onDuty: departmentAttendance.filter((record) => record.checkIn && !record.checkOut).length,
        lateToday: departmentAttendance.filter((record) => record.status === "retard").length
      };
    });
  }

  private query<T extends Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    const result = this.ensureDb().exec(sql, params);
    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((values) =>
      result[0].columns.reduce<SqlRow>((row, column, index) => {
        row[column] = values[index];
        return row;
      }, {}) as T
    );
  }

  private run(sql: string, params?: SqlParams): void {
    this.ensureDb().run(sql, params);
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.ensureDb().export()));
  }

  private ensureDb(): SqlDatabase {
    if (!this.db) {
      throw new Error("La base de donnees n'est pas initialisee.");
    }
    return this.db;
  }

  private resolveSqlJsFile(file: string): string {
    const packagedPath = path.join(process.resourcesPath ?? "", "sqljs", file);
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }

    const devPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", file);
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    return path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file);
  }

  private nowInDakar(): { date: string; time: string; isoLike: string } {
    const formatter = new Intl.DateTimeFormat("fr-SN", {
      timeZone: "Africa/Dakar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    return {
      date,
      time,
      isoLike: `${date} ${time}:${parts.second}`
    };
  }

  private todayInDakar(): string {
    return this.nowInDakar().date;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
}
