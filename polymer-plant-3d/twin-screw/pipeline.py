# -*- coding: utf-8 -*-
"""One-shot reproducible pipeline. Run inside Blender:

    exec(open(r"g:/GRID-X/tools/extruder-model/pipeline.py").read())

  1. rebuild the machine from lib_params.py
  2. render every validation view into docs/validation/
  3. save the master .blend
  4. rig, stamp part metadata, export the optimised .glb + part manifest
"""

import bpy, sys, os, importlib, time, json

BASE = r"g:/GRID-X/tools/extruder-model"
REPO = r"g:/GRID-X"
if BASE not in sys.path:
    sys.path.insert(0, BASE)

VAL = REPO + "/docs/validation/"
GLB = REPO + "/apps/web/public/models/twin-screw-extruder.glb"
BLEND = BASE + "/extruder_master.blend"
MANIFEST = BASE + "/part-manifest.json"


def run(render=True, export=True):
    t0 = time.time()
    import build_all
    importlib.reload(build_all)
    parts, cams = build_all.build(quiet=True)

    import build_scene, build_export
    importlib.reload(build_scene)
    importlib.reload(build_export)

    if render:
        os.makedirs(VAL, exist_ok=True)
        build_scene.set_studio_ground(False)
        build_scene.set_cutaway(True)
        build_scene.render(VAL + "reference-view.png", "Reference", (1672, 939), 72)
        build_scene.set_cutaway(False)
        build_scene.render(VAL + "reference-closed-barrel.png", "Reference",
                           (1672, 939), 72)
        build_scene.set_cutaway(True)
        for cam in ("Side", "Top"):
            build_scene.render(VAL + "view-%s.png" % cam.lower(), cam,
                               (1672, 730), 40)
        build_scene.render(VAL + "view-twin-screw.png", "Twin Screw",
                           (1280, 800), 64)
        build_scene.set_studio_ground(True)
        for cam in ("Perspective", "Drive End", "Die End"):
            build_scene.render(VAL + "view-%s.png" % cam.lower().replace(" ", "-"),
                               cam, (1400, 790), 48)
        build_scene.set_studio_ground(False)
        build_scene.set_cutaway(True)
        print("renders done %.0fs" % (time.time() - t0))

    bpy.ops.wm.save_as_mainfile(filepath=BLEND)

    if export:
        build_export.rig(bpy.context.scene.collection)
        n = build_export.stamp(bpy.context.scene.collection)
        build_export.cleanup_for_export()
        path, size = build_export.export_glb(GLB)
        rows = build_export.manifest(MANIFEST)
        print("GLB %.2f MB, %d parts stamped, %d manifest rows"
              % (size / 1048576.0, n, rows))
        # reopen the master so the session is left with the studio intact
        bpy.ops.wm.open_mainfile(filepath=BLEND)
    print("pipeline finished in %.0fs" % (time.time() - t0))


run()
