// Wall clocks / tablets: registered devices and badge-number punching.
// Server-only. Never imported from client code directly.
import { SHIFT_LABEL, POSITION_LABEL, type ShiftType, type PositionType } from "./facility";
import { db, logAudit, today, unitMap } from "./staffing.server";
import { punch } from "./workforce.server";

function newKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deviceBoard() {
  const [{ data: devices }, units] = await Promise.all([
    db.from("punch_devices").select("*").order("created_at", { ascending: true }),
    unitMap(),
  ]);
  const { data: missingBadge } = await db
    .from("employees")
    .select("id,full_name")
    .eq("is_active", true)
    .or("clock_in_number.eq.,punch_pin.eq.")
    .order("full_name")
    .limit(50);

  return {
    devices: (devices ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      unit: d.unit_id ? (units.byId.get(d.unit_id as string) ?? "Facility") : "Facility",
      unitId: (d.unit_id as string | null) ?? null,
      deviceKey: d.device_key as string,
      isActive: d.is_active as boolean,
      lastSeenAt: (d.last_seen_at as string | null) ?? null,
    })),
    needsBadge: (missingBadge ?? []).map((e) => ({
      id: e.id as string,
      name: e.full_name as string,
    })),
  };
}

export async function saveDevice(
  input: {
    id?: string | null | undefined;
    name: string;
    unitId?: string | null | undefined;
    isActive?: boolean | undefined;
  },
  actorLabel: string,
) {
  if (input.id) {
    const patch: { name: string; unit_id: string | null; is_active?: boolean } = {
      name: input.name,
      unit_id: input.unitId ?? null,
    };
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    const { error } = await db.from("punch_devices").update(patch).eq("id", input.id);
    if (error) throw new Error(error.message);
    await logAudit("clock_updated", actorLabel, "punch_devices", input.id, { name: input.name });
    return { id: input.id };
  }
  const { data, error } = await db
    .from("punch_devices")
    .insert({ name: input.name, unit_id: input.unitId ?? null, device_key: newKey() })
    .select("id,device_key")
    .single();
  if (error) throw new Error(error.message);
  await logAudit("clock_added", actorLabel, "punch_devices", data.id as string, {
    name: input.name,
  });
  return { id: data.id as string, deviceKey: data.device_key as string };
}

export async function rotateDeviceKey(id: string, actorLabel: string) {
  const key = newKey();
  const { error } = await db.from("punch_devices").update({ device_key: key }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit("clock_key_rotated", actorLabel, "punch_devices", id, {});
  return { deviceKey: key };
}

export async function setBadge(
  input: {
    employeeId: string;
    clockInNumber?: string | undefined;
    pin?: string | undefined;
    payrollId?: string | undefined;
  },
  actorLabel: string,
) {
  const patch: { clock_in_number?: string; punch_pin?: string; payroll_id?: string } = {};
  if (input.clockInNumber !== undefined) patch.clock_in_number = input.clockInNumber.trim();
  if (input.pin !== undefined) {
    if (input.pin && !/^\d{4,6}$/.test(input.pin))
      throw new Error("The PIN must be 4 to 6 digits.");
    patch.punch_pin = input.pin;
  }
  if (input.payrollId !== undefined) patch.payroll_id = input.payrollId.trim();
  const { error } = await db.from("employees").update(patch).eq("id", input.employeeId);
  if (error) throw new Error(error.message);
  await logAudit("badge_updated", actorLabel, "employees", input.employeeId, {
    clockInNumber: patch.clock_in_number ?? null,
    payrollId: patch.payroll_id ?? null,
  });
  return { ok: true };
}

export type KioskResult = {
  ok: boolean;
  message: string;
  name?: string;
  detail?: string;
};

/** Confirms a tablet's key belongs to a real, active clock before it is paired. */
export async function verifyDeviceKey(
  deviceKey: string,
): Promise<{ ok: boolean; message: string; name?: string }> {
  const { data: device } = await db
    .from("punch_devices")
    .select("id,name,is_active")
    .eq("device_key", deviceKey.trim())
    .maybeSingle();
  if (!device)
    return { ok: false, message: "That key isn't right. Ask your manager for the clock key." };
  if (!device.is_active)
    return { ok: false, message: "This clock has been turned off. Ask your manager." };
  await db
    .from("punch_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);
  return { ok: true, message: "Clock ready.", name: device.name as string };
}

/** A punch coming from a registered wall clock. Badge number + PIN, nothing else. */

export async function kioskPunch(input: {
  deviceKey: string;
  clockInNumber: string;
  pin: string;
}): Promise<KioskResult> {
  const { data: device } = await db
    .from("punch_devices")
    .select("id,name,unit_id,is_active")
    .eq("device_key", input.deviceKey)
    .maybeSingle();
  if (!device || !device.is_active)
    return { ok: false, message: "This clock is not registered. Ask your manager." };
  await db
    .from("punch_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  const badge = input.clockInNumber.trim();
  const pin = input.pin.trim();
  if (!badge || !pin) return { ok: false, message: "Enter your clock-in number and PIN." };

  const { data: emp } = await db
    .from("employees")
    .select("id,full_name,position,punch_pin,is_active")
    .eq("clock_in_number", badge)
    .maybeSingle();
  if (!emp || !emp.is_active || !emp.punch_pin || emp.punch_pin !== pin) {
    return { ok: false, message: "That clock-in number and PIN don't match. Try again." };
  }

  const date = today();
  const { data: assignment } = await db
    .from("shift_assignments")
    .select("id,shift,unit_id")
    .eq("employee_id", emp.id)
    .eq("shift_date", date)
    .in("status", ["scheduled", "completed"])
    .limit(1)
    .maybeSingle();

  const { data: open } = await db
    .from("time_punches")
    .select("id")
    .eq("employee_id", emp.id)
    .is("clock_out", null)
    .limit(1)
    .maybeSingle();

  const kind: "in" | "out" = open ? "out" : "in";
  try {
    const res = await punch(emp.id, (assignment?.id as string | undefined) ?? null, kind);
    await db
      .from("time_punches")
      .update({ device_id: device.id, source: "clock" })
      .eq("id", (res.punch as { id: string }).id);
    const units = await unitMap();
    const where = assignment?.unit_id ? (units.byId.get(assignment.unit_id as string) ?? "") : "";
    const detail =
      kind === "in" && assignment
        ? `${SHIFT_LABEL[assignment.shift as ShiftType]}${where ? ` · ${where}` : ""} · ${POSITION_LABEL[emp.position as PositionType]}`
        : "";
    return { ok: true, message: res.message, name: emp.full_name as string, detail };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Punch failed. Try again." };
  }
}
