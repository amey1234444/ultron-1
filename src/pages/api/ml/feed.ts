import type { NextApiRequest, NextApiResponse } from 'next';

import { feedOnce } from '../../../server/mlFeeder';
import { mlConfigured } from '../../../server/mlClient';
import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

/**
 * Drive one pass of the telemetry feed by hand.
 *
 * The feeder normally runs on its own timer, started by the instrumentation
 * hook. This route exists for the two cases the timer does not cover: a
 * deployment that prefers an external scheduler to an in-process interval, and
 * an engineer who wants to see one tick's outcome rather than infer it from
 * the service's counters.
 *
 * Authorised either by a session (an engineer, from the console) or by
 * `CRON_SECRET` (a scheduler). It fails closed on both: with no session and no
 * matching secret it refuses, because this route reads the whole workspace and
 * writes predictions.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const secret = process.env.CRON_SECRET;
    const offered = req.headers['x-cron-secret'];
    const viaCron = Boolean(secret) && offered === secret;
    const user = viaCron ? null : await getSessionUser(req);
    if (!viaCron && !user) return res.status(401).json({ error: 'Not authenticated.' });

    if (!mlConfigured()) {
      return res.status(200).json({
        fed: 0,
        detail:
          'ML_SERVICE_URL is not set. The deterministic analysis runs unchanged; there is ' +
          'nothing to feed.',
      });
    }

    const outcomes = await feedOnce();
    return res.status(200).json({
      fed: outcomes.filter((entry) => entry.sent).length,
      skipped: outcomes.filter((entry) => !entry.sent).length,
      outcomes,
    });
  } catch (err) {
    return sendApiError(res, err, 'api/ml/feed');
  }
}
