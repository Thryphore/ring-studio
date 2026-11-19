import * as THREE from "three";

// Small photographic flares are tied to crown edges and the fixed studio
// lights. They appear at reflection angles, rather than blinking on a timer.
export function createDiamondGlints(cutGeometry) {
  const positions = cutGeometry.getAttribute("position");
  const normals = cutGeometry.getAttribute("normal");
  const edges = new Map();
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i);
    const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
    if (point.y < -0.002 || normal.y < 0.08 || normal.y > 0.995) continue;
    const key = point
      .toArray()
      .map((x) => x.toFixed(4))
      .join(",");
    if (!edges.has(key)) edges.set(key, { point, normals: [] });
    const facets = edges.get(key).normals;
    if (!facets.some((facet) => facet.dot(normal) > 0.999)) facets.push(normal);
  }
  const vertices = [],
    directions = [[], [], []],
    strengths = [];
  for (const edge of edges.values()) {
    const normal = edge.normals
      .reduce((sum, facet) => sum.add(facet), new THREE.Vector3())
      .normalize();
    edge.point.addScaledVector(normal, 0.006);
    vertices.push(...edge.point.toArray());
    // Averaging adjacent normals loses the actual reflection angles. Retain
    // three distinct facets at each junction, including the crown's star edges.
    for (let i = 0; i < 3; i++)
      directions[i].push(
        ...edge.normals[Math.min(i, edge.normals.length - 1)].toArray(),
      );
    const seed =
      Math.sin(
        edge.point.x * 127.1 + edge.point.z * 311.7 + edge.point.y * 74.7,
      ) * 43758.5453;
    strengths.push(0.65 + (seed - Math.floor(seed)) * 0.35);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  directions.forEach((values, i) =>
    geometry.setAttribute(
      `aFacetNormal${i}`,
      new THREE.Float32BufferAttribute(values, 3),
    ),
  );
  geometry.setAttribute(
    "aStrength",
    new THREE.Float32BufferAttribute(strengths, 1),
  );
  const material = new THREE.ShaderMaterial({
    name: "Diamond edge glints",
    uniforms: { uViewportHeight: { value: 600 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec3 aFacetNormal0;
      attribute vec3 aFacetNormal1;
      attribute vec3 aFacetNormal2;
      attribute float aStrength;
      uniform float uViewportHeight;
      varying float vGlint;
      float facetFlash(vec3 facet, vec3 view) {
        vec3 normal = normalize(mat3(modelMatrix) * facet);
        vec3 reflected = reflect(-view, normal);
        float key = pow(max(dot(reflected, normalize(vec3(-3.5, 8.0, 4.5))), 0.0), 90.0);
        float rim = pow(max(dot(reflected, normalize(vec3(2.5, 3.0, -4.0))), 0.0), 110.0) * 0.90;
        float fill = pow(max(dot(reflected, normalize(vec3(4.0, 1.4, 2.0))), 0.0), 100.0) * 0.65;
        float strip = pow(max(dot(reflected, normalize(vec3(-1.0, 1.5, 4.0))), 0.0), 120.0) * 0.80;
        return max(max(key, rim), max(fill, strip)) * smoothstep(0.06, 0.42, dot(normal, view));
      }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 view = normalize(cameraPosition - world.xyz);
        vGlint = max(facetFlash(aFacetNormal0, view), max(facetFlash(aFacetNormal1, view), facetFlash(aFacetNormal2, view))) * aStrength;
        vec4 mv = viewMatrix * world;
        float scale = length(modelMatrix[0].xyz);
        gl_PointSize = clamp(scale * 0.105 * projectionMatrix[1][1] * uViewportHeight / max(0.1, -mv.z), 1.0, 120.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vGlint;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float core = exp(-dot(p, p) * 32.0);
        float rays = exp(-abs(p.y) * 38.0) * pow(max(1.0 - abs(p.x), 0.0), 3.0);
        rays += exp(-abs(p.x) * 38.0) * pow(max(1.0 - abs(p.y), 0.0), 3.0) * 0.7;
        float alpha = (core * 0.96 + rays * 0.32) * vGlint;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(1.0, 0.985, 0.95, alpha);
      }
    `,
  });
  return { geometry, material };
}
