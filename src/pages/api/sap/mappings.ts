import type { NextApiRequest, NextApiResponse } from "next";

import { USER_PERMISSIONS, userHasPermission } from "../../../lib/roles";
import { ensureSchema, query } from "../../../server/db";
import { sendApiError } from "../../../server/errors";
import { enforceRateLimit } from "../../../server/rateLimit";
import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";
import {
  publishSapChange,
  writeSapAudit,
} from "../../../server/sap/repository";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    const user = await requireUser(req);
    await enforceRateLimit(req, res, "api");
    await ensureSchema();
    const connectionId =
      typeof req.query.connectionId === "string"
        ? req.query.connectionId
        : typeof req.body?.connectionId === "string"
          ? req.body.connectionId
          : "";
    if (!connectionId)
      return res.status(400).json({ error: "Connection ID is required." });
    if (req.method === "GET") {
      const [assets, materials] = await Promise.all([
        query<Record<string, unknown>>(
          `SELECT id::text,ultron_machine_id AS "machineId",sap_equipment AS "sapEquipment",
                  functional_location AS "functionalLocation",plant,work_center AS "workCenter",
                  measuring_points AS "measuringPoints",status,last_validated_at AS "lastValidatedAt"
           FROM sap_asset_mappings WHERE connection_id=$1 ORDER BY ultron_machine_id`,
          [connectionId],
        ),
        query<Record<string, unknown>>(
          `SELECT id::text,ultron_machine_id AS "machineId",component_key AS "componentKey",
                  sap_material AS "sapMaterial",plant,storage_location AS "storageLocation",
                  required_quantity AS "requiredQuantity",unit,approved_substitutes AS "approvedSubstitutes"
           FROM sap_material_mappings WHERE connection_id=$1 ORDER BY ultron_machine_id,component_key`,
          [connectionId],
        ),
      ]);
      return res
        .status(200)
        .json({ assets: assets.rows, materials: materials.rows });
    }
    if (req.method === "PUT") {
      if (!userHasPermission(user, USER_PERMISSIONS.SAP_MAPPING_MANAGE))
        return res
          .status(403)
          .json({
            error: "You do not have permission to manage SAP mappings.",
          });
      const kind = req.body?.kind;
      const machineId =
        typeof req.body?.machineId === "string"
          ? req.body.machineId.trim()
          : "";
      if (!machineId)
        return res
          .status(400)
          .json({ error: "ULTRON machine ID is required." });
      if (kind === "asset") {
        const sapEquipment =
          typeof req.body?.sapEquipment === "string"
            ? req.body.sapEquipment.trim()
            : "";
        if (!sapEquipment)
          return res
            .status(400)
            .json({ error: "SAP equipment ID is required." });
        await query(
          `INSERT INTO sap_asset_mappings
             (connection_id,ultron_machine_id,sap_equipment,functional_location,plant,work_center,measuring_points,status,last_validated_at,updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'validated',now(),$8)
           ON CONFLICT (connection_id,ultron_machine_id) DO UPDATE SET
             sap_equipment=EXCLUDED.sap_equipment,functional_location=EXCLUDED.functional_location,
             plant=EXCLUDED.plant,work_center=EXCLUDED.work_center,measuring_points=EXCLUDED.measuring_points,
             status='validated',last_validated_at=now(),updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [
            connectionId,
            machineId,
            sapEquipment,
            String(req.body?.functionalLocation ?? ""),
            String(req.body?.plant ?? ""),
            String(req.body?.workCenter ?? ""),
            JSON.stringify(req.body?.measuringPoints ?? {}),
            user.id,
          ],
        );
      } else if (kind === "material") {
        const componentKey =
          typeof req.body?.componentKey === "string"
            ? req.body.componentKey.trim()
            : "";
        const sapMaterial =
          typeof req.body?.sapMaterial === "string"
            ? req.body.sapMaterial.trim()
            : "";
        if (!componentKey || !sapMaterial)
          return res
            .status(400)
            .json({ error: "Component key and SAP material are required." });
        await query(
          `INSERT INTO sap_material_mappings
             (connection_id,ultron_machine_id,component_key,sap_material,plant,storage_location,required_quantity,unit,approved_substitutes,updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
           ON CONFLICT (connection_id,ultron_machine_id,component_key) DO UPDATE SET
             sap_material=EXCLUDED.sap_material,plant=EXCLUDED.plant,storage_location=EXCLUDED.storage_location,
             required_quantity=EXCLUDED.required_quantity,unit=EXCLUDED.unit,
             approved_substitutes=EXCLUDED.approved_substitutes,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [
            connectionId,
            machineId,
            componentKey,
            sapMaterial,
            String(req.body?.plant ?? ""),
            String(req.body?.storageLocation ?? ""),
            Number.isFinite(Number(req.body?.requiredQuantity))
              ? Number(req.body.requiredQuantity)
              : null,
            String(req.body?.unit ?? ""),
            JSON.stringify(req.body?.approvedSubstitutes ?? []),
            user.id,
          ],
        );
      } else
        return res
          .status(400)
          .json({ error: "Mapping kind must be asset or material." });
      await writeSapAudit({
        connectionId,
        userId: user.id,
        action: "mapping.upsert",
        objectType: String(kind),
        objectKey: machineId,
        status: "success",
      });
      await publishSapChange({ type: "mapping", connectionId, machineId });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendApiError(res, error, "api/sap/mappings");
  }
}
