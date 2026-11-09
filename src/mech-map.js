// MECH dept: where everything stands. World metres, the cannon's firing frame derived from the shared map.
import * as THREE from 'three';
import { ORRERY } from './layout.js';

export const PAD_Y = 640;
export const AXIS_H = 20;                                // barrel axis height above the pad at the breech
export const BREECH = new THREE.Vector3(-3200, PAD_Y + AXIS_H, 2100);
export const AIM = new THREE.Vector3(ORRERY.center[0], ORRERY.center[1], ORRERY.center[2]).sub(BREECH).normalize();
export const BARREL = 180;
export const MUZZLE = BREECH.clone().addScaledVector(AIM, BARREL);
// local firing frame: +Z along the barrel, +Y up, +X to its left (the -X side faces the moon)
export const AXIS = {
  z: AIM.clone(),
  x: new THREE.Vector3(0, 1, 0).cross(AIM).normalize(),
  y: AIM.clone().cross(new THREE.Vector3(0, 1, 0).cross(AIM).normalize()).normalize(),
};
export const FRAME = new THREE.Matrix4().makeBasis(AXIS.x, AXIS.y, AXIS.z).setPosition(BREECH);
export const FRAME_Q = new THREE.Quaternion().setFromRotationMatrix(FRAME);
export const fromFrame = (x, y, z, out = new THREE.Vector3()) => out.set(x, y, z).applyMatrix4(FRAME);
export const fr = (x, y, z) => fromFrame(x, y, z).toArray();

// flat level frame for the machines that stand on the ridge: yaw only, faces along the aim in plan
export const YAW = Math.atan2(AIM.x, AIM.z);
export const levelQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
const PX = new THREE.Vector3(1, 0, 0).applyQuaternion(levelQ), PZ = new THREE.Vector3(0, 0, 1).applyQuaternion(levelQ);
// plan position of a point given in frame terms (x across, z along), at height y
export function plan(x, z, y = PAD_Y, out = new THREE.Vector3()) {
  return out.set(BREECH.x, y, BREECH.z).addScaledVector(PX, x).addScaledVector(PZ, z);
}
export const PLAN = { x: PX, z: PZ };

export const HERON_AT = { x: -17.5, z: -24 };                    // pelvis-ish plan position, frame terms
export const TORTOISE_WAIT = { x: 40, z: 198 };                // parked to the side of the muzzle, behind cover of the trestle
export const TORTOISE_STANCE = { x: 24, z: 238 };              // plants here, on the beam line with the shield overlapping the barrel axis
export const SHOVE = 30;                                       // metres the beam drives it back toward the muzzle
// the beam hits the raised shield here (inside s20); FX should start the coral impact at this time
export const SLAM_T = 45.72;
