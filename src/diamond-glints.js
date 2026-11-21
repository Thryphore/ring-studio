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
    strengths = [],
    angles = [];
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
    const frac = seed - Math.floor(seed);
    strengths.push(0.68 + frac * 0.32);
    angles.push(frac * Math.PI * 0.5);
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
  geometry.setAttribute("aAngle", new THREE.Float32BufferAttribute(angles, 1));
  const material = new THREE.ShaderMaterial({
    name: "Diamond edge glints",
    uniforms: {
      uViewportHeight: { value: 600 },
      uHdrGain: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec3 aFacetNormal0;
      attribute vec3 aFacetNormal1;
      attribute vec3 aFacetNormal2;
      attribute float aStrength;
      attribute float aAngle;
      uniform float uViewportHeight;
      varying float vGlint;
      varying float vAngle;
      float facetFlash(vec3 facet, vec3 view) {
        vec3 normal = normalize(mat3(modelMatrix) * facet);
        vec3 reflected = reflect(-view, normal);
        float key = pow(max(dot(reflected, normalize(vec3(-3.5, 8.0, 4.5))), 0.0), 95.0);
        float rim = pow(max(dot(reflected, normalize(vec3(2.5, 3.0, -4.0))), 0.0), 115.0) * 0.90;
        float fill = pow(max(dot(reflected, normalize(vec3(4.0, 1.4, 2.0))), 0.0), 105.0) * 0.65;
        float strip = pow(max(dot(reflected, normalize(vec3(-1.0, 1.5, 4.0))), 0.0), 125.0) * 0.82;
        float crown = pow(max(dot(reflected, normalize(vec3(2.2, 6.0, 2.0))), 0.0), 115.0) * 0.78;
        float peak = max(max(max(key, rim), max(fill, strip)), crown);
        return peak * smoothstep(0.06, 0.42, dot(normal, view));
      }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 view = normalize(cameraPosition - world.xyz);
        vGlint = max(facetFlash(aFacetNormal0, view), max(facetFlash(aFacetNormal1, view), facetFlash(aFacetNormal2, view))) * aStrength;
        vAngle = aAngle;
        vec4 mv = viewMatrix * world;
        float scale = length(modelMatrix[0].xyz);
        gl_PointSize = clamp(scale * 0.125 * projectionMatrix[1][1] * uViewportHeight / max(0.1, -mv.z), 1.0, 136.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHdrGain;
      varying float vGlint;
      varying float vAngle;
      float starRay(vec2 q, float width, float lengthPower) {
        return exp(-abs(q.y) * width) * pow(max(1.0 - abs(q.x), 0.0), lengthPower);
      }
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float c = cos(vAngle), s = sin(vAngle);
        vec2 r0 = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        // Subtle 6-point photographic aperture starburst with rotated arms.
        vec2 r1 = vec2(0.5 * r0.x - 0.8660254 * r0.y, 0.8660254 * r0.x + 0.5 * r0.y);
        vec2 r2 = vec2(0.5 * r0.x + 0.8660254 * r0.y, -0.8660254 * r0.x + 0.5 * r0.y);
        float dist = length(p);
        float core = exp(-dot(p, p) * 34.0);
        float halo = exp(-dot(p, p) * 8.5) * 0.20;
        float rays =
          starRay(r0, 44.0, 2.6) * 0.42 +
          starRay(r1, 52.0, 3.0) * 0.24 +
          starRay(r2, 52.0, 3.0) * 0.24;
        float intensity = (core * 0.98 + halo + rays) * vGlint;
        if (intensity < 0.008) discard;
        // Delicate warm-core to cool-tip lens tint along the fine rays.
        vec3 tint = mix(vec3(1.0, 0.99, 0.96), vec3(0.92, 0.96, 1.0), smoothstep(0.12, 0.65, dist));
        float alpha = clamp(intensity, 0.0, 1.0);
        gl_FragColor = vec4(tint * intensity * uHdrGain, alpha);
      }
    `,
  });
  return { geometry, material };
}
