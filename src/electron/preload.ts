import { contextBridge, ipcRenderer } from "electron";
import { ClockInInput, EmployeeStatus, HospitalApi, NewEmployeeInput } from "../shared/types";

const hospitalApi: HospitalApi = {
  getSnapshot: () => ipcRenderer.invoke("hospital:getSnapshot"),
  clockIn: (input: ClockInInput) => ipcRenderer.invoke("hospital:clockIn", input),
  clockOut: (attendanceId: number) => ipcRenderer.invoke("hospital:clockOut", attendanceId),
  addEmployee: (input: NewEmployeeInput) => ipcRenderer.invoke("hospital:addEmployee", input),
  updateEmployeeStatus: (employeeId: number, status: EmployeeStatus) =>
    ipcRenderer.invoke("hospital:updateEmployeeStatus", employeeId, status)
};

contextBridge.exposeInMainWorld("hospitalApi", hospitalApi);
