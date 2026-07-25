// Envelope + payload validation for the v1.1 contract
// (contracts/json-schema/*). Returns a list of problems; empty = valid.

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateEnvelope(msg) {
  const errors = [];
  if (!msg || typeof msg !== 'object') return ['message is not a JSON object'];

  if (typeof msg.schema !== 'string' || !msg.schema.startsWith('ultron.')) errors.push('schema missing/invalid');
  if (msg.schema_version !== '1.1') errors.push('schema_version must be "1.1"');
  if (typeof msg.message_id !== 'string' || !UUID_RE.test(msg.message_id)) errors.push('message_id must be a UUID');
  if (typeof msg.gateway_id !== 'string' || !msg.gateway_id) errors.push('gateway_id missing');
  if (typeof msg.gateway_boot_id !== 'string' || !msg.gateway_boot_id) errors.push('gateway_boot_id missing');
  if (typeof msg.gateway_ip !== 'string' || !IP_RE.test(msg.gateway_ip)) errors.push('gateway_ip missing/invalid');
  if (!Number.isInteger(msg.rack_id)) errors.push('rack_id must be an integer');
  if (!Number.isInteger(msg.gateway_sequence)) errors.push('gateway_sequence must be an integer');
  if (typeof msg.created_at !== 'string' || Number.isNaN(Date.parse(msg.created_at))) errors.push('created_at invalid');
  if (typeof msg.replayed !== 'boolean') errors.push('replayed must be boolean');
  if (!msg.payload || typeof msg.payload !== 'object') errors.push('payload missing');
  return errors;
}

// Optional per-channel detail (sensor, thresholds, alarm state) reported by
// real controllers; absent from simulator batches.
function validateChannelDetail(r) {
  const errors = [];
  for (const key of ['alert_threshold', 'danger_threshold']) {
    if (r[key] !== undefined && r[key] !== null && (typeof r[key] !== 'number' || !Number.isFinite(r[key]))) {
      errors.push(`record.${key} invalid`);
    }
  }
  for (const key of ['alert_state', 'danger_state']) {
    if (r[key] !== undefined && !['ACTIVE', 'INACTIVE'].includes(r[key])) errors.push(`record.${key} invalid`);
  }
  if (r.freshness !== undefined && !['FRESH', 'STALE'].includes(r.freshness)) errors.push('record.freshness invalid');
  return errors;
}

export function validatePayload(schema, payload) {
  const errors = [];
  switch (schema) {
    case 'ultron.gateway.status':
      if (!['ONLINE', 'OFFLINE', 'DEGRADED'].includes(payload.state)) errors.push('status.state invalid');
      break;
    case 'ultron.rack.inventory':
      if (!Number.isInteger(payload.snapshot_revision)) errors.push('inventory.snapshot_revision invalid');
      if (!Array.isArray(payload.slots)) errors.push('inventory.slots must be an array');
      else {
        for (const s of payload.slots) {
          if (!Number.isInteger(s.slot_id) || s.slot_id < 1 || s.slot_id > 14) errors.push(`slot_id ${s.slot_id} out of range`);
          if (!['PRESENT', 'EMPTY'].includes(s.presence)) errors.push('slot presence invalid');
        }
      }
      break;
    case 'ultron.measurement.batch':
      if (!Number.isInteger(payload.batch_sequence)) errors.push('batch_sequence invalid');
      if (!Array.isArray(payload.records)) errors.push('records must be an array');
      else {
        if (Number.isInteger(payload.record_count) && payload.record_count !== payload.records.length) {
          errors.push('record_count does not match records length');
        }
        for (const r of payload.records) {
          if (!Number.isInteger(r.slot_id)) errors.push('record.slot_id invalid');
          if (!Number.isInteger(r.channel_id)) errors.push('record.channel_id invalid');
          if (typeof r.measurement_type !== 'string' || !r.measurement_type) errors.push('record.measurement_type missing');
          if (typeof r.value !== 'number' || !Number.isFinite(r.value)) errors.push('record.value invalid');
          if (typeof r.source_timestamp_us !== 'string' || !/^\d+$/.test(r.source_timestamp_us)) errors.push('record.source_timestamp_us invalid');
          if (!Number.isInteger(r.source_sequence)) errors.push('record.source_sequence invalid');
          errors.push(...validateChannelDetail(r));
        }
      }
      break;
    case 'ultron.event.alarm':
      if (!['WARNING', 'CRITICAL'].includes(payload.severity)) errors.push('alarm.severity invalid');
      if (!['ACTIVE', 'CLEARED'].includes(payload.state)) errors.push('alarm.state invalid');
      break;
    case 'ultron.event.fault':
      if (!['ACTIVE', 'CLEARED'].includes(payload.state)) errors.push('fault.state invalid');
      break;
    case 'ultron.event.system':
      if (typeof payload.event_type !== 'string' || !payload.event_type) errors.push('system.event_type missing');
      break;
    case 'ultron.command.response':
      if (typeof payload.request_id !== 'string') errors.push('response.request_id missing');
      if (!['ACCEPTED', 'COMPLETED', 'FAILED', 'REJECTED'].includes(payload.status)) errors.push('response.status invalid');
      break;
    default:
      break; // Unknown sub-schemas are stored raw (forward compatibility).
  }
  return errors;
}

// Expected envelope schema for each parsed topic kind — a message published on
// a telemetry topic must actually carry a measurement batch.
export const SCHEMA_FOR_KIND = {
  status: 'ultron.gateway.status',
  inventory: 'ultron.rack.inventory',
  telemetry: 'ultron.measurement.batch',
  alarm: 'ultron.event.alarm',
  fault: 'ultron.event.fault',
  system: 'ultron.event.system',
  command_response: 'ultron.command.response',
};
