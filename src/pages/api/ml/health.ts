import type { NextApiRequest, NextApiResponse } from 'next';

import { ML_CONTRACT_VERSION } from '../../../../lib/knowledge/ml/contract';
import { health, mlConfigured } from '../../../server/mlClient';
import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

/**
 * The ML service's health, as seen from the application.
 *
 * Answers 200 in every case, including when the service is unreachable. The
 * question this endpoint answers is "what is the state of the ML layer", and
 * "it is down" is an answer — returning 503 would make the Analyzer's own
 * health check fail because an advisory subsystem is restarting.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    // Which build is answering, and which ML contract it speaks. Both are
    // here because the first question after shipping a fix is whether the
    // thing showing the old behaviour is running the old code, and a cached
    // browser bundle or a deploy still in flight both answer that wrongly by
    // looking identical.
    const build = {
      build: (process.env.NEXT_PUBLIC_BUILD_ID || process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
      mlContract: ML_CONTRACT_VERSION,
      feedMode: process.env.ML_FEED_MODE ?? 'direct',
    };

    if (!mlConfigured()) {
      return res.status(200).json({
        ...build,
        configured: false,
        reachable: false,
        detail:
          'ML_SERVICE_URL is not set. The deterministic DOC-02..DOC-05 analysis runs unchanged; ' +
          'no learned findings are produced.',
      });
    }

    const result = await health();
    if (!result.ok) {
      return res.status(200).json({
        ...build,
        configured: true,
        reachable: false,
        reason: result.reason,
        detail: result.detail,
        latencyMs: result.latencyMs,
      });
    }
    return res.status(200).json({
      ...build,
      configured: true,
      reachable: true,
      latencyMs: result.latencyMs,
      service: result.value,
    });
  } catch (err) {
    return sendApiError(res, err, 'api/ml/health');
  }
}
