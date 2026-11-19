// One small geometry builder shared by the city, the cars and the people: it collects boxes, flat
// plates and quads into a single buffer with per-vertex colour and wall-aligned UVs, so a whole
// skyline or a whole fleet is one mesh and one draw call.
import * as THREE from '../vendor/three.min.js';

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.uv = [];
    this.col = [];
  }

  /** One quad, corners counter-clockwise seen from outside, with four uv pairs. */
  quad(a, b, c, d, n, ua, ub, uc, ud, color) {
    const tri = [a, b, c, a, c, d];
    const uvs = [ua, ub, uc, ua, uc, ud];
    for (let i = 0; i < 6; i += 1) {
      this.pos.push(tri[i][0], tri[i][1], tri[i][2]);
      this.norm.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /**
   * A box standing on `baseY`. `uv` is [bays, floors] of window modules, so a facade's windows line
   * up with floors instead of stretching with the height.
   */
  box(cx, baseY, cz, w, h, d, color, uv) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y0 = baseY;
    const y1 = baseY + h;
    const tile = 10.4;
    const [bays, floors] = uv ?? [Math.max(1, Math.round(w / 3.4)), Math.max(1, Math.round(h / 3.4))];
    const v = floors * 0.25;
    const uwx = Math.max(1, Math.round((w / tile) / 0.25)) * 0.25;
    const uwd = Math.max(1, Math.round((d / tile) / 0.25)) * 0.25;
    const uTop = bays * 0.25;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, 0], [uwx, 0], [uwx, v], [0, v], color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, 0], [uwx, 0], [uwx, v], [0, v], color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0], [uwd, 0], [uwd, v], [0, v], color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0], [uwd, 0], [uwd, v], [0, v], color);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [0, 0], [uTop, 0], [uTop, 1], [0, 1], color);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], color);
  }

  /** A box in the box's own frame: centre, then size, then a yaw in radians. */
  part(cx, cy, cz, w, h, d, yaw, color, uv) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Rotate the eight corners, then rebuild the six faces: reuse `box` in a local frame.
    const local = new MeshBuilder();
    local.box(0, -h / 2, 0, w, h, d, color, uv);
    for (let i = 0; i < local.pos.length; i += 3) {
      const x = local.pos[i];
      const z = local.pos[i + 2];
      this.pos.push(cx + x * c - z * s, cy + local.pos[i + 1], cz + x * s + z * c);
      const nx = local.norm[i];
      const nz = local.norm[i + 2];
      this.norm.push(nx * c - nz * s, local.norm[i + 1], nx * s + nz * c);
    }
    this.uv.push(...local.uv);
    this.col.push(...local.col);
  }

  /** A flat quad lying on the ground, wound so its face looks up. */
  plate(cx, y, cz, w, d, angle, color) {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const hx = w / 2;
    const hz = d / 2;
    const p = (px, pz) => [cx + px * c - pz * s, y, cz + px * s + pz * c];
    this.quad(p(-hx, -hz), p(-hx, hz), p(hx, hz), p(hx, -hz), [0, 1, 0], [0, 0], [0, 1], [1, 1], [1, 0], color);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }

  get empty() {
    return this.pos.length === 0;
  }
}
