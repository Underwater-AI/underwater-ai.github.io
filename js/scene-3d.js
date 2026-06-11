/* ============================================================================
   UNDERWATER AI — IMMERSIVE 3D SCENE
   Procedural Three.js underwater world. No external 3D assets.
   Renders as a fixed full-viewport canvas behind the 2D page.
   ============================================================================ */
(function (global) {
  'use strict';

  // Guard: bail if Three.js failed to load.
  if (typeof THREE === 'undefined') {
    console.warn('[underwater-ai] Three.js not loaded — 3D scene disabled.');
    return;
  }

  // Reduced motion — short-circuit.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Public state surface
  const Scene = {
    camera: null,
    renderer: null,
    isReady: false,
    scrollProgress: 0,
    mouse: { x: 0, y: 0, tx: 0, ty: 0 },
    setScroll(p) { this.scrollProgress = p; },
    setMouse(x, y) { this.mouse.tx = x; this.mouse.ty = y; },
  };
  global.UnderwaterScene = Scene;

  // ---------------------------------------------------------------------------
  // CONFIG — single source of truth for tuning
  // ---------------------------------------------------------------------------
  const CONFIG = {
    // Performance / quality
    isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
    isLowPower: navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4,
    pixelRatioCap: 2,
    // Populations (halved on low-power devices)
    bubbleCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 32 : 60,
    fishCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 16 : 28,
    jellyfishCount: 3,
    kelpCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 8 : 14,
    coralCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 4 : 7,
    particleCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 110 : 220,
    godRayCount: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 4 : 7,
    // Visual
    fogColor: 0x001a2c,
    fogNear: 18,
    fogFar: 75,
    cameraStart: { x: 0, y: 1, z: 28 },
    cameraLookStart: { x: 0, y: 0, z: 0 },
  };

  // ---------------------------------------------------------------------------
  // 1. CORE SETUP
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('scene-canvas');
  if (!canvas) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.fogColor);
  scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(CONFIG.cameraStart.x, CONFIG.cameraStart.y, CONFIG.cameraStart.z);
  camera.lookAt(CONFIG.cameraLookStart.x, CONFIG.cameraLookStart.y, CONFIG.cameraLookStart.z);
  Scene.camera = camera;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !CONFIG.isMobile,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  Scene.renderer = renderer;

  // ---------------------------------------------------------------------------
  // 2. LIGHTING — bioluminescent + sun rays
  // ---------------------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x4488aa, 0.35);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x66ccee, 0x001020, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xb8e6ff, 0.85);
  sun.position.set(4, 30, 8);
  scene.add(sun);

  // A second light tinted cyan for "deep water" rim
  const deepLight = new THREE.DirectionalLight(0x00b4d8, 0.20);
  deepLight.position.set(-10, -5, -10);
  scene.add(deepLight);

  // ---------------------------------------------------------------------------
  // 3. CAUSTICS PROJECTED ON SAND (animated texture-free pattern)
  // ---------------------------------------------------------------------------
  function makeCausticTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        // Multi-octave sin/cos interference pattern (fake caustics)
        const a = Math.sin((u * 6 + v * 4) * Math.PI) * 0.5 + 0.5;
        const b = Math.sin((u * 9 - v * 7) * Math.PI) * 0.5 + 0.5;
        const c2 = Math.sin((u * 4 + v * 11) * Math.PI) * 0.5 + 0.5;
        const k = Math.pow(a * b * c2, 0.5);
        const i = (y * size + x) * 4;
        const val = Math.floor(k * 255);
        img.data[i] = val;
        img.data[i + 1] = val;
        img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // 4. WATER SURFACE — animated plane at top
  // ---------------------------------------------------------------------------
  function buildWaterSurface() {
    const geo = new THREE.PlaneGeometry(140, 140, 60, 60);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4ad0e6,
      transparent: true,
      opacity: 0.35,
      roughness: 0.15,
      metalness: 0.0,
      side: THREE.DoubleSide,
      emissive: 0x006688,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 14;
    const basePositions = geo.attributes.position.array.slice();
    return { mesh, basePositions, geo };
  }
  const water = buildWaterSurface();
  scene.add(water.mesh);

  // ---------------------------------------------------------------------------
  // 5. GOD RAYS — volumetric light cones
  // ---------------------------------------------------------------------------
  function buildGodRays() {
    const rays = [];
    for (let i = 0; i < CONFIG.godRayCount; i++) {
      const h = 28 + Math.random() * 12;
      const r = 4 + Math.random() * 4;
      const geo = new THREE.ConeGeometry(r, h, 12, 1, true);
      geo.translate(0, -h / 2, 0);
      // Custom shader for additive vertical fade
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.06 + Math.random() * 0.08 },
          uColor: { value: new THREE.Color(0x88ddff) },
        },
        vertexShader: `
          varying float vY;
          varying vec3 vPos;
          void main() {
            vY = (position.y + ${h.toFixed(1)}) / ${h.toFixed(1)};
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vY;
          uniform float uTime;
          uniform float uOpacity;
          uniform vec3 uColor;
          void main() {
            float a = smoothstep(0.0, 0.4, 1.0 - vY);
            a *= 0.5 + 0.5 * sin(vY * 8.0 + uTime * 0.4);
            a *= uOpacity;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 50,
        14,
        (Math.random() - 0.5) * 30 - 5
      );
      mesh.rotation.z = (Math.random() - 0.5) * 0.2;
      mesh.userData = { baseX: mesh.position.x, mat, speed: 0.3 + Math.random() * 0.6 };
      scene.add(mesh);
      rays.push(mesh);
    }
    return rays;
  }
  const godRays = buildGodRays();

  // ---------------------------------------------------------------------------
  // 6. JELLYFISH — bell + animated tentacles
  // ---------------------------------------------------------------------------
  function makeJellyfishTexture(hue) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.95)`);
    grd.addColorStop(0.4, `hsla(${hue}, 90%, 60%, 0.6)`);
    grd.addColorStop(0.85, `hsla(${hue}, 80%, 40%, 0.25)`);
    grd.addColorStop(1, `hsla(${hue}, 80%, 30%, 0.0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildJellyfish() {
    const group = new THREE.Group();
    const hue = 180 + Math.random() * 50;

    // Bell — half sphere with vertex displacement for pulsing
    const bellGeo = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const bellMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
      emissive: new THREE.Color(`hsl(${hue}, 90%, 55%)`),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.55,
      roughness: 0.3,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    group.add(bell);

    // Inner glow sphere
    const glowGeo = new THREE.SphereGeometry(0.4, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(`hsl(${hue}, 100%, 80%)`),
      transparent: true,
      opacity: 0.4,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = -0.2;
    group.add(glow);

    // Tentacles — curved lines with sine wave animation
    const tentacleCount = 8;
    const tentacles = [];
    for (let i = 0; i < tentacleCount; i++) {
      const points = [];
      const segs = 14;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const angle = (i / tentacleCount) * Math.PI * 2;
        const r = 0.7 - t * 0.4;
        points.push(new THREE.Vector3(
          Math.cos(angle) * r,
          -t * 2.5,
          Math.sin(angle) * r
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.025, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
        transparent: true,
        opacity: 0.55,
      });
      const tent = new THREE.Mesh(tubeGeo, tubeMat);
      tent.userData = { phase: Math.random() * Math.PI * 2, baseAngle: (i / tentacleCount) * Math.PI * 2 };
      group.add(tent);
      tentacles.push(tent);
    }

    group.userData = {
      bell, glow, tentacles, hue,
      baseY: 0,
      phase: Math.random() * Math.PI * 2,
      basePos: new THREE.Vector3(),
    };
    return group;
  }

  const jellyfish = [];
  for (let i = 0; i < CONFIG.jellyfishCount; i++) {
    const j = buildJellyfish();
    const scale = 1.2 + Math.random() * 1.2;
    j.scale.setScalar(scale);
    j.position.set(
      (Math.random() - 0.5) * 30,
      4 - i * 4,
      (Math.random() - 0.5) * 20 - 5
    );
    j.userData.basePos.copy(j.position);
    scene.add(j);
    jellyfish.push(j);
  }

  // ---------------------------------------------------------------------------
  // 7. FISH SCHOOL — instanced low-poly fish
  // ---------------------------------------------------------------------------
  function buildFishSchool() {
    // Build a low-poly fish: stretched octahedron with a tail
    const body = new THREE.ConeGeometry(0.3, 0.9, 4);
    body.rotateZ(-Math.PI / 2);
    body.scale(1, 0.7, 0.5);
    const tail = new THREE.ConeGeometry(0.18, 0.3, 3);
    tail.rotateZ(Math.PI / 2);
    tail.translate(-0.55, 0, 0);
    tail.scale(0.4, 1, 1);

    // Merge: for simplicity, use a Group then convert to one geometry
    const merged = new THREE.BufferGeometry();
    // Simpler: use just the body and add the tail as separate instanced mesh
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x66ccee,
      emissive: 0x114466,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
    });
    const bodyMesh = new THREE.InstancedMesh(body, bodyMat, CONFIG.fishCount);
    const tailMat = bodyMat.clone();
    const tailMesh = new THREE.InstancedMesh(tail, tailMat, CONFIG.fishCount);

    const dummy = new THREE.Object3D();
    const fishData = [];
    for (let i = 0; i < CONFIG.fishCount; i++) {
      const f = {
        center: new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 14 - 2,
          (Math.random() - 0.5) * 30 - 10
        ),
        radius: 4 + Math.random() * 8,
        speed: 0.15 + Math.random() * 0.25,
        offset: Math.random() * Math.PI * 2,
        bobAmp: 0.5 + Math.random() * 0.8,
        tilt: (Math.random() - 0.5) * 0.3,
        scale: 0.6 + Math.random() * 0.7,
        wagPhase: Math.random() * Math.PI * 2,
        wagSpeed: 4 + Math.random() * 3,
      };
      fishData.push(f);
      dummy.position.copy(f.center);
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      tailMesh.setMatrixAt(i, dummy.matrix);
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    tailMesh.instanceMatrix.needsUpdate = true;

    const group = new THREE.Group();
    group.add(bodyMesh, tailMesh);
    group.userData = { fishData, bodyMesh, tailMesh, dummy };
    return group;
  }
  const fishSchool = buildFishSchool();
  scene.add(fishSchool);

  // ---------------------------------------------------------------------------
  // 8. BUBBLES — instanced rising spheres
  // ---------------------------------------------------------------------------
  function buildBubbles() {
    const geo = new THREE.SphereGeometry(1, 10, 10);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xaae6ff,
      emissive: 0x66aaff,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.6,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, CONFIG.bubbleCount);
    const dummy = new THREE.Object3D();
    const data = [];
    for (let i = 0; i < CONFIG.bubbleCount; i++) {
      const b = {
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 26 + 2,
        z: (Math.random() - 0.5) * 30 - 8,
        r: 0.05 + Math.random() * 0.25,
        speed: 0.6 + Math.random() * 1.2,
        wobble: Math.random() * Math.PI * 2,
      };
      data.push(b);
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.setScalar(b.r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, data, dummy };
  }
  const bubbles = buildBubbles();
  scene.add(bubbles.mesh);

  // ---------------------------------------------------------------------------
  // 9. KELP / SEAWEED — vertex-shader animated ribbons
  // ---------------------------------------------------------------------------
  function buildKelp() {
    const group = new THREE.Group();
    const items = [];
    for (let i = 0; i < CONFIG.kelpCount; i++) {
      const height = 5 + Math.random() * 6;
      const width = 0.6 + Math.random() * 0.4;
      const geo = new THREE.PlaneGeometry(width, height, 1, 20);
      geo.translate(0, height / 2, 0);

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: Math.random() * Math.PI * 2 },
          uBaseColor: { value: new THREE.Color(0x0d4a3a) },
          uTipColor: { value: new THREE.Color(0x2dd4bf) },
          uBend: { value: 0.3 + Math.random() * 0.4 },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;
          uniform float uBend;
          varying float vY;
          void main() {
            vec3 p = position;
            float t = (p.y + ${height.toFixed(1)} * 0.5) / ${height.toFixed(1)};
            float wave = sin(uTime * 0.6 + uPhase + t * 4.0) * uBend * t;
            float wave2 = cos(uTime * 0.4 + uPhase * 0.7 + t * 2.0) * uBend * 0.6 * t;
            p.x += wave;
            p.z += wave2;
            vY = t;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uBaseColor;
          uniform vec3 uTipColor;
          varying float vY;
          void main() {
            vec3 col = mix(uBaseColor, uTipColor, vY);
            gl_FragColor = vec4(col, 0.85);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 60,
        -10,
        (Math.random() - 0.5) * 30 - 10
      );
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.userData = { mat };
      group.add(mesh);
      items.push(mesh);
    }
    group.userData = { items };
    return group;
  }
  const kelp = buildKelp();
  scene.add(kelp);

  // ---------------------------------------------------------------------------
  // 10. SAND FLOOR — large plane with subtle ripple
  // ---------------------------------------------------------------------------
  function buildSandFloor() {
    const geo = new THREE.PlaneGeometry(160, 120, 60, 40);
    geo.rotateX(-Math.PI / 2);
    // Displace vertices for dunes
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = (Math.sin(x * 0.2) * 0.4 + Math.cos(z * 0.15) * 0.3 + Math.sin(x * 0.05 + z * 0.05) * 0.5);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc8a878,
      emissive: 0x223344,
      emissiveIntensity: 0.1,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -12;
    return mesh;
  }
  const sand = buildSandFloor();
  scene.add(sand);

  // Caustic overlay on sand (separate transparent plane just above)
  const causticTex = makeCausticTexture();
  causticTex.repeat.set(8, 6);
  const causticMat = new THREE.MeshBasicMaterial({
    map: causticTex,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const causticGeo = new THREE.PlaneGeometry(120, 100);
  causticGeo.rotateX(-Math.PI / 2);
  const causticMesh = new THREE.Mesh(causticGeo, causticMat);
  causticMesh.position.y = -11.8;
  scene.add(causticMesh);

  // ---------------------------------------------------------------------------
  // 11. CORAL / ROCKS — low-poly decorative geometry
  // ---------------------------------------------------------------------------
  function buildCoral() {
    const items = [];
    for (let i = 0; i < CONFIG.coralCount; i++) {
      const h = 0.6 + Math.random() * 1.5;
      const geo = new THREE.ConeGeometry(0.5 + Math.random() * 0.4, h, 5 + Math.floor(Math.random() * 4), 2);
      // Displace vertices
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        if (y < h / 2 - 0.1) {
          pos.setX(v, pos.getX(v) + (Math.random() - 0.5) * 0.2);
          pos.setZ(v, pos.getZ(v) + (Math.random() - 0.5) * 0.2);
        }
      }
      geo.computeVertexNormals();
      const colors = [0xff5577, 0x8844cc, 0xff9944, 0x44aaff, 0xff66aa];
      const col = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.15,
        roughness: 0.6,
        metalness: 0.0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 50,
        -11.5 + h / 2,
        (Math.random() - 0.5) * 25 - 8
      );
      mesh.scale.setScalar(0.8 + Math.random() * 0.6);
      scene.add(mesh);
      items.push(mesh);
    }
    return items;
  }
  const coral = buildCoral();

  // ---------------------------------------------------------------------------
  // 12. MARINE SNOW — drifting particle motes
  // ---------------------------------------------------------------------------
  function buildMarineSnow() {
    const count = CONFIG.particleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
      sizes[i] = 0.04 + Math.random() * 0.10;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        uniform float uTime;
        varying float vSize;
        void main() {
          vec3 p = position;
          p.y -= mod(uTime * 0.4 + position.x * 0.1, 30.0) - 15.0;
          p.x += sin(uTime * 0.3 + position.z) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * 50.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
          vSize = size;
        }
      `,
      fragmentShader: `
        varying float vSize;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = 0.4 * (1.0 - d * 2.0);
          gl_FragColor = vec4(0.7, 0.85, 1.0, a);
        }
      `,
    });
    return new THREE.Points(geo, mat);
  }
  const marineSnow = buildMarineSnow();
  scene.add(marineSnow);

  // ---------------------------------------------------------------------------
  // 13. SCROLL-DRIVEN CAMERA PATH
  // ---------------------------------------------------------------------------
  // Define waypoints keyed to sections. p ∈ [0, 1].
  // Each waypoint: { cam: {x,y,z}, look: {x,y,z} }
  const cameraWaypoints = [
    { p: 0.00, cam: { x:  0, y:  4, z: 28 }, look: { x: 0, y:  0, z:  0 } }, // Hero — at surface looking down
    { p: 0.18, cam: { x:  4, y:  0, z: 24 }, look: { x: 0, y:  0, z:  0 } }, // Comparison — descending, jellyfish
    { p: 0.32, cam: { x: -6, y: -2, z: 22 }, look: { x: 0, y: -2, z: -5 } }, // Models — mid-water, fish school
    { p: 0.48, cam: { x:  8, y: -4, z: 24 }, look: { x: 0, y: -4, z:  0 } }, // Tech — panning horizontally
    { p: 0.64, cam: { x:  0, y: -6, z: 26 }, look: { x: 0, y: -6, z:  0 } }, // Detection
    { p: 0.78, cam: { x: -4, y: -9, z: 22 }, look: { x: 0, y: -10, z: -4 } }, // Tourism — near floor, coral
    { p: 0.90, cam: { x:  6, y: -2, z: 28 }, look: { x: 0, y: -2, z:  0 } }, // Team — pulling back
    { p: 1.00, cam: { x:  0, y:  4, z: 30 }, look: { x: 0, y:  0, z:  0 } }, // Footer — return
  ];

  const _tmpA = new THREE.Vector3();
  const _tmpB = new THREE.Vector3();
  function lerpWaypoint(p) {
    // find segment
    p = Math.max(0, Math.min(1, p));
    let i = 0;
    while (i < cameraWaypoints.length - 1 && cameraWaypoints[i + 1].p < p) i++;
    const a = cameraWaypoints[i];
    const b = cameraWaypoints[Math.min(i + 1, cameraWaypoints.length - 1)];
    const range = b.p - a.p || 1;
    const t = (p - a.p) / range;
    // smoothstep for nice ease
    const e = t * t * (3 - 2 * t);
    _tmpA.set(a.cam.x, a.cam.y, a.cam.z).lerp(
      _tmpB.set(b.cam.x, b.cam.y, b.cam.z), e
    );
    camera.position.copy(_tmpA);
    const la = new THREE.Vector3(a.look.x, a.look.y, a.look.z);
    const lb = new THREE.Vector3(b.look.x, b.look.y, b.look.z);
    camera.lookAt(la.lerp(lb, e));
  }

  // ---------------------------------------------------------------------------
  // 14. ANIMATION LOOP
  // ---------------------------------------------------------------------------
  const clock = new THREE.Clock();
  let elapsed = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;

    // Smooth mouse lerp
    Scene.mouse.x += (Scene.mouse.tx - Scene.mouse.x) * 0.04;
    Scene.mouse.y += (Scene.mouse.ty - Scene.mouse.y) * 0.04;

    // Camera path
    lerpWaypoint(Scene.scrollProgress);
    // Mouse parallax — small offset on top of waypoint
    if (!prefersReducedMotion) {
      camera.position.x += Scene.mouse.x * 0.6;
      camera.position.y += Scene.mouse.y * 0.3;
    }

    // Water surface waves
    if (!prefersReducedMotion) {
      const pos = water.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = water.basePositions[i * 3 + 0];
        const y = water.basePositions[i * 3 + 1];
        const wave = Math.sin(x * 0.15 + elapsed * 0.8) * 0.4
                   + Math.cos(y * 0.12 + elapsed * 0.6) * 0.3;
        pos.setZ(i, wave);
      }
      pos.needsUpdate = true;
      water.geo.computeVertexNormals();
    }

    // God rays: subtle drift
    godRays.forEach((r, idx) => {
      r.userData.mat.uniforms.uTime.value = elapsed;
      r.position.x = r.userData.baseX + Math.sin(elapsed * 0.1 + idx) * 0.3;
    });

    // Jellyfish: pulse bell + drift tentacles
    jellyfish.forEach((j, idx) => {
      const ud = j.userData;
      const pulse = 1 + Math.sin(elapsed * 1.2 + ud.phase) * 0.08;
      ud.bell.scale.set(pulse, 1 / pulse, pulse);
      ud.glow.material.opacity = 0.3 + Math.sin(elapsed * 1.5 + ud.phase) * 0.15;

      // Tentacle wave
      ud.tentacles.forEach((t) => {
        const phase = t.userData.phase;
        const baseAngle = t.userData.baseAngle;
        t.rotation.x = Math.sin(elapsed * 0.7 + phase) * 0.15;
        t.rotation.z = Math.sin(elapsed * 0.5 + phase + 1) * 0.15;
      });

      // Drift through water
      j.position.x = ud.basePos.x + Math.sin(elapsed * 0.3 + idx) * 1.2;
      j.position.y = ud.basePos.y + Math.sin(elapsed * 0.4 + idx * 0.7) * 0.6;
      j.rotation.y = elapsed * 0.05 + idx;
    });

    // Fish school — circular paths
    const dummy = fishSchool.userData.dummy;
    fishSchool.userData.fishData.forEach((f, i) => {
      const t = elapsed * f.speed + f.offset;
      const x = f.center.x + Math.cos(t) * f.radius;
      const z = f.center.z + Math.sin(t) * f.radius;
      const y = f.center.y + Math.sin(t * 1.3) * f.bobAmp;
      dummy.position.set(x, y, z);
      // Face direction of motion
      const tangX = -Math.sin(t) * f.radius * f.speed;
      const tangZ =  Math.cos(t) * f.radius * f.speed;
      dummy.rotation.y = Math.atan2(tangX, tangZ);
      dummy.rotation.z = f.tilt + Math.sin(elapsed * f.wagSpeed + f.wagPhase) * 0.15;
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      fishSchool.userData.bodyMesh.setMatrixAt(i, dummy.matrix);
      fishSchool.userData.tailMesh.setMatrixAt(i, dummy.matrix);
    });
    fishSchool.userData.bodyMesh.instanceMatrix.needsUpdate = true;
    fishSchool.userData.tailMesh.instanceMatrix.needsUpdate = true;

    // Bubbles — rise and wobble
    bubbles.data.forEach((b, i) => {
      b.y += b.speed * dt;
      if (b.y > 14) {
        b.y = -12;
        b.x = (Math.random() - 0.5) * 40;
        b.z = (Math.random() - 0.5) * 30 - 8;
      }
      const wx = b.x + Math.sin(elapsed * 0.8 + b.wobble) * 0.4;
      const wy = b.y;
      const wz = b.z + Math.cos(elapsed * 0.6 + b.wobble) * 0.3;
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(b.r);
      dummy.updateMatrix();
      bubbles.mesh.setMatrixAt(i, dummy.matrix);
    });
    bubbles.mesh.instanceMatrix.needsUpdate = true;

    // Kelp
    kelp.userData.items.forEach((m) => {
      m.userData.mat.uniforms.uTime.value = elapsed;
    });

    // Marine snow
    marineSnow.material.uniforms.uTime.value = elapsed;

    // Caustics scroll
    if (causticTex) {
      causticTex.offset.x = (elapsed * 0.02) % 1;
      causticTex.offset.y = (elapsed * 0.015) % 1;
    }

    renderer.render(scene, camera);
  }
  animate();
  Scene.isReady = true;

  // ---------------------------------------------------------------------------
  // 15. RESIZE
  // ---------------------------------------------------------------------------
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
  }
  window.addEventListener('resize', onResize);

  // ---------------------------------------------------------------------------
  // 16. MOUSE LISTENER
  // ---------------------------------------------------------------------------
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    Scene.setMouse(x, -y);
  });

})(window);
