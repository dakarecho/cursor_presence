import { app, BrowserWindow, ipcMain, shell } from "electron";
import http from "node:http";
import path from "node:path";
import { HospitalDatabase } from "./database";
import { ClockInInput, EmployeeStatus, NewEmployeeInput } from "../shared/types";

const database = new HospitalDatabase();
let mainWindow: BrowserWindow | null = null;

const DEV_SERVER_URL = "http://127.0.0.1:5173";

function waitForDevServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Dev server at ${url} not available after ${timeout}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    }
    check();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "Pointage Hopital Senegal",
    backgroundColor: "#eef7f5",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  } else {
    waitForDevServer(DEV_SERVER_URL).then(() => {
      mainWindow?.loadURL(DEV_SERVER_URL);
    }).catch((err) => {
      console.error(err.message);
      app.quit();
    });
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("hospital:getSnapshot", () => database.getSnapshot());
  ipcMain.handle("hospital:clockIn", (_event, input: ClockInInput) => database.clockIn(input));
  ipcMain.handle("hospital:clockOut", (_event, attendanceId: number) => database.clockOut(attendanceId));
  ipcMain.handle("hospital:addEmployee", (_event, input: NewEmployeeInput) => database.addEmployee(input));
  ipcMain.handle("hospital:updateEmployeeStatus", (_event, employeeId: number, status: EmployeeStatus) =>
    database.updateEmployeeStatus(employeeId, status)
  );
}

app.whenReady().then(async () => {
  await database.initialize();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
