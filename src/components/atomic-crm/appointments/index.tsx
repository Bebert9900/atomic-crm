import type { Appointment } from "../types";
import { AppointmentList } from "./AppointmentList";

export default {
  list: AppointmentList,
  recordRepresentation: (record: Appointment) => record?.title,
};
