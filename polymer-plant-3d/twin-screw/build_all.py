# -*- coding: utf-8 -*-
"""Master build. Run inside Blender:

    exec(open(r"g:/GRID-X/tools/extruder-model/build_all.py").read())

Rebuilds the whole machine from lib_params.py, sets up the studio rig and
leaves the scene ready for rendering or glTF export.
"""

import bpy, sys, os, importlib, time

BASE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() \
    else r"g:/GRID-X/tools/extruder-model"
if BASE not in sys.path:
    sys.path.insert(0, BASE)

MODULES = ["lib_params", "lib_geo", "lib_mat", "build_drive", "build_barrel",
           "build_screws", "build_feed", "build_die", "build_scene"]


def reload_all():
    mods = {}
    for name in MODULES:
        m = importlib.import_module(name)
        importlib.reload(m)
        mods[name] = m
    return mods


def reset_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1.0
    s.unit_settings.length_unit = 'METERS'


def build(render_preview=None, quiet=True):
    t0 = time.time()
    reset_scene()
    m = reload_all()
    m["lib_mat"].build_materials()
    root = bpy.context.scene.collection

    parts = {}
    stages = [("drive", m["build_drive"]), ("barrel", m["build_barrel"]),
              ("feed", m["build_feed"]), ("die", m["build_die"])]
    for name, mod in stages:
        t = time.time()
        parts.update(mod.build(root))
        if not quiet:
            print("  %-8s %5.1fs" % (name, time.time() - t))

    t = time.time()
    screws = m["build_screws"].build(root)
    for ob in screws:
        parts[ob.name] = ob
    if not quiet:
        print("  %-8s %5.1fs" % ("screws", time.time() - t))

    cams = m["build_scene"].build(root)
    bpy.context.view_layer.update()

    meshes = [o for o in bpy.context.scene.objects
              if o.type == 'MESH' and not o.name.startswith("STUDIO_")]
    tris = sum(len(o.data.loop_triangles) if o.data.loop_triangles else 0
               for o in meshes)
    for o in meshes:
        o.data.calc_loop_triangles()
    tris = sum(len(o.data.loop_triangles) for o in meshes)
    print("built %d parts / %d tris in %.1fs" % (len(meshes), tris, time.time() - t0))

    if render_preview:
        m["build_scene"].render(render_preview, "Reference", (1200, 675), 24)
    return parts, cams


def bbox(prefix=None):
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.name.startswith("STUDIO_"):
            continue
        if prefix and not o.name.startswith(prefix):
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


if __name__ == "__main__" or True:
    pass
