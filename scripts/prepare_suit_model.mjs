// Reproducible lossless unpacking of NASA's Draco geometry. No runtime decoder/CDN.
import {readFileSync,writeFileSync,copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const temp=mkdtempSync(join(tmpdir(),'marswalk-draco-'));
try{
 copyFileSync('node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js',join(temp,'decoder.cjs'));
 const draco=await createRequire(import.meta.url)(join(temp,'decoder.cjs'))();
 const source=readFileSync('research-data/health/astronaut-original.glb');
 const len=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+len).toString());
 const bin=source.subarray(28+len);const chunks=[bin];let offset=bin.length;
 const append=(array)=>{const buffer=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length});chunks.push(buffer);offset+=buffer.length;return view;};
 for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
  const ext=primitive.extensions?.KHR_draco_mesh_compression;if(!ext)continue;
  const view=doc.bufferViews[ext.bufferView],bytes=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const decoder=new draco.Decoder(),buffer=new draco.DecoderBuffer(),geometry=new draco.Mesh();buffer.Init(new Int8Array(bytes),bytes.length);
  const status=decoder.DecodeBufferToMesh(buffer,geometry);if(!status.ok())throw Error(status.error_msg());
  for(const [name,id] of Object.entries(ext.attributes)){
   const attr=decoder.GetAttributeByUniqueId(geometry,id),values=new draco.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(geometry,attr,values);
   const count=geometry.num_points(),components=attr.num_components(),array=new Float32Array(count*components);
   for(let i=0;i<array.length;i++)array[i]=values.GetValue(i);
   const accessor=doc.accessors[primitive.attributes[name]];accessor.bufferView=append(array);accessor.byteOffset=0;accessor.componentType=5126;accessor.count=count;delete accessor.normalized;
   if(name==='POSITION'){accessor.min=Array.from({length:components},(_,c)=>Math.min(...array.filter((_,i)=>i%components===c)));accessor.max=Array.from({length:components},(_,c)=>Math.max(...array.filter((_,i)=>i%components===c)));}
   draco.destroy(values);
  }
  const faces=new Uint32Array(geometry.num_faces()*3),face=new draco.DracoInt32Array();for(let i=0;i<geometry.num_faces();i++){decoder.GetFaceFromMesh(geometry,i,face);for(let j=0;j<3;j++)faces[3*i+j]=face.GetValue(j);}
  const indices=doc.accessors[primitive.indices];Object.assign(indices,{bufferView:append(faces),byteOffset:0,componentType:5125,count:faces.length,min:[Math.min(...faces)],max:[Math.max(...faces)]});
  delete primitive.extensions.KHR_draco_mesh_compression;if(!Object.keys(primitive.extensions).length)delete primitive.extensions;
  draco.destroy(face);draco.destroy(geometry);draco.destroy(buffer);draco.destroy(decoder);draco.destroy(status);
 }
 doc.extensionsRequired=(doc.extensionsRequired??[]).filter(x=>x!=='KHR_draco_mesh_compression');doc.extensionsUsed=(doc.extensionsUsed??[]).filter(x=>x!=='KHR_draco_mesh_compression');doc.buffers[0].byteLength=offset;
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const binary=Buffer.concat(chunks),output=Buffer.alloc(28+json.length+binary.length);output.writeUInt32LE(0x46546c67);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(json.length,12);output.writeUInt32LE(0x4e4f534a,16);json.copy(output,20);output.writeUInt32LE(binary.length,20+json.length);output.writeUInt32LE(0x004e4942,24+json.length);binary.copy(output,28+json.length);
 writeFileSync('public/assets/models/astronaut.glb',output);console.log(JSON.stringify({bytes:output.length,sha256:createHash('sha256').update(output).digest('hex')}));
}finally{rmSync(temp,{recursive:true,force:true});}
