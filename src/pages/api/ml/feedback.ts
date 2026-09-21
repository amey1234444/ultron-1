import type { NextApiRequest, NextApiResponse } from 'next';

import { persistMlFeedback } from '../../../server/mlPersistence';
import { submitFeedback } from '../../../server/mlClient';
import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

/**
 * An engineer's verdict on a surfaced diagnosis.
 *
 * Stored in Postgres first and forwarded to the ML service second, in that
 * order deliberately: the durable record is the thing that matters and the
 * service's copy is a convenience. Feedback that reached the service and not
 * the database would be lost on the next restart.
 *
 * Nothing here trains anything. Feedback becomes a labelled event, the event
 * goes into a versioned dataset, the dataset is reviewed, and only then does a
 * candidate model get fitted. A system that retrains on an operator's click
 * learns whoever clicks most.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const body =
      typeof req.body === 'string' && req.body
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : ((req.body ?? {}) as Record<string, unknown>);

    if (!body.machine_id && !body.machineId) {
      return res.status(400).json({ error: 'machine_id is required.' });
    }

    const payload: Record<string, unknown> = {
      ...body,
      machine_id: body.machine_id ?? body.machineId,
      prediction_id: body.prediction_id ?? body.predictionId ?? null,
      // The submitter is taken from the session, never from the body: a
      // client-supplied author on a record that becomes training truth is a
      // record nobody can stand behind.
      submitted_by: user.email ?? user.id ?? null,
    };

    const stored = await persistMlFeedback(payload);
    const forwarded = await submitFeedback(payload);

    return res.status(200).json({
      accepted: stored.stored,
      feedbackId: stored.predictionId,
      persistence: stored,
      forwarded: forwarded.ok ? forwarded.value : { delivered: false, detail: forwarded.detail },
      note:
        'Recorded for review. Feedback becomes training data only through a versioned dataset ' +
        'and an approved training run.',
    });
  } catch (err) {
    return sendApiError(res, err, 'api/ml/feedback');
  }
}
