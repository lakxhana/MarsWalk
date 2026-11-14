const collections = new Set(['observations','messages','tasks']);
export function validateRecord(table, value) {
  if (!collections.has(table)) throw new Error('Unknown collection');
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 250) throw new Error('A valid record ID is required');
  if (table === 'observations' && (typeof value.note !== 'string' || typeof value.siteId !== 'string' || !value.location || typeof value.timestamp !== 'string')) throw new Error('Invalid observation');
  if (table === 'messages' && (!['uplink','downlink'].includes(value.direction) || typeof value.questionText !== 'string' || !Number.isFinite(value.sentAtSimTime) || !Number.isFinite(value.deliveredAtSimTime) || value.deliveredAtSimTime < value.sentAtSimTime)) throw new Error('Invalid message or delivery time');
  if (table === 'tasks' && (typeof value.title !== 'string' || !['pending','in_progress','blocked_on_advice','completed'].includes(value.status))) throw new Error('Invalid task');
}
