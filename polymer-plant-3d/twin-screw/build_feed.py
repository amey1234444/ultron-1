# -*- coding: utf-8 -*-
"""FEEDING_SYSTEM_ASSEMBLY -- the second priority assembly.

Two independent material-entry paths, plus the devolatilisation vent:

    MAIN_FEED_SYSTEM   hopper lid / body / cone / neck / clamp,
                       concealed metering feeder + drive, chute, throat
    SIDE_FEED_SYSTEM   flared lip, body, cone, housing, drive, metering
                       screw, chute, barrel port
    VENT_ASSEMBLY      barrel port, neck, perforated body, cap, and the two
                       separate VENT PRESSURE / VENT TEMP fittings

The side feeder sits in the physical break between TZ-04 and TZ-05, and the
vent in the break between TZ-07 and TZ-08; both X positions come from
lib_params.BARREL_LAYOUT rather than being hardcoded here.

MAIN FEED RPM / RATE / CURR and SIDE FEED RPM / RATE / CURR are different
devices from SCREW-1 and SCREW-2 and are never cross-wired.
"""

import bpy
from math import pi, cos, sin, radians

import lib_params as P
import lib_geo as G
import lib_mat as M

# ---------------------------------------------------------------------------
# main hopper stack, bottom -> top
# ---------------------------------------------------------------------------
Z_NECK_B = 0.648
Z_NECK_T = Z_NECK_B + P.HOP_NECK_H          # 0.763
Z_CONE_T = Z_NECK_T + P.HOP_CONE_H          # 1.093
Z_CYL_T = Z_CONE_T + P.HOP_CYL_H            # 1.245


def build_main_feed(root):
    c = G.coll("MAIN_FEED_SYSTEM", root)
    bright = M.get("MAT_stainless_b")
    steel = M.get("MAT_stainless")
    cast = M.get("MAT_cast_gray")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    cav = M.get("MAT_cavity")
    screw_mat = M.get("MAT_screw_steel")
    out = {}

    R, r, w = P.HOP_R, P.HOP_NECK_R, P.HOP_WALL
    x = P.HOP_X

    # ---- thin-walled vessel: up the outside, rolled rim, down the inside ---
    prof = [
        (r, Z_NECK_B), (r, Z_NECK_T), (R, Z_CONE_T), (R, Z_CYL_T),
        (R + 0.009, Z_CYL_T + 0.009), (R + 0.009, Z_CYL_T + 0.018),
        (R, Z_CYL_T + 0.026), (R - w, Z_CYL_T + 0.020),
        (R - w, Z_CONE_T - 0.004), (r - w, Z_NECK_T - 0.006),
        (r - w, Z_NECK_B),
    ]
    out["MAIN_HOPPER_BODY"] = G.lathe("MAIN_HOPPER_BODY", prof, P.Q_LARGE, 'Z',
                                      (x, 0, 0), mat=bright, target=c)

    # ---- lid + centred capped fitting -------------------------------------
    lp = [G.lathe("MHL_plate",
                  [(0, Z_CYL_T + 0.020), (R - 0.004, Z_CYL_T + 0.020),
                   (R - 0.004, Z_CYL_T + 0.034), (0, Z_CYL_T + 0.034)],
                  P.Q_LARGE, 'Z', (x, 0, 0), mat=bright, target=c)]
    lp.append(G.lathe("MHL_fit",
                      [(0, 0), (0.036, 0), (0.036, 0.030), (0.030, 0.030),
                       (0.030, 0.040), (0, 0.040)],
                      P.Q_MED, 'Z', (x, 0, Z_CYL_T + 0.034), mat=steel, target=c))
    lp.append(G.lathe("MHL_cap", [(0, 0), (0.026, 0), (0.026, 0.014), (0, 0.014)],
                      6, 'Z', (x, 0, Z_CYL_T + 0.074), mat=cast, target=c,
                      smooth=radians(20)))
    out["MAIN_HOPPER_LID"] = G.join(lp, "MAIN_HOPPER_LID", None, c)

    # ---- clamp rings, latches, gasket seams --------------------------------
    cp = []
    for (zz, rr) in ((Z_CONE_T, R), (Z_NECK_T, r * 1.02), (Z_NECK_B + 0.010, r * 1.02)):
        cp.append(G.lathe("MHC_ring",
                          [(rr, -0.011), (rr + 0.017, -0.011),
                           (rr + 0.017, 0.011), (rr, 0.011)],
                          P.Q_CYL, 'Z', (x, 0, zz), mat=steel, target=c))
        cp.append(G.lathe("MHC_gasket",
                          [(rr + 0.002, -0.002), (rr + 0.019, -0.002),
                           (rr + 0.019, 0.002), (rr + 0.002, 0.002)],
                          P.Q_CYL, 'Z', (x, 0, zz), mat=dark, target=c))
    for k in range(3):
        a = 2 * pi * k / 3 + radians(24)
        px, py = x + (R + 0.026) * cos(a), (R + 0.026) * sin(a)
        cp.append(G.box("MHC_latch", (px, py, Z_CONE_T), (0.030, 0.030, 0.052),
                        steel, c, bev=0.004))
        cp.append(G.cyl("MHC_pin", 0.007, 0.044, 'Z', (px, py, Z_CONE_T + 0.034),
                        P.Q_CYL_LOW, bolt, c))
    for k in range(8):
        a = 2 * pi * k / 8
        cp.append(G.socket_screw("MHC_nbolt", 0.008, 0.006, 'Z',
                                 (x + (r + 0.009) * cos(a), (r + 0.009) * sin(a),
                                  Z_NECK_T + 0.011), bolt, c, dark))
    out["MAIN_HOPPER_CLAMP"] = G.join(cp, "MAIN_HOPPER_CLAMP", None, c)

    # ---- feed chute + throat box down onto the barrel ----------------------
    tp = [G.box("MFT_chute", (x, 0, (P.THROAT_Z + Z_NECK_B) * .5),
                (0.168, 0.168, Z_NECK_B - P.THROAT_Z + 0.010), steel, c, bev=0.007)]
    tp.append(G.lathe("MFT_collar",
                      [(r - 0.004, 0), (r + 0.006, 0), (r + 0.006, 0.030),
                       (r - 0.004, 0.030)],
                      P.Q_CYL, 'Z', (x, 0, Z_NECK_B - 0.014), mat=steel, target=c))
    out["MAIN_FEED_CHUTE"] = G.join(tp, "MAIN_FEED_CHUTE", None, c)

    thp = [G.box("MFTH_box", (x, 0, (P.THROAT_Z + P.BARREL_Z1) * .5 + 0.006),
                 (0.196, 0.240, max(0.020, P.THROAT_Z - P.BARREL_Z1 + 0.024)),
                 steel, c, bev=0.007)]
    thp.append(G.box("MFTH_cavity", (x, -0.002, P.THROAT_Z - 0.010),
                     (0.130, 0.130, 0.040), cav, c, bev=0))
    out["MAIN_FEED_THROAT"] = G.join(thp, "MAIN_FEED_THROAT", None, c)

    # ---- concealed metering feeder + drive ---------------------------------
    # Inferred internal geometry: a vertical metering auger in the neck driven
    # by a compact gearmotor tucked behind the throat (+Y), so the reference
    # silhouette is unchanged in normal mode.
    aug, _ = G.twist_extrude(
        "MAIN_FEEDER_SCREW_geo",
        G.auger_profile(r * 0.30, r * 0.80, 30.0, P.Q_MED),
        0.0, Z_NECK_T - Z_NECK_B + 0.06, pitch=0.085, mat=screw_mat, target=c,
        slices_per_turn=P.Q_SLICES_TURN)
    aug.rotation_euler = (0.0, radians(-90.0), 0.0)     # +X sweep -> +Z
    aug.location = (x, 0.0, Z_NECK_B - 0.03)
    out["MAIN_FEEDER_SCREW"] = aug

    dp = [G.cyl("MFD_motor", 0.052, 0.120, 'Y', (x, 0.175, Z_NECK_B + 0.03),
                P.Q_MED, M.get("MAT_motor_body"), c, chamfer=0.006)]
    dp.append(G.box("MFD_gearcase", (x, 0.100, Z_NECK_B + 0.03),
                    (0.090, 0.070, 0.096), cast, c, bev=0.006))
    dp.append(G.cyl("MFD_shaft", 0.014, 0.070, 'Y', (x, 0.058, Z_NECK_B + 0.03),
                    P.Q_CYL_LOW, steel, c))
    out["MAIN_FEEDER_DRIVE"] = G.join(dp, "MAIN_FEEDER_DRIVE", None, c)

    # ---- pellet bed, revealed by the translucent / cutaway hopper mode -----
    fill = G.frustum("MAIN_HOPPER_LEVEL", P.HOP_R * 0.982, P.HOP_NECK_R * 1.2,
                     P.HOP_CONE_H, 'Z', (x, 0, Z_NECK_T + P.HOP_CONE_H * .5),
                     P.Q_CYL, M.get("MAT_pellet_cool"), c)
    fill.hide_render = True
    fill.hide_viewport = True
    out["MAIN_HOPPER_LEVEL"] = fill
    return out


# ---------------------------------------------------------------------------
# side feed system
# ---------------------------------------------------------------------------

def build_side_feed(root):
    c = G.coll("SIDE_FEED_SYSTEM", root)
    bright = M.get("MAT_stainless_b")
    steel = M.get("MAT_stainless")
    dark = M.get("MAT_dark")
    cav = M.get("MAT_cavity")
    bolt = M.get("MAT_bolt")
    cast = M.get("MAT_cast_gray")
    screw_mat = M.get("MAT_screw_steel")
    out = {}

    x = P.SF_X
    z_top = P.SF_TOP_Z
    z_fun_b = z_top - P.SF_CONE_H
    z_thr_b = z_fun_b - 0.036
    z_body_t = z_thr_b - 0.014
    z_body_b = z_body_t - P.SF_BODY_H
    z_barrel = P.BARREL_Z1

    # flared funnel with a rolled lip
    r_thr = P.SF_R * 0.40
    prof = [(r_thr, z_thr_b), (r_thr, z_fun_b), (P.SF_R, z_top),
            (P.SF_R + 0.006, z_top + 0.007), (P.SF_R - 0.004, z_top + 0.004),
            (P.SF_R - 0.008, z_top - 0.004), (r_thr - 0.005, z_fun_b + 0.004),
            (r_thr - 0.005, z_thr_b)]
    out["SIDE_HOPPER_CONE"] = G.lathe("SIDE_HOPPER_CONE", prof, P.Q_CYL, 'Z',
                                      (x, 0, 0), mat=bright, target=c)

    bp = [G.box("SFH_body", (x, 0, (z_body_b + z_body_t) * .5),
                (P.SF_BODY_W, P.SF_BODY_W, P.SF_BODY_H), dark, c, bev=0.006)]
    bp.append(G.box("SFH_window", (x, -P.SF_BODY_W * .5 - 0.002,
                                   (z_body_b + z_body_t) * .5),
                    (P.SF_BODY_W * .6, 0.006, P.SF_BODY_H * .62), cav, c, bev=0.002))
    for zz in (z_body_t + 0.010, z_body_b - 0.010):
        bp.append(G.box("SFH_flange", (x, 0, zz),
                        (P.SF_BODY_W + 0.036, P.SF_BODY_W + 0.036, 0.018),
                        steel, c, bev=0.005))
        for sx in (-1, 1):
            for sy in (-1, 1):
                bp.append(G.socket_screw("SFH_bolt", 0.0065, 0.005, 'Z',
                                         (x + sx * (P.SF_BODY_W * .5 + 0.012),
                                          sy * (P.SF_BODY_W * .5 + 0.012),
                                          zz + 0.009), bolt, c, dark))
    # small side fitting + adjuster knob, as in the reference
    bp.append(G.cyl("SFH_fitting", 0.016, 0.052, 'Y',
                    (x, -P.SF_BODY_W * .5 - 0.026, z_body_t - 0.028), P.Q_MED,
                    steel, c, chamfer=0.003))
    bp.append(G.lathe("SFH_knob",
                      [(0, 0), (0.022, 0), (0.022, 0.014), (0.016, 0.018), (0, 0.018)],
                      P.Q_CYL_LOW, 'Y',
                      (x, -P.SF_BODY_W * .5 - 0.052, z_body_t - 0.028),
                      mat=cast, target=c))
    out["SIDE_FEEDER_HOUSING"] = G.join(bp, "SIDE_FEEDER_HOUSING", None, c)

    # metering screw inside the feeder body, vertical into the barrel port
    aug, _ = G.twist_extrude(
        "SIDE_FEEDER_SCREW_geo",
        G.auger_profile(P.SF_BODY_W * 0.13, P.SF_BODY_W * 0.34, 32.0, P.Q_MED),
        0.0, z_body_t - z_barrel, pitch=0.062, mat=screw_mat, target=c,
        slices_per_turn=P.Q_SLICES_TURN)
    aug.rotation_euler = (0.0, radians(-90.0), 0.0)
    aug.location = (x, 0.0, z_barrel)
    out["SIDE_FEEDER_SCREW"] = aug

    # compact gearmotor behind the housing (+Y), invisible from the reference
    dp = [G.cyl("SFD_motor", 0.040, 0.098, 'Y', (x, 0.132, z_body_t - 0.030),
                P.Q_MED, M.get("MAT_motor_body"), c, chamfer=0.005)]
    dp.append(G.box("SFD_gearcase", (x, 0.074, z_body_t - 0.030),
                    (0.070, 0.058, 0.076), cast, c, bev=0.005))
    out["SIDE_FEEDER_DRIVE"] = G.join(dp, "SIDE_FEEDER_DRIVE", None, c)

    # chute down into the dedicated barrel port
    cp = [G.box("SFC_chute", (x, 0, (z_barrel + z_body_b) * .5),
                (P.SF_BODY_W * .84, P.SF_BODY_W * .84,
                 max(0.02, z_body_b - z_barrel + 0.01)), steel, c, bev=0.006)]
    out["SIDE_FEED_CHUTE"] = G.join(cp, "SIDE_FEED_CHUTE", None, c)

    pp = [G.box("SFP_saddle", (x, 0, z_barrel + 0.048),
                (0.150, 0.178, 0.030), cast, c, bev=0.006)]
    for sx in (-1, 1):
        pp.append(G.socket_screw("SFP_bolt", 0.0075, 0.006, 'Z',
                                 (x + sx * 0.058, 0.062, z_barrel + 0.063),
                                 bolt, c, dark))
    out["SIDE_FEED_BARREL_PORT"] = G.join(pp, "SIDE_FEED_BARREL_PORT", None, c)
    return out


# ---------------------------------------------------------------------------
# vent / devolatilisation stack
# ---------------------------------------------------------------------------

def build_vent(root):
    c = G.coll("VENT_ASSEMBLY", root)
    steel = M.get("MAT_stainless")
    mesh = M.get("MAT_mesh")
    cav = M.get("MAT_cavity")
    cast = M.get("MAT_cast_gray")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    out = {}

    x = P.VENT_X
    R = P.VENT_R
    z_top = P.VENT_TOP_Z
    z_cap_b = z_top - 0.042
    z_mesh_t = z_cap_b - 0.012
    z_mesh_b = z_mesh_t - P.VENT_MESH_H
    z_base = P.BARREL_Z1

    parts = [G.lathe("VNT_cap",
                     [(0, z_cap_b), (R * 1.16, z_cap_b), (R * 1.16, z_top - 0.008),
                      (R * 1.02, z_top), (0, z_top)],
                     P.Q_CYL, 'Z', (x, 0, 0), mat=steel, target=c)]
    parts.append(G.cyl("VNT_cavity", R * 0.80, z_mesh_t - z_mesh_b + 0.02, 'Z',
                       (x, 0, (z_mesh_b + z_mesh_t) * .5), P.Q_MED, cav, c))

    # perforated guard built from instanced rings + bars, not a plain pipe
    nc, na = P.VENT_MESH_HOLES
    for j in range(na + 1):
        zz = z_mesh_b + (z_mesh_t - z_mesh_b) * j / na
        parts.append(G.lathe("VNT_ring%d" % j,
                             [(R * 0.94, -0.0022), (R, -0.0022),
                              (R, 0.0022), (R * 0.94, 0.0022)],
                             P.Q_MED, 'Z', (x, 0, zz), mat=mesh, target=c))
    for k in range(nc):
        a = 2 * pi * k / nc
        parts.append(G.box("VNT_bar%d" % k,
                           (x + R * 0.97 * cos(a), R * 0.97 * sin(a),
                            (z_mesh_b + z_mesh_t) * .5),
                           (0.0042, 0.0042, z_mesh_t - z_mesh_b), mesh, c, bev=0))

    for zz in (z_mesh_b - 0.010, z_mesh_t + 0.008):
        parts.append(G.lathe("VNT_flange",
                             [(R * 0.86, -0.009), (R * 1.30, -0.009),
                              (R * 1.30, 0.009), (R * 0.86, 0.009)],
                             P.Q_MED, 'Z', (x, 0, zz), mat=steel, target=c))
        for k in range(6):
            a = 2 * pi * k / 6 + radians(30)
            parts.append(G.socket_screw("VNT_b", 0.006, 0.005, 'Z',
                                        (x + R * 1.12 * cos(a), R * 1.12 * sin(a),
                                         zz + 0.009), bolt, c, dark))
    parts.append(G.cyl("VNT_neck", R * 0.88, z_mesh_b - z_base + 0.02, 'Z',
                       (x, 0, (z_base + z_mesh_b) * .5), P.Q_MED, steel, c))
    parts.append(G.box("VNT_port", (x, 0, z_base + 0.048),
                       (0.140, 0.170, 0.030), cast, c, bev=0.006))
    out["VENT_STACK"] = G.join(parts, "VENT_STACK", None, c)

    # VENT PRESSURE take-off at the top, VENT TEMP on the body -- two separate
    # fittings, never merged (master prompt V2 section 6A.5)
    out["SENSOR_VENT_PRESSURE"] = G.pressure_boss(
        "SENSOR_VENT_PRESSURE", (x, 0.0, z_top), axis='Z', sign=1,
        mat=steel, dark=dark, body_mat=cast, target=c,
        boss_r=0.021, boss_h=0.022, body_r=0.015, body_h=0.040, seg=P.Q_MED)

    out["SENSOR_VENT_TEMP"] = G.pressure_boss(
        "SENSOR_VENT_TEMP", (x, -R * 0.90, z_mesh_b - 0.030), axis='Y', sign=-1,
        mat=steel, dark=dark, body_mat=cast, target=c,
        boss_r=0.017, boss_h=0.018, body_r=0.012, body_h=0.034,
        seg=P.Q_MED, capped=True)
    return out


def build(root):
    fs = G.coll("FEEDING_SYSTEM_ASSEMBLY", root)
    out = {}
    out.update(build_main_feed(fs))
    out.update(build_side_feed(fs))
    out.update(build_vent(root))
    return out
