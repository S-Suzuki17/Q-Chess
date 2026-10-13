"""Original articulated mascot enemies. Run in an independent factory-startup Blender.

The editable 3D meshes are retained in art/*.blend. Smooth, lightweight orthographic
RGBA layers are exported for the app; only the current character loads at runtime.
No QUBE or adopted board asset is read, modified or copied.
"""
import bpy, json, math, os, sys, hashlib, array
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args=sys.argv[sys.argv.index('--')+1:]
catalogue_path,output_root=args[0],args[1]
selected=set(map(int,args[2].split(','))) if len(args)>2 else set(range(1,101))
sys.stdout=open(os.path.join(output_root,'scratch/crown-character-blender-python.log'),'w',buffering=1,encoding='utf8');sys.stderr=sys.stdout
with open(catalogue_path,encoding='utf8') as f: catalogue=json.load(f)
assert bpy.data.filepath=='' and selected.issubset(set(range(1,101)))
startup=list(bpy.data.objects.keys())
# Only defaults in this new, unsaved factory process; no user's scene was opened.
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.resolution_x=160;scene.render.resolution_y=180;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(0,-8,3.4));camera=bpy.context.object;camera.name='Crown_Character_Studio_Camera'
camera.rotation_euler=(Vector((0,0,1.50))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.65;scene.camera=camera
library=bpy.data.collections.new('Crown_Original_Character_Library');scene.collection.children.link(library)
material_cache={};current=None;objects=[]
palettes=[('#d7cdbc','#526c71','#91a3a6'),('#c3cfca','#355b79','#89b8cd'),('#e0d5c1','#7a617f','#c0b0d1'),('#c1bda9','#4d665a','#95ad8f'),('#dac9b3','#824e60','#ca9eab')]
gold='#dbba75';dark='#233333';white='#f1eada'
def material(color):
    if color not in material_cache:
        mat=bpy.data.materials.new('Crown_'+color[1:]);mat.diffuse_color=tuple((int(color[i:i+2],16)/255)**2.2 for i in (1,3,5))+(1,);mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=mat.diffuse_color;shader.inputs['Roughness'].default_value=.48;shader.inputs['Metallic'].default_value=.28 if color==gold else .015;material_cache[color]=mat
    return material_cache[color]
def own(obj,name,part,color):
    obj.name=name;obj['crown_part']=part;obj['crown_enemy_id']=current['id'];obj.data.materials.append(material(color))
    for col in list(obj.users_collection): col.objects.unlink(obj)
    collection.objects.link(obj);objects.append(obj);return obj
def orb(name,location,scale,part,color,segments=20,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=location)
    obj=own(bpy.context.object,name,part,color);obj.scale=scale
    for face in obj.data.polygons:face.use_smooth=True
    return obj
def box(name,location,scale,part,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);obj=own(bpy.context.object,name,part,color);obj.scale=scale
    bevel=obj.modifiers.new('Soft_Sculpted_Edges','BEVEL');bevel.width=.13;bevel.segments=2;return obj
def rod(name,a,b,radius,part,color):
    a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=radius,depth=(b-a).length,location=(a+b)/2)
    obj=own(bpy.context.object,name,part,color);obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return obj
def ribbon(name,points,width,part,color):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=width;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,co in zip(spline.points,points):point.co=(*co,1)
    obj=bpy.data.objects.new(name,curve);collection.objects.link(obj);objects.append(obj);obj['crown_part']=part;obj['crown_enemy_id']=current['id'];curve.materials.append(material(color));return obj
def crown(z,part='head',rays=5):
    for k in range(rays):
        x=(k-(rays-1)/2)*.18
        box('Royal_Crown_Tooth', (x,-.02,z+.10+(1-abs(x))*.12),(.12,.34,.25+(k%2)*.10),part,gold)
    box('Crown_Band',(0,-.02,z-.04),(.94,.34,.13),part,gold)
def project(point):
    p=world_to_camera_view(scene,camera,point);return [round(p.x*160,2),round((1-p.y)*180,2)]
def export_character(enemy):
    bpy.context.view_layer.update()
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.film_transparent=True
    scene.render.resolution_x=256;scene.render.resolution_y=288;scene.render.resolution_percentage=100
    scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8'
    scene.view_settings.view_transform='AgX'
    target=os.path.join(output_root,'public/assets/crown-enemies')
    full=os.path.join(target,enemy['id']+'.png');scene.render.filepath=full
    bpy.ops.render.render(write_still=True)
    order=['cape','left-foot','right-foot','body','left-hand','right-hand','head','gear']
    atlas=bpy.data.images.new(enemy['id']+'_Articulated_Atlas',width=768,height=864,alpha=True,float_buffer=True)
    pixels=array.array('f',[0.0])*(768*864*4)
    for index,part in enumerate(order):
        selected_parts=[obj for obj in objects if obj['crown_part']==part]
        if not selected_parts:continue
        for obj in objects:obj.hide_render=obj not in selected_parts
        scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32'
        temp=os.path.join(output_root,'scratch',enemy['id']+'-'+part+'.exr');scene.render.filepath=temp
        bpy.ops.render.render(write_still=True)
        image=bpy.data.images.load(temp,check_existing=False);layer=array.array('f',[0.0])*(256*288*4);image.pixels.foreach_get(layer)
        col=index%3;row=index//3
        for y in range(288):
            dst=((2-row)*288+y)*768*4+col*256*4;src=y*256*4
            pixels[dst:dst+256*4]=layer[src:src+256*4]
        bpy.data.images.remove(image)
        print('LAYER '+enemy['id']+' '+part,flush=True)
    for obj in objects:obj.hide_render=False
    atlas.pixels.foreach_set(pixels);atlas.alpha_mode='PREMUL'
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8'
    atlas_path=os.path.join(target,enemy['id']+'-atlas.png');atlas.save_render(atlas_path,scene=scene)
    bpy.data.images.remove(atlas)
    files=[]
    for file in [full,atlas_path]:
        with open(file,'rb') as f:raw=f.read()
        files.append({'name':os.path.basename(file),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    return {'id':enemy['id'],'stageId':enemy['stageId'],'objects':len(objects),'parts':[part for part in order if any(obj['crown_part']==part for obj in objects)],'files':files,'bytes':sum(file['bytes'] for file in files)}

os.makedirs(os.path.join(output_root,'public/assets/crown-enemies'),exist_ok=True);os.makedirs(os.path.join(output_root,'art'),exist_ok=True)
world=bpy.data.worlds.new('Crown_Studio_World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.70,.76,.80,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
for name,position,energy,size in [('Key',(-3,-4,6),400,4),('Fill',(3,-2,4),210,3),('Rim',(0,4,5),300,3)]:
    bpy.ops.object.light_add(type='AREA',location=position);lamp=bpy.context.object;lamp.name='Crown_Studio_'+name;lamp.data.energy=energy;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,1.4))-lamp.location).to_track_quat('-Z','Y').to_euler()
records=[]
for enemy in catalogue:
    if enemy['stageId'] not in selected:continue
    current=enemy;v=enemy['crest'];family={'pawn':0,'knight':1,'bishop':2,'rook':3,'queen':4,'king':4}[enemy['foe']];head_color,cloth,accent=palettes[family]
    if enemy['finalBoss']:head_color,cloth,accent='#dcb976','#604d68',gold
    collection=bpy.data.collections.new(enemy['id']+'_'+enemy['name']['en']);library.children.link(collection);objects=[]
    # Oversized expressive head, short torso and independently modeled limbs.
    head=orb('Rounded_Character_Head',(0,0,2.10),(.64+(v%3)*.025,.50,.57+(v%4)*.02),'head',head_color,24,12)
    orb('Short_Costumed_Torso',(0,.04,1.05),(.43+(family==3)*.09,.29,.48),'body',cloth)
    orb('Chest_Plate',(0,-.265,1.10),(.30,.055,.30),'body',accent,16,8)
    for side,x in [('left',-.32),('right',.32)]:
        orb(side+'_Boot',(x,-.09,.40),(.23,.30,.17),side+'-foot',dark,16,8)
        rod(side+'_Leg',(x,0,.43),(x,0,.74),.10,side+'-foot',cloth)
    for side,x in [('left',-.60),('right',.60)]:
        z=1.03+(.12 if (v+family)%3==0 and side=='right' else 0)
        rod(side+'_Arm',(x*.68,0,1.35),(x,-.02,z+.07),.12,side+'-hand',cloth)
        orb(side+'_Hand',(x,-.08,z),(.17,.17,.18),side+'-hand',head_color,16,8)
    # Facial expressions are actual separate meshes/curves on the head, not labels.
    eye_style=4 if enemy['finalBoss'] else (v+family)%5;eye_z=2.14+(eye_style==3)*.04;eye_width=.14 if eye_style!=4 else .17
    for side,x in [('left',-.25),('right',.25)]:
        orb(side+'_Eye_White',(x,-.477,eye_z),(eye_width,.07,.16 if eye_style<3 else .12),'head',white,16,8)
        orb(side+'_Pupil',(x+(.015 if eye_style==1 else -.012),-.535,eye_z-.012),(.062,.038,.090 if eye_style<3 else .068),'head',dark,12,8)
        orb(side+'_Eye_Glint',(x-.015,-.567,eye_z+.035),(.018,.013,.026),'head','#ffffff',10,6)
        slant=(.055 if eye_style in (1,4) else -.025)*(1 if side=='left' else -1)
        ribbon(side+'_Brow',[(x-.14,-.46,eye_z+.19+slant),(x+.12,-.46,eye_z+.19-slant)],.032,'head',dark)
    mouth_z=1.88
    mouth=[(-.13,-.49,mouth_z),(-.06,-.52,mouth_z-.035),(0,-.53,mouth_z-.045),(.07,-.52,mouth_z-.025),(.13,-.49,mouth_z)] if eye_style in (0,3) else [(-.13,-.49,mouth_z-.02),(0,-.53,mouth_z+.015),(.13,-.49,mouth_z-.02)]
    ribbon('Individual_Mouth',mouth,.020,'head',dark)
    orb('Small_Nose',(0,-.53,2.015),(.057,.047,.042),'head',head_color,12,8)
    for x in [-.43,.43]:orb('Soft_Cheek',(x,-.405,1.96),(.09,.025,.054),'head','#b98c81',12,6)
    # Family silhouettes differ even before the 20 individual equipment variations.
    if family==0:
        box('Watch_Cap',(0,.025,2.59),(1.14,.48,.15),'head',cloth)
        orb('Pawn_Cap_Orb',(0,.02,2.82),(.17,.17,.17),'head',accent,16,8)
        box('Cap_Peak',(0,-.28,2.55),(.56,.25,.10),'head',accent)
    elif family==1:
        for x in [-.45,.45]:orb('Rider_Ear_Plate',(x,.10,2.64),(.16,.16,.27),'head',cloth,16,8)
        ribbon('Rider_Crest',[(-.03,.15,2.6),(0,.16,2.86),(.04,.15,3.02)],.070,'head',accent)
        orb('Horse_Profile_Helmet',(0,.10,2.69),(.27,.31,.30),'head',cloth)
        orb('Horse_Helmet_Muzzle',(0,-.18,2.62),(.22,.18,.13),'head',accent)
    elif family==2:
        orb('Lantern_Hood',(0,.18,2.21),(.70,.37,.71),'head',cloth,24,12)
        bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.34,radius2=.03,depth=.65,location=(0,.07,2.93));own(bpy.context.object,'Bishop_Mitre','head',accent)
        rod('Mitre_Diagonal_Slit',(-.11,-.17,2.90),(.10,-.17,3.18),.030,'head',dark)
        box('Mage_Book',(-.66,-.10,1.02),(.28,.15,.37),'left-hand',accent)
    elif family==3:
        for x in [-.43,.43]:box('Bastion_Pauldron',(x,.08,1.40),(.39,.42,.30),'body',accent)
        box('Bastion_Helmet',(0,.14,2.64),(1.25,.48,.25),'head',cloth)
        box('Helm_Band',(0,-.18,2.57),(1.17,.12,.10),'head',accent)
        for x in [-.48,0,.48]:box('Rook_Crenellation',(x,.10,2.86),(.23,.40,.27),'head',accent)
    else:
        orb('Court_Hair_Back',(0,.22,2.12),(.72,.32,.69),'cape',cloth,24,12)
        ribbon('Court_Diadem',[(-.47,-.1,2.50),(0,-.30,2.74),(.47,-.1,2.50)],.055,'head',gold)
    if family in (2,4) or enemy['finalBoss']:
        orb('Short_Layered_Cape',(0,.22,1.12),(.56,.15,.60),'cape',cloth)
    # Individual equipment: each of the twenty roles has a different physical outline.
    if v in (0,2,9,16):
        orb('Distinct_Shield',(-.70,-.16,1.08),(.23,.095,.32 if v!=16 else .23),'left-hand',accent,16,8)
        if v==2:orb('Second_Shield',(.70,-.16,1.08),(.22,.095,.30),'right-hand',gold,16,8)
    if v in (1,4,6,7,8,14,15,18):
        rod('Role_Staff',(.73,.02,.50),(.73,.02,2.32),.045,'right-hand',gold)
        if v==1:box('Standard_Flag',(.94,.03,2.17),(.42,.07,.26),'gear',cloth)
        elif v==7:box('Lantern_Frame',(.73,.02,2.38),(.28,.23,.38),'gear',gold);orb('Lantern_Light',(.73,-.09,2.38),(.08,.05,.12),'gear','#e9d59e',12,8)
        elif v==8:orb('Key_Bow',(.73,.02,2.42),(.15,.06,.15),'gear',gold,16,8);box('Key_Teeth',(.81,0,2.26),(.23,.11,.12),'gear',gold)
        elif v==18:orb('Hour_Glass_Top',(.73,.02,2.43),(.15,.11,.13),'gear',accent);orb('Hour_Glass_Base',(.73,.02,2.22),(.15,.11,.13),'gear',accent)
        else:orb('Staff_Orb',(.73,.02,2.42),(.15,.13,.16),'gear',accent,16,8)
    if v==5:
        rod('Short_Blade',(.73,-.02,.76),(.73,-.02,1.83),.068,'right-hand',white);rod('Blade_Guard',(.54,-.02,1.06),(.93,-.02,1.06),.05,'right-hand',gold)
    if v in (3,11,13,17):
        for side,x in [('left',-.54),('right',.54)]:
            orb('Role_'+side+'_Crest',(x,.04,2.64),(.15,.12,.20+(v==17)*.13),'head',accent,16,8)
    if v in (10,12,15):
        for k in range(3):box('Role_Armor_Step',((k-1)*.24,-.15,2.67+k*.035),(.18,.18,.20),'head',accent)
    if v==14:
        ribbon('Sail_Cape',[(-.42,.20,1.48),(-.82,.20,.92),(-.41,.20,.62)],.11,'cape',accent)
    if v in (6,19) or enemy['finalBoss']:crown(2.79,rays=7 if enemy['finalBoss'] else 5)
    if enemy['finalBoss']:
        rod('King_Cross_Vertical',(0,0,2.98),(0,0,3.32),.055,'head',gold)
        rod('King_Cross_Horizontal',(-.14,0,3.20),(.14,0,3.20),.055,'head',gold)
    if enemy['finalBoss']:
        for x in [-.46,.46]:orb('Royal_Pauldron',(x,.04,1.42),(.31,.24,.22),'body',gold,16,8)
        box('Royal_Belt',(0,-.29,.96),(.61,.11,.12),'body',gold)
    for other in library.all_objects:other.hide_render=other not in objects
    for obj in objects:
        if obj['crown_part']=='gear':obj['crown_part']='right-hand'
    records.append(export_character(enemy))
    # Organize the editable library on a grid only after its normalized export.
    offset=Vector(((len(records)-1)%10*3.2,(len(records)-1)//10*4.0,0))
    for obj in objects:obj.location+=offset
    collection['enemy_id']=enemy['id'];collection['stage_id']=enemy['stageId']
for obj in library.all_objects:obj.hide_render=False
blend=os.path.join(output_root,'art','crown-enemy-smooth-prototypes.blend' if len(selected)<6 else 'crown-enemies.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend,compress=True,check_existing=False)
result={'createdAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'application':'Blender '+bpy.app.version_string,'factoryStartupObjects':startup,'sourceBlend':blend,'sourceScript':'scripts/assets/create-crown-characters.py','originalQubeAndBoardAssetsRead':False,'characters':records,'totalBytes':sum(r['bytes'] for r in records),'runtime':'Only selected smooth RGBA render/layer assets load; no Blender runtime or authoring scene ships.'}
with open(os.path.join(output_root,'art','crown-character-creation.json'),'w',encoding='utf8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print(json.dumps({'application':result['application'],'characters':len(records),'bytes':result['totalBytes'],'blend':blend}))
