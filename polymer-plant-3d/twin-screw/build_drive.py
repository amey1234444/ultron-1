# -*- coding: utf-8 -*-
"""Motor assembly, coupling and gearbox / drive housing."""

import bpy
from math import pi, radians, cos, sin

import lib_params as P
import lib_geo as G
import lib_mat as M


# ---------------------------------------------------------------------------
# motor
# ---------------------------------------------------------------------------

def build_motor(root):
    c = G.coll("MOTOR", root)
    body = M.get("MAT_motor_body")
    fin = M.get("MAT_motor_fin")
    cast = M.get("MAT_cast_gray")
    steel = M.get("MAT_stainless")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")

    x0, x1 = P.X_MOTOR
    zc = P.Z_MOTOR
    out = {}

    # ---- rear fan shroud / end bell ---------------------------------------
    sx0 = x0 + 0.010
    sh = P.MOTOR_SHROUD_L
    prof = [(0.0, 0.0), (P.MOTOR_SHROUD_R * 0.42, 0.0),
            (P.MOTOR_SHROUD_R * 0.86, 0.016), (P.MOTOR_SHROUD_R, 0.040),
            (P.MOTOR_SHROUD_R, sh - 0.012), (P.MOTOR_SHROUD_R * 0.99, sh),
            (0.0, sh)]
    shroud = G.lathe("MOTOR_fan_shroud", prof, P.Q_CYL, 'X', (sx0, 0, zc),
                     mat=cast, target=c)
    # cooling slots in the shroud face
    slots = []
    for i in range(12):
        a = 2 * pi * i / 12
        slots.append(G.box("slot%d" % i,
                           (sx0 + 0.004, P.MOTOR_SHROUD_R * .62 * cos(a),
                            zc + P.MOTOR_SHROUD_R * .62 * sin(a)),
                           (0.010, 0.020, 0.048), dark, c, bev=0.002))
    out["MOTOR_fan_shroud"] = G.join([shroud] + slots, "MOTOR_fan_shroud", None, c)

    # ---- finned stator body ------------------------------------------------
    bx0 = sx0 + sh
    core_r = P.MOTOR_BODY_R - P.MOTOR_FIN_D
    parts = [G.cyl("MOTOR_core", core_r, P.MOTOR_BODY_L + 0.02, 'X',
                   (bx0 + P.MOTOR_BODY_L * .5, 0, zc), P.Q_CYL, body, c)]
    pitchf = P.MOTOR_BODY_L / P.MOTOR_FIN_N
    for i in range(P.MOTOR_FIN_N):
        fx = bx0 + pitchf * (i + 0.5)
        parts.append(G.tube("MOTOR_fin%02d" % i, P.MOTOR_BODY_R, core_r - 0.004,
                            P.MOTOR_FIN_T, 'X', (fx, 0, zc), P.Q_CYL, fin, c))
    # cast ribs the fins are broken by, top and bottom
    for s in (1, -1):
        parts.append(G.box("MOTOR_rib%d" % s,
                           (bx0 + P.MOTOR_BODY_L * .5, 0,
                            zc + s * (P.MOTOR_BODY_R - P.MOTOR_FIN_D * .35)),
                           (P.MOTOR_BODY_L, 0.052, P.MOTOR_FIN_D * .8),
                           body, c, bev=0.004))
    out["MOTOR_body"] = G.join(parts, "MOTOR_body", None, c)

    # ---- terminal box ------------------------------------------------------
    tl, tw, th = P.MOTOR_TBOX
    tz = zc + P.MOTOR_BODY_R + th * .5 - 0.012
    tx = bx0 + P.MOTOR_BODY_L * .46
    tparts = [G.box("MOTOR_tbox_b", (tx, 0, tz), (tl, tw, th), body, c, bev=0.007),
              G.box("MOTOR_tbox_lid", (tx, 0, tz + th * .5 + 0.010),
                    (tl * .94, tw * .94, 0.020), body, c, bev=0.005)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            tparts.append(G.socket_screw(
                "MOTOR_tbolt", 0.0075, 0.006, 'Z',
                (tx + sx * tl * .38, sy * tw * .38, tz + th * .5 + 0.020),
                bolt, c, dark))
    # gland plate on the side
    tparts.append(G.cyl("MOTOR_gland", 0.020, 0.030, 'Y',
                        (tx, -tw * .5 - 0.012, tz), 24, cast, c, chamfer=0.004))
    out["MOTOR_terminal_box"] = G.join(tparts, "MOTOR_terminal_box", None, c)

    # ---- drive end bell + shaft -------------------------------------------
    ex0 = bx0 + P.MOTOR_BODY_L
    eprof = [(0.0, 0.0), (P.MOTOR_BODY_R * .97, 0.0), (P.MOTOR_ENDBELL_R, 0.030),
             (P.MOTOR_ENDBELL_R, 0.052), (P.MOTOR_ENDBELL_R * .72, 0.068),
             (P.MOTOR_ENDBELL_R * .60, 0.070), (0.0, 0.070)]
    eparts = [G.lathe("MOTOR_endbell", eprof, P.Q_CYL, 'X', (ex0, 0, zc),
                      mat=cast, target=c)]
    eparts.append(G.cyl("MOTOR_shaft_boss", P.MOTOR_SHAFT_R * 1.9, 0.034, 'X',
                        (ex0 + 0.084, 0, zc), 36, cast, c, chamfer=0.004))
    for i in range(6):
        a = 2 * pi * i / 6 + radians(30)
        eparts.append(G.socket_screw(
            "MOTOR_ebolt", 0.008, 0.007, 'X',
            (ex0 + 0.002, P.MOTOR_ENDBELL_R * .78 * cos(a),
             zc + P.MOTOR_ENDBELL_R * .78 * sin(a)), bolt, c, dark))
    out["MOTOR_end_bell"] = G.join(eparts, "MOTOR_end_bell", None, c)

    shaft_x0 = ex0 + 0.100
    out["MOTOR_shaft"] = G.cyl("MOTOR_shaft", P.MOTOR_SHAFT_R,
                               (x1 - shaft_x0) + 0.02, 'X',
                               (shaft_x0 + (x1 - shaft_x0) * .5, 0, zc),
                               36, steel, c, chamfer=0.004)
    G.set_origin(out["MOTOR_shaft"], (shaft_x0, 0, zc))

    # ---- feet, base plates, anchors ---------------------------------------
    foot_z0 = 0.100
    fparts = []
    for fx in (bx0 + 0.030, ex0 - 0.030):
        for sy in (-1, 1):
            fparts.append(G.box("MOTOR_foot",
                                (fx, sy * 0.140, (foot_z0 + zc - P.MOTOR_BODY_R * .55) * .5),
                                (0.070, 0.048, zc - P.MOTOR_BODY_R * .55 - foot_z0 + 0.10),
                                body, c, bev=0.005))
            fparts.append(G.box("MOTOR_footpad", (fx, sy * 0.140, foot_z0 + 0.012),
                                (0.096, 0.078, 0.026), body, c, bev=0.005))
    out["MOTOR_feet"] = G.join(fparts, "MOTOR_feet", None, c)

    bl, bw, bh = P.MOTOR_BASE
    bxc = (bx0 + ex0) * .5
    bparts = [G.box("MOTOR_base_lo", (bxc, 0, bh * .5), (bl, bw, bh), cast, c, bev=0.006),
              G.box("MOTOR_base_hi", (bxc, 0, bh + 0.026),
                    (bl * .82, bw * .82, 0.052), cast, c, bev=0.006)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            bparts.append(G.hex_head("MOTOR_anchor", 0.016, 0.014, 'Z',
                                     (bxc + sx * bl * .40, sy * bw * .40, bh),
                                     bolt, c))
    out["MOTOR_base"] = G.join(bparts, "MOTOR_base", None, c)
    return out


# ---------------------------------------------------------------------------
# coupling
# ---------------------------------------------------------------------------

def build_coupling(root):
    c = G.coll("COUPLING", root)
    steel = M.get("MAT_stainless")
    cast = M.get("MAT_cast_gray")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    x0, x1 = P.X_COUPLING
    zc = P.Z_MOTOR
    out = {}

    hub_r = 0.062
    parts = []
    for i, hx in enumerate((x0 + 0.022, x1 - 0.022)):
        parts.append(G.lathe("CPL_hub%d" % i,
                             [(P.MOTOR_SHAFT_R * .9, -0.026), (hub_r, -0.026),
                              (hub_r, 0.026), (P.MOTOR_SHAFT_R * .9, 0.026)],
                             36, 'X', (hx, 0, zc), mat=steel, target=c))
        for k in range(6):
            a = 2 * pi * k / 6
            parts.append(G.cyl("CPL_pin", 0.0075, 0.062, 'X',
                               (x0 + (x1 - x0) * .5, hub_r * .66 * cos(a),
                                zc + hub_r * .66 * sin(a)), 16, dark, c))
    parts.append(G.cyl("CPL_spacer", hub_r * .78, (x1 - x0) - 0.096, 'X',
                       ((x0 + x1) * .5, 0, zc), 36, cast, c, chamfer=0.004))
    out["COUPLING"] = G.join(parts, "COUPLING", None, c)
    G.set_origin(out["COUPLING"], ((x0 + x1) * .5, 0, zc))
    return out


# ---------------------------------------------------------------------------
# gearbox
# ---------------------------------------------------------------------------

def build_gearbox(root):
    c = G.coll("GEARBOX", root)
    cast = M.get("MAT_cast_gray")
    light = M.get("MAT_cast_light")
    steel = M.get("MAT_stainless")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    out = {}

    x0, x1 = P.X_GEARBOX
    zc = P.Z_SCREW
    body_z0 = P.GB_BOT_Z
    body_zc = (body_z0 + P.GB_TOP_Z) * .5
    body_h = P.GB_TOP_Z - body_z0
    bxc = (P.GB_X0 + P.GB_X1) * .5
    bl = P.GB_X1 - P.GB_X0
    yf = -P.GB_BODY_W * .5                      # front face, toward the camera

    # ---- main cast housing, stepped as in the reference --------------------
    parts = [G.box("GB_body", (bxc, 0, body_zc), (bl, P.GB_BODY_W, body_h),
                   cast, c, bev=0.012, seg=3)]
    # narrower raised upper section
    parts.append(G.box("GB_upper", (bxc - bl * .06, 0, P.GB_TOP_Z + 0.026),
                       (bl * .62, P.GB_BODY_W * .78, 0.058), cast, c,
                       bev=0.010, seg=3))
    # stepped drive-side shoulder
    parts.append(G.box("GB_shoulder", (bxc + bl * .34, 0, body_zc - 0.030),
                       (bl * .34, P.GB_BODY_W + 0.034, body_h * .74),
                       cast, c, bev=0.010, seg=3))
    # inset inspection panel on the visible face (and its twin behind)
    for sy in (-1, 1):
        parts.append(G.box("GB_panel",
                           (bxc - bl * .13, sy * (P.GB_BODY_W * .5 + 0.014),
                            body_zc - 0.014),
                           (bl * .46, 0.012, body_h * .60), light, c, bev=0.008))
        parts.append(G.box("GB_panel_lip",
                           (bxc - bl * .13, sy * (P.GB_BODY_W * .5 + 0.006),
                            body_zc - 0.014),
                           (bl * .52, 0.010, body_h * .66), cast, c, bev=0.006))
    # cast seam between the two housing halves
    parts.append(G.box("GB_seam", (bxc, 0, body_zc + body_h * .16),
                       (bl * 1.004, P.GB_BODY_W * 1.004, 0.006), dark, c, bev=0))
    out["GEARBOX_housing"] = G.join(parts, "GEARBOX_housing", None, c)

    # ---- inspection plugs / caps on the visible face ----------------------
    pparts = []
    for sy in (-1, 1):
        yy = sy * (P.GB_BODY_W * .5 + 0.020)
        for (px, pz, pr) in ((bxc - bl * .13, body_zc + body_h * .17, 0.030),
                             (bxc - bl * .13, body_zc - body_h * .19, 0.030),
                             (bxc + bl * .30, body_zc + body_h * .12, 0.036),
                             (bxc + bl * .30, body_zc - body_h * .22, 0.028)):
            pparts.append(G.lathe("GB_plug",
                                  [(0, 0), (pr, 0), (pr, 0.013), (pr * .74, 0.020),
                                   (0, 0.020)],
                                  28, 'Y', (px, yy, pz), mat=light, target=c))
            pparts.append(G.lathe("GB_plug_i",
                                  [(0, 0), (pr * .46, 0), (pr * .46, 0.005), (0, 0.005)],
                                  20, 'Y', (px, yy + sy * 0.019, pz), mat=dark,
                                  target=c))
    out["GEARBOX_plugs"] = G.join(pparts, "GEARBOX_plugs", None, c)

    # ---- perimeter fasteners ----------------------------------------------
    fparts = []
    for sy in (-1, 1):
        yy = sy * (P.GB_BODY_W * .5 + 0.012)
        for i in range(6):
            fx = bxc - bl * .43 + bl * .86 * i / 5
            for fz in (body_zc + body_h * .44, body_zc - body_h * .44):
                fparts.append(G.socket_screw("GB_bolt", 0.011, 0.008, 'Y',
                                             (fx, yy, fz), bolt, c, dark))
    out["GEARBOX_fasteners"] = G.join(fparts, "GEARBOX_fasteners", None, c)

    # ---- lifting eye -------------------------------------------------------
    ex = bxc - bl * .10
    z_eye = P.GB_TOP_Z + 0.055                 # sits on the raised upper section
    eparts = [G.box("GB_eye_boss", (ex, 0, z_eye + 0.014),
                    (0.070, 0.070, 0.030), cast, c, bev=0.006)]
    ring = []
    import math
    rr, tr = 0.036, 0.010
    for j in range(28):
        aj = 2 * math.pi * j / 28
        for i in range(14):
            ai = 2 * math.pi * i / 14
            R = rr + tr * math.cos(ai)
            ring.append((ex + R * math.cos(aj), R * math.sin(aj) * 0.0 + tr * math.sin(ai),
                         z_eye + 0.030 + rr))
    # simple torus in the XZ plane
    rv, rf = [], []
    for j in range(28):
        aj = 2 * math.pi * j / 28
        for i in range(14):
            ai = 2 * math.pi * i / 14
            R = rr + tr * math.cos(ai)
            rv.append((ex + R * math.cos(aj), tr * math.sin(ai),
                       z_eye + 0.058 + R * math.sin(aj)))
    for j in range(28):
        for i in range(14):
            a = j * 14 + i
            b = j * 14 + (i + 1) % 14
            cc = ((j + 1) % 28) * 14 + (i + 1) % 14
            d = ((j + 1) % 28) * 14 + i
            rf.append((a, b, cc, d))
    eparts.append(G.mk("GB_eye_ring", rv, rf, steel, c))
    out["GEARBOX_lifting_eye"] = G.join(eparts, "GEARBOX_lifting_eye", None, c)

    # ---- input transition from the coupling -------------------------------
    ix0 = x0 - 0.006
    iparts = [G.lathe("GB_input",
                      [(P.GB_INPUT_R * .42, 0), (P.GB_INPUT_R, 0),
                       (P.GB_INPUT_R, 0.052), (P.GB_INPUT_R * 1.18, 0.052),
                       (P.GB_INPUT_R * 1.18, 0.076), (P.GB_INPUT_R * .42, 0.076)],
                      P.Q_CYL, 'X', (ix0, 0, P.Z_MOTOR), mat=cast, target=c)]
    iparts.append(G.cyl("GB_input_shaft", P.MOTOR_SHAFT_R * 1.02, 0.10, 'X',
                        (ix0 - 0.030, 0, P.Z_MOTOR), 32, steel, c, chamfer=0.003))
    for k in range(6):
        a = 2 * pi * k / 6 + radians(30)
        iparts.append(G.socket_screw("GB_ibolt", 0.008, 0.006, 'X',
                                     (ix0 + 0.001, P.GB_INPUT_R * .74 * cos(a),
                                      P.Z_MOTOR + P.GB_INPUT_R * .74 * sin(a)),
                                     bolt, c, dark))
    out["GEARBOX_input"] = G.join(iparts, "GEARBOX_input", None, c)

    # ---- output flange / twin bearing housing -----------------------------
    fx0 = bxc + bl * .5
    fl = x1 - fx0
    oparts = [G.lathe("GB_out_hub",
                      [(0, 0), (P.GB_FLANGE_R * .80, 0),
                       (P.GB_FLANGE_R * .80, fl * .34),
                       (P.GB_FLANGE_R, fl * .34), (P.GB_FLANGE_R, fl * .58),
                       (P.GB_FLANGE_R * .86, fl * .58), (P.GB_FLANGE_R * .86, fl),
                       (0, fl)],
                      P.Q_CYL, 'X', (fx0, 0, zc), mat=cast, target=c)]
    for k in range(10):
        a = 2 * pi * k / 10 + radians(18)
        oparts.append(G.hex_head("GB_fbolt", 0.012, 0.011, 'X',
                                 (fx0 + fl * .58, P.GB_FLANGE_R * .90 * cos(a),
                                  zc + P.GB_FLANGE_R * .90 * sin(a)), bolt, c))
    out["GEARBOX_output_flange"] = G.join(oparts, "GEARBOX_output_flange", None, c)

    # ---- feet + base plate -------------------------------------------------
    gl, gw, gh = P.GB_BASE
    gparts = [G.box("GB_base", (bxc, 0, gh * .5), (gl, gw, gh), cast, c, bev=0.007)]
    gparts.append(G.box("GB_pedestal", (bxc, 0, gh + (body_z0 - gh) * .5),
                        (gl * .74, gw * .70, body_z0 - gh), cast, c, bev=0.008))
    for sx in (-1, 1):
        gparts.append(G.box("GB_gusset", (bxc + sx * gl * .30, 0, gh + 0.030),
                            (0.055, gw * .52, 0.060), cast, c, bev=0.006))
        for sy in (-1, 1):
            gparts.append(G.hex_head("GB_anchor", 0.017, 0.015, 'Z',
                                     (bxc + sx * gl * .40, sy * gw * .40, gh),
                                     bolt, c))
    out["GEARBOX_base"] = G.join(gparts, "GEARBOX_base", None, c)
    return out


def build(root):
    out = {}
    out.update(build_motor(root))
    out.update(build_coupling(root))
    out.update(build_gearbox(root))
    return out
