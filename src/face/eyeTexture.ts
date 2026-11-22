// Canvas texture for an eyeball whose pole points forward.
//
// Three's SphereGeometry maps the canvas top row to the north pole. The eyeball geometry is
// rotated so that pole faces +Z, so circles around the pole (pupil, iris) are simply
// horizontal bands near the top of the canvas, and radial iris streaks are vertical lines.
import * as THREE from 'three';

export interface EyeTextureOptions {
  irisAngle: number; // degrees from the pole
  pupilAngle: number;
  scleraColor: string;
  irisColor: string;
  irisEdgeColor: string;
  pupilColor: string;
}

const W = 1024;
const H = 512;

export function drawEyeTexture(o: EyeTextureOptions, canvas = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const row = (deg: number) => (deg / 180) * H;
  const pupil = row(o.pupilAngle);
  const iris = row(o.irisAngle);

  // Sclera, slightly greyer toward the back so the eyeball reads as round.
  const sclera = g.createLinearGradient(0, iris, 0, H);
  sclera.addColorStop(0, o.scleraColor);
  sclera.addColorStop(0.5, o.scleraColor);
  sclera.addColorStop(1, '#bcb3a8');
  g.fillStyle = sclera;
  g.fillRect(0, 0, W, H);

  // Iris: lighter toward the pupil, dark limbal ring at the edge.
  const irisGrad = g.createLinearGradient(0, pupil, 0, iris);
  irisGrad.addColorStop(0, shade(o.irisColor, 1.35));
  irisGrad.addColorStop(0.55, o.irisColor);
  irisGrad.addColorStop(0.85, o.irisEdgeColor);
  irisGrad.addColorStop(1, o.irisEdgeColor);
  g.fillStyle = irisGrad;
  g.fillRect(0, 0, W, iris);

  // Radial streaks (vertical lines in this projection), deterministic pseudo-random.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) {
    const x = rand() * W;
    const light = rand() > 0.5;
    g.strokeStyle = light ? 'rgba(255,220,170,0.10)' : 'rgba(0,0,0,0.16)';
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    g.moveTo(x, pupil + rand() * (iris - pupil) * 0.2);
    g.lineTo(x, pupil + (0.6 + rand() * 0.4) * (iris - pupil));
    g.stroke();
  }

  // Soft blend from iris into sclera.
  const blend = g.createLinearGradient(0, iris - 4, 0, iris + 6);
  blend.addColorStop(0, 'rgba(0,0,0,0)');
  blend.addColorStop(0.4, hexA(o.irisEdgeColor, 0.6));
  blend.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = blend;
  g.fillRect(0, iris - 4, W, 10);

  // Pupil.
  g.fillStyle = o.pupilColor;
  g.fillRect(0, 0, W, pupil);
  const pupilEdge = g.createLinearGradient(0, pupil - 2, 0, pupil + 3);
  pupilEdge.addColorStop(0, o.pupilColor);
  pupilEdge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pupilEdge;
  g.fillRect(0, pupil - 2, W, 5);

  return canvas;
}

export function createEyeTexture(o: EyeTextureOptions): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(drawEyeTexture(o));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function redrawEyeTexture(tex: THREE.CanvasTexture, o: EyeTextureOptions): void {
  drawEyeTexture(o, tex.image as HTMLCanvasElement);
  tex.needsUpdate = true;
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function hexA(hex: string, a: number): string {
  const h = new THREE.Color(hex).getHexString(); // sRGB hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}
