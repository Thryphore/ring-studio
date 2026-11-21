import * as THREE from "three";

// Transparent-safe HDR jewelry post-processing:
// 1. 4x MSAA linear HDR scene render (preserves clean alpha over Studio/Noir).
// 2. Depth + view-normal + material-mask G-buffer (gems cast contact occlusion
//    onto surrounding metal while staying sparkling bright themselves).
// 3. Horizon-based crevice AO with bilateral depth/mask blur and multi-bounce
//    colored metallic darkening (deep warm amber in gold crevices, not gray).
// 4. Tight 4-mip HDR optical bloom on diamond glints and peak highlights,
//    composited with valid premultiplied alpha for both live view and PNGs.

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createGbufferMaterial(maskValue) {
  return new THREE.ShaderMaterial({
    name: `Jewelry G-buffer (${maskValue})`,
    uniforms: { uMask: { value: maskValue } },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMask;
      varying vec3 vNormalView;
      void main() {
        vec3 n = normalize(vNormalView) * 0.5 + 0.5;
        gl_FragColor = vec4(n, uMask);
      }
    `,
  });
}

const aoFragment = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform mat4 uInvProjection;
  uniform vec2 uResolution;
  uniform float uRadius;
  uniform float uIntensity;
  varying vec2 vUv;

  vec3 viewPosFromDepth(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uInvProjection * clip;
    return view.xyz / view.w;
  }

  float interleavedNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    vec4 gbuf = texture2D(tNormal, vUv);
    if (depth >= 0.9999 || gbuf.a < 0.01) {
      gl_FragColor = vec4(1.0, 100.0, 0.0, 1.0);
      return;
    }

    vec3 P = viewPosFromDepth(vUv, depth);
    vec3 N = normalize(gbuf.rgb * 2.0 - 1.0);
    float linearZ = -P.z;

    // Project world crevice radius into screen UV radius.
    vec4 projCorner = vec4(uRadius, 0.0, P.z, 1.0);
    float focal = 1.0 / max(abs(uInvProjection[1][1]), 0.001);
    float pixelRadius = clamp((uRadius * focal / max(linearZ, 0.1)) * (uResolution.y * 0.5), 2.5, 40.0);
    vec2 uvRadius = vec2(pixelRadius) / uResolution;

    float randAngle = interleavedNoise(gl_FragCoord.xy) * 6.2831853;
    float randStep = interleavedNoise(gl_FragCoord.xy + vec2(17.0, 31.0));
    float occlusion = 0.0;
    const float dirs = 8.0;
    const float steps = 3.0;
    float invR2 = 1.0 / max(uRadius * uRadius, 1e-5);

    for (int d = 0; d < 8; d++) {
      float angle = randAngle + (float(d) / dirs) * 6.2831853;
      vec2 dir = vec2(cos(angle), sin(angle));
      float maxHorizon = 0.0;
      for (int s = 1; s <= 3; s++) {
        float frac = (float(s) - 0.5 + 0.5 * randStep) / steps;
        vec2 sampleUv = vUv + dir * uvRadius * frac;
        if (sampleUv.x <= 0.0 || sampleUv.x >= 1.0 || sampleUv.y <= 0.0 || sampleUv.y >= 1.0) continue;
        float sd = texture2D(tDepth, sampleUv).r;
        if (sd >= 0.9999) continue;
        vec3 Q = viewPosFromDepth(sampleUv, sd);
        vec3 V = Q - P;
        float dist2 = dot(V, V);
        if (dist2 < 1e-7 || dist2 > uRadius * uRadius * 2.2) continue;
        float dist = sqrt(dist2);
        float ndotv = dot(N, V / dist) - 0.065;
        float falloff = clamp(1.0 - dist2 * invR2, 0.0, 1.0);
        maxHorizon = max(maxHorizon, max(0.0, ndotv) * falloff);
      }
      occlusion += maxHorizon;
    }

    float ao = 1.0 - clamp((occlusion / dirs) * uIntensity, 0.0, 0.88);
    gl_FragColor = vec4(ao, linearZ, gbuf.a, 1.0);
  }
`;

const bilateralBlurFragment = /* glsl */ `
  uniform sampler2D tAo;
  uniform vec2 uStep;
  varying vec2 vUv;

  void main() {
    vec4 center = texture2D(tAo, vUv);
    if (center.b < 0.01) {
      gl_FragColor = center;
      return;
    }
    float weights[4];
    weights[0] = 0.28;
    weights[1] = 0.22;
    weights[2] = 0.11;
    weights[3] = 0.03;

    float sum = center.r * weights[0];
    float total = weights[0];
    float depthScale = 14.0 / max(center.g, 0.2);

    for (int i = 1; i <= 3; i++) {
      vec2 offset = uStep * float(i);
      vec4 a = texture2D(tAo, vUv + offset);
      vec4 b = texture2D(tAo, vUv - offset);
      float wa = weights[i] * exp(-abs(center.g - a.g) * depthScale - abs(center.b - a.b) * 8.0) * step(0.01, a.b);
      float wb = weights[i] * exp(-abs(center.g - b.g) * depthScale - abs(center.b - b.b) * 8.0) * step(0.01, b.b);
      sum += a.r * wa + b.r * wb;
      total += wa + wb;
    }
    gl_FragColor = vec4(sum / max(total, 1e-4), center.g, center.b, 1.0);
  }
`;

const brightExtractFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec4 raw = texture2D(tScene, vUv);
    float alpha = clamp(raw.a, 0.0, 1.0);
    if (alpha < 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec3 hdr = raw.rgb / alpha;
    float luma = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
    float soft = clamp(luma - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = (soft * soft) / max(4.0 * uKnee, 1e-4);
    float contrib = max(soft, luma - uThreshold) / max(luma, 1e-4);
    vec3 bright = min(hdr * contrib * alpha, vec3(5.5));
    gl_FragColor = vec4(bright, 1.0);
  }
`;

const blurFragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec3 sum = texture2D(tInput, vUv).rgb * 0.227027;
    sum += (texture2D(tInput, vUv + uDirection * 1.384615).rgb + texture2D(tInput, vUv - uDirection * 1.384615).rgb) * 0.316216;
    sum += (texture2D(tInput, vUv + uDirection * 3.230769).rgb + texture2D(tInput, vUv - uDirection * 3.230769).rgb) * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const compositeFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tAo;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform sampler2D tBloom3;
  uniform float uBloomStrength;
  uniform float uOuterBloomGain;
  uniform float uAoStrength;
  uniform float uExposure;
  varying vec2 vUv;

  vec3 jewelryACES(vec3 color) {
    const mat3 ACESIn = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 ACESOut = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    vec3 v = ACESIn * (color * (uExposure / 0.6));
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return clamp(ACESOut * (a / b), 0.0, 1.0);
  }

  vec3 linearToSrgb(vec3 c) {
    return mix(
      pow(max(c, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055),
      c * 12.92,
      vec3(lessThanEqual(c, vec3(0.0031308)))
    );
  }

  void main() {
    vec4 raw = texture2D(tScene, vUv);
    float alpha = clamp(raw.a, 0.0, 1.0);

    vec3 bloom = (
      texture2D(tBloom0, vUv).rgb * 0.44 +
      texture2D(tBloom1, vUv).rgb * 0.30 +
      texture2D(tBloom2, vUv).rgb * 0.17 +
      texture2D(tBloom3, vUv).rgb * 0.09
    ) * uBloomStrength;

    vec3 ringSrgb = vec3(0.0);
    if (alpha > 0.001) {
      vec3 hdr = raw.rgb / alpha;
      vec4 aoSample = texture2D(tAo, vUv);
      float mask = aoSample.b;
      float ao = mix(1.0, aoSample.r, mask * uAoStrength);
      // Multi-bounce colored metallic occlusion: occluded metal reflects its
      // own alloy tint again, deepening gold into warm amber rather than gray.
      float occ = 1.0 - ao;
      float peak = max(hdr.r, max(hdr.g, hdr.b));
      vec3 alloyHue = peak > 0.002 ? hdr / peak : vec3(1.0);
      vec3 multiBounce = mix(vec3(1.0), clamp(alloyHue * 1.15 + 0.10, 0.0, 1.0), occ * 0.80 * mask);
      hdr *= ao * multiBounce;

      ringSrgb = linearToSrgb(jewelryACES(hdr + bloom));
    }

    // Subtle photographic bloom outside the silhouette without sRGB low-end
    // gamma lift, encoded as valid premultiplied RGBA for live view and PNGs.
    vec3 outerBloom = jewelryACES(bloom) * uOuterBloomGain;
    float bloomAlpha = clamp(max(outerBloom.r, max(outerBloom.g, outerBloom.b)), 0.0, 1.0);
    float outAlpha = alpha + bloomAlpha * (1.0 - alpha);
    vec3 outPremult = ringSrgb * alpha + outerBloom * (1.0 - alpha);
    gl_FragColor = vec4(outPremult, outAlpha);
  }
`;

function makeTarget(w, h, options = {}) {
  const target = new THREE.WebGLRenderTarget(Math.max(4, w), Math.max(4, h), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    ...options,
  });
  target.texture.generateMipmaps = false;
  return target;
}

export class JewelryPostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const hasFloatRT =
      isWebGL2 &&
      (renderer.extensions.has("EXT_color_buffer_float") ||
        renderer.extensions.has("EXT_color_buffer_half_float"));
    this.supported = Boolean(isWebGL2 && hasFloatRT);
    if (!this.supported) return;

    this.width = 4;
    this.height = 4;
    this.aoWidth = 4;
    this.aoHeight = 4;
    this.samples = Math.min(4, renderer.capabilities.maxSamples || 0);

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    this.metalGbufferMat = createGbufferMaterial(1.0);
    this.gemGbufferMat = createGbufferMaterial(0.14);

    this.sceneTarget = makeTarget(4, 4, {
      depthBuffer: true,
      samples: this.samples,
    });
    this.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
    this.gbufferTarget = makeTarget(4, 4, {
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: this.depthTexture,
    });
    this.aoRawTarget = makeTarget(4, 4);
    this.aoBlurH = makeTarget(4, 4);
    this.aoBlurV = makeTarget(4, 4);
    this.bloomBright = makeTarget(4, 4);
    this.bloomH = [0, 1, 2, 3].map(() => makeTarget(4, 4));
    this.bloomV = [0, 1, 2, 3].map(() => makeTarget(4, 4));

    this.aoMaterial = new THREE.ShaderMaterial({
      name: "Jewelry Crevice AO",
      uniforms: {
        tDepth: { value: this.depthTexture },
        tNormal: { value: this.gbufferTarget.texture },
        uInvProjection: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(4, 4) },
        uRadius: { value: 0.22 },
        uIntensity: { value: 1.35 },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: aoFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.aoBlurMaterial = new THREE.ShaderMaterial({
      name: "Jewelry AO Bilateral Blur",
      uniforms: {
        tAo: { value: null },
        uStep: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: bilateralBlurFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.brightMaterial = new THREE.ShaderMaterial({
      name: "Jewelry Bloom Extract",
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        uThreshold: { value: 1.18 },
        uKnee: { value: 0.45 },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: brightExtractFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      name: "Jewelry Bloom Blur",
      uniforms: {
        tInput: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: blurFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      name: "Jewelry HDR Composite",
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        tAo: { value: this.aoBlurV.texture },
        tBloom0: { value: this.bloomV[0].texture },
        tBloom1: { value: this.bloomV[1].texture },
        tBloom2: { value: this.bloomV[2].texture },
        tBloom3: { value: this.bloomV[3].texture },
        uBloomStrength: { value: 0.24 },
        uOuterBloomGain: { value: 0.55 },
        uAoStrength: { value: 0.82 },
        uExposure: { value: 1.9 },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false,
    });
  }

  setSize(pixelWidth, pixelHeight) {
    if (!this.supported) return;
    const w = Math.max(4, Math.round(pixelWidth));
    const h = Math.max(4, Math.round(pixelHeight));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.sceneTarget.setSize(w, h);

    // Run crevice AO at crisp viewport resolution capped at 1280px for speed.
    const aoScale = Math.min(1, 1280 / Math.max(w, h), w > 960 ? 0.65 : 0.85);
    const aoW = Math.max(4, Math.round(w * aoScale));
    const aoH = Math.max(4, Math.round(h * aoScale));
    this.aoWidth = aoW;
    this.aoHeight = aoH;
    this.gbufferTarget.setSize(aoW, aoH);
    this.aoRawTarget.setSize(aoW, aoH);
    this.aoBlurH.setSize(aoW, aoH);
    this.aoBlurV.setSize(aoW, aoH);
    this.aoMaterial.uniforms.uResolution.value.set(aoW, aoH);

    let bw = Math.max(4, Math.round(w / 2));
    let bh = Math.max(4, Math.round(h / 2));
    this.bloomBright.setSize(bw, bh);
    for (let i = 0; i < 4; i++) {
      this.bloomH[i].setSize(bw, bh);
      this.bloomV[i].setSize(bw, bh);
      bw = Math.max(4, Math.round(bw / 2));
      bh = Math.max(4, Math.round(bh / 2));
    }
  }

  runQuad(material, target, clear = false) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(scene, camera, { noir = false, cameraDistance = 6 } = {}) {
    if (!this.supported) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    const r = this.renderer;
    const prevClearColor = new THREE.Color();
    r.getClearColor(prevClearColor);
    const prevClearAlpha = r.getClearAlpha();
    const prevAutoClear = r.autoClear;
    const prevShadowAuto = r.shadowMap.autoUpdate;

    try {
      // 1. Render full linear HDR scene into 4x MSAA render target.
      r.setRenderTarget(this.sceneTarget);
      r.setClearColor(0x000000, 0);
      r.autoClear = true;
      r.render(scene, camera);

      // 2. Render Depth + View-Normal + Material-Mask G-buffer.
      const saved = [];
      scene.traverse((obj) => {
        if (obj.isPoints || obj.userData.isGlint) {
          if (obj.visible) {
            saved.push({ obj, visible: obj.visible });
            obj.visible = false;
          }
          return;
        }
        if (!obj.isMesh || !obj.visible) return;
        if (obj.material?.transparent) {
          saved.push({ obj, visible: obj.visible });
          obj.visible = false;
          return;
        }
        saved.push({ obj, material: obj.material });
        obj.material = obj.userData.isGem
          ? this.gemGbufferMat
          : this.metalGbufferMat;
      });

      r.shadowMap.autoUpdate = false;
      try {
        r.setRenderTarget(this.gbufferTarget);
        r.setClearColor(0x8080ff, 0);
        r.clear();
        r.render(scene, camera);
      } finally {
        for (const item of saved) {
          if (item.material !== undefined) item.obj.material = item.material;
          if (item.visible !== undefined) item.obj.visible = item.visible;
        }
        r.shadowMap.autoUpdate = prevShadowAuto;
      }

      // 3. Horizon-based crevice AO + 2-pass bilateral blur.
      r.autoClear = false;
      this.aoMaterial.uniforms.uInvProjection.value
        .copy(camera.projectionMatrixInverse);
      this.aoMaterial.uniforms.uRadius.value = THREE.MathUtils.clamp(
        cameraDistance * 0.045,
        0.11,
        0.26,
      );
      this.aoMaterial.uniforms.uIntensity.value = noir ? 1.48 : 1.32;
      this.runQuad(this.aoMaterial, this.aoRawTarget);

      this.aoBlurMaterial.uniforms.tAo.value = this.aoRawTarget.texture;
      this.aoBlurMaterial.uniforms.uStep.value.set(1 / this.aoWidth, 0);
      this.runQuad(this.aoBlurMaterial, this.aoBlurH);

      this.aoBlurMaterial.uniforms.tAo.value = this.aoBlurH.texture;
      this.aoBlurMaterial.uniforms.uStep.value.set(0, 1 / this.aoHeight);
      this.runQuad(this.aoBlurMaterial, this.aoBlurV);

      // 4. Tight 4-mip optical HDR bloom on peak diamond glints & highlights.
      this.brightMaterial.uniforms.uThreshold.value = noir ? 1.08 : 1.24;
      this.runQuad(this.brightMaterial, this.bloomBright);

      let source = this.bloomBright.texture;
      for (let i = 0; i < 4; i++) {
        const hTarget = this.bloomH[i];
        const vTarget = this.bloomV[i];
        this.blurMaterial.uniforms.tInput.value = source;
        this.blurMaterial.uniforms.uDirection.value.set(1 / hTarget.width, 0);
        this.runQuad(this.blurMaterial, hTarget);

        this.blurMaterial.uniforms.tInput.value = hTarget.texture;
        this.blurMaterial.uniforms.uDirection.value.set(0, 1 / vTarget.height);
        this.runQuad(this.blurMaterial, vTarget);
        source = vTarget.texture;
      }

      // 5. Final composite: multi-bounce metallic AO + bloom + ACES + sRGB.
      this.compositeMaterial.uniforms.uBloomStrength.value = noir ? 0.34 : 0.22;
      this.compositeMaterial.uniforms.uOuterBloomGain.value = noir
        ? 0.92
        : 0.48;
      this.compositeMaterial.uniforms.uAoStrength.value = noir ? 0.88 : 0.78;
      this.compositeMaterial.uniforms.uExposure.value = r.toneMappingExposure;
      r.setRenderTarget(null);
      r.setClearColor(0x000000, 0);
      r.clear();
      this.runQuad(this.compositeMaterial, null);
    } finally {
      r.setClearColor(prevClearColor, prevClearAlpha);
      r.autoClear = prevAutoClear;
      r.setRenderTarget(null);
    }
  }

  dispose() {
    if (!this.supported) return;
    this.quadMesh.geometry.dispose();
    this.metalGbufferMat.dispose();
    this.gemGbufferMat.dispose();
    this.aoMaterial.dispose();
    this.aoBlurMaterial.dispose();
    this.brightMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.sceneTarget.dispose();
    this.depthTexture.dispose();
    this.gbufferTarget.dispose();
    this.aoRawTarget.dispose();
    this.aoBlurH.dispose();
    this.aoBlurV.dispose();
    this.bloomBright.dispose();
    for (let i = 0; i < 4; i++) {
      this.bloomH[i].dispose();
      this.bloomV[i].dispose();
    }
  }
}
