import { HospitalApi } from "../shared/types";

declare global {
  interface Window {
    hospitalApi: HospitalApi;
  }
}

export {};
