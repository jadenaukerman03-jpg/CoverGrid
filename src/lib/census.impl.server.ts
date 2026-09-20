// Permission-aware layer for census intake.
import {
  applyCensusRows,
  censusFeedStatus,
  censusImportHistory,
  parseCensusFile,
  type CensusSource,
} from "./census-import.server";
import { loadActor, logAudit, requireManager, type Actor } from "./staffing.server";

function label(actor: Actor) {
  return `${actor.profile?.full_name ?? actor.profile?.email ?? "user"} (${actor.role})`;
}

export async function censusIntakeData(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const [status, history] = await Promise.all([censusFeedStatus(), censusImportHistory(25)]);
  return { status, history };
}

export async function previewCensusFileAction(userId: string, text: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const parsed = await parseCensusFile(text);
  return { ...parsed, preview: parsed.rows.slice(0, 50), total: parsed.rows.length };
}

export async function importCensusFileAction(
  userId: string,
  text: string,
  fileName: string,
  source: CensusSource,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const parsed = await parseCensusFile(text);
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      applied: 0,
      skipped: 0,
      received: 0,
      unmatchedUnits: parsed.unmatchedUnits,
      errors:
        parsed.errors.length > 0 ? parsed.errors : ["No census rows were found in that file."],
      periodStart: null,
      periodEnd: null,
      importId: null,
    };
  }
  const result = await applyCensusRows({
    rows: parsed.rows,
    source,
    fileName,
    actorLabel: label(actor),
    errors: parsed.errors,
    unmatchedUnits: parsed.unmatchedUnits,
  });
  await logAudit("census.import", label(actor), "census_imports", result.importId, {
    source,
    fileName,
    applied: result.applied,
    skipped: result.skipped,
  });
  return result;
}
