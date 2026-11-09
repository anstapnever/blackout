import * as THREE from 'three';

// MECH dept: the scope view of s08. A full-screen brass reticle drawn over the long-lens picture in the overlay pass.
// Engraved brass ring, tick scale that turns as the operator dials in, four brackets that converge on the target.
export function buildScope(overlay) {
  const u = { uConv: { value: 0 }, uTurn: { value: 0 }, uFlash: { value: 0 } };
  const vs = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const fs = /* glsl */ `
    uniform float uConv, uTurn, uFlash;
    varying vec2 vUv;
    out vec4 oColor;
    const float R = 0.86;
    float box(vec2 p, vec2 b){ vec2 d = abs(p) - b; return max(d.x, d.y); }
    float hash(float x){ return fract(sin(x * 91.7) * 43758.5); }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(1920.0 / 1080.0, 1.0) * 2.0;
      float r = length(p), a = atan(p.y, p.x), px = 2.0 / 1080.0;
      vec3 col = vec3(0.0); float al = 0.0;
      // the housing: everything outside the glass is blackened brass
      if(r > R){
        float ring = (r - R) / (1.4 - R);
        vec3 brass = mix(vec3(0.24, 0.16, 0.08), vec3(0.05, 0.035, 0.03), smoothstep(0.0, 0.5, ring));
        float band = smoothstep(0.03, 0.022, abs(r - (R + 0.05))) + smoothstep(0.014, 0.008, abs(r - (R + 0.1)));
        brass = mix(brass, vec3(0.5, 0.37, 0.18), band);
        float kn = step(0.5, fract((a + 3.14159) / 6.28318 * 90.0)) * smoothstep(0.02, 0.016, abs(r - (R + 0.145)));
        brass = mix(brass, vec3(0.16, 0.11, 0.07), kn);
        float top = 0.5 + 0.5 * cos(a - 2.2);   // a hard painted gleam on the upper left of the rim
        brass += vec3(0.34, 0.23, 0.1) * smoothstep(0.78, 0.82, top) * smoothstep(0.06, 0.0, abs(r - (R + 0.03))) * 0.9;
        // bolts around the ring
        float na = floor((a + 3.14159) / 6.28318 * 12.0) + 0.5;
        float aa = na / 12.0 * 6.28318 - 3.14159;
        vec2 bp = vec2(cos(aa), sin(aa)) * (R + 0.21);
        float bd = length(p - bp);
        brass = mix(brass, vec3(0.5, 0.38, 0.2), smoothstep(0.024, 0.02, bd));
        brass = mix(brass, vec3(0.16, 0.11, 0.08), smoothstep(0.014, 0.01, bd));
        col = brass; al = 1.0;
      } else {
        // inner edge of the glass: dark falloff
        col = vec3(0.0); al = smoothstep(R - 0.14, R - 0.005, r) * 0.65;
        // etched scale ring
        float ang = (a + 3.14159) / 6.28318 + uTurn;
        float t72 = abs(fract(ang * 72.0) - 0.5) / 72.0 * 6.28318 * r;
        float t12 = abs(fract(ang * 12.0) - 0.5) / 12.0 * 6.28318 * r;
        vec3 ink = vec3(0.96, 0.78, 0.42);
        float inScale = smoothstep(0.0055, 0.0035, abs(r - (R - 0.055))) ;
        float tick = max(step(t72, 0.0035) * step(R - 0.11, r) * step(r, R - 0.07), step(t12, 0.006) * step(R - 0.16, r) * step(r, R - 0.05));
        float e = max(inScale, tick);
        // fine cross
        float cross_ = max(step(abs(p.y), 0.0012 + px * 0.3) * step(0.09, abs(p.x)), step(abs(p.x), 0.0012 + px * 0.3) * step(0.09, abs(p.y)));
        // range marks along the vertical
        float rm = 0.0;
        for(int i = 1; i <= 6; i++){ float y = float(i) * 0.1; rm = max(rm, step(abs(abs(p.y) - y), 0.0016) * step(abs(p.x), 0.024 + float(i) * 0.003)); }
        // inner circle
        float circ = smoothstep(0.0022, 0.0, abs(r - 0.15));
        // converging brackets: L shapes closing toward the core
        float gap = mix(0.72, 0.14, uConv);
        float bracket = 0.0;
        for(int i = 0; i < 4; i++){
          float ang2 = float(i) * 1.5708 + 0.7854;
          vec2 c = vec2(cos(ang2), sin(ang2)) * gap;
          vec2 q = p - c;
          // rotate so the L opens toward the centre
          q = mat2(cos(ang2 + 0.7854), -sin(ang2 + 0.7854), sin(ang2 + 0.7854), cos(ang2 + 0.7854)) * q;
          float h = max(step(abs(q.y), 0.004) * step(-0.06, q.x) * step(q.x, 0.0), step(abs(q.x), 0.004) * step(-0.06, q.y) * step(q.y, 0.0));
          bracket = max(bracket, h);
        }
        vec3 lock = uConv > 0.985 ? vec3(1.0, 0.36, 0.2) : vec3(1.0, 0.82, 0.42);
        float lines = max(max(max(e, cross_), rm), circ);
        col = mix(col, ink * 0.8, clamp(lines, 0.0, 1.0));
        al = max(al, lines * 0.92);
        col = mix(col, lock * 0.95, bracket);
        al = max(al, bracket);
        // faint amber on the glass and a dim reflection sweep
        col = mix(col, vec3(0.5, 0.3, 0.12), 0.0);
      }
      col += uFlash * vec3(0.9, 0.8, 0.5);
      oColor = vec4(col, al);
    }
  `;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 100;
  overlay.add(mesh);
  return { mesh, u };
}
