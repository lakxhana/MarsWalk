// MARSWALK Structured Persistence & Storage Layer (IndexedDB)
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
  missionId?: string;
  explorerId?: string;
  sequenceNumber?: number;
  capturedAtSimTime?: number;
  headingRadians?: number;
  movementState?: 'Walking' | 'Stopped' | 'Recording' | 'Returning';
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

const DB_NAME = 'marswalk_db_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('observations')) {
        db.createObjectStore('observations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open MARSWalk database'));
    };
  });

  return dbPromise;
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

/**
 * Migrates existing localStorage notebook entries into IndexedDB if not already present.
 * Does NOT delete the localStorage copy (maintaining backward compatibility).
 */
export async function migrateLegacyNotebook(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem('marswalk_field_notebook_v1');
  if (!raw) return 0;
  const legacyEntries: Record<string, { stationName?: string; userObservation?: string; savedAt?: string }> = JSON.parse(raw);
  const db = await getDB();
  let migratedCount = 0;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('observations', 'readwrite');
    const store = tx.objectStore('observations');
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const existing = getAllRequest.result as ObservationRecord[];
      for (const [stationId, entry] of Object.entries(legacyEntries)) {
        const note = entry.userObservation?.trim();
        if (!note) continue;

        const idPrefix = `obs-legacy-${stationId}`;
        const previousMigration = existing.find(
          (observation) => observation.id === idPrefix || observation.id.startsWith(`${idPrefix}-`),
        );
        if (previousMigration) {
          const isUntouchedAutoMigration =
            previousMigration.imageCaption === 'Archival legacy observation record.' &&
            previousMigration.editHistory.length === 0 &&
            previousMigration.note === note;
          if (isUntouchedAutoMigration) {
            store.put({
              ...previousMigration,
              location: { description: 'The exact observation position was not recorded in the legacy note.' },
              locationStatus: stationId === 'abrasion-comparison' ? 'catalog_only' : 'unverified',
              imageRef: '',
              imageCaption: 'No image was attached to this legacy note.',
              imageIsArchival: false,
              imageSource: '',
            } satisfies ObservationRecord);
          }
          continue;
        }

        const record: ObservationRecord = {
          id: idPrefix,
          siteId: stationId,
          siteName: entry.stationName || stationId,
          targetName: entry.stationName || 'Legacy field note',
          location: { description: 'The exact observation position was not recorded in the legacy note.' },
          locationStatus: stationId === 'abrasion-comparison' ? 'catalog_only' : 'unverified',
          imageRef: '',
          imageCaption: 'No image was attached to this legacy note.',
          imageIsArchival: false,
          imageSource: '',
          note,
          question: null,
          timestamp: entry.savedAt || new Date().toISOString(),
          taskId: null,
          planVersion: 1,
          editHistory: [],
        };
        store.add(record);
        migratedCount++;
      }
    };

    getAllRequest.onerror = () => reject(getAllRequest.error || new Error('Failed to read observations for legacy migration'));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Legacy observation migration was aborted'));
    tx.onerror = () => reject(tx.error || new Error('Legacy observation migration failed'));
  });

  return migratedCount;
}

/**
 * Initializes default tasks and adds missing default advice-dependency metadata.
 */
export async function initializeDefaultTasks(): Promise<void> {
  const tasks = await getAllTasks();
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    if (tasks.length === 0) {
      for (const t of DEFAULT_TASKS) {
        store.put(t);
      }
    } else {
      for (const defaultTask of DEFAULT_TASKS) {
        const existingTask = tasks.find((task) => task.id === defaultTask.id);
        if (existingTask && defaultTask.requiresEarthAdvice && existingTask.requiresEarthAdvice === undefined) {
          store.put({ ...existingTask, requiresEarthAdvice: true });
        }
      }
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Task initialization was aborted'));
    tx.onerror = () => reject(tx.error || new Error('Failed to initialize mission tasks'));
  });
}

// ---------------------------------------------------------------------------
// OBSERVATIONS CRUD
// ---------------------------------------------------------------------------

export async function getAllObservations(): Promise<ObservationRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('observations', 'readonly');
    const store = tx.objectStore('observations');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as ObservationRecord[];
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getObservationById(id: string): Promise<ObservationRecord | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('observations', 'readonly');
    const store = tx.objectStore('observations');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveObservation(record: ObservationRecord): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('observations', 'readwrite');
    const store = tx.objectStore('observations');
    const req = store.put(record);
    req.onerror = () => reject(req.error || new Error('Failed to save observation to IndexedDB'));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Observation save was aborted'));
    tx.onerror = () => reject(tx.error || new Error('Failed to save observation to IndexedDB'));
  });
}

export async function deleteObservation(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('observations', 'readwrite');
    const store = tx.objectStore('observations');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to delete observation from IndexedDB'));
  });
}

// ---------------------------------------------------------------------------
// MESSAGES CRUD
// ---------------------------------------------------------------------------

export async function getAllMessages(): Promise<CommMessage[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as CommMessage[];
      list.sort((a, b) => b.sentAtSimTime - a.sentAtSimTime);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveMessage(message: CommMessage): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const req = store.put(message);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save communication message'));
  });
}

export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to prune communication messages'));
    tx.onabort = () => reject(tx.error || new Error('Pruning communication messages was aborted'));
  });
}

// ---------------------------------------------------------------------------
// TASKS CRUD
// ---------------------------------------------------------------------------

export async function getAllTasks(): Promise<FieldTask[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readonly');
    const store = tx.objectStore('tasks');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as FieldTask[]);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTask(task: FieldTask): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.put(task);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save task'));
  });
}

// ---------------------------------------------------------------------------
// JSON EXPORT / IMPORT WITH SCHEMA VALIDATION
// ---------------------------------------------------------------------------

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

    // Persist into IndexedDB
    const db = await getDB();
    const tx = db.transaction(['observations', 'messages', 'tasks'], 'readwrite');

    const obsStore = tx.objectStore('observations');
    for (const o of parsed.observations) {
      obsStore.put(o);
    }

    const msgStore = tx.objectStore('messages');
    for (const m of parsed.messages) {
      msgStore.put(m);
    }

    const taskStore = tx.objectStore('tasks');
    for (const t of parsed.tasks) {
      taskStore.put(t);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

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
