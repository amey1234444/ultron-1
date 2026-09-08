# -*- coding: utf-8 -*-
"""Runtime rig + glTF export.

Adds the animation pivots the web viewer drives, stamps every mesh with the
stable part id / group / exploded direction the viewer reads back out of the
glTF `extras`, then writes the optimised .glb.
"""

import bpy, os, json
from mathutils import Vector

import lib_params as P
import lib_geo as G

# group -> (exploded direction, exploded distance in metres)
EXPLODE = {
    "motor":         ((-1.00, 0.00, 0.10), 0.62),
    "coupling":      ((-0.55, 0.00, 0.06), 0.40),
    "gearbox":       ((-0.30, 0.00, 0.04), 0.26),
    "barrel":        ((0.00, 0.00, 0.00), 0.00),
    "barrel_top":    ((0.00, 0.00, 1.00), 0.34),
    "barrel_port":   ((0.00, 0.00, 1.00), 0.24),
    "barrel_bot":    ((0.00, 0.00, -1.00), 0.28),
    "barrel_front":  ((0.00, -1.00, 0.00), 0.55),
    "screw_1":       ((0.55, 0.00, -0.10), 0.46),
    "screw_2":       ((0.55, 0.00, 0.10), 0.46),
    "main_feed":     ((0.00, 0.00, 1.00), 0.46),
    "main_feeder":   ((0.00, 0.20, 1.00), 0.40),
    "side_feed":     ((0.00, 0.15, 1.00), 0.34),
    "side_feeder":   ((0.00, 0.25, 1.00), 0.30),
    "vent":          ((0.00, 0.15, 1.00), 0.34),
    "melt_adapter":  ((0.62, 0.00, 0.00), 0.30),
    "screen_inlet":  ((0.78, 0.00, 0.00), 0.40),
    "screen_pack":   ((0.88, 0.00, 0.06), 0.50),
    "screen_outlet": ((0.95, 0.00, 0.00), 0.58),
    "die":           ((1.00, 0.00, 0.00), 0.68),
    "sensor":        ((0.00, 0.00, 0.00), 0.00),
    "frame":         ((0.00, 0.00, -1.00), 0.20),
}


def classify(name):
    """Map an object name onto (part group, spin pivot or None)."""
    n = name
    if n.startswith("MOTOR_shaft"):
        return "motor", "PIVOT_DRIVE"
    if n.startswith("MOTOR"):
        return "motor", None
    if n.startswith("COUPLING") or n.startswith("CPL"):
        return "coupling", "PIVOT_DRIVE"
    if n.startswith("GEARBOX") or n.startswith("GB_"):
        return "gearbox", None
    # the two process screws -- separate groups, separate pivots
    if n.startswith("S1_"):
        return "screw_1", "PIVOT_SCREW1"
    if n.startswith("S2_"):
        return "screw_2", "PIVOT_SCREW2"
    # barrel modules, keyed off the topology codes
    if n.startswith("BARREL_"):
        if n.endswith("_front"):
            return "barrel_front", None
        if n.endswith("_top"):
            return "barrel_top", None
        if n.endswith("_port"):
            return "barrel_port", None
        if n.endswith("_bottom"):
            return "barrel_bot", None
        if n.startswith("BARREL_supports"):
            return "frame", None
        return "barrel", None
    # feeding system
    if n.startswith("MAIN_FEEDER_SCREW"):
        return "main_feeder", "PIVOT_MAIN_FEEDER"
    if n.startswith("MAIN_"):
        return "main_feed", None
    if n.startswith("SIDE_FEEDER_SCREW"):
        return "side_feeder", "PIVOT_SIDE_FEEDER"
    if n.startswith("SIDE_"):
        return "side_feed", None
    if n.startswith("VENT_") or n.startswith("SENSOR_VENT"):
        return "vent", None
    # die-end chain
    if n.startswith("MELT_ADAPTER"):
        return "melt_adapter", None
    if n.startswith("SCREEN_PACK_INLET"):
        return "screen_inlet", None
    if n.startswith("SCREEN_PACK_OUTLET"):
        return "screen_outlet", None
    if n.startswith("SCREEN_PACK"):
        return "screen_pack", None
    if n.startswith("DIE_") or n == "EXTRUDATE":
        return "die", None
    if n.startswith("SENSOR_"):
        return "sensor", None
    return "frame", None


def rig(root):
    """Create the spin pivots and parent the rotating parts to them."""
    c = G.coll("RIG", root)
    piv = {}
    for name, loc, axis in (
        ("PIVOT_DRIVE", (0.0, 0.0, P.Z_MOTOR), 'X'),
        ("PIVOT_SCREW1", (0.0,) + P.SCREW_1_AXIS, 'X'),
        ("PIVOT_SCREW2", (0.0,) + P.SCREW_2_AXIS, 'X'),
        ("PIVOT_MAIN_FEEDER", (P.HOP_X, 0.0, 0.66), 'Z'),
        ("PIVOT_SIDE_FEEDER", (P.SF_X, 0.0, P.BARREL_Z1), 'Z'),
    ):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'PLAIN_AXES'
        e.empty_display_size = 0.12
        e.location = loc
        c.objects.link(e)
        e["spin_axis"] = axis
        piv[name] = e

    bpy.context.view_layer.update()
    for ob in list(bpy.context.scene.objects):
        if ob.type != 'MESH' or ob.name.startswith("STUDIO_"):
            continue
        group, pivot = classify(ob.name)
        if pivot:
            mw = ob.matrix_world.copy()
            ob.parent = piv[pivot]
            ob.matrix_parent_inverse = piv[pivot].matrix_world.inverted()
            ob.matrix_world = mw
    bpy.context.view_layer.update()
    return piv


def stamp(root):
    """Write part metadata into custom properties -> glTF node extras."""
    n = 0
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith("STUDIO_"):
            continue
        group, pivot = classify(ob.name)
        d, dist = EXPLODE.get(group, ((0, 0, 0), 0.0))
        ob["partId"] = ob.name
        ob["partGroup"] = group
        ob["explodeDir"] = list(d)
        ob["explodeDist"] = dist
        ob["spin"] = pivot or ""
        n += 1
    for name in ("PIVOT_DRIVE", "PIVOT_SCREW1", "PIVOT_SCREW2",
                 "PIVOT_MAIN_FEEDER", "PIVOT_SIDE_FEEDER"):
        e = bpy.data.objects.get(name)
        if e:
            e["partId"] = name
            e["partGroup"] = "rig"
    return n


def cleanup_for_export():
    """Drop the studio-only objects; the web viewer brings its own environment."""
    kill = [o for o in bpy.context.scene.objects
            if o.name.startswith("STUDIO_") or o.type in ('LIGHT', 'CAMERA')]
    for o in kill:
        G._delete(o) if o.type == 'MESH' else bpy.data.objects.remove(o, do_unlink=True)
    lvl = bpy.data.objects.get("MAIN_HOPPER_LEVEL")
    if lvl:
        lvl.hide_render = False
        lvl.hide_viewport = False


def export_glb(path, draco=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.context.scene.objects:
        ob.hide_viewport = False
        ob.hide_render = False
    # the glTF exporter reads context.active_object; without a 3D view that
    # attribute is missing entirely unless the view layer has one set
    vl = bpy.context.view_layer
    if getattr(bpy.context, "active_object", None) is None:
        for ob in bpy.context.scene.objects:
            if ob.type == 'MESH':
                vl.objects.active = ob
                ob.select_set(True)
                break
        vl.update()
    kw = dict(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
    )
    if draco:
        kw.update(export_draco_mesh_compression_enable=True,
                  export_draco_mesh_compression_level=6,
                  export_draco_position_quantization=14,
                  export_draco_normal_quantization=10)
    def _run(kwargs):
        # The exporter dereferences context.active_object. Depending on how the
        # script was invoked that member may not exist on the context at all, so
        # supply a complete override rather than relying on the ambient one.
        act = next((o for o in bpy.context.scene.objects if o.type == 'MESH'), None)
        ctx = {"scene": bpy.context.scene, "view_layer": vl,
               "active_object": act, "object": act,
               "selected_objects": [act] if act else [],
               "selected_editable_objects": [act] if act else []}
        wins = bpy.context.window_manager.windows
        if wins:
            ctx["window"] = wins[0]
            ctx["screen"] = wins[0].screen
        try:
            with bpy.context.temp_override(**ctx):
                bpy.ops.export_scene.gltf(**kwargs)
        except (TypeError, ValueError):
            bpy.ops.export_scene.gltf(**kwargs)

    try:
        _run(kw)
    except TypeError:
        for k in list(kw):
            if k.startswith("export_draco"):
                kw.pop(k)
        _run(kw)
    return path, os.path.getsize(path)


def manifest(path):
    """Dump the part list so the web app and the docs stay in sync."""
    rows = []
    for ob in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if ob.type != 'MESH':
            continue
        ob.data.calc_loop_triangles()
        rows.append({
            "id": ob.name,
            "group": ob.get("partGroup", ""),
            "spin": ob.get("spin", ""),
            "tris": len(ob.data.loop_triangles),
            "explodeDir": list(ob.get("explodeDir", (0, 0, 0))),
            "explodeDist": ob.get("explodeDist", 0.0),
        })
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"parts": rows, "totalTris": sum(r["tris"] for r in rows)},
                  f, indent=2)
    return len(rows)
