// MECH dept: two-bone IK on rigid joint groups, and world-orientation helpers. Limbs are modelled along -Y from each joint.
import * as THREE from 'three';

const _s = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _pole = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _P = new THREE.Quaternion();

// Rotate `joint` so its world orientation equals q (parents must be up to date).
export function setWorldQ(joint, q) {
  joint.parent.updateWorldMatrix(true, false);
  joint.parent.getWorldQuaternion(_P).invert();
  joint.quaternion.copy(_P).multiply(q);
  joint.updateMatrixWorld(true);
}

// Set world orientation from axes y (limb up) and a reference z.
function basisQ(y, refZ, out) {
  _y.copy(y).normalize();
  _z.copy(refZ).addScaledVector(_y, -_y.dot(refZ)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _M.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_M);
}

// Two-bone solve. upper/lower are joints, L1/L2 bone lengths, target world point of the end joint,
// pole: world point the knee/elbow bends toward. Returns the elbow/knee world position.
export function solveLimb(upper, lower, L1, L2, target, pole) {
  upper.parent.updateWorldMatrix(true, false);
  upper.getWorldPosition(_s);
  _d.copy(target).sub(_s);
  const reach = Math.min(L1 + L2 - 0.02, Math.max(Math.abs(L1 - L2) + 0.02, _d.length()));
  const dir = _d.clone().normalize();
  const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _pole.copy(pole).sub(_s);
  _pole.addScaledVector(dir, -_pole.dot(dir)).normalize();
  _m.copy(_s).addScaledVector(dir, a).addScaledVector(_pole, h);
  // upper
  basisQ(_y.copy(_s).sub(_m), _pole, _Q);
  setWorldQ(upper, _Q);
  // lower: same reference so the hinge axis stays put; its joint sits at (0,-L1,0) of the upper
  basisQ(_y.copy(_m).sub(_x.copy(_s).addScaledVector(dir, reach)), _pole, _Q);
  setWorldQ(lower, _Q);
  return _m.clone();
}
