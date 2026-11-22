// GLB loading with the same decoders as three.js' webgl_morphtargets_face example:
// KTX2 (Basis) textures and meshopt-compressed geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DECODERS } from './config';

export interface LoadedModel {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  /** Meshes that carry morph targets. */
  morphMeshes: THREE.Mesh[];
  vertexCount: number;
}

export async function loadModel(url: string, renderer: THREE.WebGLRenderer): Promise<LoadedModel> {
  const ktx2 = new KTX2Loader().setTranscoderPath(DECODERS.basisTranscoderPath).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return {
    root: gltf.scene,
    meshes,
    morphMeshes: meshes.filter((m) => m.morphTargetInfluences && m.morphTargetInfluences.length > 0),
    vertexCount: meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0),
  };
}
