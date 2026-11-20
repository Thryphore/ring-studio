import * as THREE from "three";

// A fine, continuous metal texture works on the shank, prongs, and galleries
// without UV seams. Pixel-footprint filtering keeps distant grain stable.
const frostNoise = /* glsl */ `
  varying vec3 vFrostPosition;
  float softFrostHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float softFrostNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(softFrostHash(cell), softFrostHash(cell + vec3(1,0,0)), f.x),
          mix(softFrostHash(cell + vec3(0,1,0)), softFrostHash(cell + vec3(1,1,0)), f.x), f.y),
      mix(mix(softFrostHash(cell + vec3(0,0,1)), softFrostHash(cell + vec3(1,0,1)), f.x),
          mix(softFrostHash(cell + vec3(0,1,1)), softFrostHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

export function createMetalMaterial(color, finish) {
  const yellow = /Yellow/.test(finish);
  const rose = /Rose/.test(finish);
  // Calibrate the reflected alloy color in linear space. The previous very
  // low blue reflectance made yellow gold read as brass under the bright
  // studio. A warmer, less saturated response leaves creamy highlights over
  // amber midtones without changing the diamond's existing mount tint.
  const goldReflectance = {
    "14k Yellow": [1.0, 0.63, 0.24],
    "18k Yellow": [1.0, 0.56, 0.17],
  }[finish];
  const material = new THREE.MeshPhysicalMaterial({
    color: goldReflectance
      ? new THREE.Color().setRGB(...goldReflectance)
      : color,
    metalness: 1,
    roughness: yellow ? 0.068 : rose ? 0.088 : 0.095,
    envMapIntensity: yellow ? 1.1 : rose ? 1.38 : 1.12,
    clearcoat: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vFrostPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFrostPosition = (modelMatrix * vec4(position, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${frostNoise}`)
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        #include <roughnessmap_fragment>
        vec3 frostCoordinate = vFrostPosition * 240.0;
        float frostFootprint = max(length(dFdx(frostCoordinate)), length(dFdy(frostCoordinate)));
        float frostVisibility = 1.0 - smoothstep(0.55, 1.5, frostFootprint);
        float frostGrain = mix(0.5, softFrostNoise(frostCoordinate), frostVisibility);
        roughnessFactor *= mix(0.90, 1.10, frostGrain);
      `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        float frostHeight = (frostGrain - 0.5) * 0.00004;
        vec3 frostDx = dFdx(-vViewPosition);
        vec3 frostDy = dFdy(-vViewPosition);
        vec3 frostR1 = cross(frostDy, normal);
        vec3 frostR2 = cross(normal, frostDx);
        float frostDet = dot(frostDx, frostR1) * faceDirection;
        if (abs(frostDet) > 1e-12) {
          vec3 frostGradient = sign(frostDet) * (dFdx(frostHeight) * frostR1 + dFdy(frostHeight) * frostR2);
          normal = normalize(abs(frostDet) * normal - frostGradient);
        }
      `,
      );
  };
  material.customProgramCacheKey = () => "studio-soft-frost-v2";
  return material;
}
