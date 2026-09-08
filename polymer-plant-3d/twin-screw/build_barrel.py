# -*- coding: utf-8 -*-
"""Modular barrel, built from the mandatory process topology.

Master prompt V2 section 6B fixes the left-to-right order:

    MAIN HOPPER / FEED THROAT
      -> TZ-01 -> TZ-02 -> TZ-03 -> TZ-04
      -> SIDE FEEDER PORT
      -> TZ-05 -> TZ-06 -> TZ-07
      -> VENT ASSEMBLY
      -> TZ-08
      -> melt adapter / screen pack / die

Four zones before the side feeder, three between the side feeder and the vent,
one after the vent. The side feeder and the vent are real physical breaks in
the module rhythm, not zones with their caps removed. Everything here is
derived from `lib_params.BARREL_LAYOUT`, so the order exists in exactly one
place.

Each slot becomes separate objects so the runtime viewer can open the barrel
without leaving floating pieces:

    BARREL_<CODE>_body     rails + back shell + bore   (always visible)
    BARREL_<CODE>_front    front window panel          (hidden in cutaway)
    BARREL_<CODE>_top      heater block + cap          (zones only)
    BARREL_<CODE>_bottom   cooling housing             (zones + throat)
"""

import bpy
from math import pi, cos, sin, radians

import lib_params as P
import lib_geo as G
import lib_mat as M


def _bore_liner(name, x0, length, target, near=False):
    """Half of the figure-of-eight bore surface, as an open sheet."""
    pts = G.erdmenger_bore(P.SCREW_R, P.SCREW_RI, samples=18,
                           clearance=P.SCREW_BARREL_CLEARANCE,
                           vertical=P.SCREW_VERTICAL)
    half = [(y, z) for (y, z) in pts if ((y < 0) if near else (y > 0))]
    if len(half) < 3:
        return None
    ob, _ = G.twist_extrude(name, half, x0, length, pitch=None, slices=1,
                            mat=M.get("MAT_bore"), target=target,
                            axis_z=P.Z_SCREW, closed_profile=False,
                            cap0=False, cap1=False, flip=not near)
    return ob


def _module_shell(tag, x0, L, c, steel, cast, bronze, bolt, dark):
    """Rails, back shell, bore liner and bronze accent for one slot."""
    xc = x0 + L * .5
    W2 = P.BARREL_W * .5
    by = P.BARREL_BORE_Y
    z0, z1 = P.BARREL_Z0, P.BARREL_Z1
    w0, w1 = P.BARREL_WIN_Z0, P.BARREL_WIN_Z1
    back_t = max(P.BARREL_WALL, W2 - by)
    back_yc = W2 - back_t * .5

    parts = [
        G.box(tag + "_rail_top", (xc, 0, (w1 + z1) * .5),
              (L, P.BARREL_W, z1 - w1), steel, c, bev=0.006),
        G.box(tag + "_rail_bot", (xc, 0, (z0 + w0) * .5),
              (L, P.BARREL_W, w0 - z0), steel, c, bev=0.006),
        G.box(tag + "_back", (xc, back_yc, (w0 + w1) * .5),
              (L, back_t, w1 - w0), cast, c, bev=0.004),
    ]
    liner = _bore_liner(tag + "_bore", x0, L, c, near=False)
    if liner:
        parts.append(liner)
    for zz in (w0 + P.BARREL_GOLD_H * .5, w1 - P.BARREL_GOLD_H * .5):
        parts.append(G.box(tag + "_gold", (xc, -W2 * .999, zz),
                           (L, 0.004, P.BARREL_GOLD_H), bronze, c, bev=0))
    return parts


def _module_front(tag, x0, L, c, steel, bolt, dark):
    """The removable front window panel for one slot."""
    xc = x0 + L * .5
    W2 = P.BARREL_W * .5
    by = P.BARREL_BORE_Y
    w0, w1 = P.BARREL_WIN_Z0, P.BARREL_WIN_Z1
    t = max(P.BARREL_WALL, W2 - by)
    parts = [G.box(tag + "_fp", (xc, -(W2 - t * .5), (w0 + w1) * .5),
                   (L, t, w1 - w0), steel, c, bev=0.005)]
    nl = _bore_liner(tag + "_borefront", x0, L, c, near=True)
    if nl:
        parts.append(nl)
    for sz in (w0 + (w1 - w0) * .24, w0 + (w1 - w0) * .76):
        parts.append(G.socket_screw(tag + "_fb", 0.010, 0.007, 'Y',
                                    (xc, -W2 - 0.001, sz), bolt, c, dark))
    return parts


def build(root):
    c = G.coll("BARREL", root)
    steel = M.get("MAT_barrel_steel")
    cast = M.get("MAT_cast_gray")
    bolt = M.get("MAT_bolt")
    dark = M.get("MAT_dark")
    bronze = M.get("MAT_bronze")
    cav = M.get("MAT_cavity")
    out = {}

    z0, z1 = P.BARREL_Z0, P.BARREL_Z1
    seam = P.BARREL_SEAM

    for kind, code, sx0, sx1 in P.barrel_slots():
        x0 = sx0 + seam * .5
        L = (sx1 - sx0) - seam
        xc = x0 + L * .5
        tag = "BARREL_" + code

        out[tag + "_body"] = G.join(
            _module_shell(tag, x0, L, c, steel, cast, bronze, bolt, dark),
            tag + "_body", None, c)
        out[tag + "_front"] = G.join(
            _module_front(tag, x0, L, c, steel, bolt, dark),
            tag + "_front", None, c)

        # ---- top hardware --------------------------------------------------
        if kind == "zone":
            tz = z1 + P.TOPBLOCK_H * .5
            tp = [G.box(tag + "_tb", (xc, 0, tz),
                        (min(0.140, L * .90), P.TOPBLOCK_W, P.TOPBLOCK_H),
                        steel, c, bev=0.006)]
            tp.append(G.plug_cap(tag + "_cap", P.TOPCAP_R, P.TOPCAP_H, 'Z',
                                 (xc, 0, z1 + P.TOPBLOCK_H), cast, c,
                                 seg=P.Q_MED))
            for sy in (-1, 1):
                tp.append(G.socket_screw(tag + "_tbolt", 0.0085, 0.006, 'Z',
                                         (xc, sy * P.TOPBLOCK_W * .37,
                                          z1 + P.TOPBLOCK_H), bolt, c, dark))
            out[tag + "_top"] = G.join(tp, tag + "_top", None, c)

        elif kind == "port":
            # a raised machined port saddle: the visible break in the rhythm
            pp = [G.box(tag + "_saddle", (xc, 0, z1 + 0.020),
                        (L * .96, P.TOPBLOCK_W * .82, 0.040), cast, c, bev=0.006)]
            pp.append(G.box(tag + "_mouth", (xc, -0.001, z1 + 0.014),
                            (L * .52, 0.130, 0.030), cav, c, bev=0))
            for sx in (-1, 1):
                for sy in (-1, 1):
                    pp.append(G.socket_screw(tag + "_pbolt", 0.0085, 0.006, 'Z',
                                             (xc + sx * L * .34,
                                              sy * P.TOPBLOCK_W * .32,
                                              z1 + 0.040), bolt, c, dark))
            out[tag + "_port"] = G.join(pp, tag + "_port", None, c)

        # ---- lower cooling / heater control housing ------------------------
        if kind != "port":
            bz = z0 - P.BOTBOX_H * .5
            bl = min(0.152, L * .92)
            bp = [G.box(tag + "_bb", (xc, 0, bz), (bl, P.BOTBOX_W, P.BOTBOX_H),
                        steel, c, bev=0.007)]
            bp.append(G.box(tag + "_bb_in", (xc, -P.BOTBOX_W * .5 + 0.004, bz),
                            (bl * .58, 0.012, P.BOTBOX_H * .52), dark, c, bev=0.003))
            bp.append(G.socket_screw(tag + "_bbolt", 0.0125, 0.008, 'Y',
                                     (xc, -P.BOTBOX_W * .5 - 0.008, bz),
                                     bolt, c, dark))
            out[tag + "_bottom"] = G.join(bp, tag + "_bottom", None, c)

    # ---- intermediate melt-pressure tappings (P-INT-01 / P-INT-02) ---------
    for pcode, zcode in zip(P.P_INT_CODES, P.P_INT_ZONES):
        a, b = P.slot(zcode)
        px = (a + b) * .5
        boss = G.pressure_boss(
            "SENSOR_" + pcode, (px, -P.BARREL_W * 0.5, P.P_INT_FACE_Z),
            axis='Y', sign=-1,
            mat=M.get("MAT_stainless"), dark=dark, body_mat=cast, target=c,
            boss_r=P.BOSS_R * 0.88, boss_h=P.BOSS_H * 0.85,
            body_r=P.BOSS_BODY_R, body_h=P.BOSS_BODY_H * 0.85, seg=P.Q_MED)
        out["SENSOR_" + pcode] = boss

    # ---- feed throat opening into the barrel ------------------------------
    ta, tb = P.slot("FEED_THROAT")
    thx = (ta + tb) * .5
    tp = [G.box("BARREL_feed_lip", (thx, 0, z1 + 0.014),
                (0.215, 0.262, 0.028), cast, c, bev=0.006)]
    tp.append(G.box("BARREL_feed_mouth", (thx, -0.001, z1 + 0.012),
                    (0.150, 0.150, 0.030), cav, c, bev=0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tp.append(G.socket_screw("BARREL_feed_b", 0.009, 0.006, 'Z',
                                     (thx + sx * 0.092, sy * 0.112,
                                      z1 + 0.028), bolt, c, dark))
    out["BARREL_FEED_THROAT_lip"] = G.join(tp, "BARREL_FEED_THROAT_lip", None, c)

    # ---- structural supports ----------------------------------------------
    bx0, bx1 = P.X_BARREL
    span = bx1 - bx0
    sp = []
    for sx in (bx0 + span * 0.07, bx1 - span * 0.06):
        sp.append(G.box("BARREL_sup_col", (sx, 0, (z0 - P.BOTBOX_H) * .5),
                        (0.085, 0.180, z0 - P.BOTBOX_H), cast, c, bev=0.007))
        sp.append(G.box("BARREL_sup_pad", (sx, 0, 0.024),
                        (0.230, 0.260, 0.048), cast, c, bev=0.007))
        for ax in (-1, 1):
            for ay in (-1, 1):
                sp.append(G.hex_head("BARREL_sup_anchor", 0.014, 0.012, 'Z',
                                     (sx + ax * 0.088, ay * 0.100, 0.048),
                                     bolt, c))
    out["BARREL_supports"] = G.join(sp, "BARREL_supports", None, c)

    # ---- drive-end connection flange ---------------------------------------
    fp = [G.box("BARREL_de_flange", (bx0 - 0.012, 0, P.Z_SCREW),
                (0.034, P.BARREL_W + 0.030, P.BARREL_H + 0.026), cast, c, bev=0.007)]
    for k in range(8):
        a = 2 * pi * k / 8 + radians(22.5)
        fp.append(G.hex_head("BARREL_de_bolt", 0.012, 0.010, 'X',
                             (bx0 - 0.030, 0.244 * cos(a),
                              P.Z_SCREW + 0.222 * sin(a)), bolt, c))
    out["BARREL_drive_end_flange"] = G.join(fp, "BARREL_drive_end_flange", None, c)
    return out
