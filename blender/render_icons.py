import math
import os
import sys

import json

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "blender", "out")
os.makedirs(OUT, exist_ok=True)

TARGET = Vector((0.0, 0.0, 1.15))


def hex_lin(h):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def set_input(node, name, value):
    sock = node.inputs.get(name)
    if sock is not None:
        sock.default_value = value


def make_mat(name, color, rough=0.5, sss=0.12, coat=0.0, sheen=0.25):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", hex_lin(color))
    set_input(bsdf, "Roughness", rough)
    set_input(bsdf, "Subsurface Weight", sss)
    set_input(bsdf, "Subsurface Radius", (0.4, 0.25, 0.2))
    set_input(bsdf, "Subsurface Scale", 0.15)
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Coat Roughness", 0.25)
    set_input(bsdf, "Sheen Weight", sheen)
    set_input(bsdf, "Specular IOR Level", 0.35)
    return mat


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bm_to_obj(name, bm, mats):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    for m in mats:
        obj.data.materials.append(m)
    return link(obj)


def add_bevel(obj, width, segs=10):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segs
    mod.limit_method = "NONE"
    return mod


def add_subsurf(obj, levels=2):
    mod = obj.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels + 1
    return mod


def rounded_box(name, size, radius, loc, mat, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    obj = bm_to_obj(name, bm, [mat])
    add_bevel(obj, radius, 12)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    return obj


def sphere(name, r, loc, mat, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=r)
    obj = bm_to_obj(name, bm, [mat])
    obj.location = loc
    obj.scale = scale
    return obj


def lathe(name, profile, mats, seg=72, mat_index=None):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([
                bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                for i in range(seg)
            ])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(seg):
                bm.faces.new((a[0], b[(i + 1) % seg], b[i]))
        elif len(b) == 1:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[0]))
        else:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if mat_index is not None:
        for f in bm.faces:
            f.material_index = mat_index(f.calc_center_median())
    return bm_to_obj(name, bm, mats)


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 10
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (co[0], co[1], co[2], 1.0)
    spline.use_smooth = True
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    return link(obj)


def capsule_path(name, points, radius, mat):
    tube(name, points, radius, mat)
    for i, p in enumerate(points):
        sphere(f"{name}_cap{i}", radius, p, mat)


def parent_all(objs, rot, loc=(0, 0, 0)):
    empty = bpy.data.objects.new("rig", None)
    link(empty)
    for o in objs:
        o.parent = empty
    empty.location = loc
    empty.rotation_euler = Euler(rot)
    return empty


def xz(x, z, y=0.0):
    return Vector((x, y, z))


def setup_scene(res):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as exc:
        print("GPU unavailable, using CPU:", exc, file=sys.stderr)
    scene.cycles.samples = 72
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.1

    world = bpy.data.worlds.new("world")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hex_lin("#F3E7D7")
    bg.inputs["Strength"].default_value = 0.75

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 85
    cam = bpy.data.objects.new("cam", cam_data)
    link(cam)
    elev = math.radians(22)
    dist = 7.6
    cam.location = TARGET + Vector((0.0, -math.cos(elev), math.sin(elev))) * dist
    cam.rotation_euler = (TARGET - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    key = bpy.data.lights.new("key", "AREA")
    key.energy = 900
    key.size = 5.0
    key.color = (1.0, 0.95, 0.88)
    key_obj = link(bpy.data.objects.new("key", key))
    key_obj.location = (-3.5, -3.0, 6.0)
    key_obj.rotation_euler = (Vector((0, 0, 1)) - key_obj.location).to_track_quat("-Z", "Y").to_euler()

    rim = bpy.data.lights.new("rim", "AREA")
    rim.energy = 350
    rim.size = 4.0
    rim.color = (1.0, 0.9, 0.85)
    rim.use_shadow = False
    rim_obj = link(bpy.data.objects.new("rim", rim))
    rim_obj.location = (4.0, 3.0, 4.0)
    rim_obj.rotation_euler = (Vector((0, 0, 1)) - rim_obj.location).to_track_quat("-Z", "Y").to_euler()

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    floor = bm_to_obj("floor", bm, [make_mat("floor", "#FFFFFF")])
    floor.is_shadow_catcher = True


def subject_bounds():
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for obj in scene.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.hide_render or obj.is_shadow_catcher:
            continue
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        for v in mesh.vertices:
            co = world_to_camera_view(scene, scene.camera, ev.matrix_world @ v.co)
            xs.append(co.x)
            ys.append(1 - co.y)
        ev.to_mesh_clear()
    return {"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys)}


def render(name):
    with open(os.path.join(OUT, f"{name}.json"), "w") as fh:
        json.dump(subject_bounds(), fh)
    bpy.context.scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


C = {
    "rose": "#E39A88",
    "sand": "#E2BF93",
    "sage": "#9DB98F",
    "caramel": "#DDA878",
    "milk": "#FFF7EC",
    "skin": "#F0CDB4",
    "areola": "#D99383",
    "cocoa": "#7A5A48",
    "sun": "#F3C47C",
    "moon": "#CEC4E2",
    "cream": "#F8EEDF",
    "blush": "#F2A7A0",
}

YAW = math.radians(-14)


def icon_play():
    m = make_mat("play", C["rose"])
    z = TARGET.z
    bm = bmesh.new()
    verts = [bm.verts.new(v) for v in [(-0.72, -0.3, z - 0.95), (0.98, -0.3, z), (-0.72, -0.3, z + 0.95)]]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += 0.6
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = bm_to_obj("play", bm, [m])
    add_bevel(obj, 0.26, 14)
    obj.rotation_euler = (0, 0, YAW)


def icon_pause():
    m = make_mat("pause", C["sand"])
    bars = [rounded_box(f"bar{i}", (0.55, 0.6, 1.85), 0.26, (x, 0, 0), m) for i, x in enumerate((-0.45, 0.45))]
    parent_all(bars, (0, 0, YAW), TARGET)


def icon_check():
    m = make_mat("check", C["sage"])
    pts = [xz(-0.95, 0.05), xz(-0.3, -0.6), xz(0.98, 0.7)]
    capsule_path("check", pts, 0.26, m)
    parent_all([o for o in bpy.context.scene.objects if o.name.startswith("check")], (0, 0, YAW), TARGET)


def arrow_head(name, base, tangent, mat):
    profile = [(0, 0.62), (0.07, 0.56), (0.42, 0.06), (0.4, 0.0), (0.3, -0.03), (0, -0.03)]
    obj = lathe(name, profile, [mat], seg=48)
    add_subsurf(obj, 2)
    obj.location = base
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(tangent).to_euler()
    return obj


def icon_switch():
    m = make_mat("switch", C["caramel"])
    r = 0.82
    objs = []
    for i, (a0, a1) in enumerate(((25, 140), (205, 320))):
        pts = []
        for k in range(41):
            a = math.radians(a0 + (a1 - a0) * k / 40)
            pts.append(xz(r * math.cos(a), r * math.sin(a)))
        tube(f"arc{i}", pts, 0.15, m)
        objs.append(bpy.context.scene.objects[f"arc{i}"])
        objs.append(sphere(f"arccap{i}", 0.15, pts[0], m))
        a = math.radians(a1)
        tangent = Vector((-math.sin(a), 0, math.cos(a)))
        objs.append(arrow_head(f"head{i}", pts[-1] - tangent * 0.05, tangent, m))
    parent_all(objs, (0, 0, YAW), TARGET)


def icon_drop():
    m = make_mat("milk", C["milk"], rough=0.22, sss=0.45, coat=0.4, sheen=0.1)
    profile = []
    for k in range(49):
        t = math.pi * k / 48
        profile.append((0.92 * math.sin(t) * math.sin(t / 2) ** 1.25, 1.05 * math.cos(t)))
    obj = lathe("drop", profile, [m], seg=72)
    add_subsurf(obj, 1)
    obj.location = TARGET + Vector((0, 0, 0.08))
    obj.rotation_euler = (0, math.radians(-8), 0)


def icon_bell():
    m = make_mat("bell", C["caramel"], rough=0.38, coat=0.25)
    dark = make_mat("clapper", C["rose"])
    profile = [(0, 0.98), (0.2, 0.96), (0.36, 0.88), (0.47, 0.7), (0.53, 0.45), (0.58, 0.18), (0.66, -0.08),
               (0.82, -0.3), (0.96, -0.42), (0.98, -0.5), (0.9, -0.55), (0.6, -0.54), (0, -0.54)]
    bell = lathe("bell", profile, [m])
    add_subsurf(bell, 2)
    knob = sphere("knob", 0.14, (0, 0, 1.05), m)
    clap = sphere("clap", 0.2, (0, 0, -0.66), dark)
    parent_all([bell, knob, clap], (math.radians(-6), math.radians(14), 0), TARGET + Vector((0, 0, 0.1)))


def icon_side():
    skin = make_mat("skin", C["skin"], rough=0.55, sss=0.35, sheen=0.4)
    areola = make_mat("areola", C["areola"], rough=0.5, sss=0.3)
    profile = [(0, 0.86), (0.05, 0.855), (0.09, 0.835), (0.115, 0.79), (0.14, 0.76), (0.22, 0.745),
               (0.32, 0.725), (0.45, 0.68)]
    for k in range(1, 17):
        a = (math.pi / 2) * k / 16
        profile.append((0.45 + 0.6 * math.sin(a), 0.68 - 0.78 * (1 - math.cos(a))))
    profile += [(1.0, -0.14), (0.9, -0.2), (0.5, -0.22), (0, -0.22)]
    obj = lathe("side", profile, [skin, areola], mat_index=lambda c: 1 if math.hypot(c.x, c.y) < 0.36 and c.z > 0.5 else 0)
    add_subsurf(obj, 2)
    obj.location = TARGET + Vector((0, 0, 0.05))
    obj.rotation_euler = (math.radians(58), 0, YAW)
    obj.scale = (0.82, 0.82, 0.82)


def icon_clock():
    face = make_mat("face", C["cream"], rough=0.5)
    rim = make_mat("rim", C["sage"], rough=0.45)
    hands = make_mat("hands", C["cocoa"], rough=0.45)
    rp = [(0, 0.26), (0.92, 0.26), (1.02, 0.2), (1.06, 0.0), (1.02, -0.2), (0.92, -0.26), (0, -0.26)]
    body = lathe("clock", rp, [rim, face], mat_index=lambda c: 1 if c.z > 0.2 and math.hypot(c.x, c.y) < 0.88 else 0)
    add_subsurf(body, 2)
    objs = [body]
    objs.append(tube("hand_a", [(0, 0, 0.3), (0, 0.5, 0.3)], 0.07, hands))
    objs.append(tube("hand_b", [(0, 0, 0.3), (0.36, -0.08, 0.3)], 0.07, hands))
    objs.append(sphere("hand_a_tip", 0.07, (0, 0.5, 0.3), hands))
    objs.append(sphere("hand_b_tip", 0.07, (0.36, -0.08, 0.3), hands))
    objs.append(sphere("center", 0.12, (0, 0, 0.3), hands, (1, 1, 0.6)))
    for k in range(4):
        a = k * math.pi / 2
        objs.append(sphere(f"tick{k}", 0.07, (0.7 * math.cos(a), 0.7 * math.sin(a), 0.27), rim, (1, 1, 0.5)))
    parent_all(objs, (math.radians(90), 0, YAW), TARGET)


def icon_sun():
    m = make_mat("sun", C["sun"], rough=0.42, sss=0.2)
    objs = [sphere("core", 0.56, (0, 0, 0), m)]
    for k in range(8):
        a = k * math.pi / 4
        p0 = Vector((math.cos(a) * 0.82, 0, math.sin(a) * 0.82))
        p1 = Vector((math.cos(a) * 1.08, 0, math.sin(a) * 1.08))
        objs.append(tube(f"ray{k}", [p0, p1], 0.1, m))
        objs.append(sphere(f"ray{k}a", 0.1, p0, m))
        objs.append(sphere(f"ray{k}b", 0.1, p1, m))
    parent_all(objs, (0, 0, YAW), TARGET)


def icon_moon():
    m = make_mat("moon", C["moon"], rough=0.45, sss=0.2)
    star = make_mat("star", C["sun"], rough=0.4)
    curve = bpy.data.curves.new("moon", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 12
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    n = 48
    spline.points.add(n - 1)
    for k, p in enumerate(spline.points):
        t = k / (n - 1)
        a = math.radians(-125 + 250 * t)
        p.co = (-0.62 * math.cos(a) + 0.1, 0.0, 0.62 * math.sin(a), 1.0)
        p.radius = 0.05 + 0.34 * math.sin(math.pi * t) ** 1.4
    spline.use_smooth = True
    moon = link(bpy.data.objects.new("moon", curve))
    moon.data.materials.append(m)
    s1 = sphere("star1", 0.15, (0.55, 0.0, 0.5), star)
    s2 = sphere("star2", 0.1, (0.85, 0.0, -0.05), star)
    parent_all([moon, s1, s2], (0, 0, YAW), TARGET)


def bottle_body(name, h, r, mats, collar_mat_index):
    # Rounded bottle body with a narrower collar on top, as one lathe.
    profile = [(0, -h / 2)]
    for k in range(1, 9):
        a = (math.pi / 2) * k / 8
        profile.append((r * math.sin(a) * 0.98 + 0.02 * r, -h / 2 + r * 0.35 * (1 - math.cos(a))))
    profile += [(r, h / 2 - r * 0.3), (r * 0.92, h / 2 - r * 0.1), (r * 0.8, h / 2)]
    return lathe(name, profile, mats, mat_index=collar_mat_index)


def icon_bottle():
    milk = make_mat("milk", C["milk"], rough=0.22, sss=0.45, coat=0.4, sheen=0.1)
    collar = make_mat("collar", C["sage"], rough=0.42, coat=0.2)
    teat = make_mat("teat", C["sand"], rough=0.35, sss=0.3, coat=0.3)
    ticks = make_mat("ticks", C["rose"], rough=0.5)
    body = bottle_body("bottle", 1.5, 0.5, [milk], None)
    add_subsurf(body, 1)
    body.location = (0, 0, -0.35)
    ring = lathe("collar", [(0, 0.38), (0.5, 0.38), (0.57, 0.34), (0.58, 0.2), (0.57, 0.06), (0.5, 0.02), (0, 0.02)], [collar])
    add_subsurf(ring, 2)
    tp = [(0, 1.12), (0.06, 1.11), (0.1, 1.06), (0.11, 0.96), (0.13, 0.86), (0.2, 0.76), (0.32, 0.62), (0.4, 0.5),
          (0.44, 0.4), (0.4, 0.36), (0, 0.36)]
    nipple = lathe("teat", tp, [teat])
    add_subsurf(nipple, 2)
    objs = [body, ring, nipple]
    for k in range(3):
        z = -0.45 + 0.24 * k
        w = 0.14 if k % 2 == 0 else 0.09
        objs.append(tube(f"tick{k}", [(-0.18 - w, -0.505, z), (-0.18 + w, -0.505, z)], 0.035, ticks))
        objs.append(sphere(f"tick{k}a", 0.035, (-0.18 - w, -0.505, z), ticks))
        objs.append(sphere(f"tick{k}b", 0.035, (-0.18 + w, -0.505, z), ticks))
    parent_all(objs, (0, math.radians(12), YAW), TARGET + Vector((0, 0, -0.05)))


def icon_pump():
    milk = make_mat("milk", C["milk"], rough=0.22, sss=0.45, coat=0.4, sheen=0.1)
    shield = make_mat("shield", C["sage"], rough=0.35, sss=0.2, coat=0.35)
    hub = make_mat("hub", C["rose"], rough=0.42, coat=0.2)
    lever = make_mat("lever", C["caramel"], rough=0.4, coat=0.2)
    collar = make_mat("collar", C["sand"], rough=0.42, coat=0.2)

    body = bottle_body("bottle", 1.0, 0.36, [milk], None)
    add_subsurf(body, 1)
    body.location = (0.18, 0, -0.42)
    ring = lathe("collar", [(0, 0.2), (0.36, 0.2), (0.41, 0.17), (0.42, 0.1), (0.41, 0.03), (0.36, 0.0), (0, 0.0)], [collar])
    add_subsurf(ring, 2)
    ring.location = (0.18, 0, 0.02)
    centre = sphere("hub", 0.36, (0.18, 0, 0.44), hub, (1, 1, 0.92))

    # Breast shield: a funnel lying on its side, its open mouth facing the viewer's left.
    fp = [(0.0, 0.0), (0.14, 0.0), (0.15, 0.16), (0.18, 0.3), (0.3, 0.48), (0.5, 0.64), (0.66, 0.74), (0.7, 0.78),
          (0.66, 0.8), (0.58, 0.76), (0.42, 0.64), (0.24, 0.48), (0.1, 0.34), (0.0, 0.3)]
    funnel = lathe("shield", fp, [shield])
    add_subsurf(funnel, 2)
    funnel.location = (-0.1, 0, 0.46)
    funnel.rotation_euler = (0, math.radians(-90), math.radians(-16))

    handle = [xz(0.36, 0.7), xz(0.66, 0.92), xz(0.98, 0.98)]
    capsule_path("lever", handle, 0.1, lever)
    objs = [body, ring, centre, funnel] + [o for o in bpy.context.scene.objects if o.name.startswith("lever")]
    parent_all(objs, (0, 0, math.radians(-24)), TARGET + Vector((0.05, 0, 0.0)))


def icon_app():
    m = make_mat("milk", C["milk"], rough=0.22, sss=0.45, coat=0.4, sheen=0.1)
    eye = make_mat("eye", "#4A3A30", rough=0.2, coat=0.6, sss=0.0)
    blush = make_mat("blush", C["blush"], rough=0.6, sss=0.2)
    profile = []
    for k in range(49):
        t = math.pi * k / 48
        profile.append((0.98 * math.sin(t) * math.sin(t / 2) ** 1.1, 1.08 * math.cos(t)))
    body = lathe("drop", profile, [m], seg=72)
    add_subsurf(body, 1)

    def surface_y(x, z):
        r = max(pr for pr, pz in profile if abs(pz - z) < 0.05)
        return -math.sqrt(max(r * r - x * x, 0.0)) * 0.985

    objs = [body]
    for sx in (-1, 1):
        objs.append(sphere(f"eye{sx}", 0.085, (sx * 0.27, surface_y(0.27, -0.28), -0.28), eye, (1, 0.6, 1.25)))
        objs.append(sphere(f"blush{sx}", 0.13, (sx * 0.43, surface_y(0.43, -0.47) + 0.03, -0.47), blush, (1, 0.35, 0.7)))
    smile = []
    for k in range(13):
        a = math.radians(200 + 140 * k / 12)
        x, z = 0.13 * math.cos(a), -0.44 + 0.1 * math.sin(a)
        smile.append(Vector((x, surface_y(x, z), z)))
    objs.append(tube("smile", smile, 0.03, eye))
    objs.append(sphere("smile0", 0.03, smile[0], eye))
    objs.append(sphere("smile1", 0.03, smile[-1], eye))
    parent_all(objs, (0, 0, math.radians(-6)), TARGET + Vector((0, 0, 0.12)))


ICONS = {
    "play": icon_play,
    "pause": icon_pause,
    "check": icon_check,
    "switch": icon_switch,
    "drop": icon_drop,
    "bell": icon_bell,
    "side": icon_side,
    "clock": icon_clock,
    "sun": icon_sun,
    "moon": icon_moon,
    "app": icon_app,
    "bottle": icon_bottle,
    "pump": icon_pump,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = argv or list(ICONS)
    for name in names:
        setup_scene(1024 if name == "app" else 512)
        ICONS[name]()
        render(name)


main()
