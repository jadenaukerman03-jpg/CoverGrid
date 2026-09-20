// Permission wrappers for texting, time clocks, payroll exports and paperwork.
import { loadActor, requireManager } from "./staffing.server";
import {
  flushOutbox,
  getMessagingSettings,
  outboxBoard,
  sendTestText,
  setSmsOptin,
  updateMessagingSettings,
} from "./messaging.server";
import { deviceBoard, rotateDeviceKey, saveDevice, setBadge } from "./timeclock.server";
import { payrollExport, type PayrollFormat } from "./payroll-export.server";
import {
  paperworkBoard,
  savePaperwork,
  setPaperworkStatus,
  type PaperworkStatus,
} from "./paperwork.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

// --- Texting --------------------------------------------------------------
export async function outboxQuery(userId: string) {
  await manager(userId);
  return outboxBoard();
}

export async function messagingSettingsUpdate(
  userId: string,
  input: {
    smsEnabled?: boolean | undefined;
    quietStart?: number | undefined;
    quietEnd?: number | undefined;
    retentionDays?: number | undefined;
  },
) {
  const actor = await manager(userId);
  return updateMessagingSettings(input, label(actor));
}

export async function testTextAction(userId: string, phone: string) {
  const actor = await manager(userId);
  return sendTestText(phone, label(actor));
}

export async function flushOutboxAction(userId: string) {
  await manager(userId);
  return flushOutbox();
}

/** Employees control their own text preference; managers can set anyone's. */
export async function smsOptinAction(
  userId: string,
  input: { employeeId?: string | undefined; optin: boolean },
) {
  const actor = await loadActor(userId);
  const target = input.employeeId ?? actor.employee?.id;
  if (!target) throw new Error("No staff record found.");
  if (target !== actor.employee?.id) requireManager(actor);
  return setSmsOptin(target, input.optin);
}

export async function messagingSettingsQuery(userId: string) {
  await manager(userId);
  return getMessagingSettings();
}

// --- Time clocks ----------------------------------------------------------
export async function deviceBoardQuery(userId: string) {
  await manager(userId);
  return deviceBoard();
}

export async function saveDeviceAction(
  userId: string,
  input: {
    id?: string | null | undefined;
    name: string;
    unitId?: string | null | undefined;
    isActive?: boolean | undefined;
  },
) {
  const actor = await manager(userId);
  return saveDevice(input, label(actor));
}

export async function rotateDeviceKeyAction(userId: string, id: string) {
  const actor = await manager(userId);
  return rotateDeviceKey(id, label(actor));
}

export async function setBadgeAction(
  userId: string,
  input: {
    employeeId: string;
    clockInNumber?: string | undefined;
    pin?: string | undefined;
    payrollId?: string | undefined;
  },
) {
  const actor = await manager(userId);
  return setBadge(input, label(actor));
}

// --- Payroll export -------------------------------------------------------
export async function payrollExportQuery(
  userId: string,
  input: {
    start?: string | undefined;
    end?: string | undefined;
    format: PayrollFormat;
    companyCode?: string | undefined;
  },
) {
  await manager(userId);
  return payrollExport(input);
}

// --- Paperwork ------------------------------------------------------------
export async function paperworkQuery(userId: string) {
  await manager(userId);
  return paperworkBoard();
}

export async function savePaperworkAction(
  userId: string,
  input: Parameters<typeof savePaperwork>[0],
) {
  const actor = await manager(userId);
  return savePaperwork(input, label(actor));
}

export async function paperworkStatusAction(
  userId: string,
  input: { id: string; status: PaperworkStatus },
) {
  const actor = await manager(userId);
  return setPaperworkStatus(input.id, input.status, label(actor));
}
