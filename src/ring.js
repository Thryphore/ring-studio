import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createStudioEnvironment } from "./studio-lighting.js";
import { buildRing } from "./ring-model.js";
import { backdropImage, paintBackdrop } from "./preview-background.js";
import { IdleRotation } from "./idle-rotation.js";

const views = {
  signature: [4.6, 3.1, 7.6],
  top: [0, 8.5, 0.6],
  side: [7.7, 1.8, 0.5],
  detail: [4.5, 3.4, 7.0],
};

export const DEFAULT_LIGHT_LEVEL = 1.9;

export class RingViewer {
  constructor(container, { idleRotate = false } = {}) {
    this.container = container;
    this.zoom = 100;
    this.currentView = "signature";
    this.motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.motionPreference.matches;
    this.idleRotation = new IdleRotation(
      { enabled: idleRotate && !this.reducedMotion },
      performance.now(),
    );
    this.events = new AbortController();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DEFAULT_LIGHT_LEVEL;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(27, 1, 0.05, 80);
    this.camera.position.set(...views.signature);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.07;
    this.baseDistance = this.camera.position.distanceTo(this.controls.target);
    this.dirty = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.7;
    this.controls.maxDistance = 13;
    this.controls.autoRotateSpeed = this.idleRotation.speed;
    this.controls.addEventListener("change", () => {
      this.dirty = true;
      this.zoom = Math.round(
        (this.baseDistance /
          this.camera.position.distanceTo(this.controls.target)) *
          100,
      );
      this.onZoom?.(this.zoom);
    });
    this.environmentTarget = createStudioEnvironment(this.renderer, {
      resolution: container.clientWidth >= 640 ? 1024 : 512,
    });
    this.environment = this.environmentTarget.texture;
    this.scene.environment = this.environment;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    const key = new THREE.DirectionalLight("#fff4e7", 1.3);
    key.position.set(-3.5, 8.0, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 9;
    key.shadow.blurSamples = 12;
    Object.assign(key.shadow.camera, {
      left: -4,
      right: 4,
      top: 4.5,
      bottom: -3.5,
      near: 0.1,
      far: 22,
    });
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.012;
    this.scene.add(key);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight("#f1f5ff", 0.6);
    fill.position.set(4.0, 1.4, 2.0);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight("#e3edff", 0.8);
    rim.position.set(2.5, 3.0, -4.0);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight("#f8faff", "#b7a78a", 0.22));

    this.ring = new THREE.Group();
    // Align the ring with the vertical turntable axis; only the starting yaw
    // is offset, so rotating it never carries a sideways lean around the view.
    this.ring.rotation.set(0, -0.24, 0);
    this.scene.add(this.ring);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.watchInteraction();
    this.renderer.setAnimationLoop((now) => {
      const elapsed =
        this.lastFrame === undefined
          ? 0
          : Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;
      const motion = this.idleRotation.sample(now);
      this.controls.autoRotate = motion.spinning;
      this.controls.autoRotateSpeed = motion.speed;
      // Turntable movement has no damping tail: touching the ring stops it now.
      this.controls.enableDamping = !motion.spinning && !this.reducedMotion;
      if (motion.spinning) this.frameIdleOrbit(now);
      else this.idleFraming = null;
      this.reportRotation(motion);
      this.controls.update(elapsed);
      if (this.dirty || this.controls.autoRotate) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
    });
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.setActive(false);
        this.onError?.();
      },
      { signal: this.events.signal },
    );
  }
  get rotationEnabled() {
    return this.idleRotation.enabled;
  }
  reportRotation(motion = this.idleRotation.sample(performance.now())) {
    const status = `${motion.enabled}:${motion.spinning}`;
    if (this.rotationStatus === status) return;
    this.rotationStatus = status;
    this.container.dataset.spinning = String(motion.spinning);
    this.onRotationChange?.(motion);
  }
  pauseForInteraction() {
    this.idleRotation.interact(performance.now());
    this.controls.autoRotate = false;
    this.reportRotation();
  }
  setIdleRotation(enabled) {
    this.idleRotation.setEnabled(enabled, performance.now(), true);
    this.controls.autoRotate = false;
    this.reportRotation();
  }
  setActive(active) {
    this.idleRotation.block("presentation", !active, performance.now());
    this.controls.autoRotate = false;
    this.reportRotation();
  }
  frameIdleOrbit(now) {
    const bounds =
      this.currentView === "detail" ? this.headBounds : this.modelBounds;
    if (!bounds || bounds.isEmpty()) return;
    if (!this.idleFraming) {
      const center = bounds.getCenter(new THREE.Vector3());
      const offset = this.camera.position.clone().sub(this.controls.target);
      const cosPitch = offset.y / offset.length();
      const sinPitch = Math.hypot(offset.x, offset.z) / offset.length();
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const fill = this.currentView === "detail" ? 0.79 : 0.96;
      const vertical = 1 / (tanV * fill);
      const horizontal = vertical / this.camera.aspect;
      const vertices =
        this.currentView === "detail"
          ? this.frameVertices.head
          : this.frameVertices.all;
      let distance = 0.65;
      // Fit every azimuth analytically, so the large ring stays inside the
      // preview for a complete turn without repeatedly zooming in and out.
      for (let i = 0; i < vertices.length; i += 3) {
        const y = vertices[i + 1] - center.y;
        const radius = Math.hypot(
          vertices[i] - center.x,
          vertices[i + 2] - center.z,
        );
        distance = Math.max(
          distance,
          y * cosPitch + radius * Math.hypot(sinPitch, horizontal),
          y * (cosPitch + sinPitch * vertical) +
            radius * Math.abs(sinPitch - cosPitch * vertical),
          y * (cosPitch - sinPitch * vertical) +
            radius * Math.abs(sinPitch + cosPitch * vertical),
        );
      }
      this.idleFraming = {
        at: now,
        fromCenter: this.controls.target.clone(),
        center,
        fromDistance: offset.length(),
        distance: (distance * 100) / this.zoom,
        fromBase: this.baseDistance,
        base: distance,
      };
    }
    const fit = this.idleFraming;
    if (fit.complete) return;
    const progress = Math.min(1, (now - fit.at) / this.idleRotation.ramp);
    const ease = progress * progress * (3 - 2 * progress);
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.lerpVectors(fit.fromCenter, fit.center, ease);
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(
        direction,
        THREE.MathUtils.lerp(fit.fromDistance, fit.distance, ease),
      );
    this.baseDistance = THREE.MathUtils.lerp(fit.fromBase, fit.base, ease);
    fit.complete = progress === 1;
  }
  watchInteraction() {
    const signal = this.events.signal;
    const root = this.container.closest("#studio-screen") || this.container;
    const hold = (key) => {
      this.idleRotation.hold(key, performance.now());
      this.controls.autoRotate = false;
      this.reportRotation();
    };
    const release = (key) => {
      this.idleRotation.release(key, performance.now());
      this.reportRotation();
    };
    root.addEventListener(
      "pointerdown",
      (event) => hold(`pointer-${event.pointerId}`),
      { capture: true, signal },
    );
    document.addEventListener(
      "pointerup",
      (event) => release(`pointer-${event.pointerId}`),
      { capture: true, signal },
    );
    document.addEventListener(
      "pointercancel",
      (event) => release(`pointer-${event.pointerId}`),
      { capture: true, signal },
    );
    root.addEventListener("wheel", () => this.pauseForInteraction(), {
      capture: true,
      passive: true,
      signal,
    });
    root.addEventListener("keydown", () => this.pauseForInteraction(), {
      capture: true,
      signal,
    });
    this.controls.addEventListener("start", () => hold("orbit"));
    this.controls.addEventListener("end", () => release("orbit"));
    const block = (key, blocked) => {
      const now = performance.now();
      if (blocked) this.idleRotation.clearHolds(now);
      this.idleRotation.block(key, blocked, now);
      this.controls.autoRotate = false;
      this.reportRotation();
    };
    document.addEventListener(
      "visibilitychange",
      () => block("hidden-tab", document.hidden),
      { signal },
    );
    block("hidden-tab", document.hidden);
    window.addEventListener("blur", () => block("window-blur", true), {
      signal,
    });
    window.addEventListener("focus", () => block("window-blur", false), {
      signal,
    });
    this.motionPreference.addEventListener(
      "change",
      (event) => {
        this.reducedMotion = event.matches;
        if (event.matches) this.setIdleRotation(false);
      },
      { signal },
    );
    this.intersectionObserver = new IntersectionObserver(([entry]) =>
      block("offscreen", !entry.isIntersecting),
    );
    this.intersectionObserver.observe(this.container);
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.modelBounds) this.frameView(this.currentView, true);
    this.dirty = true;
  }
  clearModel() {
    const resources = new Set();
    this.ring.traverse((obj) => {
      if (obj.geometry) resources.add(obj.geometry);
      if (obj.material) {
        resources.add(obj.material);
        if (obj.material.map) resources.add(obj.material.map);
      }
    });
    resources.forEach((resource) => resource.dispose());
    this.ring.clear();
  }
  update(state) {
    this.pauseForInteraction();
    this.clearModel();
    const model = buildRing(state);
    this.ring.add(...model.children);
    this.ring.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow =
        !object.material.transparent && !object.userData.isGem;
      object.receiveShadow =
        !object.material.isShaderMaterial && !object.material.transparent;
    });
    this.ring.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.ring, true);
    const previousSize = this.modelBounds?.getSize(new THREE.Vector3());
    this.modelBounds = bounds;
    this.headBounds = new THREE.Box3();
    for (const child of this.ring.children)
      if (child.userData.isSetting)
        this.headBounds.union(new THREE.Box3().setFromObject(child, true));
    const all = [],
      head = [],
      point = new THREE.Vector3();
    this.ring.traverse((object) => {
      if (!object.isMesh) return;
      let ancestor = object,
        isHead = false;
      while (ancestor && ancestor !== this.ring) {
        if (ancestor.userData.isSetting) isHead = true;
        ancestor = ancestor.parent;
      }
      const vertices = object.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld);
        all.push(point.x, point.y, point.z);
        if (isHead) head.push(point.x, point.y, point.z);
      }
    });
    this.frameVertices = {
      all: new Float32Array(all),
      head: new Float32Array(head),
    };
    const changedSize =
      !previousSize ||
      previousSize.distanceTo(bounds.getSize(new THREE.Vector3())) > 0.08;
    if (changedSize || this.currentView === "detail")
      this.frameView(this.currentView, Boolean(previousSize));
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.events.abort();
    this.intersectionObserver.disconnect();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.environmentTarget.dispose();
    this.keyLight.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
  frameView(name, keepAngle = false) {
    const bounds = name === "detail" ? this.headBounds : this.modelBounds;
    if (!bounds || bounds.isEmpty()) return;
    this.pauseForInteraction();
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update(0);
    const direction = keepAngle
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new THREE.Vector3(...(views[name] || views.signature)).normalize();
    const right = new THREE.Vector3()
      .crossVectors(this.camera.up, direction)
      .normalize();
    const vertical = new THREE.Vector3()
      .crossVectors(direction, right)
      .normalize();
    const center = bounds.getCenter(new THREE.Vector3());
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanHorizontal = tanVertical * this.camera.aspect;
    const fill = name === "detail" ? 0.79 : 0.96;
    const vertices =
      name === "detail" ? this.frameVertices.head : this.frameVertices.all;
    const fitDistance = () => {
      let distance = name === "detail" ? 1.5 : 3.5;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i] - center.x,
          y = vertices[i + 1] - center.y,
          z = vertices[i + 2] - center.z;
        const depth = x * direction.x + y * direction.y + z * direction.z;
        const horizontal = Math.abs(x * right.x + y * right.y + z * right.z);
        const height = Math.abs(
          x * vertical.x + y * vertical.y + z * vertical.z,
        );
        distance = Math.max(
          distance,
          depth + horizontal / (tanHorizontal * fill),
          depth + height / (tanVertical * fill),
        );
      }
      return distance;
    };
    // Center the visible silhouette in perspective, then fit again. A world-space
    // box center leaves extra space beneath the tilted band and shrinks the ring.
    for (let pass = 0; pass < 4; pass++) {
      const distance = fitDistance();
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i] - center.x,
          y = vertices[i + 1] - center.y,
          z = vertices[i + 2] - center.z;
        const depth =
          distance - (x * direction.x + y * direction.y + z * direction.z);
        const projectedX = (x * right.x + y * right.y + z * right.z) / depth;
        const projectedY =
          (x * vertical.x + y * vertical.y + z * vertical.z) / depth;
        minX = Math.min(minX, projectedX);
        maxX = Math.max(maxX, projectedX);
        minY = Math.min(minY, projectedY);
        maxY = Math.max(maxY, projectedY);
      }
      center.addScaledVector(right, ((minX + maxX) / 2) * distance);
      center.addScaledVector(vertical, ((minY + maxY) / 2) * distance);
    }
    const distance = fitDistance();
    this.controls.minDistance = Math.max(0.65, distance * 0.4);
    this.controls.maxDistance = Math.max(18, distance * 2.5);
    this.baseDistance = distance;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.update(0);
    this.controls.enableDamping = damping;
    this.dirty = true;
  }
  setView(name) {
    this.currentView = views[name] ? name : "signature";
    this.frameView(this.currentView);
  }
  setBackdrop(mode) {
    this.backdrop = mode;
    const stage = this.container.closest(".ring-stage");
    if (stage) stage.style.backgroundImage = `url("${backdropImage(mode)}")`;
  }
  setLightLevel(level) {
    this.renderer.toneMappingExposure = level;
    this.pauseForInteraction();
    this.dirty = true;
  }
  setZoom(delta) {
    this.pauseForInteraction();
    const direction = new THREE.Vector3().subVectors(
      this.camera.position,
      this.controls.target,
    );
    const distance = THREE.MathUtils.clamp(
      direction.length() * (delta > 0 ? 0.88 : 1.12),
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position
      .copy(this.controls.target)
      .add(direction.setLength(distance));
    this.controls.update(0);
  }
  image() {
    this.pauseForInteraction();
    const ratio = this.renderer.getPixelRatio();
    const cssSize = this.renderer.getSize(new THREE.Vector2());
    const exportRatio = Math.min(
      3200 / Math.max(cssSize.x, cssSize.y),
      ratio * 2,
    );
    try {
      this.renderer.setPixelRatio(exportRatio);
      this.renderer.render(this.scene, this.camera);
      const canvas = document.createElement("canvas");
      canvas.width = this.renderer.domElement.width;
      canvas.height = this.renderer.domElement.height;
      const ctx = canvas.getContext("2d");
      paintBackdrop(ctx, canvas.width, canvas.height, this.backdrop);
      ctx.drawImage(this.renderer.domElement, 0, 0);
      ctx.font = `${canvas.width * 0.012}px Georgia`;
      ctx.fillStyle = this.backdrop === "noir" ? "#a9b59e" : "#8b8976";
      ctx.fillText(
        "A U R E L L E  /  YOUR PERSONAL DESIGN",
        canvas.width * 0.045,
        canvas.height * 0.95,
      );
      return canvas.toDataURL("image/png");
    } finally {
      this.renderer.setPixelRatio(ratio);
      this.renderer.render(this.scene, this.camera);
    }
  }
  thumbnail() {
    const source = new Image();
    source.src = this.image();
    return new Promise((resolve) => {
      source.onload = () => {
        const c = document.createElement("canvas");
        c.width = 240;
        c.height = 180;
        c.getContext("2d").drawImage(source, 0, 0, 240, 180);
        resolve(c.toDataURL("image/jpeg", 0.65));
      };
    });
  }
}
