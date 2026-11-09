// BLACKOUT — multi-scale surface detail in one GLSL chunk (lead). Include AFTER COMMON from glsl.js (needs vnoise3, fbm3).
// surfaceDetail(world position, distance to camera, kind) -> vec3(albedo multiplier, crack mask 0..1, chip mask 0..1).
// kind 0 stone/rock, 1 stucco/plaster, 2 metal. Fine layers fade with distance so far objects stay solid, never speckled.
export const DETAIL_GLSL = /* glsl */ `
float _voroEdge(vec3 p){
  vec3 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int z = -1; z <= 1; z++) for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = fract(sin(vec3(dot(g + o, vec3(127.1, 311.7, 74.7)), dot(g + o, vec3(269.5, 183.3, 246.1)), dot(g + o, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    float d = length(o + h - f);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
vec3 surfaceDetail(vec3 p, float dist, float kind){
  float near = 1.0 - smoothstep(20.0, 120.0, dist);
  float mid = 1.0 - smoothstep(120.0, 700.0, dist);
  float macro = fbm3(p * 0.035 + 4.0);
  float streak = fbm3(vec3(p.x * 0.12, p.y * 0.012, p.z * 0.12) + 9.0);
  float m = 1.0 + (macro - 0.5) * 0.22 + (streak - 0.5) * 0.18;
  float cs = kind < 0.5 ? 0.22 : (kind < 1.5 ? 0.4 : 0.9);
  float crack = (1.0 - smoothstep(0.0, 0.05, _voroEdge(p * cs + fbm3(p * 0.3) * 0.35))) * mid;
  float chipN = fbm3(p * 1.7 + 2.0) + 0.3 * vnoise3(p * 9.0);
  float chip = smoothstep(0.86, 0.9, chipN) * near;
  float grain = (vnoise3(p * 32.0) - 0.5) * 0.14 * near + (vnoise3(p * 7.0) - 0.5) * 0.1 * mid;
  m += grain - crack * 0.26 - chip * 0.16;
  return vec3(m, crack, chip);
}
`;
