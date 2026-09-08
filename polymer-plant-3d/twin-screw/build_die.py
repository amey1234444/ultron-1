# -*- coding: utf-8 -*-
"""Die-end chain: melt adapter, screen inlet, screen pack, screen outlet,
die head, nozzle and extrudate.

Master prompt V2 section 6C requires `P_SCR_IN` and `P_SCR_OUT` to be two
separate physical tappings on opposite sides of the screen pack:

    ... TZ-08 | MELT_ADAPTER | SCREEN_INLET | SCREEN_PACK | SCREEN_OUTLET | DIE
                    ^MELT_TEMP     ^P_SCR_IN                  ^P_SCR_OUT

`P_SCR_IN` sits upstream of the breaker plate on the inlet adapter,
`P_SCR_OUT` downstream of it on the outlet adapter and upstream of the die.
Neither shares a mesh, and neither is attached to the brass extrudate.
`SCREEN_DP` is derived in the telemetry layer, never modelled as a sensor.
"""

import bpy
from math import pi, cos, sin, radians

import lib_params as P
import lib_geo as G
import lib_mat as M


def build(root):
    c = G.coll("DIE_HEAD", root)
    steel = M.get("MAT_stainless")
    barrel = M.get("MAT_barrel_steel")
    cast = M.get("MAT_cast_gray")
    mesh = M.get("MAT_mesh")
    cav = M.get("MAT_cavity")
    brass = M.get("MAT_brass")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    out = {}

    zc = P.Z_SCREW
    ma0, ma1 = P.die_slot("MELT_ADAPTER")
    si0, si1 = P.die_slot("SCREEN_INLET")
    sp0, sp1 = P.die_slot("SCREEN_PACK")
    so0, so1 = P.die_slot("SCREEN_OUTLET")
    db0, db1 = P.die_slot("DIE_BODY")
    nz0, nz1 = P.die_slot("NOZZLE")

    def flange_bolts(parts, x, r, n=10, size=0.0105, prefix="bolt"):
        for k in range(n):
            a = 2 * pi * k / n + pi / n
            parts.append(G.hex_head("%s_%s" % (prefix, k), size, 0.010, 'X',
                                    (x, r * cos(a), zc + r * sin(a)), bolt, c))

    def gasket(parts, x, r, name):
        parts.append(G.lathe(name, [(r * .62, -0.0025), (r, -0.0025),
                                    (r, 0.0025), (r * .62, 0.0025)],
                             P.Q_MED, 'X', (x, 0, zc), mat=dark, target=c))

    # ---- melt-temperature adapter -----------------------------------------
    # square barrel section transitioning to the round screen-pack train
    mp = [G.box("MELT_ADAPTER_body", ((ma0 + ma1) * .5, 0, zc),
                (ma1 - ma0, P.BARREL_W * .90, P.BARREL_H * .88), cast, c,
                bev=0.008, seg=3)]
    mp.append(G.lathe("MELT_ADAPTER_hub",
                      [(P.SCREEN_R * .58, 0), (P.SCREEN_R * 1.02, 0),
                       (P.SCREEN_R * 1.02, 0.026), (P.SCREEN_R * .58, 0.026)],
                      P.Q_LARGE, 'X', (ma1 - 0.013, 0, zc), mat=cast, target=c))
    flange_bolts(mp, ma0 + 0.008, 0.196, 8, 0.011, "MELT_ADAPTER_fb")
    out["MELT_ADAPTER"] = G.join(mp, "MELT_ADAPTER", None, c)

    # MELT TEMP probe on top of the adapter
    out["SENSOR_MELT_TEMP"] = G.pressure_boss(
        "SENSOR_MELT_TEMP", ((ma0 + ma1) * .5, 0.0, zc + P.BARREL_H * .44),
        axis='Z', sign=1, mat=steel, dark=dark, body_mat=cast, target=c,
        boss_r=0.024, boss_h=0.026, body_r=0.017, body_h=0.052,
        seg=P.Q_MED, capped=True)

    # ---- screen-pack inlet adapter (carries P-SCR-IN) ---------------------
    ip = [G.lathe("SCREEN_INLET_body",
                  [(P.SCREEN_R * .56, 0), (P.SCREEN_R * 1.10, 0),
                   (P.SCREEN_R * 1.10, (si1 - si0) * .62),
                   (P.SCREEN_R * .98, (si1 - si0) * .62),
                   (P.SCREEN_R * .98, si1 - si0),
                   (P.SCREEN_R * .56, si1 - si0)],
                  P.Q_LARGE, 'X', (si0, 0, zc), mat=cast, target=c)]
    gasket(ip, si0 + 0.001, P.SCREEN_R * 1.10, "SCREEN_INLET_gasket")
    flange_bolts(ip, si0 + (si1 - si0) * .31, P.SCREEN_R * .96, 10, 0.0095,
                 "SCREEN_INLET_fb")
    out["SCREEN_PACK_INLET"] = G.join(ip, "SCREEN_PACK_INLET", None, c)

    out["SENSOR_P_SCR_IN"] = G.pressure_boss(
        "SENSOR_P_SCR_IN", (si0 + (si1 - si0) * .5, 0.0, zc - P.SCREEN_R * 1.02),
        axis='Z', sign=-1, mat=steel, dark=dark, body_mat=cast, target=c,
        boss_r=P.BOSS_R, boss_h=P.BOSS_H,
        body_r=P.BOSS_BODY_R, body_h=P.BOSS_BODY_H, seg=P.Q_MED)

    # ---- screen pack: real perforated cartridge with visible thickness ----
    L = sp1 - sp0
    pk = [G.cyl("SCREEN_PACK_cavity", P.SCREEN_R * .78, L + 0.006, 'X',
                ((sp0 + sp1) * .5, 0, zc), P.Q_MED, cav, c)]
    nr, na = 24, 10
    for j in range(na + 1):
        xx = sp0 + L * j / na
        pk.append(G.lathe("SCREEN_PACK_ring%d" % j,
                          [(P.SCREEN_R * .82, -0.0026), (P.SCREEN_R * .92, -0.0026),
                           (P.SCREEN_R * .92, 0.0026), (P.SCREEN_R * .82, 0.0026)],
                          P.Q_MED, 'X', (xx, 0, zc), mat=mesh, target=c))
    for k in range(nr):
        a = 2 * pi * k / nr
        pk.append(G.box("SCREEN_PACK_bar%d" % k,
                        ((sp0 + sp1) * .5, P.SCREEN_R * .88 * cos(a),
                         zc + P.SCREEN_R * .88 * sin(a)),
                        (L, 0.0055, 0.0055), mesh, c, bev=0))
    # end collars give the cartridge real axial thickness
    for xx in (sp0 + 0.010, sp1 - 0.010):
        pk.append(G.lathe("SCREEN_PACK_collar",
                          [(P.SCREEN_R * .70, -0.010), (P.SCREEN_R * 1.02, -0.010),
                           (P.SCREEN_R * 1.02, 0.010), (P.SCREEN_R * .70, 0.010)],
                          P.Q_LARGE, 'X', (xx, 0, zc), mat=cast, target=c))
    out["SCREEN_PACK"] = G.join(pk, "SCREEN_PACK", None, c)

    # ---- screen-pack outlet adapter (carries P-SCR-OUT) -------------------
    op = [G.lathe("SCREEN_OUTLET_body",
                  [(P.SCREEN_R * .50, 0), (P.SCREEN_R * .98, 0),
                   (P.SCREEN_R * .98, (so1 - so0) * .36),
                   (P.SCREEN_R * 1.10, (so1 - so0) * .36),
                   (P.SCREEN_R * 1.10, so1 - so0),
                   (P.SCREEN_R * .50, so1 - so0)],
                  P.Q_LARGE, 'X', (so0, 0, zc), mat=cast, target=c)]
    gasket(op, so1 - 0.001, P.SCREEN_R * 1.10, "SCREEN_OUTLET_gasket")
    flange_bolts(op, so0 + (so1 - so0) * .70, P.SCREEN_R * .98, 10, 0.0095,
                 "SCREEN_OUTLET_fb")
    out["SCREEN_PACK_OUTLET"] = G.join(op, "SCREEN_PACK_OUTLET", None, c)

    # downstream of the screen pack, upstream of the die: its own boss, on the
    # opposite side of the centreline from P-SCR-IN so the pair reads clearly
    out["SENSOR_P_SCR_OUT"] = G.pressure_boss(
        "SENSOR_P_SCR_OUT", (so0 + (so1 - so0) * .5, 0.0, zc - P.SCREEN_R * 0.96),
        axis='Z', sign=-1, mat=steel, dark=dark, body_mat=cast, target=c,
        boss_r=P.BOSS_R * 0.92, boss_h=P.BOSS_H,
        body_r=P.BOSS_BODY_R, body_h=P.BOSS_BODY_H, seg=P.Q_MED)

    # ---- faceted tapering die housing --------------------------------------
    dl = db1 - db0
    dp = [G.lathe("DIE_body",
                  [(P.SCREEN_R * .46, 0.0), (P.DIE_H * .5, 0.0),
                   (P.DIE_H * .5, dl * .26),
                   (P.DIE_H * .31, dl * .72),
                   (P.NOZZLE_R * 2.2, dl), (P.SCREEN_R * .46, dl)],
                  12, 'X', (db0, 0, zc), mat=cast, target=c,
                  smooth=radians(14), phase=radians(15), bev=0.004)]
    for sy in (-1, 1):
        dp.append(G.box("DIE_cover", (db0 + dl * .30, sy * (P.DIE_H * .42), zc),
                        (dl * .42, 0.014, P.DIE_H * .54), barrel, c, bev=0.006))
        for (dx, dz) in ((-0.030, 0.052), (0.034, 0.048), (0.002, -0.050)):
            dp.append(G.socket_screw("DIE_pbolt", 0.0105, 0.007, 'Y',
                                     (db0 + dl * .30 + dx,
                                      sy * (P.DIE_H * .42 + 0.008), zc + dz),
                                     bolt, c, dark))
    flange_bolts(dp, db0 + 0.010, P.DIE_H * .40, 8, 0.011, "DIE_fb")
    out["DIE_HOUSING"] = G.join(dp, "DIE_HOUSING", None, c)

    # ---- nozzle + brass extrudate -----------------------------------------
    nl = nz1 - nz0
    npz = [G.lathe("DIE_nozzle",
                   [(0, 0), (P.NOZZLE_R * 1.80, 0), (P.NOZZLE_R * 1.80, nl * .34),
                    (P.NOZZLE_R * 1.22, nl * .44), (P.NOZZLE_R * 1.22, nl * .62),
                    (0, nl * .62)],
                   P.Q_MED, 'X', (nz0, 0, zc), mat=steel, target=c)]
    out["DIE_NOZZLE"] = G.join(npz, "DIE_NOZZLE", None, c)

    ex0 = nz0 + nl * .62
    out["EXTRUDATE"] = G.cyl("EXTRUDATE", P.NOZZLE_R * .84, nz1 - ex0 + 0.004,
                             'X', ((ex0 + nz1) * .5, 0, zc), P.Q_MED, brass, c,
                             chamfer=0.006)
    return out
