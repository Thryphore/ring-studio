import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { studioRadianceGLSL } from "./studio-lighting.js";
import { cutProfiles } from "./gem-proportions.js";

export function diamondOutline(shape, angle) {
  let x = Math.cos(angle);
  let z = Math.sin(angle);
  if (shape === "Oval") {
    x *= 0.78;
    z *= 1.12;
  } else if (shape === "Cushion") {
    x = Math.sign(x) * Math.pow(Math.abs(x), 0.6) * 0.89;
    z = Math.sign(z) * Math.pow(Math.abs(z), 0.6) * 0.98;
  } else if (["Emerald", "Asscher", "Radiant", "Princess"].includes(shape)) {
    const halfX = shape === "Asscher" || shape === "Princess" ? 0.94 : 0.85;
    const halfZ = cutProfiles[shape].halfLength;
    const chamfer = shape === "Princess" ? 0 : shape === "Asscher" ? 0.26 : 0.2;
    const radius = Math.min(
      halfX / Math.max(Math.abs(x), 1e-8),
      halfZ / Math.max(Math.abs(z), 1e-8),
      (halfX + halfZ - chamfer) / Math.max(Math.abs(x) + Math.abs(z), 1e-8),
    );
    x *= radius;
    z *= radius;
  } else if (shape === "Marquise") {
    x = Math.sign(x) * Math.pow(Math.abs(x), 2) * 0.68;
    z *= 1.3;
  } else if (shape === "Pear") {
    // A rounded belly narrows continuously to a single pointed tip.
    x *= 0.82 * (0.86 - 0.25 * z);
    z *= z > 0 ? 1.25 : 0.95;
  }
  return [x, z];
}

function cutGeometry(shape) {
  const points = [];
  const profile = cutProfiles[shape] || cutProfiles.Round;
  const stepCut = profile.step;
  const hx = profile.halfWidth,
    hz = profile.halfLength;
  const chamfer = shape === "Asscher" ? 0.26 : 0.2;
  const corners = [
    [hx - chamfer, hz],
    [-hx + chamfer, hz],
    [-hx, hz - chamfer],
    [-hx, -hz + chamfer],
    [-hx + chamfer, -hz],
    [hx - chamfer, -hz],
    [hx, -hz + chamfer],
    [hx, hz - chamfer],
  ];
  const ring = (radius, height, count, offset = 0) => {
    for (let i = 0; i < count; i++) {
      const [x, z] = stepCut
        ? corners[i]
        : diamondOutline(shape, ((i + offset) / count) * Math.PI * 2);
      points.push(
        new THREE.Vector3(x * radius, height * profile.depth, z * radius),
      );
    }
  };

  if (stepCut) {
    // Broad, planar steps give an emerald cut its hall-of-mirrors reflections.
    ring(0.54, 0.28, 8);
    ring(0.82, 0.15, 8);
    ring(1, 0, 8);
    ring(0.997, -0.035, 8);
    ring(0.82, -0.2, 8);
    ring(0.55, -0.45, 8);
    ring(0.26, -0.68, 8);
    ring(0.025, -0.83, 8);
  } else {
    // Coplanar bezel and pavilion kites meet star and half facets. A deeper
    // pavilion and a 54% table give the round benchmark a brilliant profile.
    const table = 0.54,
      crown = 0.32,
      pavilion = 0.9;
    const star = 0.78,
      lower = 0.8,
      cosine = Math.cos(Math.PI / 8);
    ring(table, crown, 8);
    ring(star, ((1 - star * cosine) * crown) / (1 - table), 8, 0.5);
    ring(1, 0, 16);
    ring(0.997, -0.035, 16);
    ring(lower, -pavilion + (pavilion - 0.035) * lower * cosine, 8, 0.5);
    points.push(new THREE.Vector3(0, -pavilion * profile.depth, 0));
  }

  // The closed convex hull is also the exact volume used for optical rays.
  const geometry = new ConvexGeometry(points);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const planes = [];
  for (let i = 0; i < positions.count; i += 3) {
    const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
    const position = new THREE.Vector3().fromBufferAttribute(positions, i);
    const distance = -normal.dot(position);
    if (
      !planes.some(
        (p) =>
          p.x * normal.x + p.y * normal.y + p.z * normal.z > 0.99999 &&
          Math.abs(p.w - distance) < 0.0001,
      )
    ) {
      planes.push(new THREE.Vector4(normal.x, normal.y, normal.z, distance));
    }
  }
  return { geometry, planes };
}

const vertexShader = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vCamera;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vAxisZ;

  void main() {
    vPosition = position;
    vNormal = normal;
    vec3 cameraDelta = cameraPosition - modelMatrix[3].xyz;
    float scaleSquared = dot(modelMatrix[0].xyz, modelMatrix[0].xyz);
    vCamera = vec3(
      dot(cameraDelta, modelMatrix[0].xyz),
      dot(cameraDelta, modelMatrix[1].xyz),
      dot(cameraDelta, modelMatrix[2].xyz)
    ) / scaleSquared;
    vAxisX = normalize(modelMatrix[0].xyz);
    vAxisY = normalize(modelMatrix[1].xyz);
    vAxisZ = normalize(modelMatrix[2].xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec4 uPlanes[PLANE_COUNT];
  uniform vec3 uMetalTint;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vCamera;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vAxisZ;

  vec3 toWorld(vec3 direction) {
    return normalize(vAxisX * direction.x + vAxisY * direction.y + vAxisZ * direction.z);
  }

  ${studioRadianceGLSL}

  vec3 studio(vec3 localDirection) {
    vec3 d = toWorld(localDirection);
    vec3 light = studioRadiance(d);
    float mountReflection = (1.0 - smoothstep(-0.85, -0.15, d.y)) * 0.06;
    return mix(light, uMetalTint * 0.8, mountReflection);
  }

  float fresnel(float cosine, float incidentIor, float transmittedIor) {
    float cosIncident = clamp(cosine, 0.0, 1.0);
    float eta = incidentIor / transmittedIor;
    float sinTransmittedSquared = eta * eta * (1.0 - cosIncident * cosIncident);
    if (sinTransmittedSquared >= 1.0) return 1.0;
    float cosTransmitted = sqrt(max(0.0, 1.0 - sinTransmittedSquared));
    float s = (incidentIor * cosIncident - transmittedIor * cosTransmitted)
      / max(0.00001, incidentIor * cosIncident + transmittedIor * cosTransmitted);
    float p = (transmittedIor * cosIncident - incidentIor * cosTransmitted)
      / max(0.00001, transmittedIor * cosIncident + incidentIor * cosTransmitted);
    return 0.5 * (s * s + p * p);
  }

  bool nextFacet(vec3 origin, vec3 ray, out vec3 hit, out vec3 hitNormal, out float distance) {
    distance = 10000.0;
    hitNormal = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < PLANE_COUNT; i++) {
      vec4 plane = uPlanes[i];
      float denominator = dot(plane.xyz, ray);
      if (denominator > 0.00001) {
        float t = -(dot(plane.xyz, origin) + plane.w) / denominator;
        if (t > 0.0001 && t < distance) {
          distance = t;
          hitNormal = plane.xyz;
        }
      }
    }
    hit = origin + ray * distance;
    return distance < 9999.0;
  }

  vec3 traceDiamond(vec3 incoming, vec3 surfaceNormal, float ior) {
    float reflection = fresnel(dot(-incoming, surfaceNormal), 1.0, ior);
    vec3 result = studio(reflect(incoming, surfaceNormal)) * reflection;
    vec3 ray = refract(incoming, surfaceNormal, 1.0 / ior);
    vec3 origin = vPosition + ray * 0.0006;
    vec3 throughput = vec3(1.0 - reflection);

    for (int bounce = 0; bounce < 8; bounce++) {
      vec3 hit, outwardNormal;
      float distance;
      if (!nextFacet(origin, ray, hit, outwardNormal, distance)) break;
      throughput *= exp(-vec3(0.012, 0.005, 0.002) * distance);
      vec3 exitRay = refract(ray, -outwardNormal, ior);
      if (dot(exitRay, exitRay) > 0.001) {
        // Glass-to-air reflections rise rapidly near the critical angle.
        // Evaluate that interface explicitly to retain bright mirror facets.
        float reflected = fresnel(dot(ray, outwardNormal), ior, 1.0);
        result += throughput * (1.0 - reflected) * studio(exitRay);
        throughput *= reflected;
      }
      // A zero refraction vector is total internal reflection. Keep tracing
      // inside the pavilion rather than returning a painted or black facet.
      ray = reflect(ray, outwardNormal);
      origin = hit + ray * 0.0006;
      if (max(max(throughput.r, throughput.g), throughput.b) < 0.012) break;
    }
    // Residual rays are still inside the stone. Sampling the studio here
    // leaks light through totally reflecting facets and washes out the cut.
    // Only rays that actually cross a diamond-to-air interface collect light.
    return result;
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 incoming = normalize(vPosition - vCamera);
    // Trace wavelengths separately: the diamond's high refractive index splits
    // crisp reflections into restrained red/blue fire at facet boundaries.
    vec3 red = traceDiamond(incoming, normal, 2.397);
    vec3 green = traceDiamond(incoming, normal, 2.417);
    vec3 blue = traceDiamond(incoming, normal, 2.447);
    vec3 radiance = vec3(red.r, green.g, blue.b);
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createDiamondCut(shape, metalColor) {
  const { geometry, planes } = cutGeometry(shape);
  const material = new THREE.ShaderMaterial({
    name: `Diamond ${shape} — internal refraction`,
    defines: { PLANE_COUNT: planes.length },
    uniforms: {
      uPlanes: { value: planes },
      uMetalTint: { value: new THREE.Color(metalColor) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    toneMapped: true,
  });
  return { geometry, material };
}
