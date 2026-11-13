// MARSWALK SQLite-backed API persistence
// Stores scientific observations, delayed communication messages, and field tasks.
// Safely migrates existing localStorage entries without deletion.
// Provides validated JSON import / export and explicit error handling.
//
// Note: Archival NASA images and orbital HiRISE tiles require network connectivity on first fetch.

export type LocationStatus = 'verified' | 'unverified' | 'catalog_only';

export interface GeoLocation {
  lon?: number;
  lat?: number;
  x?: number;
  z?: number;
  elevationMeters?: number;
  description?: string;
  coordinateReference?: string;
}

export interface ObservationEditHistory {
  editedAt: string;
  previousNote: string;
  previousQuestion: string | null;
  planVersion: number;
}

export interface ObservationRecord {
  id: string; // Stable UUID or timestamp-based ID
  siteId: string;
  siteName: string;
  targetName: string;
  location: GeoLocation;
  locationStatus: LocationStatus;
  cameraLocation?: GeoLocation;
  targetLocation?: GeoLocation;
  audioRef?: string; // Persisted data URL of crew voice recording
  imageRef: string; // URL or blob key
  imageCaption: string;
  imageIsArchival: boolean;
  imageSource: string;
  note: string;
  question: string | null;
  timestamp: string; // ISO 8601
  createdAtSimTime?: number;
  missionElapsedSeconds?: number;
  activityDurationSeconds?: number;
  taskId: string | null;
  planVersion: number;
  editHistory: ObservationEditHistory[];
}

export type CommMessageStatus = 'queued' | 'in_transit' | 'delivered' | 'replied';

export interface CommMessage {
  id: string;
  kind?: 'question' | 'status_update' | 'observation_update' | 'chat';
  observationId: string;
  observationSnapshot?: ObservationRecord;
  statusSnapshot?: MissionStatusSnapshot;
  statusCreatedAtSimTime?: number;
  siteId: string;
  siteName: string;
  taskId: string | null;
  questionText: string;
  originalPlanVersion: number;
  originalPlanSummary: string;
  status: CommMessageStatus;
  direction: 'uplink' | 'downlink'; // uplink: Explorer -> Science Team; downlink: Science Team -> Explorer
  sentAtSimTime: number; // simulated seconds
  deliveredAtSimTime: number; // simulated seconds
  earliestPossibleReplyAtSimTime?: number; // simulated seconds
  replyText?: string;
  replySentAtSimTime?: number;
  replyDeliveredAtSimTime?: number;
  replyPlanVersion?: number;
  planDifference?: string | null; // e.g. "Plan changed since request: Destination changed..."
  scienceTeamAuthor?: string;
}

export interface MissionStatusSnapshot {
  mapMode?: 'regional';
  routeDistanceMeters?:number;
  routeTotalMeters?:number;
  progressPercent?:number;
  operations?: import('./crewOperations').OperationsReport;
  missionId?: string;
  explorerId?: string;
  sequenceNumber?: number;
  capturedAtSimTime?: number;
  headingRadians?: number;
  movementState?: 'Walking' | 'Stopped' | 'Recording' | 'Returning' | 'Investigating';
  activityEvent?: string;
  currentTaskId?: string | null;
  currentTaskName?: string | null;
  taskSummary?: Array<{ id: string; title: string; status: TaskStatus }>;
  remainingMissionMinutes?: number | null;
  planVersion: number;
  planSummary: string;
  destinationName: string;
  position: { x: number; z: number };
  coordinateReference: string;
  missionElapsedSeconds: number;
  missionBudgetMinutes: number;
  reserveMinutes: number;
  returnEstimateMinutes: number | null;
  base?: { x: number; z: number; name: string } | null;
  plannedRoutePoints?: Array<{ x: number; z: number }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'blocked_on_advice' | 'completed';

export interface FieldTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  blockedByMessageId?: string;
  estimatedMinutes: number;
  isIndependent: boolean;
  requiresEarthAdvice?: boolean;
  category: 'sampling' | 'survey' | 'atmospheric' | 'maintenance' | 'navigation';
  siteId?: string;
}

export interface ExportDataPayload {
  format: 'marswalk_data_v1';
  exportedAt: string;
  version: 1;
  observations: ObservationRecord[];
  messages: CommMessage[];
  tasks: FieldTask[];
  settings: {
    oneWayDelayMinutes: number;
    clockSpeedMultiplier: number;
  };
}

export const DEFAULT_TASKS: FieldTask[] = [
  {
    id: 'task-outcrop-sampling',
    title: 'Outcrop workspace & abrasion screening',
    description: 'Inspect rock surface clasts, clear dust with gas puff, and evaluate abrasion patch placement.',
    status: 'in_progress',
    estimatedMinutes: 20,
    isIndependent: false,
    requiresEarthAdvice: true,
    category: 'sampling',
    siteId: 'skinner-ridge',
  },
  {
    id: 'task-dust-opacity',
    title: 'Atmospheric dust opacity check (Tau survey)',
    description: 'Point Mastcam-Z toward solar disk through neutral density filters to measure atmospheric optical depth.',
    status: 'pending',
    estimatedMinutes: 8,
    isIndependent: true,
    category: 'atmospheric',
  },
  {
    id: 'task-quadrant-grain-survey',
    title: 'Workspace pebble grain-size distribution count',
    description: 'Document 1 m² regolith quadrant to establish fluvial energy baseline.',
    status: 'pending',
    estimatedMinutes: 12,
    isIndependent: true,
    category: 'survey',
  },
  {
    id: 'task-thermal-baseline',
    title: 'Ground surface thermal baseline (Sunlit vs Shadow)',
    description: 'Record radiometric surface temperature contrast across boulder shadow contacts.',
    status: 'pending',
    estimatedMinutes: 10,
    isIndependent: true,
    category: 'atmospheric',
  },
  {
    id: 'task-cache-inspection',
    title: 'Sample tube cache seal inspection',
    description: 'Inspect sample return tube seals and mechanical latching mechanisms.',
    status: 'pending',
    estimatedMinutes: 15,
    isIndependent: true,
    category: 'maintenance',
  },
];

// SQLite API; IndexedDB is only read during the one-time migration.
async function api<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  let response: Response;
  try {response = await fetch(`/api/${path}`, {method, headers: {'Content-Type':'application/json'}, body:value === undefined ? undefined : JSON.stringify(value)});}
  catch {throw new Error('Database server is unavailable. Keep npm start running and retry.');}
  if(!response.ok) {const error = await response.json().catch(()=>({error:'Database request failed'}));throw new Error(error.error || 'Database request failed');}
  return response.json() as Promise<T>;
}
export const getStoredMission = <T,>() => api<T | null>('mission');
export const saveStoredMission = (value: unknown) => api('mission','PUT',value);
export async function migrateLegacyNotebook(): Promise<number> {
  if(typeof window === 'undefined') return 0;
  const health = await api<{databaseId:string}>('health');
  const migrationKey = `marswalk_sqlite_migrated_${health.databaseId}`;
  if(localStorage.getItem(migrationKey)) return 0;
  const legacy = await import('./legacyStorage');
  await legacy.migrateLegacyNotebook();
  const [observations,messages,tasks] = await Promise.all([legacy.getAllObservations(),legacy.getAllMessages(),legacy.getAllTasks()]);
  let migrationId = localStorage.getItem('marswalk_migration_id');
  if(!migrationId){migrationId=crypto.randomUUID();localStorage.setItem('marswalk_migration_id',migrationId);}
  await api('import','POST',{observations,messages,tasks,migrationId});
  localStorage.setItem(migrationKey,'true');
  return observations.length;
}
export async function initializeDefaultTasks(): Promise<void> {await api('seed','POST',{tasks:DEFAULT_TASKS});}
export async function getAllObservations(): Promise<ObservationRecord[]> {return (await api<ObservationRecord[]>('observations')).sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());}
export async function getObservationById(id:string): Promise<ObservationRecord | null> {return (await getAllObservations()).find(o=>o.id===id) ?? null;}
export async function saveObservation(record:ObservationRecord): Promise<void> {await api('observations','PUT',record);}
export async function deleteObservation(id:string): Promise<void> {await api('observations','DELETE',{ids:[id]});}
export async function getAllMessages(): Promise<CommMessage[]> {return (await api<CommMessage[]>('messages')).sort((a,b)=>b.sentAtSimTime-a.sentAtSimTime);}
export async function saveMessage(message:CommMessage): Promise<void> {await api('messages','PUT',message);}
export async function deleteMessages(ids:string[]): Promise<void> {if(ids.length)await api('messages','DELETE',{ids});}
export async function getAllTasks(): Promise<FieldTask[]> {return api<FieldTask[]>('tasks');}
export async function saveTask(task:FieldTask): Promise<void> {await api('tasks','PUT',task);}

export async function exportAllDataAsJSON(settings = { oneWayDelayMinutes: 5, clockSpeedMultiplier: 1 }): Promise<string> {
  const [observations, messages, tasks] = await Promise.all([
    getAllObservations(),
    getAllMessages(),
    getAllTasks(),
  ]);

  const payload: ExportDataPayload = {
    format: 'marswalk_data_v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    observations,
    messages,
    tasks,
    settings,
  };

  return JSON.stringify(payload, null, 2);
}

export interface ImportValidationResult {
  success: boolean;
  importedObservations: number;
  importedMessages: number;
  importedTasks: number;
  error?: string;
}

export async function importDataFromJSON(jsonString: string): Promise<ImportValidationResult> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: 'File content is not a valid JSON object.' };
    }

    if (parsed.format !== 'marswalk_data_v1' || parsed.version !== 1) {
      return {
        success: false,
        importedObservations: 0,
        importedMessages: 0,
        importedTasks: 0,
        error: 'Unsupported or missing format header. Expected "marswalk_data_v1".',
      };
    }

    if (!Array.isArray(parsed.observations) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.tasks)) {
      return {
        success: false,
        importedObservations: 0,
        importedMessages: 0,
        importedTasks: 0,
        error: 'Invalid schema: observations, messages, and tasks arrays are required.',
      };
    }

    // Validate each observation record
    for (let i = 0; i < parsed.observations.length; i++) {
      const o = parsed.observations[i];
      if (!o.id || typeof o.id !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation #${i + 1} has an invalid or missing "id".` };
      }
      if (!o.siteId || typeof o.siteId !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation "${o.id}" is missing required "siteId".` };
      }
      if (typeof o.note !== 'string') {
        return { success: false, importedObservations: 0, importedMessages: 0, importedTasks: 0, error: `Observation "${o.id}" is missing required "note" text.` };
      }
    }

    await api('import','POST',parsed);

    return {
      success: true,
      importedObservations: parsed.observations.length,
      importedMessages: parsed.messages.length,
      importedTasks: parsed.tasks.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      importedObservations: 0,
      importedMessages: 0,
      importedTasks: 0,
      error: `JSON parse or storage failure: ${message}`,
    };
  }
}
