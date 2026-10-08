"""Re-export the original victory-FX prop from its authored Blender studio.
This asset is an effect decoration. It never replaces a currently adopted chess piece.
Usage: blender -b -t 4 --python scripts/assets/export-coronation-seal.py
"""
import bpy, os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'public/assets/victory-cinematic')
SOURCE=os.path.join(ROOT,'scripts/assets/source/coronation-production.blend')
bpy.ops.wm.open_mainfile(filepath=SOURCE)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'coronation-seal.glb'),use_selection=True,export_format='GLB',export_yup=True,export_apply=True,export_cameras=False,export_lights=False)
render_path=os.path.join(ROOT,'scratch/cinematic/coronation-seal.png')
os.makedirs(os.path.dirname(render_path),exist_ok=True)
bpy.context.scene.render.filepath=render_path
bpy.ops.render.render(write_still=True)
