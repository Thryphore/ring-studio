import * as THREE from "three";

// One asymmetric studio layout is shared by metal reflections and diamond rays.
// Restrained broad panels retain facet detail and metal color. Narrow strips
// carry the bright highlights, instead of washing whole surfaces out to white.
export const studioRadianceGLSL = /* glsl */ `
  float lightPanel(vec3 direction, vec3 center, vec2 halfSize, float softness) {
    vec3 forward = normalize(center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    float facing = dot(direction, forward);
    vec2 uv = vec2(dot(direction, right), dot(direction, up)) / max(facing, 0.001);
    vec2 edge = 1.0 - smoothstep(halfSize - softness, halfSize + softness, abs(uv));
    return edge.x * edge.y * step(0.0, facing);
  }

  float graduatedPanel(vec3 direction, vec3 center, vec2 halfSize, float softness) {
    vec3 forward = normalize(center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    float facing = dot(direction, forward);
    float across = abs(dot(direction, right) / max(facing, 0.001)) / halfSize.x;
    float gradient = 0.48 + 0.52 * (1.0 - smoothstep(0.0, 1.0, across));
    return lightPanel(direction, center, halfSize, softness) * gradient;
  }

  vec3 studioRadiance(vec3 direction, float noir) {
    vec3 d = normalize(direction);
    float ceiling = smoothstep(-0.65, 0.90, d.y);
    #ifdef METAL_STUDIO
      vec3 studioAmbient = mix(vec3(0.17, 0.18, 0.20), vec3(0.58, 0.62, 0.67), ceiling) * 0.86;
      vec3 noirAmbient = mix(vec3(0.055, 0.068, 0.062), vec3(0.24, 0.27, 0.29), ceiling);
      vec3 light = mix(studioAmbient, noirAmbient, noir);
    #else
      // Diamonds need deep dark contrast zones between bright light panels
      // (including natural overhead camera/viewer obstruction) so pavilion
      // arrows and individual facets read crisp instead of milky pale gray.
      vec3 studioAmbient = mix(vec3(0.09, 0.10, 0.12), vec3(0.32, 0.35, 0.39), ceiling);
      vec3 noirAmbient = mix(vec3(0.035, 0.042, 0.046), vec3(0.16, 0.18, 0.20), ceiling);
      vec3 light = mix(studioAmbient, noirAmbient, noir);
      // Camera lens / viewer head obstruction overhead creates real diamond
      // contrast (such as the dark pavilion arrow pattern in top-down views).
      float lensObstruction = smoothstep(0.86, 0.985, d.y);
      light *= 1.0 - lensObstruction * mix(0.54, 0.64, noir);
    #endif
    float panelGain = mix(1.0, 1.12, noir);
    // The main softbox is high and to the left, with a quieter right fill.
    light += vec3(2.3, 2.20, 1.95) * panelGain * graduatedPanel(d, vec3(-3.5, 8.0, 4.5), vec2(0.30, 0.52), 0.05);
    light += vec3(1.45, 1.50, 1.55) * panelGain * graduatedPanel(d, vec3(4.0, 1.4, 2.0), vec2(0.22, 0.68), 0.04);
    light += vec3(2.0, 1.85, 1.55) * panelGain * lightPanel(d, vec3(-1.0, 1.5, 4.0), vec2(0.025, 0.55), 0.014);
    light += vec3(1.4, 1.32, 1.16) * mix(1.0, 0.72, noir) * graduatedPanel(d, vec3(-2.5, -2.0, 4.5), vec2(0.30, 0.38), 0.08);
    light += vec3(3.8, 3.85, 4.0) * mix(1.0, 1.22, noir) * lightPanel(d, vec3(2.5, 3.0, -4.0), vec2(0.035, 0.58), 0.018);
    light += vec3(1.15, 1.20, 1.25) * panelGain * lightPanel(d, vec3(-1.0, 1.4, -2.8), vec2(0.46, 0.10), 0.035);
    // A tall side strip stays recognizable in the curved band and the gem's
    // internal reflections, including as the back of the ring turns into view.
    light += vec3(1.9, 2.0, 2.15) * mix(1.0, 1.18, noir) * graduatedPanel(d, vec3(-4.5, 2.0, -2.2), vec2(0.080, 0.70), 0.018);
    // Deeper reflection cards define the curved metal and individual facets.
    float negativeFill = lightPanel(d, vec3(-4.0, 0.0, -0.5), vec2(0.16, 0.72), 0.055);
    light *= 1.0 - negativeFill * mix(0.62, 0.76, noir);
    float frontCard = lightPanel(d, vec3(0.6, 0.15, 4.5), vec2(0.15, 0.46), 0.04);
    light *= 1.0 - frontCard * mix(0.62, 0.76, noir);
    // Shape the low reflections without raising the controlled light panels.
    float luminance = dot(light, vec3(0.2126, 0.7152, 0.0722));
    float shadowWeight = 1.0 - smoothstep(0.0, 0.85, luminance);
    light *= 1.0 - mix(0.32, 0.44, noir) * shadowWeight;
    #ifdef METAL_STUDIO
      // Broad silk panels illuminate the inside and underside of the shank.
      // Their falloff supplies curved gradients between the narrow strips,
      // instead of a large, uniformly gold reflection of an empty floor.
      float silkFill = mix(1.0, 0.62, noir);
      light += vec3(0.75, 0.72, 0.65) * silkFill * graduatedPanel(d, vec3(0.4, -4.0, 1.1), vec2(0.75, 0.48), 0.20);
      light += vec3(0.80, 0.76, 0.68) * silkFill * graduatedPanel(d, vec3(-5.0, 1.0, 2.0), vec2(0.38, 0.90), 0.22);
      // Alternating dark cards and bright silk strips give a polished surface
      // recognizable reflected shapes instead of an evenly lit gold fill.
      float frontFlag = lightPanel(d, vec3(3.2, 0.4, 4.0), vec2(0.065, 0.72), 0.015);
      float backFlag = lightPanel(d, vec3(-3.5, 0.6, -3.8), vec2(0.10, 0.80), 0.025);
      light *= 1.0 - max(frontFlag * 0.60, backFlag * 0.52);
      light += vec3(3.3, 3.15, 2.8) * mix(1.0, 1.18, noir) * graduatedPanel(d, vec3(4.1, 0.5, 3.1), vec2(0.045, 0.68), 0.012);
      // Reflection-only strip cards make the polished metal read as glossy.
      // Diamond rays retain the calibrated, restrained studio highlights.
      light += vec3(3.8, 3.4, 2.4) * mix(1.0, 1.08, noir) * graduatedPanel(d, vec3(2.8, -4.5, 3.4), vec2(0.090, 0.76), 0.025);
      light += vec3(2.8, 2.45, 1.65) * lightPanel(d, vec3(-2.5, -2.0, 4.5), vec2(0.025, 0.42), 0.009);
    #endif
    #ifndef METAL_STUDIO
      // Crisp ring of upper-hemisphere jewelry lamps produces high-contrast
      // scintillation and spectral fire across crown and pavilion facets.
      light += vec3(2.6, 2.65, 2.8) * lightPanel(d, vec3(2.8, 5.2, 2.6), vec2(0.16, 0.24), 0.025);
      light += vec3(2.2, 2.15, 2.0) * lightPanel(d, vec3(-3.8, 4.6, -2.8), vec2(0.14, 0.22), 0.025);
      light += vec3(2.0, 2.08, 2.2) * lightPanel(d, vec3(0.4, 5.0, -3.6), vec2(0.18, 0.16), 0.025);
      // Keep the deepest dark-crystal facets rich slate instead of flat ink-black.
      light = max(light, mix(vec3(0.055, 0.062, 0.075), vec3(0.024, 0.028, 0.034), noir));
      // Small bright sources produce brief internal facet flashes as the
      // diamond moves, without lifting its broad reflections to white.
      light += vec3(6.2, 6.0, 5.5) * pow(max(dot(d, normalize(vec3(-3.5, 8.0, 4.5))), 0.0), 1100.0);
      light += vec3(4.2, 4.6, 5.6) * pow(max(dot(d, normalize(vec3(4.0, 1.4, 2.0))), 0.0), 1300.0);
      light += vec3(5.4, 5.5, 6.2) * pow(max(dot(d, normalize(vec3(2.5, 3.0, -4.0))), 0.0), 1000.0);
      light += vec3(4.8, 4.7, 4.4) * pow(max(dot(d, normalize(vec3(2.2, 6.0, 2.0))), 0.0), 1200.0);
    #endif
    float glint = pow(max(dot(d, normalize(vec3(-3.0, 5.0, 4.0))), 0.0), 1600.0);
    return light + vec3(8.5, 8.1, 7.3) * glint;
  }

  vec3 studioRadiance(vec3 direction) {
    return studioRadiance(direction, 0.0);
  }
`;

export function createStudioEnvironment(
  renderer,
  { resolution = 512, noir = false } = {},
) {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  const material = new THREE.ShaderMaterial({
    defines: { METAL_STUDIO: 1 },
    uniforms: { uNoir: { value: noir ? 1.0 : 0.0 } },
    side: THREE.BackSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNoir;
      varying vec3 vDirection;
      ${studioRadianceGLSL}
      void main() { gl_FragColor = vec4(studioRadiance(vDirection, uNoir), 1.0); }
    `,
  });
  scene.add(new THREE.Mesh(geometry, material));
  const source = new THREE.WebGLCubeRenderTarget(resolution, {
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
  });
  const camera = new THREE.CubeCamera(0.1, 20, source);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment;
  try {
    camera.update(renderer, scene);
    environment = pmrem.fromCubemap(source.texture);
  } finally {
    pmrem.dispose();
    source.dispose();
    geometry.dispose();
    material.dispose();
  }
  return environment;
}
