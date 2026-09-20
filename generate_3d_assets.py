"""
LuminaLanes — 3D Model Asset Generator
Generates native 3D files:
- library_model.obj + library_model.mtl (Universal Wavefront 3D format)
- library_model.glb (Standard Binary glTF 2.0 format)
- library_model.gltf (Standard JSON glTF 2.0 format)
"""

import os
import math
import json
import struct

def build_library_scene():
    """
    Constructs vertices, normals, and faces for all library digital twin elements:
    - Floor & Grid
    - Bookshelves forming aisles with amber/orange trim
    - 5 Study Tables (Center Hub + 4 Corners)
    - Movement Lanes & Junctions
    - 6 Ceiling Access Points (Floating Blue Spheres)
    - Users (Small Blue Spheres clustered around tables)
    - Camera Sensors (Yellow Cubes at lane intersections)
    """
    materials = {
        "Floor_Dark": {"kd": [0.04, 0.06, 0.10], "pbr": [0.05, 0.08, 0.12, 1.0], "metallic": 0.2, "roughness": 0.8},
        "Floor_Grid": {"kd": [0.15, 0.35, 0.65], "pbr": [0.23, 0.51, 0.96, 1.0], "metallic": 0.1, "roughness": 0.5},
        "Bookshelf_Body": {"kd": [0.09, 0.12, 0.18], "pbr": [0.10, 0.13, 0.19, 1.0], "metallic": 0.3, "roughness": 0.7},
        "Bookshelf_Trim": {"kd": [0.85, 0.47, 0.02], "pbr": [0.85, 0.47, 0.02, 1.0], "metallic": 0.4, "roughness": 0.4},
        "Table_Top": {"kd": [0.12, 0.16, 0.23], "pbr": [0.12, 0.16, 0.24, 1.0], "metallic": 0.6, "roughness": 0.3},
        "Table_Leg": {"kd": [0.06, 0.09, 0.16], "pbr": [0.06, 0.09, 0.16, 1.0], "metallic": 0.5, "roughness": 0.6},
        "Table_Glow_Ring": {"kd": [0.23, 0.51, 0.96], "pbr": [0.38, 0.74, 0.97, 1.0], "metallic": 0.1, "roughness": 0.2, "emissive": [0.23, 0.51, 0.96]},
        "Lane_Walkway": {"kd": [0.12, 0.23, 0.54], "pbr": [0.12, 0.23, 0.54, 0.6], "metallic": 0.1, "roughness": 0.4},
        "Lane_Guideline": {"kd": [0.38, 0.65, 0.98], "pbr": [0.38, 0.65, 0.98, 0.9], "metallic": 0.1, "roughness": 0.2},
        "Junction_Sensor_Floor": {"kd": [0.98, 0.80, 0.08], "pbr": [0.98, 0.80, 0.08, 0.5], "metallic": 0.2, "roughness": 0.3},
        "AP_Ceiling_Node": {"kd": [0.23, 0.51, 0.96], "pbr": [0.23, 0.51, 0.96, 1.0], "metallic": 0.8, "roughness": 0.2, "emissive": [0.23, 0.51, 0.96]},
        "User_Patron_Dot": {"kd": [0.22, 0.74, 0.97], "pbr": [0.22, 0.74, 0.97, 1.0], "metallic": 0.5, "roughness": 0.3, "emissive": [0.12, 0.45, 0.78]},
        "Camera_Junction_Node": {"kd": [0.98, 0.80, 0.08], "pbr": [0.98, 0.80, 0.08, 1.0], "metallic": 0.7, "roughness": 0.3, "emissive": [0.79, 0.54, 0.03]}
    }

    mesh_groups = {mat_name: {"vertices": [], "normals": [], "indices": []} for mat_name in materials}

    def add_box(mat_name, cx, cy, cz, w, h, d):
        group = mesh_groups[mat_name]
        start_idx = len(group["vertices"]) // 3
        hw, hh, hd = w / 2, h / 2, d / 2

        # 6 faces: +Y, -Y, +Z, -Z, +X, -X
        faces_data = [
            # Top (+Y)
            ([(cx - hw, cy + hh, cz - hd), (cx + hw, cy + hh, cz - hd), (cx + hw, cy + hh, cz + hd), (cx - hw, cy + hh, cz + hd)], (0, 1, 0)),
            # Bottom (-Y)
            ([(cx - hw, cy - hh, cz + hd), (cx + hw, cy - hh, cz + hd), (cx + hw, cy - hh, cz - hd), (cx - hw, cy - hh, cz - hd)], (0, -1, 0)),
            # Front (+Z)
            ([(cx - hw, cy - hh, cz + hd), (cx + hw, cy - hh, cz + hd), (cx + hw, cy + hh, cz + hd), (cx - hw, cy + hh, cz + hd)], (0, 0, 1)),
            # Back (-Z)
            ([(cx + hw, cy - hh, cz - hd), (cx - hw, cy - hh, cz - hd), (cx - hw, cy + hh, cz - hd), (cx + hw, cy + hh, cz - hd)], (0, 0, -1)),
            # Right (+X)
            ([(cx + hw, cy - hh, cz + hd), (cx + hw, cy - hh, cz - hd), (cx + hw, cy + hh, cz - hd), (cx + hw, cy + hh, cz + hd)], (1, 0, 0)),
            # Left (-X)
            ([(cx - hw, cy - hh, cz - hd), (cx - hw, cy - hh, cz + hd), (cx - hw, cy + hh, cz + hd), (cx - hw, cy + hh, cz - hd)], (-1, 0, 0)),
        ]

        v_offset = start_idx
        for verts, normal in faces_data:
            idx0 = v_offset
            for vx, vy, vz in verts:
                group["vertices"].extend([vx, vy, vz])
                group["normals"].extend(normal)
                v_offset += 1
            # Two triangles: 0, 1, 2 and 0, 2, 3
            group["indices"].extend([idx0, idx0 + 1, idx0 + 2, idx0, idx0 + 2, idx0 + 3])

    def add_horizontal_plane(mat_name, cx, cy, cz, w, d):
        group = mesh_groups[mat_name]
        idx0 = len(group["vertices"]) // 3
        hw, hd = w / 2, d / 2
        pts = [
            (cx - hw, cy, cz - hd),
            (cx + hw, cy, cz - hd),
            (cx + hw, cy, cz + hd),
            (cx - hw, cy, cz + hd)
        ]
        for vx, vy, vz in pts:
            group["vertices"].extend([vx, vy, vz])
            group["normals"].extend([0, 1, 0])
        group["indices"].extend([idx0, idx0 + 1, idx0 + 2, idx0, idx0 + 2, idx0 + 3])

    def add_cylinder(mat_name, cx, cy, cz, radius, height, segments=24):
        group = mesh_groups[mat_name]
        start_idx = len(group["vertices"]) // 3
        y_top = cy + height / 2
        y_bot = cy - height / 2

        # Top center vertex
        top_center = start_idx
        group["vertices"].extend([cx, y_top, cz])
        group["normals"].extend([0, 1, 0])

        # Bottom center vertex
        bot_center = start_idx + 1
        group["vertices"].extend([cx, y_bot, cz])
        group["normals"].extend([0, -1, 0])

        cur_idx = start_idx + 2
        top_ring_start = cur_idx
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            rx = math.cos(angle) * radius
            rz = math.sin(angle) * radius
            group["vertices"].extend([cx + rx, y_top, cz + rz])
            group["normals"].extend([0, 1, 0])
            cur_idx += 1

        bot_ring_start = cur_idx
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            rx = math.cos(angle) * radius
            rz = math.sin(angle) * radius
            group["vertices"].extend([cx + rx, y_bot, cz + rz])
            group["normals"].extend([0, -1, 0])
            cur_idx += 1

        # Side ring vertices
        side_top_start = cur_idx
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            rx = math.cos(angle)
            rz = math.sin(angle)
            group["vertices"].extend([cx + rx * radius, y_top, cz + rz * radius])
            group["normals"].extend([rx, 0, rz])
            cur_idx += 1

        side_bot_start = cur_idx
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            rx = math.cos(angle)
            rz = math.sin(angle)
            group["vertices"].extend([cx + rx * radius, y_bot, cz + rz * radius])
            group["normals"].extend([rx, 0, rz])
            cur_idx += 1

        # Connect top disk
        for i in range(segments):
            next_i = (i + 1) % segments
            group["indices"].extend([top_center, top_ring_start + i, top_ring_start + next_i])

        # Connect bottom disk
        for i in range(segments):
            next_i = (i + 1) % segments
            group["indices"].extend([bot_center, bot_ring_start + next_i, bot_ring_start + i])

        # Connect side walls
        for i in range(segments):
            next_i = (i + 1) % segments
            st1 = side_top_start + i
            st2 = side_top_start + next_i
            sb1 = side_bot_start + i
            sb2 = side_bot_start + next_i
            group["indices"].extend([st1, sb1, sb2, st1, sb2, st2])

    def add_sphere(mat_name, cx, cy, cz, radius, lat_segs=14, lon_segs=16):
        group = mesh_groups[mat_name]
        start_idx = len(group["vertices"]) // 3

        for lat in range(lat_segs + 1):
            theta = (lat / lat_segs) * math.pi
            sin_t = math.sin(theta)
            cos_t = math.cos(theta)
            for lon in range(lon_segs + 1):
                phi = (lon / lon_segs) * 2 * math.pi
                sin_p = math.sin(phi)
                cos_p = math.cos(phi)

                nx = sin_t * cos_p
                ny = cos_t
                nz = sin_t * sin_p

                group["vertices"].extend([cx + nx * radius, cy + ny * radius, cz + nz * radius])
                group["normals"].extend([nx, ny, nz])

        for lat in range(lat_segs):
            for lon in range(lon_segs):
                first = start_idx + (lat * (lon_segs + 1)) + lon
                second = first + lon_segs + 1
                group["indices"].extend([first, second, first + 1])
                group["indices"].extend([second, second + 1, first + 1])

    # ==========================================
    # 1. FLOOR & LANES
    # ==========================================
    add_box("Floor_Dark", 0, -0.2, 0, 64, 0.4, 52)
    
    # Grid lines on floor
    for x in range(-28, 30, 4):
        add_horizontal_plane("Floor_Grid", x, 0.005, 0, 0.08, 48)
    for z in range(-22, 24, 4):
        add_horizontal_plane("Floor_Grid", 0, 0.005, z, 58, 0.08)

    # Movement lanes (walkways)
    add_horizontal_plane("Lane_Walkway", 0, 0.012, -5.5, 52, 2.6)
    add_horizontal_plane("Lane_Walkway", 0, 0.012, 5.5, 52, 2.6)
    add_horizontal_plane("Lane_Walkway", -8, 0.012, 0, 2.6, 42)
    add_horizontal_plane("Lane_Walkway", 8, 0.012, 0, 2.6, 42)
    add_horizontal_plane("Lane_Walkway", 0, 0.012, 0, 16, 2.0)

    # Lane guidelines
    add_horizontal_plane("Lane_Guideline", 0, 0.018, -5.5, 52, 0.12)
    add_horizontal_plane("Lane_Guideline", 0, 0.018, 5.5, 52, 0.12)
    add_horizontal_plane("Lane_Guideline", -8, 0.018, 0, 0.12, 42)
    add_horizontal_plane("Lane_Guideline", 8, 0.018, 0, 0.12, 42)

    # Junction markers
    for jx, jz in [(-8, -5.5), (8, -5.5), (-8, 5.5), (8, 5.5)]:
        add_horizontal_plane("Junction_Sensor_Floor", jx, 0.025, jz, 3.2, 3.2)

    # ==========================================
    # 2. BOOKSHELVES (FORMING AISLES)
    # ==========================================
    shelf_configs = [
        # North wall
        (-16, 2.4, -21, 14, 4.8, 1.8),
        (0,   2.4, -21, 12, 4.8, 1.8),
        (16,  2.4, -21, 14, 4.8, 1.8),
        # South wall
        (-16, 2.4, 21,  14, 4.8, 1.8),
        (0,   2.4, 21,  12, 4.8, 1.8),
        (16,  2.4, 21,  14, 4.8, 1.8),
        # West & East perimeter
        (-27, 2.4, -10, 1.8, 4.8, 12),
        (-27, 2.4, 10,  1.8, 4.8, 12),
        (27,  2.4, -10, 1.8, 4.8, 12),
        (27,  2.4, 10,  1.8, 4.8, 12),
        # Internal aisle dividers
        (-16, 2.25, 0,  1.8, 4.5, 6.5),
        (16,  2.25, 0,  1.8, 4.5, 6.5)
    ]
    for x, y, z, w, h, d in shelf_configs:
        add_box("Bookshelf_Body", x, y, z, w, h, d)
        add_box("Bookshelf_Trim", x, h + 0.09, z, w + 0.1, 0.18, d + 0.1)

    # ==========================================
    # 3. STUDY TABLES (5 CYLINDERS)
    # ==========================================
    tables = [
        (0,   0,   3.8, 1.2),  # Center Hub
        (-16, -11, 2.7, 1.2),  # NW
        (16,  -11, 2.7, 1.2),  # NE
        (-16, 11,  2.7, 1.2),  # SW
        (16,  11,  2.7, 1.2),  # SE
    ]
    for tx, tz, trad, th in tables:
        # Table top
        add_cylinder("Table_Top", tx, th, tz, trad, 0.22, segments=28)
        # Leg
        add_cylinder("Table_Leg", tx, th / 2, tz, 0.5, th, segments=16)
        # Glow ring
        add_cylinder("Table_Glow_Ring", tx, th - 0.04, tz, trad + 0.05, 0.04, segments=28)

    # ==========================================
    # 4. ACCESS POINTS (6 FLOATING BLUE SPHERES)
    # ==========================================
    ap_positions = [
        (-16, 7.5, -11),
        (0,   7.5, -5.5),
        (16,  7.5, -11),
        (-16, 7.5, 11),
        (0,   7.5, 5.5),
        (16,  7.5, 11)
    ]
    for apx, apy, apz in ap_positions:
        add_sphere("AP_Ceiling_Node", apx, apy, apz, 0.8, lat_segs=16, lon_segs=18)
        # Hanging mount rod
        add_cylinder("Table_Leg", apx, (apy + 9.0) / 2, apz, 0.08, 9.0 - apy, segments=8)

    # ==========================================
    # 5. USERS (STUDY PATRONS)
    # ==========================================
    for t_idx, (tx, tz, trad, th) in enumerate(tables):
        user_count = 5 if t_idx == 0 else 4
        dist = trad + 0.7
        for i in range(user_count):
            angle = (i / user_count) * 2 * math.pi
            ux = tx + math.cos(angle) * dist
            uz = tz + math.sin(angle) * dist
            add_sphere("User_Patron_Dot", ux, 0.95, uz, 0.38, lat_segs=12, lon_segs=12)

    # ==========================================
    # 6. CAMERA SENSORS (AT LANE JUNCTIONS)
    # ==========================================
    camera_positions = [
        (-8, 0.45, -5.5),
        (8,  0.45, -5.5),
        (-8, 0.45, 5.5),
        (8,  0.45, 5.5)
    ]
    for cx, cy, cz in camera_positions:
        add_box("Camera_Junction_Node", cx, cy, cz, 0.85, 0.85, 0.85)
        add_cylinder("Table_Leg", cx, 0.22, cz, 0.12, 0.44, segments=8)

    return materials, mesh_groups

def export_obj(materials, mesh_groups, obj_path, mtl_path):
    """Exports the 3D model to Wavefront OBJ and MTL files."""
    mtl_filename = os.path.basename(mtl_path)
    
    # 1. Write MTL
    with open(mtl_path, "w") as f:
        f.write("# LuminaLanes Library Digital Twin Material Library\n\n")
        for mat_name, mat_data in materials.items():
            kd = mat_data["kd"]
            f.write(f"newmtl {mat_name}\n")
            f.write("Ka 0.1 0.1 0.1\n")
            f.write(f"Kd {kd[0]:.4f} {kd[1]:.4f} {kd[2]:.4f}\n")
            f.write("Ks 0.5 0.5 0.5\n")
            f.write("Ns 40.0\n")
            f.write("d 1.0\n")
            f.write("illum 2\n\n")

    # 2. Write OBJ
    with open(obj_path, "w") as f:
        f.write("# LuminaLanes 3D Library Digital Twin Model\n")
        f.write(f"mtllib {mtl_filename}\n\n")

        global_vertex_offset = 1

        for mat_name, group in mesh_groups.items():
            verts = group["vertices"]
            normals = group["normals"]
            indices = group["indices"]

            if not verts:
                continue

            f.write(f"# Material: {mat_name}\n")
            f.write(f"usemtl {mat_name}\n")
            f.write(f"o {mat_name}_Object\n")

            # Write vertices
            for i in range(0, len(verts), 3):
                f.write(f"v {verts[i]:.4f} {verts[i+1]:.4f} {verts[i+2]:.4f}\n")

            # Write normals
            for i in range(0, len(normals), 3):
                f.write(f"vn {normals[i]:.4f} {normals[i+1]:.4f} {normals[i+2]:.4f}\n")

            # Write triangle faces (1-indexed in OBJ format)
            for i in range(0, len(indices), 3):
                i0 = global_vertex_offset + indices[i]
                i1 = global_vertex_offset + indices[i+1]
                i2 = global_vertex_offset + indices[i+2]
                f.write(f"f {i0}//{i0} {i1}//{i1} {i2}//{i2}\n")

            global_vertex_offset += len(verts) // 3
            f.write("\n")

def export_glb(materials, mesh_groups, glb_path):
    """Exports the 3D model to standard binary glTF 2.0 (.glb)."""
    binary_data = bytearray()
    accessors = []
    buffer_views = []
    meshes = []
    nodes = []
    node_indices = []
    gltf_materials = []

    mat_name_to_idx = {}
    for idx, (mat_name, mat_info) in enumerate(materials.items()):
        mat_name_to_idx[mat_name] = idx
        pbr = mat_info["pbr"]
        mat_obj = {
            "name": mat_name,
            "pbrMetallicRoughness": {
                "baseColorFactor": pbr,
                "metallicFactor": mat_info.get("metallic", 0.3),
                "roughnessFactor": mat_info.get("roughness", 0.6)
            }
        }
        if "emissive" in mat_info:
            mat_obj["emissiveFactor"] = mat_info["emissive"]
        gltf_materials.append(mat_obj)

    for mat_name, group in mesh_groups.items():
        verts = group["vertices"]
        normals = group["normals"]
        indices = group["indices"]

        if not verts or not indices:
            continue

        # Position buffer
        pos_bytes = struct.pack(f"<{len(verts)}f", *verts)
        pos_bv_idx = len(buffer_views)
        pos_offset = len(binary_data)
        binary_data.extend(pos_bytes)
        # Pad to 4 bytes
        while len(binary_data) % 4 != 0:
            binary_data.append(0)

        buffer_views.append({
            "buffer": 0,
            "byteOffset": pos_offset,
            "byteLength": len(pos_bytes),
            "target": 34962 # ARRAY_BUFFER
        })

        min_pos = [min(verts[i::3]) for i in range(3)]
        max_pos = [max(verts[i::3]) for i in range(3)]

        pos_acc_idx = len(accessors)
        accessors.append({
            "bufferView": pos_bv_idx,
            "byteOffset": 0,
            "componentType": 5126, # FLOAT
            "count": len(verts) // 3,
            "type": "VEC3",
            "min": min_pos,
            "max": max_pos
        })

        # Normal buffer
        norm_bytes = struct.pack(f"<{len(normals)}f", *normals)
        norm_bv_idx = len(buffer_views)
        norm_offset = len(binary_data)
        binary_data.extend(norm_bytes)
        while len(binary_data) % 4 != 0:
            binary_data.append(0)

        buffer_views.append({
            "buffer": 0,
            "byteOffset": norm_offset,
            "byteLength": len(norm_bytes),
            "target": 34962
        })

        norm_acc_idx = len(accessors)
        accessors.append({
            "bufferView": norm_bv_idx,
            "byteOffset": 0,
            "componentType": 5126,
            "count": len(normals) // 3,
            "type": "VEC3"
        })

        # Index buffer (UNSIGNED_INT 5125)
        idx_bytes = struct.pack(f"<{len(indices)}I", *indices)
        idx_bv_idx = len(buffer_views)
        idx_offset = len(binary_data)
        binary_data.extend(idx_bytes)
        while len(binary_data) % 4 != 0:
            binary_data.append(0)

        buffer_views.append({
            "buffer": 0,
            "byteOffset": idx_offset,
            "byteLength": len(idx_bytes),
            "target": 34963 # ELEMENT_ARRAY_BUFFER
        })

        idx_acc_idx = len(accessors)
        accessors.append({
            "bufferView": idx_bv_idx,
            "byteOffset": 0,
            "componentType": 5125, # UNSIGNED_INT
            "count": len(indices),
            "type": "SCALAR",
            "min": [min(indices)],
            "max": [max(indices)]
        })

        # Create glTF Mesh
        mesh_idx = len(meshes)
        meshes.append({
            "name": f"Mesh_{mat_name}",
            "primitives": [{
                "attributes": {
                    "POSITION": pos_acc_idx,
                    "NORMAL": norm_acc_idx
                },
                "indices": idx_acc_idx,
                "material": mat_name_to_idx[mat_name]
            }]
        })

        node_idx = len(nodes)
        nodes.append({
            "name": f"Node_{mat_name}",
            "mesh": mesh_idx
        })
        node_indices.append(node_idx)

    # Build glTF JSON structure
    gltf_dict = {
        "asset": {
            "version": "2.0",
            "generator": "LuminaLanes 3D Digital Twin GLB Exporter"
        },
        "scene": 0,
        "scenes": [{
            "name": "Library_Digital_Twin",
            "nodes": node_indices
        }],
        "nodes": nodes,
        "meshes": meshes,
        "materials": gltf_materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{
            "byteLength": len(binary_data)
        }]
    }

    json_str = json.dumps(gltf_dict, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')

    # Pad JSON chunk to 4-byte boundary with spaces (0x20)
    json_padding = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * json_padding

    # Pad BIN chunk to 4-byte boundary with nulls (0x00)
    bin_padding = (4 - (len(binary_data) % 4)) % 4
    binary_data += b'\x00' * bin_padding

    # Header: 12 bytes
    # Chunk 0 (JSON): 8 bytes + len(json_bytes)
    # Chunk 1 (BIN): 8 bytes + len(binary_data)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary_data)

    header = struct.pack(
        "<4sII",
        b"glTF",
        2,
        total_length
    )

    json_chunk_header = struct.pack(
        "<II",
        len(json_bytes),
        0x4E4F534A # "JSON"
    )

    bin_chunk_header = struct.pack(
        "<II",
        len(binary_data),
        0x004E4942 # "BIN\0"
    )

    with open(glb_path, "wb") as f:
        f.write(header)
        f.write(json_chunk_header)
        f.write(json_bytes)
        f.write(bin_chunk_header)
        f.write(binary_data)

def main():
    print("[3D Asset Generator] Building 3D Library Digital Twin model...")
    materials, mesh_groups = build_library_scene()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Output OBJ / MTL
    obj_path = os.path.join(base_dir, "library_model.obj")
    mtl_path = os.path.join(base_dir, "library_model.mtl")
    export_obj(materials, mesh_groups, obj_path, mtl_path)
    print(f"[3D Asset Generator] Created: {obj_path} ({os.path.getsize(obj_path):,} bytes)")
    print(f"[3D Asset Generator] Created: {mtl_path} ({os.path.getsize(mtl_path):,} bytes)")

    # 2. Output Binary GLB
    glb_path = os.path.join(base_dir, "library_model.glb")
    export_glb(materials, mesh_groups, glb_path)
    print(f"[3D Asset Generator] Created: {glb_path} ({os.path.getsize(glb_path):,} bytes)")

    # Copy to static/ for easy web serving as well
    static_dir = os.path.join(base_dir, "static")
    os.makedirs(static_dir, exist_ok=True)
    static_glb = os.path.join(static_dir, "library_model.glb")
    with open(glb_path, "rb") as src, open(static_glb, "wb") as dst:
        dst.write(src.read())
    print(f"[3D Asset Generator] Copied to: {static_glb}")

if __name__ == "__main__":
    main()
