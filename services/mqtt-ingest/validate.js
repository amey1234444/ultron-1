// Envelope + payload validation for the v2.0 current-state contract
// (contracts/json-schema/*). Returns a list of problems; empty = valid.

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateEnvelope(msg) {
  const errors = [];
  if (!msg || typeof msg !== 'object') return ['message is not a JSON object'];

  if (typeof msg.schema !== 'string' || !msg.schema.startsWith('ultron.')) errors.push('schema missing/invalid');
  if (msg.schema_version !== '2.0') errors.push('schema_version must be "2.0"');
  if (typeof msg.message_id !== 'string' || !UUID_RE.test(msg.message_id)) errors.push('message_id must be a UUID');
  if (typeof msg.gateway_id !== 'string' || !msg.gateway_id) errors.push('gateway_id missing');
  if (typeof msg.gateway_boot_id !== 'string' || !msg.gateway_boot_id) errors.push('gateway_boot_id missing');
  if (typeof msg.gateway_ip !== 'string' || !IP_RE.test(msg.gateway_ip)) errors.push('gateway_ip missing/invalid');
  if (msg.rack_id !== undefined && (typeof msg.rack_id !== 'string' || !msg.rack_id)) errors.push('rack_id must be a non-empty string');
  if (!Number.isInteger(msg.gateway_sequence)) errors.push('gateway_sequence must be an integer');
  if (typeof msg.created_at !== 'string' || Number.isNaN(Date.parse(msg.created_at))) errors.push('created_at invalid');
  if (typeof msg.created_at_us !== 'string' || !/^\d+$/.test(msg.created_at_us)) errors.push('created_at_us must be a decimal string');
  if (msg.replayed !== false) errors.push('replayed must be false');
  if (!msg.payload || typeof msg.payload !== 'object') errors.push('payload missing');
  return errors;
}

export function validatePayload(schema, payload) {
  const errors = [];
  switch (schema) {
    case 'ultron.gateway.status':
      if (!['ONLINE', 'OFFLINE'].includes(payload.state)) errors.push('status.state invalid');
      if (payload.rack_summary !== undefined && (payload.rack_summary === null || typeof payload.rack_summary !== 'object' || Array.isArray(payload.rack_summary))) {
        errors.push('status.rack_summary invalid');
      }
      break;
    case 'ultron.gateway.topology':
      if (!Array.isArray(payload.racks)) errors.push('topology.racks must be an array');
      else {
        for (const rack of payload.racks) {
          if (typeof rack?.rack_id !== 'string' || !rack.rack_id) errors.push('topology.rack_id invalid');
        }
      }
      break;
    case 'ultron.rack.inventory':
      if (!Number.isInteger(payload.snapshot_revision)) errors.push('inventory.snapshot_revision invalid');
      if (!Number.isInteger(payload.slot_count) || payload.slot_count < 0) errors.push('inventory.slot_count invalid');
      if (!Array.isArray(payload.slots)) errors.push('inventory.slots must be an array');
      else {
        for (const s of payload.slots) {
          if (!Number.isInteger(s.slot_number) || s.slot_number < 1) errors.push(`slot_number ${s.slot_number} invalid`);
        }
      }
      break;
    case 'ultron.rack.health':
      if (typeof payload.rack_id !== 'string' || !payload.rack_id) errors.push('health.rack_id invalid');
      if (typeof payload.status !== 'string' || !payload.status) errors.push('health.status invalid');
      if (typeof payload.data_current !== 'boolean') errors.push('health.data_current invalid');
      break;
    case 'ultron.rack.telemetry':
      if (typeof payload.rack_id !== 'string' || !payload.rack_id) errors.push('telemetry.rack_id invalid');
      if (!Number.isInteger(payload.slot_count) || payload.slot_count < 0) errors.push('telemetry.slot_count invalid');
      if (!Array.isArray(payload.slots)) errors.push('telemetry.slots must be an array');
      else {
        for (const s of payload.slots) {
          if (!Number.isInteger(s?.slot_number) || s.slot_number < 1) errors.push('telemetry.slot_number invalid');
          if (s?.measurement_valid !== undefined && typeof s.measurement_valid !== 'boolean') errors.push('telemetry.measurement_valid invalid');
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
  topology: 'ultron.gateway.topology',
  rack_health: 'ultron.rack.health',
  inventory: 'ultron.rack.inventory',
  telemetry: 'ultron.rack.telemetry',
  alarm: 'ultron.event.alarm',
  command_response: 'ultron.command.response',
};
