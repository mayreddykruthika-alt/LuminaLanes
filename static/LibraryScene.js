/**
 * LuminaLanes — Library Digital Twin
 * 3D Environment Module (Three.js)
 * File: static/LibraryScene.js
 * 
 * Exports: LibraryEnvironment
 * Features:
 * - Scene, PerspectiveCamera, WebGLRenderer, OrbitControls
 * - Ambient & PointLights attached to ceiling Access Points
 * - Static Room: Floor (dark grid/wireframe), Bookshelves (dark gray BoxGeometries forming aisles),
 *   Tables (raised CylinderGeometries in center and corners)
 * - Movement Lanes: Pathing network intersecting at specific junctions
 * - Entities: this.accessPoints, this.users, this.cameras
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class LibraryEnvironment {
  constructor(containerId = 'canvas-container') {
    this.container = document.getElementById(containerId) || document.body;
    
    // Core Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Entity storage arrays (as specified)
    this.users = [];
    this.accessPoints = [];
    this.cameras = [];

    // Internal state
    this.pointLights = [];
    this.clock = new THREE.Clock();
  }

  /**
   * Initializes the 3D scene, lighting, static geometry, and dynamic entities.
   */
  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLighting();

    // Build Environment Geometry
    this.createFloor();
    this.createBookshelves();
    this.createTables();
    this.createMovementLanes();

    // Build Entities
    this.createAccessPoints();
    this.createUsers();
    this.createIntersectionCameras();

    // Handle Window Resizing
    window.addEventListener('resize', () => this.onWindowResize());
    console.log('[LibraryEnvironment] 3D Environment initialized successfully.');
  }

  // ==========================================================================
  // 1. SETUP CORE THREE.JS COMPONENTS
  // ==========================================================================

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    // Subtle atmospheric distance fog for depth
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.012);
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // High-angle perspective view overlooking the entire room
    this.camera.position.set(0, 32, 38);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera from clipping through floor
    this.controls.minDistance = 10;
    this.controls.maxDistance = 90;
    this.controls.target.set(0, 1.5, 0);
  }

  setupLighting() {
    // 1. Ambient Lighting (Cool cyan/slate tint for cyber-physical tech look)
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.6);
    this.scene.add(ambientLight);

    // 2. Global Soft Directional Key Light
    const dirLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    dirLight.position.set(15, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 3. Subtle floor fill light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.4);
    this.scene.add(hemiLight);
  }

  // ==========================================================================
  // 2. STATIC ROOM GEOMETRY
  // ==========================================================================

  /**
   * Creates the dark floor plane and engineering wireframe grid.
   */
  createFloor() {
    // Solid dark matte floor plane
    const floorGeo = new THREE.PlaneGeometry(64, 52);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e18,
      roughness: 0.85,
      metalness: 0.2
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.01;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Technical Blueprint / Engineering Grid Overlay
    const gridHelper = new THREE.GridHelper(60, 60, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = 0.005;
    this.scene.add(gridHelper);

    // Subtle outer perimeter boundary room border
    const roomOutline = new THREE.BoxGeometry(60.2, 0.2, 48.2);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true });
    const wireMesh = new THREE.Mesh(roomOutline, wireMat);
    wireMesh.position.y = 0.1;
    this.scene.add(wireMesh);
  }

  /**
   * Creates Bookshelves (dark gray BoxGeometries forming distinct aisles).
   */
  createBookshelves() {
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x181f2d,
      roughness: 0.7,
      metalness: 0.3
    });

    const shelfTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber / Orange-Brown trim border
      roughness: 0.5,
      metalness: 0.4
    });

    // Bookshelf dimensions and coordinates
    const shelfConfigs = [
      // North Perimeter Wall Stacks
      { x: -16, z: -21, w: 14, h: 4.8, d: 1.8 },
      { x: 0,   z: -21, w: 12, h: 4.8, d: 1.8 },
      { x: 16,  z: -21, w: 14, h: 4.8, d: 1.8 },

      // South Perimeter Wall Stacks
      { x: -16, z: 21, w: 14, h: 4.8, d: 1.8 },
      { x: 0,   z: 21, w: 12, h: 4.8, d: 1.8 },
      { x: 16,  z: 21, w: 14, h: 4.8, d: 1.8 },

      // West & East Perimeter Stacks
      { x: -27, z: -10, w: 1.8, h: 4.8, d: 12 },
      { x: -27, z: 10,  w: 1.8, h: 4.8, d: 12 },
      { x: 27,  z: -10, w: 1.8, h: 4.8, d: 12 },
      { x: 27,  z: 10,  w: 1.8, h: 4.8, d: 12 },

      // Internal Aisle Partitions (Forming aisles between study tables)
      { x: -16, z: 0, w: 1.8, h: 4.5, d: 6.5 },
      { x: 16,  z: 0, w: 1.8, h: 4.5, d: 6.5 }
    ];

    shelfConfigs.forEach(cfg => {
      const shelfGroup = new THREE.Group();

      // Main Dark Charcoal Body
      const bodyGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
      const bodyMesh = new THREE.Mesh(bodyGeo, shelfMat);
      bodyMesh.position.y = cfg.h / 2;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      shelfGroup.add(bodyMesh);

      // Top Amber Trim Accent
      const trimGeo = new THREE.BoxGeometry(cfg.w + 0.1, 0.18, cfg.d + 0.1);
      const trimMesh = new THREE.Mesh(trimGeo, shelfTrimMat);
      trimMesh.position.y = cfg.h + 0.09;
      trimMesh.castShadow = true;
      shelfGroup.add(trimMesh);

      shelfGroup.position.set(cfg.x, 0, cfg.z);
      this.scene.add(shelfGroup);
    });
  }

  /**
   * Creates Study Tables (raised CylinderGeometries in the center and corners).
   */
  createTables() {
    const tableTopMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark slate glass
      roughness: 0.3,
      metalness: 0.6
    });

    const tableBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.5
    });

    const tableGlowRingMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.6
    });

    // 5 Study Table Locations (Center Hub + 4 Quadrants)
    this.tableData = [
      { id: 'table-center', name: 'Center Hub', x: 0,   z: 0,   radius: 3.8, height: 1.2 },
      { id: 'table-nw',     name: 'Zone 1 (NW)', x: -16, z: -11, radius: 2.7, height: 1.2 },
      { id: 'table-ne',     name: 'Zone 2 (NE)', x: 16,  z: -11, radius: 2.7, height: 1.2 },
      { id: 'table-sw',     name: 'Zone 3 (SW)', x: -16, z: 11,  radius: 2.7, height: 1.2 },
      { id: 'table-se',     name: 'Zone 4 (SE)', x: 16,  z: 11,  radius: 2.7, height: 1.2 }
    ];

    this.tableData.forEach(t => {
      const tableGroup = new THREE.Group();

      // Raised Cylinder Table Top
      const tableTopGeo = new THREE.CylinderGeometry(t.radius, t.radius, 0.22, 32);
      const tableTopMesh = new THREE.Mesh(tableTopGeo, tableTopMat);
      tableTopMesh.position.y = t.height;
      tableTopMesh.castShadow = true;
      tableTopMesh.receiveShadow = true;
      tableGroup.add(tableTopMesh);

      // Central Pillar Leg
      const legGeo = new THREE.CylinderGeometry(0.45, 0.6, t.height, 16);
      const legMesh = new THREE.Mesh(legGeo, tableBaseMat);
      legMesh.position.y = t.height / 2;
      legMesh.castShadow = true;
      tableGroup.add(legMesh);

      // Circular Cyber Glow Rim under table top edge
      const rimGeo = new THREE.TorusGeometry(t.radius, 0.04, 16, 64);
      const rimMesh = new THREE.Mesh(rimGeo, tableGlowRingMat);
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.y = t.height - 0.05;
      tableGroup.add(rimMesh);

      tableGroup.position.set(t.x, 0, t.z);
      this.scene.add(tableGroup);
    });
  }

  /**
   * Creates Movement Lanes (Pathing network on the floor intersecting at junctions).
   */
  createMovementLanes() {
    const laneMat = new THREE.MeshBasicMaterial({
      color: 0x1e3a8a, // Soft translucent navy blue
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    const laneGuidelineMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa, // Cyan/blue line
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });

    const laneSegments = [
      // Horizontal Aisles crossing the room
      { x: 0, z: -5.5, w: 52, d: 2.4 },
      { x: 0, z: 5.5,  w: 52, d: 2.4 },

      // Vertical Aisles running lengthwise
      { x: -8, z: 0,   w: 2.4, d: 42 },
      { x: 8,  z: 0,   w: 2.4, d: 42 },

      // Central Connecting Link
      { x: 0,  z: 0,   w: 16,  d: 1.8 }
    ];

    laneSegments.forEach(seg => {
      // Shaded corridor plane
      const planeGeo = new THREE.PlaneGeometry(seg.w, seg.d);
      const planeMesh = new THREE.Mesh(planeGeo, laneMat);
      planeMesh.rotation.x = -Math.PI / 2;
      planeMesh.position.set(seg.x, 0.015, seg.z);
      this.scene.add(planeMesh);

      // Centerline guideline
      const lineGeo = new THREE.PlaneGeometry(seg.w > seg.d ? seg.w : 0.08, seg.d > seg.w ? seg.d : 0.08);
      const lineMesh = new THREE.Mesh(lineGeo, laneGuidelineMat);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(seg.x, 0.02, seg.z);
      this.scene.add(lineMesh);
    });

    // Highlighted Junction Crossings
    const junctionMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });

    const junctions = [
      { x: -8, z: -5.5 },
      { x: 8,  z: -5.5 },
      { x: -8, z: 5.5 },
      { x: 8,  z: 5.5 }
    ];

    junctions.forEach(j => {
      const jGeo = new THREE.PlaneGeometry(3.0, 3.0);
      const jMesh = new THREE.Mesh(jGeo, junctionMat);
      jMesh.rotation.x = -Math.PI / 2;
      jMesh.position.set(j.x, 0.025, j.z);
      this.scene.add(jMesh);
    });
  }

  // ==========================================================================
  // 3. ENTITIES (ACCESS POINTS, USERS, CAMERAS)
  // ==========================================================================

  /**
   * Access Points: 6 floating Blue Spheres near ceiling with emissive glow
   * distributed over tables and main intersections, with PointLights attached.
   */
  createAccessPoints() {
    this.accessPoints = [];

    const apGeo = new THREE.SphereGeometry(0.75, 32, 32);
    const apMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.8
    });

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.35,
      wireframe: true
    });

    // 6 Access Point Coordinates in a 3x2 Matrix (near ceiling height Y = 7.5)
    const apLocations = [
      { id: 1, label: 'AP-1', x: -16, y: 7.5, z: -11 }, // Centered over NW table
      { id: 2, label: 'AP-2', x: 0,   y: 7.5, z: -5.5 }, // Centered over North Aisle & Hub
      { id: 3, label: 'AP-3', x: 16,  y: 7.5, z: -11 }, // Centered over NE table
      { id: 4, label: 'AP-4', x: -16, y: 7.5, z: 11 },  // Centered over SW table
      { id: 5, label: 'AP-5', x: 0,   y: 7.5, z: 5.5 },  // Centered over South Aisle & Hub
      { id: 6, label: 'AP-6', x: 16,  y: 7.5, z: 11 }   // Centered over SE table
    ];

    apLocations.forEach(loc => {
      const apGroup = new THREE.Group();

      // Core Floating Blue Sphere
      const apMesh = new THREE.Mesh(apGeo, apMat);
      apGroup.add(apMesh);

      // Outer Holographic Halo Sphere
      const haloGeo = new THREE.SphereGeometry(1.2, 16, 16);
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      apGroup.add(haloMesh);

      // Attached High-Intensity Blue Optical PointLight
      const pointLight = new THREE.PointLight(0x38bdf8, 2.5, 22, 1.8);
      pointLight.position.set(0, -0.2, 0);
      apGroup.add(pointLight);
      this.pointLights.push(pointLight);

      // Position AP Group
      apGroup.position.set(loc.x, loc.y, loc.z);
      apGroup.userData = { id: loc.id, label: loc.label, baseY: loc.y };

      this.scene.add(apGroup);
      this.accessPoints.push(apGroup);
    });
  }

  /**
   * Users: 3 to 5 smaller Blue Spheres clustered around each of the 5 study tables.
   */
  createUsers() {
    this.users = [];

    const userGeo = new THREE.SphereGeometry(0.35, 24, 24);
    const userMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      metalness: 0.5
    });

    let userIdCounter = 1;

    // Cluster 3 to 5 users per table
    this.tableData.forEach((table, tIdx) => {
      const userCount = (tIdx === 0) ? 5 : 4; // 5 users at center hub, 4 at corner tables
      const orbitRadius = table.radius + 0.65;

      for (let i = 0; i < userCount; i++) {
        const angle = (i / userCount) * Math.PI * 2;
        const ux = table.x + Math.cos(angle) * orbitRadius;
        const uz = table.z + Math.sin(angle) * orbitRadius;
        const uy = 0.95; // Seating height

        const userMesh = new THREE.Mesh(userGeo, userMat);
        userMesh.position.set(ux, uy, uz);
        userMesh.castShadow = true;
        userMesh.userData = {
          id: `U${userIdCounter++}`,
          tableId: table.id,
          baseY: uy,
          angle: angle
        };

        this.scene.add(userMesh);
        this.users.push(userMesh);
      }
    });
  }

  /**
   * Cameras: Small White/Yellow Cubes placed strictly at lane intersections on the floor.
   */
  createIntersectionCameras() {
    this.cameras = [];

    const camBoxGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Yellow Cube
      emissive: 0xca8a04,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.7
    });

    const lensGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Exact lane intersection junction coordinates
    const cameraLocations = [
      { id: 'CAM-1', x: -8, y: 0.45, z: -5.5 },
      { id: 'CAM-2', x: 8,  y: 0.45, z: -5.5 },
      { id: 'CAM-3', x: -8, y: 0.45, z: 5.5 },
      { id: 'CAM-4', x: 8,  y: 0.45, z: 5.5 }
    ];

    cameraLocations.forEach(loc => {
      const camGroup = new THREE.Group();

      // Yellow Cube Body
      const camMesh = new THREE.Mesh(camBoxGeo, camMat);
      camMesh.castShadow = true;
      camGroup.add(camMesh);

      // White Optical Lens Diode
      const lensMesh = new THREE.Mesh(lensGeo, lensMat);
      lensMesh.position.set(0, 0, 0.42);
      camGroup.add(lensMesh);

      // Mounting Base Stand
      const standGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.45, 12);
      const standMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
      const standMesh = new THREE.Mesh(standGeo, standMat);
      standMesh.position.y = -0.45;
      camGroup.add(standMesh);

      camGroup.position.set(loc.x, loc.y, loc.z);
      camGroup.userData = { id: loc.id };

      this.scene.add(camGroup);
      this.cameras.push(camGroup);
    });
  }

  // ==========================================================================
  // 4. WINDOW RESIZE & RENDER LOOP
  // ==========================================================================

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /**
   * Main render method called on every frame by requestAnimationFrame loop.
   * Updates camera controls, applies subtle micro-animations, and renders the scene.
   */
  render() {
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Update OrbitControls damping
    if (this.controls) {
      this.controls.update();
    }

    // 2. Subtle Micro-Animation: Gentle floating oscillation for Access Points
    this.accessPoints.forEach((apGroup, idx) => {
      const offset = idx * 0.8;
      apGroup.position.y = apGroup.userData.baseY + Math.sin(elapsedTime * 1.8 + offset) * 0.12;
      apGroup.rotation.y = elapsedTime * 0.4;
    });

    // 3. Subtle Camera Sensor Scanning Sweep
    this.cameras.forEach((camGroup, idx) => {
      camGroup.rotation.y = Math.sin(elapsedTime * 1.2 + idx) * 0.6;
    });

    // 4. Subtle Breathing Aura for Users
    this.users.forEach((userMesh, idx) => {
      const scale = 1.0 + Math.sin(elapsedTime * 2.5 + idx) * 0.04;
      userMesh.scale.set(scale, scale, scale);
    });

    // 5. Render Scene through Camera
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
