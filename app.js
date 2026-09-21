/**
 * LuminaLanes — Dynamic Li-Fi Beam Scheduling & Load Balancing Digital Twin
 * Main Application Engine
 * 
 * Architecture:
 * 1. Geometry & Intersection Utilities (Line-Rect, Line-Polygon, Raycasting)
 * 2. Entity Model: AccessPoint, User, Table, StationaryObstacle, MovingObstacle, BeamParticle
 * 3. Core Simulation Controller (LiFiDigitalTwin):
 *    - Tri-State Beam Handover FSM (Active Green, Threat Orange, Blocked Red)
 *    - Cascading Capacity Load Balancer (Max 3 users/AP default)
 *    - High-DPI 60 FPS HTML5 Canvas Renderer
 * 4. UI Manager: View Switcher (Home, Load Balancing, Predictive Sensing),
 *    Controls Toolbar, Interactive Tooltip Inspector, Real-time Event Logger, Audio Synth.
 */

// ============================================================================
// 1. GEOMETRY & VECTOR UTILITIES
// ============================================================================

const MathUtils = {
  distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  },

  // Check if line segment AB intersects line segment CD
  lineIntersectsLine(p1, p2, p3, p4) {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return false;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  },

  // Get exact intersection point between line segment AB and CD (or null if none)
  getLineIntersectionPoint(p1, p2, p3, p4) {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return null;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return {
        x: p1.x + ua * (p2.x - p1.x),
        y: p1.y + ua * (p2.y - p1.y),
        ua,
        ub
      };
    }
    return null;
  },

  // Check if a point is inside a rectangle
  pointInRect(pt, rect) {
    return pt.x >= rect.x && pt.x <= rect.x + rect.w &&
           pt.y >= rect.y && pt.y <= rect.y + rect.h;
  },

  // Check if a point is inside an arbitrary polygon (ray casting)
  pointInPolygon(pt, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  // Check if line segment intersects a rectangle (either intersects edges or ends inside)
  lineIntersectsRect(p1, p2, rect) {
    if (this.pointInRect(p1, rect) || this.pointInRect(p2, rect)) return true;

    const rTopLeft = { x: rect.x, y: rect.y };
    const rTopRight = { x: rect.x + rect.w, y: rect.y };
    const rBottomRight = { x: rect.x + rect.w, y: rect.y + rect.h };
    const rBottomLeft = { x: rect.x, y: rect.y + rect.h };

    return this.lineIntersectsLine(p1, p2, rTopLeft, rTopRight) ||
           this.lineIntersectsLine(p1, p2, rTopRight, rBottomRight) ||
           this.lineIntersectsLine(p1, p2, rBottomRight, rBottomLeft) ||
           this.lineIntersectsLine(p1, p2, rBottomLeft, rTopLeft);
  },

  // Check if line segment intersects an arbitrary polygon
  lineIntersectsPolygon(p1, p2, vertices) {
    if (this.pointInPolygon(p1, vertices) || this.pointInPolygon(p2, vertices)) return true;

    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      if (this.lineIntersectsLine(p1, p2, v1, v2)) return true;
    }
    return false;
  }
};

// ============================================================================
// 2. AUDIO FEEDBACK (SYNTHESIZED OPTICAL CHIMES)
// ============================================================================

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.04) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx || this.ctx.state === 'suspended') {
        this.ctx?.resume();
      }
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay restrictions gracefully ignored
    }
  }

  playHandover() {
    this.playTone(880, 'sine', 0.1, 0.03); // High crisp ping
    setTimeout(() => this.playTone(1174.66, 'sine', 0.12, 0.025), 60);
  }

  playThreat() {
    this.playTone(440, 'triangle', 0.06, 0.02);
  }

  playDrop() {
    this.playTone(220, 'sawtooth', 0.18, 0.04);
  }
}

// ============================================================================
// 3. ENTITY MODELS
// ============================================================================

class AccessPoint {
  constructor(id, x, y, maxCapacity = 3) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.pos = { x, y };
    this.maxCapacity = maxCapacity;
    this.connectedUsers = [];
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.radius = 16;
    this.enabled = true;
  }

  get load() {
    return this.connectedUsers.length;
  }

  get isFull() {
    return !this.enabled || this.load >= this.maxCapacity;
  }

  distanceTo(pos) {
    return MathUtils.distance(this.pos, pos);
  }

  addUser(user) {
    if (!this.connectedUsers.includes(user)) {
      this.connectedUsers.push(user);
    }
  }

  removeUser(user) {
    const idx = this.connectedUsers.indexOf(user);
    if (idx !== -1) {
      this.connectedUsers.splice(idx, 1);
    }
  }
}

class User {
  constructor(id, x, y, tableId) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.pos = { x, y };
    this.tableId = tableId;

    this.currentAp = null;
    this.threatenedAp = null;
    this.threatTimer = 0;
    this.overloadTimer = 0;
    this.failedAp = null;
    this.isDropped = false;
    this.handoverCooldown = 0;

    // Solution 2: Predictive Camera Queuing System
    this.isQueued = false;
    this.queuedTargetAp = null;
    this.queuedObstacle = null;
    this.predictedInterceptPoint = null;
    this.predictedInterceptDistance = 0;

    // Solution 3: Dynamic Optical Beam Steering (Zero Handover)
    this.steerCpX = null;
    this.steerCpY = null;
    this.currentCurvature = 0;
    this.activePhaseShift = 0;
    this.deflectionAngle = 0;
    this.clearanceDistance = 0;
    this.isBeingSteered = false;
    this.steeringObstacle = null;

    // Solution 4: Complete Congestion & Wi-Fi Fallback
    this.isWifiFallback = false;
    this.wifiFallbackTimer = 0;
    this.assignedApBeforeWifi = null;

    // Transition interpolation for smooth visual moving of beam connections
    this.previousAp = null;
    this.fadeProgress = 1.0;
    this.transitionProgress = 1.0;
  }
}

class Table {
  constructor(id, x, y, w, h, name) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.rect = { x, y, w, h };
    this.name = name;
  }
}

class StationaryObstacle {
  constructor(id, x, y, w, h, type = 'bookshelf', label = '') {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.rect = { x, y, w, h };
    this.type = type; // 'bookshelf' or 'pillar'
    this.label = label;
  }
}

class MovingObstacle {
  constructor(id, x, y, w, h, vx, vy, laneType, leadDistance = 90) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = vx;
    this.vy = vy;
    this.baseVx = vx;
    this.baseVy = vy;
    this.isStopped = false;
    this.savedVx = vx;
    this.savedVy = vy;
    this.laneType = laneType; // 'horizontal' or 'vertical'
    this.leadDistance = leadDistance;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // Direction angle in radians
  get heading() {
    return Math.atan2(this.vy, this.vx);
  }

  // Returns polygonal vertices of the forward-projecting Warning Zone
  getWarningZonePolygon() {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const angle = this.heading;
    const forwardDist = this.leadDistance;
    const halfWidth = (this.laneType === 'horizontal' ? this.h : this.w) * 0.9;
    const tipWidth = halfWidth * 1.4; // Slightly expanding detection cone

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const perpCos = -sinA;
    const perpSin = cosA;

    // Base left and right
    const b1 = { x: cx + perpCos * halfWidth, y: cy + perpSin * halfWidth };
    const b2 = { x: cx - perpCos * halfWidth, y: cy - perpSin * halfWidth };

    // Forward tip left and right
    const t1 = {
      x: cx + cosA * forwardDist + perpCos * tipWidth,
      y: cy + sinA * forwardDist + perpSin * tipWidth
    };
    const t2 = {
      x: cx + cosA * forwardDist - perpCos * tipWidth,
      y: cy + sinA * forwardDist - perpSin * tipWidth
    };

    return [b1, t1, t2, b2];
  }

  update(speedFactor, canvasW = 1000, canvasH = 800) {
    if (this.isStopped) return;

    this.x += this.vx * speedFactor;
    this.y += this.vy * speedFactor;

    // Continuous smooth looping across canvas boundaries
    if (this.laneType === 'horizontal') {
      if (this.vx > 0 && this.x > canvasW + 60) {
        this.x = -this.w - 50;
      } else if (this.vx < 0 && this.x < -this.w - 60) {
        this.x = canvasW + 50;
      }
    } else {
      if (this.vy > 0 && this.y > canvasH + 60) {
        this.y = -this.h - 50;
      } else if (this.vy < 0 && this.y < -this.h - 60) {
        this.y = canvasH + 50;
      }
    }
  }

  toggleStop() {
    this.isStopped = !this.isStopped;
    if (this.isStopped) {
      this.savedVx = this.vx;
      this.savedVy = this.vy;
      this.vx = 0;
      this.vy = 0;
    } else {
      this.vx = this.savedVx || this.baseVx;
      this.vy = this.savedVy || this.baseVy;
    }
  }

  invertDirection() {
    this.vx = -this.vx;
    this.vy = -this.vy;
    this.baseVx = this.vx;
    this.baseVy = this.vy;
    this.savedVx = this.vx;
    this.savedVy = this.vy;
  }
}

// Camera tracking node placed at lane intersections
class CameraNode {
  constructor(id, x, y, name) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.pos = { x, y };
    this.name = name;
    this.scanAngle = (id - 1) * (Math.PI / 2);
    this.targetAngle = this.scanAngle;
    this.trackedObstacle = null;
    this.obstacleCoords = null;
    this.obstacleVelocity = null;
    this.status = 'SCANNING'; // 'SCANNING' or 'TRACKING'
    this.radius = 14;
  }

  update(obstacles, speedFactor = 1.0) {
    // Search for closest obstacle within 280px field of view
    let closest = null;
    let minD = 280;

    for (const obs of obstacles) {
      const ocx = obs.x + obs.w / 2;
      const ocy = obs.y + obs.h / 2;
      const d = MathUtils.distance(this.pos, { x: ocx, y: ocy });
      if (d < minD) {
        minD = d;
        closest = obs;
      }
    }

    this.trackedObstacle = closest;
    if (closest) {
      this.status = 'TRACKING';
      const ocx = closest.x + closest.w / 2;
      const ocy = closest.y + closest.h / 2;
      this.obstacleCoords = { x: Math.round(ocx), y: Math.round(ocy) };
      this.obstacleVelocity = { vx: closest.vx, vy: closest.vy };
      this.targetAngle = Math.atan2(ocy - this.y, ocx - this.x);
      // Smoothly rotate camera aperture towards target
      let diff = this.targetAngle - this.scanAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.scanAngle += diff * 0.15;
    } else {
      this.status = 'SCANNING';
      this.obstacleCoords = null;
      this.obstacleVelocity = null;
      this.scanAngle += 0.02 * speedFactor;
    }
  }
}

// Photon particle for "Animated Pulse" laser mode
class BeamParticle {
  constructor(startX, startY, endX, endY, color, speed) {
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.color = color;
    this.progress = Math.random();
    this.speed = speed;
  }

  update() {
    this.progress += this.speed;
    if (this.progress > 1) {
      this.progress = 0;
    }
  }

  get pos() {
    return {
      x: this.startX + (this.endX - this.startX) * this.progress,
      y: this.startY + (this.endY - this.startY) * this.progress
    };
  }
}

// ============================================================================
// 4. CORE DIGITAL TWIN SIMULATION ENGINE
// ============================================================================

class LiFiDigitalTwin {
  constructor() {
    this.canvas = document.getElementById('simCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioEngine();

    // Native resolution
    this.nativeWidth = 1000;
    this.nativeHeight = 800;

    // Modes & Configuration
    this.activeSolution = 'load-balance'; // 'load-balance' or 'predictive'
    this.isPaused = false;
    this.speedMultiplier = 1.0;
    this.defaultCapacity = 4; // Default 4 users/AP (matches top control dropdown)
    this.beamStyle = 'pulse'; // 'pulse', 'fade', 'instant'
    this.showGrid = true;
    this.showZones = true;
    this.reactiveModeOnly = false; // Page 2 comparison toggle

    // Telemetry Statistics
    this.stats = {
      proactiveHandovers: 0,
      loadRedirects: 0,
      physicalDrops: 0,
      totalHandovers: 0,
      simTimeSeconds: 0
    };

    // FPS & Timers
    this.lastFrameTime = performance.now();
    this.fps = 60;
    this.frameCount = 0;

    // Optical Photon Particles
    this.particles = [];

    // Hover Inspection Tooltip state
    this.mousePos = { x: -100, y: -100 };
    this.hoveredEntity = null;

    // Initialize Layout & Network
    this.initEnvironment();
    this.initNetwork();
    this.setupCanvasDPI();

    // Event Listeners
    this.bindEvents();

    // Start Simulation Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  setupCanvasDPI() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.nativeWidth * dpr;
    this.canvas.height = this.nativeHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  initEnvironment() {
    // 4 Walkway Lanes (Aisles between tables)
    this.lanes = [
      { id: 'h1', x: 0, y: 220, w: this.nativeWidth, h: 60, type: 'horizontal' },
      { id: 'h2', x: 0, y: 550, w: this.nativeWidth, h: 60, type: 'horizontal' },
      { id: 'v1', x: 270, y: 0, w: 60, h: this.nativeHeight, type: 'vertical' },
      { id: 'v2', x: 670, y: 0, w: 60, h: this.nativeHeight, type: 'vertical' }
    ];

    // 5 Library Study Tables
    this.tables = [
      new Table(1, 100, 330, 140, 75, 'Table 1 (NW Zone)'),
      new Table(2, 760, 330, 140, 75, 'Table 2 (NE Zone)'),
      new Table(3, 400, 380, 200, 90, 'Table 3 (Center Hub)'),
      new Table(4, 100, 440, 140, 75, 'Table 4 (SW Zone)'),
      new Table(5, 760, 440, 140, 75, 'Table 5 (SE Zone)')
    ];

    // Stationary Obstacles (Permanent infrastructure: Bookshelves & Concrete Pillars)
    this.stationaryObstacles = [
      // Tall perimeter bookshelves (solid optical shadows)
      new StationaryObstacle(1, 20, 330, 50, 190, 'bookshelf', 'Stacks NW'),
      new StationaryObstacle(2, 930, 330, 50, 190, 'bookshelf', 'Stacks NE'),
      new StationaryObstacle(3, 410, 20, 180, 45, 'bookshelf', 'Reference Section'),
      new StationaryObstacle(4, 410, 735, 180, 45, 'bookshelf', 'Periodicals'),
      // Central structural pillars
      new StationaryObstacle(5, 275, 395, 50, 45, 'pillar', 'Pillar A'),
      new StationaryObstacle(6, 675, 395, 50, 45, 'pillar', 'Pillar B')
    ];

    // Moving Obstacles (Patrons walking along aisles with forward warning zones)
    this.initObstacles();
    this.initCameras();
  }

  initCameras() {
    // 4 Camera nodes placed at the 4 lane intersections
    // H1 (center Y=250), H2 (center Y=580), V1 (center X=300), V2 (center X=700)
    this.cameras = [
      new CameraNode(1, 300, 250, 'CAM-1 (NW Junction)'),
      new CameraNode(2, 700, 250, 'CAM-2 (NE Junction)'),
      new CameraNode(3, 300, 580, 'CAM-3 (SW Junction)'),
      new CameraNode(4, 700, 580, 'CAM-4 (SE Junction)')
    ];
  }

  initObstacles() {
    this.obstacles = [
      // Lane H1 (Y=220): Moving West -> East
      new MovingObstacle(1, 60, 235, 32, 30, 1.8, 0, 'horizontal', 85),
      // Lane H1 (Y=220): Moving East -> West
      new MovingObstacle(2, 860, 235, 32, 30, -1.9, 0, 'horizontal', 90),

      // Lane H2 (Y=550): Moving West -> East
      new MovingObstacle(3, 150, 565, 32, 30, 2.0, 0, 'horizontal', 85),
      // Lane H2 (Y=550): Moving East -> West
      new MovingObstacle(4, 800, 565, 32, 30, -1.7, 0, 'horizontal', 90),

      // Lane V1 (X=270): Moving North -> South
      new MovingObstacle(5, 285, 90, 30, 32, 0, 1.9, 'vertical', 85),

      // Lane V2 (X=670): Moving South -> North
      new MovingObstacle(6, 685, 680, 30, 32, 0, -2.0, 'vertical', 85)
    ];
  }

  initNetwork() {
    // 6 Ceiling Access Points placed in a 3x2 matrix
    // Row 1: Y = 110
    // Row 2: Y = 690
    this.aps = [
      new AccessPoint(0, 180, 110, this.defaultCapacity),
      new AccessPoint(1, 500, 110, this.defaultCapacity),
      new AccessPoint(2, 820, 110, this.defaultCapacity),
      new AccessPoint(3, 180, 690, this.defaultCapacity),
      new AccessPoint(4, 500, 690, this.defaultCapacity),
      new AccessPoint(5, 820, 690, this.defaultCapacity)
    ];

    // 26 Static Library Users clustered around the 5 tables
    this.users = [];
    let userId = 1;

    const tableUserOffsets = [
      // 5 users at Table 1 (NW)
      [[-45, -18], [0, -20], [45, -18], [-30, 18], [30, 18]],
      // 5 users at Table 2 (NE)
      [[-45, -18], [0, -20], [45, -18], [-30, 18], [30, 18]],
      // 6 users at Table 3 (Center Hub)
      [[-60, -22], [0, -24], [60, -22], [-60, 22], [0, 24], [60, 22]],
      // 5 users at Table 4 (SW)
      [[-45, -18], [0, -20], [45, -18], [-30, 18], [30, 18]],
      // 5 users at Table 5 (SE)
      [[-45, -18], [0, -20], [45, -18], [-30, 18], [30, 18]]
    ];

    this.tables.forEach((table, tIdx) => {
      const cx = table.x + table.w / 2;
      const cy = table.y + table.h / 2;
      tableUserOffsets[tIdx].forEach(([dx, dy]) => {
        this.users.push(new User(userId++, cx + dx, cy + dy, table.id));
      });
    });

    // Perform initial association
    this.performInitialAssociation();
  }

  performInitialAssociation() {
    // Clear existing AP connections
    this.aps.forEach(ap => ap.connectedUsers = []);

    // Greedily associate each user with closest AP that is not full and has clear LoS
    this.users.forEach(user => {
      const sortedAps = [...this.aps].sort((a, b) => a.distanceTo(user.pos) - b.distanceTo(user.pos));
      let assigned = false;

      for (const ap of sortedAps) {
        if (!ap.isFull && !this.isPathBlocked(user.pos, ap.pos) && !this.isPathThreatened(user.pos, ap.pos)) {
          user.currentAp = ap;
          ap.connectedUsers.push(user);
          assigned = true;
          break;
        }
      }

      // Fallback: assign to nearest available with physical LoS
      if (!assigned) {
        for (const ap of sortedAps) {
          if (!ap.isFull && !this.isPathBlocked(user.pos, ap.pos)) {
            user.currentAp = ap;
            ap.connectedUsers.push(user);
            assigned = true;
            break;
          }
        }
      }

      // Edge case: total saturation fallback
      if (!assigned) {
        for (const ap of sortedAps) {
          if (!ap.isFull) {
            user.currentAp = ap;
            ap.connectedUsers.push(user);
            assigned = true;
            break;
          }
        }
      }
    });
  }

  // ==========================================================================
  // RAYCAST & COLLISION DETECTION
  // ==========================================================================

  isPathBlocked(p1, p2) {
    if (this.activeSolution === 'load-balance' || this.activeSolution === 'solution-1') {
      return false; // Zero obstacles in Solution 1
    }
    // 1. Check against stationary bookshelves and pillars
    for (const obs of this.stationaryObstacles) {
      if (MathUtils.lineIntersectsRect(p1, p2, obs.rect)) return true;
    }

    // 2. Check against solid physical bodies of moving obstacles
    for (const obs of this.obstacles) {
      if (MathUtils.lineIntersectsRect(p1, p2, obs.rect)) return true;
    }

    return false;
  }

  isPathThreatened(p1, p2) {
    if (this.activeSolution === 'load-balance' || this.activeSolution === 'solution-1') {
      return false; // Zero obstacles / warning zones in Solution 1
    }
    if (!this.showZones) return false;
    for (const obs of this.obstacles) {
      const poly = obs.getWarningZonePolygon();
      if (MathUtils.lineIntersectsPolygon(p1, p2, poly)) return true;
    }
    return false;
  }

  findCandidateAp(user, excludeAp = null) {
    const candidates = [];

    for (const ap of this.aps) {
      if (excludeAp && ap === excludeAp) continue;
      if (ap.isFull) continue; // Capacity constraint

      // Strict clear path (neither warning zone nor solid obstacle)
      if (!this.isPathThreatened(user.pos, ap.pos) && !this.isPathBlocked(user.pos, ap.pos)) {
        candidates.push({ ap, dist: ap.distanceTo(user.pos) });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0].ap;
    }

    // Secondary fallback: unblocked physically, even if close to warning zone boundary
    const secondary = [];
    for (const ap of this.aps) {
      if (excludeAp && ap === excludeAp) continue;
      if (ap.isFull) continue;

      if (!this.isPathBlocked(user.pos, ap.pos)) {
        secondary.push({ ap, dist: ap.distanceTo(user.pos) });
      }
    }

    if (secondary.length > 0) {
      secondary.sort((a, b) => a.dist - b.dist);
      return secondary[0].ap;
    }

    return null;
  }

  findOptimumBackupAp(user, excludeAp, obstacle, rayStart, rayEnd) {
    const candidates = [];

    for (const ap of this.aps) {
      if (ap === excludeAp) continue;
      if (!ap.enabled) continue;

      // The path to this candidate AP must NOT be intersected by the obstacle's forward trajectory
      const rayIntersectsCandidate = MathUtils.lineIntersectsLine(rayStart, rayEnd, user.pos, ap.pos);
      if (rayIntersectsCandidate) continue;

      // Must not be physically occluded by obstacle right now
      if (MathUtils.lineIntersectsRect(user.pos, ap.pos, obstacle.rect)) continue;

      // Score candidates: prioritize available capacity, then lowest load, then shortest distance
      candidates.push({
        ap,
        dist: ap.distanceTo(user.pos),
        load: ap.load,
        hasRoom: ap.load < ap.maxCapacity
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.hasRoom !== b.hasRoom) return a.hasRoom ? -1 : 1;
        if (a.load !== b.load) return a.load - b.load;
        return a.dist - b.dist;
      });
      return candidates[0].ap;
    }

    // Fallback: any enabled AP not excluded
    const fallbacks = this.aps.filter(ap => ap !== excludeAp && ap.enabled);
    if (fallbacks.length > 0) {
      fallbacks.sort((a, b) => (a.load < a.maxCapacity ? -1 : 1) || a.load - b.load || a.distanceTo(user.pos) - b.distanceTo(user.pos));
      return fallbacks[0];
    }
    return null;
  }

  // ==========================================================================
  // SOLUTION 2: PREDICTIVE CAMERA SENSING & PROACTIVE HANDOVER SYSTEM
  // ==========================================================================

  updatePredictiveCameraSystem(speedFactor = 1.0) {
    // 1. Update all camera tracking turrets and calculate dynamic obstacle coordinates & trajectories
    if (this.cameras) {
      this.cameras.forEach(cam => cam.update(this.obstacles, speedFactor));
    }

    // 2. Decrement timers and smooth transitions
    this.users.forEach(user => {
      if (user.handoverCooldown > 0) user.handoverCooldown--;
      if (user.fadeProgress < 1.0) user.fadeProgress = Math.min(1.0, user.fadeProgress + 0.05);
      if (user.transitionProgress < 1.0) user.transitionProgress = Math.min(1.0, user.transitionProgress + 0.05);
    });

    // 3. Core Physics & Trajectory Prediction
    this.obstacles.forEach(obs => {
      const ocx = obs.x + obs.w / 2;
      const ocy = obs.y + obs.h / 2;

      // CANCELLATION 1: If obstacle is stopped, cancel any queued handovers immediately!
      if (obs.isStopped) {
        this.users.forEach(user => {
          if (user.isQueued && user.queuedObstacle === obs) {
            this.logEvent(
              `[HANDOVER CANCELED] Obstacle #${obs.id} stopped before interruption! Handover canceled; User #U${user.id} original connection to AP-${user.currentAp.id + 1} preserved intact.`,
              'system-info'
            );
            user.isQueued = false;
            user.queuedTargetAp = null;
            user.queuedObstacle = null;
            user.predictedInterceptPoint = null;
            user.predictedInterceptDistance = 0;
            user.threatTimer = 0;
            user.threatenedAp = null;
          }
        });
        return;
      }

      // Compute forward trajectory ray: from obstacle center along velocity direction
      const forwardDist = 220; // 220px camera lookahead horizon
      const rayStart = { x: ocx, y: ocy };
      const rayEnd = {
        x: ocx + Math.cos(obs.heading) * forwardDist,
        y: ocy + Math.sin(obs.heading) * forwardDist
      };

      // Check against all active users
      this.users.forEach(user => {
        if (!user.currentAp) return;

        const p1 = user.pos;
        const p2 = user.currentAp.pos;

        // Intersection point between obstacle forward trajectory and user's Li-Fi beam
        const hit = MathUtils.getLineIntersectionPoint(rayStart, rayEnd, p1, p2);
        const isPhysicallyColliding = MathUtils.lineIntersectsRect(p1, p2, obs.rect);

        if (hit) {
          const distToHit = MathUtils.distance(rayStart, hit);

          // If obstacle is still approaching (d > 26px and not physically colliding):
          // THE QUEUING SYSTEM: Queue user to the next most optimum Access Point before interruption!
          if (distToHit > 26 && !isPhysicallyColliding) {
            if (!user.isQueued || user.queuedObstacle !== obs) {
              const targetAp = this.findOptimumBackupAp(user, user.currentAp, obs, rayStart, rayEnd);
              if (targetAp) {
                user.isQueued = true;
                user.queuedTargetAp = targetAp;
                user.queuedObstacle = obs;
                user.predictedInterceptPoint = hit;
                user.predictedInterceptDistance = distToHit;
                user.threatTimer = 999;
                user.threatenedAp = user.currentAp;
                this.audio.playThreat();
                this.logEvent(
                  `[CAMERA PREDICT] Camera tracked Obstacle #${obs.id} at (${Math.round(ocx)}, ${Math.round(ocy)}). Interruption predicted for User #U${user.id} LoS! Queued to optimum AP-${targetAp.id + 1} (${targetAp.load}/${targetAp.maxCapacity}).`,
                  'handover-proactive'
                );
              }
            } else {
              // Continuously update intercept point and remaining distance
              user.predictedInterceptPoint = hit;
              user.predictedInterceptDistance = distToHit;
            }
          } else {
            // Obstacle reached intercept threshold (distToHit <= 26px) or is physically colliding!
            // EXECUTION LOGIC: Automatically and instantly switch connection to queued optimum AP without delay!
            if (user.isQueued && user.queuedTargetAp) {
              const oldAp = user.currentAp;
              const newAp = user.queuedTargetAp;

              // Execute instant switch
              const idx = oldAp.connectedUsers.indexOf(user);
              if (idx !== -1) oldAp.connectedUsers.splice(idx, 1);
              newAp.connectedUsers.push(user);

              user.previousAp = oldAp;
              user.currentAp = newAp;
              user.fadeProgress = 1.0;
              user.transitionProgress = 1.0;
              user.isQueued = false;
              user.queuedTargetAp = null;
              user.queuedObstacle = null;
              user.predictedInterceptPoint = null;
              user.predictedInterceptDistance = 0;
              user.threatTimer = 0;
              user.threatenedAp = null;
              user.isDropped = false;
              user.failedAp = null;
              user.handoverCooldown = 35;

              this.stats.proactiveHandovers++;
              this.stats.totalHandovers++;
              this.audio.playHandover();
              this.logEvent(
                `[INSTANT HANDOVER EXECUTION] Obstacle #${obs.id} reached intercept! Automatically switched User #U${user.id}: AP-${oldAp.id + 1} → AP-${newAp.id + 1} (Zero Latency).`,
                'handover-proactive'
              );
              this.updateUI();
            } else if (isPhysicallyColliding && user.handoverCooldown === 0) {
              // Direct cut fallback
              const fallbackAp = this.findOptimumBackupAp(user, user.currentAp, obs, rayStart, rayEnd);
              if (fallbackAp) {
                const oldAp = user.currentAp;
                const idx = oldAp.connectedUsers.indexOf(user);
                if (idx !== -1) oldAp.connectedUsers.splice(idx, 1);
                fallbackAp.connectedUsers.push(user);

                user.previousAp = oldAp;
                user.currentAp = fallbackAp;
                user.isDropped = false;
                user.failedAp = null;
                user.threatTimer = 0;
                user.handoverCooldown = 30;
                this.stats.proactiveHandovers++;
                this.stats.totalHandovers++;
                this.audio.playHandover();
                this.updateUI();
              }
            }
          }
        } else {
          // CANCELLATION 2: Obstacle trajectory no longer intersects the beam!
          // If the obstacle changes direction or diverts before causing interruption:
          if (user.isQueued && user.queuedObstacle === obs && !isPhysicallyColliding) {
            this.logEvent(
              `[HANDOVER CANCELED] Obstacle #${obs.id} trajectory diverted away from beam! Queued handover canceled; User #U${user.id} original connection to AP-${user.currentAp.id + 1} preserved intact.`,
              'system-info'
            );
            user.isQueued = false;
            user.queuedTargetAp = null;
            user.queuedObstacle = null;
            user.predictedInterceptPoint = null;
            user.predictedInterceptDistance = 0;
            user.threatTimer = 0;
            user.threatenedAp = null;
          }
        }
      });
    });

    // Enforce capacity limits if any
    this.enforceLoadBalancingLimits();
  }

  // ==========================================================================
  // SOLUTION 3: DYNAMIC OPTICAL BEAM STEERING & CAMERA SENSING (ZERO HANDOVER)
  // ==========================================================================

  updateDynamicBeamSteering(speedFactor = 1.0) {
    // 1. Update all camera tracking turrets to track moving obstacles
    if (this.cameras) {
      this.cameras.forEach(cam => cam.update(this.obstacles, speedFactor));
    }

    // 2. Clear any queueing or drop flags - original connection to AP remains 100% intact!
    this.users.forEach(user => {
      user.isQueued = false;
      user.queuedTargetAp = null;
      user.threatTimer = 0;
      user.threatenedAp = null;
      user.isDropped = false;
      user.failedAp = null;
    });

    // 3. For each connected user, calculate obstacle proximity to the active Green Beam
    this.users.forEach(user => {
      if (!user.currentAp) return;

      const ap = user.currentAp;
      const p1 = { x: ap.x, y: ap.y };
      const p2 = { x: user.x, y: user.y };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;

      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      let closestDist = Infinity;
      let closestSignedDperp = 0;
      let threateningObstacle = null;
      let maxProximityWeight = 0;

      // Cameras track dynamically moving obstacles (Red Triangles)
      for (const obs of this.obstacles) {
        const ocx = obs.x + obs.w / 2;
        const ocy = obs.y + obs.h / 2;

        // Project obstacle center onto the AP-User line segment
        const t = ((ocx - p1.x) * ux + (ocy - p1.y) * uy) / len;

        // Only evaluate if obstacle is along the span between AP and user
        if (t >= 0.04 && t <= 0.96) {
          const projX = p1.x + t * len * ux;
          const projY = p1.y + t * len * uy;
          const distToProj = Math.hypot(ocx - projX, ocy - projY);
          const signedDperp = (ocx - p1.x) * nx + (ocy - p1.y) * ny;

          const steerThreshold = 80;
          if (distToProj < steerThreshold && distToProj < closestDist) {
            closestDist = distToProj;
            closestSignedDperp = signedDperp;
            threateningObstacle = obs;
            const norm = 1.0 - (distToProj / steerThreshold);
            maxProximityWeight = norm * norm * (3 - 2 * norm); // Smooth cubic ease
          }
        }
      }

      if (threateningObstacle && maxProximityWeight > 0.01) {
        // The active Green Beam must dynamically bend/arc around the obstacle's coordinates
        // using a Quadratic Bezier Curve. Original AP connection remains completely intact!
        const side = closestSignedDperp >= 0 ? -1 : 1;
        
        // Target control point displacement (up to 95px arc at peak approach)
        const targetArc = side * (38 + 58 * maxProximityWeight);
        
        // Smooth interpolation to curve gracefully
        user.currentCurvature += (targetArc - user.currentCurvature) * 0.22;
        user.isBeingSteered = true;
        user.steeringObstacle = threateningObstacle;
        user.clearanceDistance = Math.max(14, closestDist);

        // Control point of the Quadratic Bezier Curve
        user.steerCpX = midX + user.currentCurvature * nx;
        user.steerCpY = midY + user.currentCurvature * ny;

        // Compute angular deflection and SLM phase shift
        const deflection = Math.atan2(Math.abs(user.currentCurvature), len / 2) * (180 / Math.PI);
        user.deflectionAngle = deflection;
        user.activePhaseShift = deflection * 2.45;
      } else {
        // Smoothly straighten beam back to line
        user.currentCurvature += (0 - user.currentCurvature) * 0.18;
        if (Math.abs(user.currentCurvature) < 0.3) {
          user.currentCurvature = 0;
          user.isBeingSteered = false;
          user.activePhaseShift = 0;
          user.deflectionAngle = 0;
          user.clearanceDistance = 0;
          user.steerCpX = midX;
          user.steerCpY = midY;
        } else {
          user.steerCpX = midX + user.currentCurvature * nx;
          user.steerCpY = midY + user.currentCurvature * ny;
          const deflection = Math.atan2(Math.abs(user.currentCurvature), len / 2) * (180 / Math.PI);
          user.deflectionAngle = deflection;
          user.activePhaseShift = deflection * 2.45;
        }
      }
    });

    // 4. Update the SLM Data Overlay in the Right Panel
    this.updateSLMDataOverlay();
  }

  updateSLMDataOverlay() {
    let maxUser = null;
    let maxShift = 0;

    this.users.forEach(u => {
      if (u.activePhaseShift > maxShift) {
        maxShift = u.activePhaseShift;
        maxUser = u;
      }
    });

    const shiftEl = document.getElementById('slm-phase-shift-val');
    const deflEl = document.getElementById('slm-deflection-val');
    const clearEl = document.getElementById('slm-clearance-val');
    const apEl = document.getElementById('slm-active-ap-val');
    const userEl = document.getElementById('slm-target-user-val');
    const badgeEl = document.getElementById('slm-status-badge');
    const modeTextEl = document.getElementById('slm-mode-text');

    if (maxUser && maxUser.isBeingSteered && maxShift > 1.0) {
      const shiftDeg = maxUser.activePhaseShift;
      const shiftRad = (shiftDeg * Math.PI / 180).toFixed(2);
      if (shiftEl) shiftEl.textContent = `Δφ = ${shiftDeg.toFixed(1)}° (${shiftRad} rad)`;
      if (deflEl) deflEl.textContent = `+${maxUser.deflectionAngle.toFixed(1)}°`;
      if (clearEl) clearEl.textContent = `${maxUser.clearanceDistance.toFixed(1)} px`;
      if (apEl) apEl.textContent = `AP-${maxUser.currentAp.id + 1}`;
      if (userEl) userEl.textContent = `User #U${maxUser.id}`;
      if (badgeEl) {
        badgeEl.textContent = 'SLM: STEERING ACTIVE';
        badgeEl.className = 'text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse';
      }
      if (modeTextEl) modeTextEl.textContent = 'BEZIER CURVED ARC';
    } else {
      if (shiftEl) shiftEl.textContent = 'Δφ = 0.0° (0.00 rad)';
      if (deflEl) deflEl.textContent = '0.0°';
      if (clearEl) clearEl.textContent = 'Clear LoS';
      if (badgeEl) {
        badgeEl.textContent = 'SLM: MONITORING';
        badgeEl.className = 'text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20';
      }
      if (modeTextEl) modeTextEl.textContent = 'ZERO HANDOVER';
    }
  }

  // ==========================================================================
  // SOLUTION 4: COMPLETE CONGESTION & WI-FI FALLBACK LOGIC
  // ==========================================================================

  updateFailSafeRecovery(speedFactor = 1.0) {
    // 1. Update all camera tracking turrets
    if (this.cameras) {
      this.cameras.forEach(cam => cam.update(this.obstacles, speedFactor));
    }

    // 2. Continuous Polling: Check all active Li-Fi users for obstacle occlusion
    this.users.forEach(user => {
      if (user.currentAp && !user.isWifiFallback) {
        const ap = user.currentAp;
        const p1 = { x: ap.x, y: ap.y };
        const p2 = { x: user.x, y: user.y };

        // Check if any obstacle intersects the line segment between AP and user
        let isOccluded = false;
        for (const obs of this.obstacles) {
          if (MathUtils.lineIntersectsRect(p1, p2, obs.rect)) {
            isOccluded = true;
            break;
          }
        }

        if (isOccluded) {
          // Failure condition check:
          // A user's active connection is about to be blocked by an obstacle, BUT:
          // 1. All other APs are at maximum user capacity, OR
          // 2. Obstacles block all possible geometric paths to alternative APs.
          const viableAp = this.findViableAlternativeAp(user, ap);

          if (!viableAp) {
            // Failure Condition MET -> Temporarily switch user to backup Wi-Fi network!
            user.isWifiFallback = true;
            user.wifiFallbackTimer = Date.now();
            user.assignedApBeforeWifi = ap;
            ap.removeUser(user);
            user.currentAp = null;
            this.audio.playThreat();
            this.logEvent(
              `[WI-FI FALLBACK] User #U${user.id} optical link blocked; all alternate APs saturated or obstructed! Routed to central Wi-Fi backup (thin grey line).`,
              'threat'
            );
          } else {
            // Alternative AP is available with capacity & clear LoS -> normal handover
            ap.removeUser(user);
            viableAp.addUser(user);
            user.previousAp = ap;
            user.currentAp = viableAp;
            user.transitionProgress = 0.0;
            this.audio.playHandover();
          }
        }
      }
    });

    // 3. CONTINUOUS SELF-HEALING RECONNECTION (60 FPS POLLING):
    // The exact millisecond an Access Point's capacity frees up or an obstacle moves out of the way,
    // the system instantly drops the Wi-Fi fallback and reconnects the user to the Li-Fi Access Point!
    this.users.forEach(user => {
      if (user.isWifiFallback) {
        let bestCandidate = null;
        let bestDist = Infinity;

        for (const candidateAp of this.aps) {
          if (!candidateAp.enabled) continue;
          if (candidateAp.load >= candidateAp.maxCapacity) continue;

          // Check if path from candidateAp to user is clear
          const p1 = { x: candidateAp.x, y: candidateAp.y };
          const p2 = { x: user.x, y: user.y };

          let hasObstacle = false;
          for (const obs of this.obstacles) {
            if (MathUtils.lineIntersectsRect(p1, p2, obs.rect)) {
              hasObstacle = true;
              break;
            }
          }

          if (!hasObstacle) {
            const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (d < bestDist) {
              bestDist = d;
              bestCandidate = candidateAp;
            }
          }
        }

        if (bestCandidate) {
          // INSTANT SELF-HEALING RESTORATION!
          user.isWifiFallback = false;
          user.currentAp = bestCandidate;
          bestCandidate.addUser(user);
          user.transitionProgress = 0.0;
          this.audio.playHandover();
          this.logEvent(
            `[SELF-HEALING RESTORED] User #U${user.id} clear optical LoS detected at AP-${bestCandidate.id + 1} (${bestCandidate.load}/${bestCandidate.maxCapacity}). Dropped Wi-Fi fallback; solid Green Li-Fi beam restored!`,
            'handover-proactive'
          );
        }
      }
    });

    // 4. Update the Network Connection Status panel
    this.updateNetworkStatusPanel();
  }

  findViableAlternativeAp(user, currentAp) {
    let bestAp = null;
    let bestDist = Infinity;

    for (const ap of this.aps) {
      if (ap === currentAp || !ap.enabled) continue;
      // Must have capacity
      if (ap.load >= ap.maxCapacity) continue;

      // Must not be occluded by any obstacle
      const p1 = { x: ap.x, y: ap.y };
      const p2 = { x: user.x, y: user.y };
      let occluded = false;
      for (const obs of this.obstacles) {
        if (MathUtils.lineIntersectsRect(p1, p2, obs.rect)) {
          occluded = true;
          break;
        }
      }

      if (!occluded) {
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (d < bestDist) {
          bestDist = d;
          bestAp = ap;
        }
      }
    }

    return bestAp;
  }

  updateNetworkStatusPanel() {
    const wifiCount = this.users.filter(u => u.isWifiFallback).length;
    const lifiCount = this.users.filter(u => !u.isWifiFallback && u.currentAp).length;
    const totalUsers = this.users.length;

    const wifiEl = document.getElementById('stat-wifi-fallback-count');
    const lifiEl = document.getElementById('stat-lifi-primary-count');
    const badgeEl = document.getElementById('network-status-badge');
    const pillEl = document.getElementById('wifi-queue-pill');
    const barLiFi = document.getElementById('bar-lifi-active');
    const barWiFi = document.getElementById('bar-wifi-fallback');

    if (wifiEl) wifiEl.textContent = String(wifiCount);
    if (lifiEl) lifiEl.textContent = String(lifiCount);

    if (barLiFi && barWiFi) {
      const lifiPct = Math.round((lifiCount / totalUsers) * 100);
      const wifiPct = 100 - lifiPct;
      barLiFi.style.width = `${lifiPct}%`;
      barWiFi.style.width = `${wifiPct}%`;
    }

    if (badgeEl && pillEl) {
      if (wifiCount > 0) {
        badgeEl.textContent = `WI-FI FALLBACK ACTIVE (${wifiCount})`;
        badgeEl.className = 'text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse';
        pillEl.textContent = `${wifiCount} USERS ON RF`;
        pillEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30';
      } else {
        badgeEl.textContent = 'ALL ON LI-FI (100%)';
        badgeEl.className = 'text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        pillEl.textContent = 'OPTICAL PRIMARY';
        pillEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      }
    }

    // Render AP meters into #ap-meters-container-sol4
    const metersContainer = document.getElementById('ap-meters-container-sol4');
    if (metersContainer) {
      let html = '';
      let totalCapacity = 0;
      let totalAssigned = 0;

      this.aps.forEach(ap => {
        if (ap.enabled) {
          totalCapacity += ap.maxCapacity;
          totalAssigned += ap.load;
        }
        const pct = ap.enabled ? Math.min(100, Math.round((ap.load / ap.maxCapacity) * 100)) : 0;

        let barColor = 'bg-blue-600';
        if (!ap.enabled) barColor = 'bg-slate-500';
        else if (ap.load >= ap.maxCapacity) barColor = 'bg-red-500 animate-pulse';
        else if (ap.load === ap.maxCapacity - 1) barColor = 'bg-amber-500';

        const statusText = ap.enabled ? `${ap.load}/${ap.maxCapacity}` : 'OFFLINE';

        html += `
          <div class="p-2 rounded-lg border ${ap.enabled ? 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/40' : 'border-red-500/30 bg-red-500/5'}">
            <div class="flex items-center justify-between text-[11px] mb-1">
              <span class="font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1">
                <span class="w-1.5 h-1.5 rounded-full ${ap.enabled ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                <span>AP-${ap.id + 1}</span>
              </span>
              <span class="font-mono text-[10px] ${ap.enabled ? (ap.load >= ap.maxCapacity ? 'text-red-500 font-bold' : 'text-slate-500') : 'text-red-400 font-bold'}">${statusText}</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
              <div class="${barColor} h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      });

      metersContainer.innerHTML = html;

      const satEl = document.getElementById('stat-network-saturation-sol4');
      if (satEl && totalCapacity > 0) {
        const satPct = Math.round((totalAssigned / totalCapacity) * 100);
        satEl.textContent = `${satPct}% Saturated`;
      }
    }
  }

  drawWifiRouter(ctx, isDark) {
    const rx = 500;
    const ry = 415;

    ctx.save();

    // 1. Concentric radio wave broadcast pulses
    const pulseCount = 3;
    const t = (Date.now() % 2400) / 2400;
    for (let i = 0; i < pulseCount; i++) {
      const p = (t + i / pulseCount) % 1;
      const radius = 22 + p * 55;
      const alpha = (1 - p) * 0.35;
      ctx.strokeStyle = isDark ? `rgba(245, 158, 11, ${alpha})` : `rgba(217, 119, 6, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Base Station Hub Body
    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(rx - 28, ry - 16, 56, 32, 8);
    ctx.fill();
    ctx.stroke();

    // Dual Antennas
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx - 16, ry - 16);
    ctx.lineTo(rx - 26, ry - 32);
    ctx.moveTo(rx + 16, ry - 16);
    ctx.lineTo(rx + 26, ry - 32);
    ctx.stroke();

    // Antenna Tips
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(rx - 26, ry - 32, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + 26, ry - 32, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Central Status Diode
    const wifiActive = this.users.some(u => u.isWifiFallback);
    ctx.fillStyle = wifiActive ? '#f59e0b' : '#38bdf8';
    ctx.shadowColor = wifiActive ? '#f59e0b' : '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.fill();

    // Router Label Pill
    ctx.shadowBlur = 0;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
    ctx.fillText('BACKUP WI-FI (RF)', rx, ry + 26);

    ctx.restore();
  }

  forceCongestion() {
    this.isCongestionForced = !this.isCongestionForced;
    const btnText = document.getElementById('btn-force-congestion-text');
    const panelBtn = document.getElementById('btn-panel-force-congestion');

    if (this.isCongestionForced) {
      // Drop AP Capacity to 3 (26 users into 18 slots -> guaranteed saturation!)
      this.setCapacityLimit(3);
      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = '3';

      // Spawn extra moving obstacles across walkways
      if (this.obstacles.length <= 6) {
        this.obstacles.push(
          new MovingObstacle(7, 400, 235, 32, 30, 2.5, 0, 'horizontal', 85),
          new MovingObstacle(8, 480, 565, 32, 30, -2.5, 0, 'horizontal', 90),
          new MovingObstacle(9, 285, 350, 30, 32, 0, 2.4, 'vertical', 85),
          new MovingObstacle(10, 685, 450, 30, 32, 0, -2.4, 'vertical', 85)
        );
      }

      if (btnText) btnText.textContent = 'Relieve Congestion';
      if (panelBtn) panelBtn.innerHTML = '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i><span>Relieve Congestion</span>';

      this.logEvent(
        '[FORCE CONGESTION ACTIVATED] AP capacity lowered to 3 users (Full Saturation) & extra obstacles deployed! Multiple optical paths blocked, forcing users onto Wi-Fi Fallback.',
        'threat'
      );
    } else {
      // Relieve Congestion: Expand AP capacity to 5
      this.setCapacityLimit(5);
      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = '5';

      // Remove extra obstacles
      if (this.obstacles.length > 6) {
        this.obstacles = this.obstacles.slice(0, 6);
      }

      if (btnText) btnText.textContent = 'Force Congestion';
      if (panelBtn) panelBtn.innerHTML = '<i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i><span>Force Congestion</span>';

      this.logEvent(
        '[CONGESTION RELIEVED] Capacity restored to 5 users/AP. Watch continuous self-healing instantly restore all users back to Green Li-Fi beams!',
        'system-info'
      );
    }

    lucide.createIcons();
    this.updateUI();
  }

  selfHealingRecovery() {
    this.isCongestionForced = false;
    this.setCapacityLimit(5);
    const sel = document.getElementById('select-capacity');
    if (sel) sel.value = '5';

    if (this.obstacles.length > 6) {
      this.obstacles = this.obstacles.slice(0, 6);
    }

    const btnText = document.getElementById('btn-force-congestion-text');
    if (btnText) btnText.textContent = 'Force Congestion';

    this.logEvent('[SELF-HEALING RECOVERY TRIGGERED] Expanding AP capacity and clearing path blockages.', 'system-info');
    this.updateUI();
  }

  // ==========================================================================
  // DYNAMIC BEAM SCHEDULING & LOAD BALANCING FSM
  // ==========================================================================

  updateBeamScheduling() {
    this.users.forEach(user => {
      if (user.threatTimer > 0) {
        user.threatTimer--;
        if (user.threatTimer === 0) {
          user.threatenedAp = null;
        }
      }

      if (user.handoverCooldown > 0) {
        user.handoverCooldown--;
      }

      // Smooth transition progress
      if (user.fadeProgress < 1.0) {
        user.fadeProgress = Math.min(1.0, user.fadeProgress + 0.05);
      }

      const currentAp = user.currentAp;

      if (currentAp !== null) {
        const isThreatened = this.isPathThreatened(user.pos, currentAp.pos);
        const isBlocked = this.isPathBlocked(user.pos, currentAp.pos);

        // In Reactive Mode (comparison), handover triggers ONLY when physically blocked
        const shouldTriggerHandover = this.reactiveModeOnly
          ? isBlocked
          : (isBlocked || (isThreatened && user.handoverCooldown === 0));

        if (shouldTriggerHandover) {
          // Imminent or active threat detected!
          user.threatenedAp = currentAp;
          user.threatTimer = 25; // Render thick Orange beam for 25 frames

          const handoverTarget = this.findCandidateAp(user, currentAp);

          if (handoverTarget !== null) {
            // Proactive Handover Success!
            const oldId = currentAp.id + 1;
            const newId = handoverTarget.id + 1;

            // Shift user
            const idx = currentAp.connectedUsers.indexOf(user);
            if (idx !== -1) currentAp.connectedUsers.splice(idx, 1);
            handoverTarget.connectedUsers.push(user);

            user.previousAp = currentAp;
            user.fadeProgress = 0.0;
            user.currentAp = handoverTarget;
            user.failedAp = null;
            user.isDropped = false;
            user.handoverCooldown = 28; // Hysteresis

            this.stats.proactiveHandovers++;
            this.stats.totalHandovers++;
            this.audio.playHandover();

            this.logEvent(
              `[PROACTIVE HANDOVER] User #U${user.id} handed over: AP-${oldId} → AP-${newId} ` +
              `| Target Load: ${handoverTarget.load}/${handoverTarget.maxCapacity} ` +
              `| Reason: Imminent Warning Zone Intersect`,
              'handover-proactive'
            );
          } else {
            // No alternate candidate available!
            if (isBlocked) {
              // Physical cut without backup: beam drops!
              const idx = currentAp.connectedUsers.indexOf(user);
              if (idx !== -1) currentAp.connectedUsers.splice(idx, 1);
              user.failedAp = currentAp;
              user.currentAp = null;
              user.isDropped = true;
              this.stats.physicalDrops++;
              this.audio.playDrop();

              this.logEvent(
                `[PHYSICAL CUT] User #U${user.id} beam occluded! All candidate APs at max capacity (${this.defaultCapacity}) or blocked.`,
                'drop-failure'
              );
            }
          }
        }
      } else {
        // Disconnected user trying to recover connection
        const recoveryTarget = this.findCandidateAp(user, null);
        if (recoveryTarget !== null) {
          recoveryTarget.connectedUsers.push(user);
          user.currentAp = recoveryTarget;
          user.isDropped = false;
          user.failedAp = null;
          this.logEvent(
            `[CONNECTION RESTORED] User #U${user.id} recovered beam with AP-${recoveryTarget.id + 1} (${recoveryTarget.load}/${recoveryTarget.maxCapacity})`,
            'system-info'
          );
        }
      }
    });

    // Check for Capacity Load Balancing overflows
    this.enforceLoadBalancingLimits();
  }

  enforceLoadBalancingLimits() {
    let rebalancedAny = false;
    this.aps.forEach(ap => {
      while (ap.load > ap.maxCapacity) {
        // Find furthest user to reallocate
        const excessUser = ap.connectedUsers.reduce((furthest, u) => {
          return ap.distanceTo(u.pos) > ap.distanceTo(furthest.pos) ? u : furthest;
        }, ap.connectedUsers[0]);

        const candidate = this.findCandidateAp(excessUser, ap);
        if (candidate !== null) {
          const idx = ap.connectedUsers.indexOf(excessUser);
          if (idx !== -1) ap.connectedUsers.splice(idx, 1);
          candidate.connectedUsers.push(excessUser);

          // Animate connection smoothly swinging from current AP to new candidate AP
          excessUser.previousAp = ap;
          excessUser.transitionProgress = 0.0;
          excessUser.currentAp = candidate;
          excessUser.isDropped = false;
          excessUser.failedAp = null;
          excessUser.overloadTimer = 0;

          this.stats.loadRedirects++;
          this.stats.totalHandovers++;
          rebalancedAny = true;
          this.audio.playHandover();

          this.logEvent(
            `[LOAD BALANCING] AP-${ap.id + 1} capacity exceeded! Redirected User #U${excessUser.id} to AP-${candidate.id + 1} (${candidate.load}/${candidate.maxCapacity})`,
            'load-balance'
          );
        } else {
          // Hard limit reached! All APs are at capacity limit
          const idx = ap.connectedUsers.indexOf(excessUser);
          if (idx !== -1) ap.connectedUsers.splice(idx, 1);

          if (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4') {
            excessUser.isWifiFallback = true;
            excessUser.assignedApBeforeWifi = ap;
            excessUser.previousAp = ap;
            excessUser.currentAp = null;
            excessUser.isDropped = false;
            this.stats.totalHandovers++;
            this.audio.playThreat();
            this.logEvent(
              `[WI-FI FALLBACK] User #U${excessUser.id} shifted to central Wi-Fi backup due to complete AP saturation.`,
              'threat'
            );
            rebalancedAny = true;
            break;
          }

          excessUser.failedAp = ap;
          excessUser.previousAp = ap;
          excessUser.currentAp = null;
          excessUser.isDropped = true;
          this.stats.physicalDrops++;
          rebalancedAny = true;
          this.audio.playDrop();

          this.logEvent(
            `[HARD LIMIT REACHED] User #U${excessUser.id} rejected! All available Access Points saturated at max capacity (${this.defaultCapacity} users/AP).`,
            'drop-failure'
          );
          break; // Cannot reallocate further without dropping
        }
      }
    });

    if (rebalancedAny) {
      this.updateUI();
    }
  }

  reconnectDroppedUsers() {
    let reconnectedAny = false;
    this.users.forEach(user => {
      if (user.isDropped || !user.currentAp) {
        const candidate = this.findCandidateAp(user, null);
        if (candidate !== null) {
          candidate.connectedUsers.push(user);
          user.previousAp = user.failedAp || candidate;
          user.transitionProgress = 0.0;
          user.currentAp = candidate;
          user.isDropped = false;
          user.failedAp = null;
          user.overloadTimer = 0;
          reconnectedAny = true;
        }
      }
    });
    if (reconnectedAny) {
      this.audio.playHandover();
      this.updateUI();
    }
  }

  // ==========================================================================
  // SCENARIO PRESETS & INTERACTIVE TRIGGERS
  // ==========================================================================

  triggerAP2Overload() {
    const ap2 = this.aps[1]; // AP-2 (North Central)
    this.logEvent(`[BURST SIMULATION] Inducing sudden overload burst surge on AP-2...`, 'load-balance');
    
    // Select users from Table 3 (Center Hub) and force them into AP-2
    const hubUsers = this.users.filter(u => u.tableId === 3);
    hubUsers.forEach(u => {
      if (u.currentAp && u.currentAp !== ap2) {
        const idx = u.currentAp.connectedUsers.indexOf(u);
        if (idx !== -1) u.currentAp.connectedUsers.splice(idx, 1);
      }
      if (!ap2.connectedUsers.includes(u)) {
        ap2.connectedUsers.push(u);
      }
      u.previousAp = u.currentAp || ap2;
      u.currentAp = ap2;
      u.isDropped = false;
      u.failedAp = null;
      u.overloadTimer = 45; // Visual red overload burst warning for ~0.75s
      u.transitionProgress = 0.0;
    });

    this.audio.playThreat();
    this.updateUI();

    // After 700ms, trigger load balancing to dynamically redirect excess users to nearest available APs
    setTimeout(() => {
      this.enforceLoadBalancingLimits();
      this.updateUI();
    }, 700);
  }

  triggerRebalanceAll() {
    this.logEvent(`[OPTIMIZATION] Calculating optimal network load distribution across all 6 APs...`, 'system-info');
    this.aps.forEach(ap => ap.connectedUsers = []);
    this.users.forEach(u => {
      u.previousAp = u.currentAp || u.failedAp;
      u.transitionProgress = 0.0;
      u.currentAp = null;
      u.isDropped = false;
      u.failedAp = null;
      u.threatTimer = 0;
      u.overloadTimer = 0;
    });
    this.performInitialAssociation();
    this.updateUI();
    this.audio.playHandover();
  }

  setCapacityLimit(newCap) {
    this.defaultCapacity = parseInt(newCap, 10);
    this.aps.forEach(ap => ap.maxCapacity = this.defaultCapacity);
    this.reconnectDroppedUsers();
    this.enforceLoadBalancingLimits();
    this.logEvent(`[CAPACITY UPDATE] Access Point capacity ceiling updated to ${newCap} users/AP.`, 'system-info');
    this.updateUI();
  }

  triggerFastCrossing() {
    this.accelerateObstacle(1);
  }

  accelerateObstacle(id = 1) {
    const obs = this.obstacles.find(o => o.id === id) || this.obstacles[0];
    if (!obs) return;
    if (obs.isStopped) obs.toggleStop();
    const oldVx = obs.vx;
    const oldVy = obs.vy;
    obs.vx = (obs.vx !== 0 ? Math.sign(obs.vx) : 1) * 4.2;
    obs.vy = (obs.vy !== 0 ? Math.sign(obs.vy) : 1) * (obs.laneType === 'vertical' ? 4.2 : 0);
    this.logEvent(`[ACCELERATE] Obstacle #${obs.id} velocity boosted to (${obs.vx.toFixed(1)}, ${obs.vy.toFixed(1)}). Watch imminent LoS queuing and instant execution!`, 'handover-proactive');
    setTimeout(() => {
      obs.vx = obs.baseVx;
      obs.vy = obs.baseVy;
    }, 3500);
  }

  invertObstacleTrajectories() {
    this.obstacles.forEach(obs => {
      obs.invertDirection();
    });
    this.logEvent(`[TRAJECTORY INVERTED] Obstacle trajectories reversed! Any queued handover whose trajectory no longer threatens the beam is instantly canceled.`, 'system-info');
    this.updateUI();
  }

  toggleStopObstacle(id = 1) {
    const obs = this.obstacles.find(o => o.id === id) || this.obstacles[0];
    if (!obs) return;
    obs.toggleStop();
    const stopBtnText = document.getElementById('btn-panel-stop-text');
    if (stopBtnText) {
      stopBtnText.textContent = obs.isStopped ? 'Resume Obstacle' : 'Stop Obstacle';
    }
    this.logEvent(
      obs.isStopped
        ? `[OBSTACLE HALTED] Obstacle #${obs.id} stopped! Queued handover canceled; original connection to AP preserved intact.`
        : `[OBSTACLE RESUMED] Obstacle #${obs.id} resumed movement at (${obs.vx.toFixed(1)}, ${obs.vy.toFixed(1)}).`,
      obs.isStopped ? 'system-info' : 'handover-proactive'
    );
    this.updateUI();
  }

  triggerSlowMotion() {
    this.speedMultiplier = 0.25;
    const speedSlider = document.getElementById('slider-speed');
    const speedLabel = document.getElementById('label-speed');
    if (speedSlider) speedSlider.value = 0.25;
    if (speedLabel) speedLabel.textContent = '0.25x';
    this.logEvent(`[SLOW-MOTION] Simulation scaled to 0.25x speed for frame-by-frame beam inspection.`, 'system-info');
  }

  toggleAP(apIndex) {
    const ap = this.aps[apIndex];
    if (!ap) return;
    ap.enabled = !ap.enabled;

    if (!ap.enabled) {
      this.logEvent(`[AP TOGGLE] AP-${ap.id + 1} switched OFFLINE. Evicting users to neighbor APs...`, 'drop-failure');
      const evictUsers = [...ap.connectedUsers];
      ap.connectedUsers = [];

      evictUsers.forEach(user => {
        user.currentAp = null;
        const candidate = this.findCandidateAp(user, ap);
        if (candidate) {
          candidate.connectedUsers.push(user);
          user.currentAp = candidate;
          user.previousAp = ap;
          user.fadeProgress = 0.0;
          this.stats.loadRedirects++;
          this.stats.totalHandovers++;
        } else {
          user.isDropped = true;
          user.failedAp = ap;
          this.stats.physicalDrops++;
        }
      });
      this.audio.playDrop();
    } else {
      this.logEvent(`[AP TOGGLE] AP-${ap.id + 1} restored ONLINE. Rebalancing network...`, 'system-info');
      this.audio.playTone(587.33, 'sine', 0.1, 0.05);
      // Try restoring dropped users
      this.users.forEach(user => {
        if (!user.currentAp) {
          const candidate = this.findCandidateAp(user, null);
          if (candidate) {
            candidate.connectedUsers.push(user);
            user.currentAp = candidate;
            user.isDropped = false;
            user.failedAp = null;
          }
        }
      });
      this.enforceLoadBalancingLimits();
    }

    this.updateUI();
  }

  toggleProactiveVsReactive() {
    this.reactiveModeOnly = !this.reactiveModeOnly;
    this.logEvent(
      `[MODE TOGGLE] Handover algorithm switched to: ${this.reactiveModeOnly ? 'REACTIVE (Wait for Cut)' : 'PROACTIVE (Predictive Warning Zone)'}`,
      this.reactiveModeOnly ? 'drop-failure' : 'handover-proactive'
    );
    this.updateUI();
  }

  resetSimulation() {
    this.stats.proactiveHandovers = 0;
    this.stats.loadRedirects = 0;
    this.stats.physicalDrops = 0;
    this.stats.totalHandovers = 0;
    this.stats.simTimeSeconds = 0;
    this.aps.forEach(ap => ap.enabled = true);
    this.initObstacles();
    this.performInitialAssociation();
    this.logEvent(`[SYSTEM RESET] Entity positions and network telemetry cleared.`, 'system-info');
    this.updateUI();
  }

  stepForward() {
    if (!this.isPaused) return;
    this.updatePhysics(1.0);
    if (this.activeSolution === 'predictive' || this.activeSolution === 'solution-2') {
      this.updatePredictiveCameraSystem(1.0);
    } else {
      this.updateBeamScheduling();
    }
    this.render();
    this.updateUI();
  }

  // ==========================================================================
  // RENDERING PIPELINE (60 FPS CANVAS)
  // ==========================================================================

  render() {
    const ctx = this.ctx;
    const isDark = document.documentElement.classList.contains('dark');

    ctx.clearRect(0, 0, this.nativeWidth, this.nativeHeight);

    // 1. Draw Library Floor & Grid
    this.drawFloorPlan(ctx, isDark);

    // SOLUTION 1 VIEW: Load Balancing & Overload Redirection
    // ONLY REMOVE THE OBSTACLES (No moving obstacles, no bookshelves, no pillars).
    // KEEP THE TABLES AND LANES AND THE GRID AS IT WAS BEFORE.
    if (this.activeSolution === 'load-balance' || this.activeSolution === 'solution-1') {
      this.drawLanes(ctx, isDark);
      this.drawTables(ctx, isDark);
      this.drawLiFiBeams(ctx, isDark);
      this.drawUsers(ctx, isDark);
      this.drawAccessPoints(ctx, isDark);
      return;
    }

    // SOLUTION 2 VIEW: Proactive Obstacle Sensing & Predictive Handover
    // Displays Access Points (Blue circles), Users (green circles), predefined movement lanes,
    // and Dynamically Moving Obstacles (Red Triangles).
    // Visually place Camera icons/nodes at the intersections of the predefined lanes.
    if (this.activeSolution === 'predictive' || this.activeSolution === 'solution-2') {
      this.drawLanes(ctx, isDark);
      this.drawTables(ctx, isDark);
      this.drawCameraTracking(ctx, isDark);
      this.drawLiFiBeams(ctx, isDark);
      this.drawObstacles(ctx, isDark);
      this.drawCameraNodes(ctx, isDark);
      this.drawUsers(ctx, isDark);
      this.drawAccessPoints(ctx, isDark);
      return;
    }

    // SOLUTION 3 VIEW: Optical Beam Steering (Zero Handover)
    // Displays Access Points (Blue circles), Users (green circles), predefined movement lanes,
    // and Dynamically Moving Obstacles (Red Triangles - NO warning zones).
    // Visually place Camera icons/nodes at the intersections of the predefined lanes.
    if (this.activeSolution === 'beam-steering' || this.activeSolution === 'solution-3') {
      this.drawLanes(ctx, isDark);
      this.drawTables(ctx, isDark);
      this.drawCameraTracking(ctx, isDark);
      this.drawLiFiBeams(ctx, isDark);
      this.drawObstacles(ctx, isDark);
      this.drawCameraNodes(ctx, isDark);
      this.drawUsers(ctx, isDark);
      this.drawAccessPoints(ctx, isDark);
      return;
    }

    // SOLUTION 4 VIEW: Complete Congestion & Wi-Fi Fallback (Occlusion Recovery)
    // Displays Access Points (Blue circles), Users (green circles), predefined movement lanes,
    // Central Wi-Fi Router node at (500, 415), Dynamically Moving Obstacles (Red Triangles),
    // and Camera icons/nodes at lane intersections.
    if (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4') {
      this.drawLanes(ctx, isDark);
      this.drawTables(ctx, isDark);
      this.drawCameraTracking(ctx, isDark);
      this.drawWifiRouter(ctx, isDark);
      this.drawLiFiBeams(ctx, isDark);
      this.drawObstacles(ctx, isDark);
      this.drawCameraNodes(ctx, isDark);
      this.drawUsers(ctx, isDark);
      this.drawAccessPoints(ctx, isDark);
      return;
    }

    // Other Solutions: Draw full library environment with shelves, tables, lanes, and obstacles
    this.drawLanes(ctx, isDark);
    this.drawTablesAndShelves(ctx, isDark);
    this.drawLiFiBeams(ctx, isDark);
    this.drawObstacles(ctx, isDark);
    this.drawUsers(ctx, isDark);
    this.drawAccessPoints(ctx, isDark);
  }

  drawFloorPlan(ctx, isDark) {
    // Floor Background
    ctx.fillStyle = isDark ? '#0b1120' : '#f8fafc';
    ctx.fillRect(0, 0, this.nativeWidth, this.nativeHeight);

    if (this.showGrid) {
      ctx.strokeStyle = isDark ? '#141d2f' : '#e2e8f0';
      ctx.lineWidth = 1;
      const step = 40;

      ctx.beginPath();
      for (let x = 0; x <= this.nativeWidth; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.nativeHeight);
      }
      for (let y = 0; y <= this.nativeHeight; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.nativeWidth, y);
      }
      ctx.stroke();
    }
  }

  drawLanes(ctx, isDark) {
    this.lanes.forEach(lane => {
      ctx.fillStyle = isDark ? '#111827' : '#eef2f6';
      ctx.fillRect(lane.x, lane.y, lane.w, lane.h);

      ctx.strokeStyle = isDark ? '#1e293b' : '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(lane.x, lane.y, lane.w, lane.h);

      // Dashed lane divider
      ctx.save();
      ctx.strokeStyle = isDark ? '#233249' : '#cbd5e1';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (lane.type === 'horizontal') {
        const cy = lane.y + lane.h / 2;
        ctx.moveTo(lane.x, cy);
        ctx.lineTo(lane.x + lane.w, cy);
      } else {
        const cx = lane.x + lane.w / 2;
        ctx.moveTo(cx, lane.y);
        ctx.lineTo(cx, lane.y + lane.h);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  drawShelvesAndPillars(ctx, isDark) {
    // Stationary Bookshelves & Pillars (Obstacles)
    this.stationaryObstacles.forEach(obs => {
      if (obs.type === 'bookshelf') {
        ctx.fillStyle = isDark ? '#1c1917' : '#334155';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = isDark ? '#44403c' : '#1e293b';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Bookshelf internal book ridges
        ctx.fillStyle = isDark ? '#292524' : '#475569';
        const isHoriz = obs.w > obs.h;
        if (isHoriz) {
          for (let x = obs.x + 8; x < obs.x + obs.w - 8; x += 14) {
            ctx.fillRect(x, obs.y + 3, 6, obs.h - 6);
          }
        } else {
          for (let y = obs.y + 8; y < obs.y + obs.h - 8; y += 14) {
            ctx.fillRect(obs.x + 3, y, obs.w - 6, 6);
          }
        }

        // Label
        ctx.font = '10px "Inter", sans-serif';
        ctx.fillStyle = isDark ? '#a8a29e' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(obs.label, obs.x + obs.w / 2, obs.y + obs.h / 2 + 3);
      } else {
        // Architectural Pillar
        ctx.fillStyle = isDark ? '#1e293b' : '#64748b';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = isDark ? '#334155' : '#475569';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        ctx.font = '9px "Inter", sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText('PILLAR', obs.x + obs.w / 2, obs.y + obs.h / 2 + 3);
      }
    });
  }

  drawTables(ctx, isDark) {
    // 5 Library Study Tables
    this.tables.forEach(table => {
      ctx.fillStyle = isDark ? '#1a2234' : '#e2e8f0';
      ctx.fillRect(table.x, table.y, table.w, table.h);
      ctx.strokeStyle = isDark ? '#2e3d5b' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(table.x, table.y, table.w, table.h);

      // Table name tag
      ctx.font = '11px "Inter", sans-serif';
      ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      ctx.textAlign = 'center';
      ctx.fillText(table.name, table.x + table.w / 2, table.y + table.h / 2 + 4);
    });
  }

  drawTablesAndShelves(ctx, isDark) {
    this.drawShelvesAndPillars(ctx, isDark);
    this.drawTables(ctx, isDark);
  }

  drawLiFiBeams(ctx, isDark) {
    ctx.save();

    const isSolution1 = (this.activeSolution === 'load-balance' || this.activeSolution === 'solution-1');

    if (isSolution1) {
      // SOLUTION 1 SPECIFIC BEAM ANIMATION:
      // The only things that should be moving are the connections when overloading occurs.
      // Green for active LoS, Red if testing hard limits or dropped.
      this.users.forEach(user => {
        // Progress animated connection switching
        if (user.transitionProgress < 1.0) {
          user.transitionProgress = Math.min(1.0, user.transitionProgress + 0.025 * (this.isPaused ? 0 : this.speedMultiplier));
        }

        if (user.overloadTimer > 0) {
          user.overloadTimer--;
        }

        if (user.currentAp) {
          const t = Math.min(1.0, user.transitionProgress);
          // Ease in-out interpolation for natural swing
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          const srcX = (user.previousAp && t < 1.0)
            ? user.previousAp.x + (user.currentAp.x - user.previousAp.x) * ease
            : user.currentAp.x;
          const srcY = (user.previousAp && t < 1.0)
            ? user.previousAp.y + (user.currentAp.y - user.previousAp.y) * ease
            : user.currentAp.y;

          // Green for active, Red if testing overload burst
          if (user.overloadTimer > 0) {
            ctx.strokeStyle = '#ef4444';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 4.5;
          } else {
            ctx.strokeStyle = isDark ? '#4ade80' : '#22c55e';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = isDark ? 8 : 4;
            ctx.lineWidth = 3.5;
          }

          ctx.beginPath();
          ctx.moveTo(srcX, srcY);
          ctx.lineTo(user.x, user.y);
          ctx.stroke();

          // Animated sliding connection anchor node at ceiling during transition
          if (t < 1.0 && user.previousAp) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#4ade80';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(srcX, srcY, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (user.isDropped && user.failedAp) {
          // Hard limits testing: Red connection beam (rejected / dropped)
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 6;
          ctx.setLineDash([5, 4]);

          ctx.beginPath();
          ctx.moveTo(user.failedAp.x, user.failedAp.y);
          ctx.lineTo(user.x, user.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      ctx.restore();
      return; // No particles or obstacle-induced beams in Solution 1
    }

    const isSolution2 = (this.activeSolution === 'predictive' || this.activeSolution === 'solution-2');

    if (isSolution2) {
      // SOLUTION 2 SPECIFIC BEAM RENDERING:
      // Active LoS is bright Green.
      // If user is queued (threatened by obstacle): original beam pulses glowing Orange,
      // and target queued backup beam is previewed in Cyan.
      // Upon execution, beam switches to new AP in Green instantly!
      this.users.forEach(user => {
        if (user.currentAp) {
          if (user.isQueued) {
            // Threatened Beam: Glowing pulsing Orange
            const pulse = 0.65 + Math.sin(Date.now() * 0.015) * 0.35;
            ctx.strokeStyle = `rgba(249, 115, 22, ${pulse})`;
            ctx.lineWidth = 4.5;
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 12;

            ctx.beginPath();
            ctx.moveTo(user.currentAp.x, user.currentAp.y);
            ctx.lineTo(user.x, user.y);
            ctx.stroke();
          } else {
            // Active Stable Connection: Solid Crisp Green
            ctx.strokeStyle = isDark ? '#4ade80' : '#22c55e';
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = isDark ? 8 : 4;

            ctx.beginPath();
            ctx.moveTo(user.currentAp.x, user.currentAp.y);
            ctx.lineTo(user.x, user.y);
            ctx.stroke();
          }
        } else if (user.isDropped && user.failedAp) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(user.failedAp.x, user.failedAp.y);
          ctx.lineTo(user.x, user.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      ctx.restore();
      return;
    }

    const isSolution3 = (this.activeSolution === 'beam-steering' || this.activeSolution === 'solution-3');
    if (isSolution3) {
      // SOLUTION 3 SPECIFIC BEAM RENDERING:
      // Active Green Beams dynamically bend/arc around obstacle coordinates using a Quadratic Bezier Curve.
      // Connection to original Access Point remains 100% intact with zero handover!
      this.users.forEach(user => {
        if (!user.currentAp) return;

        const ap = user.currentAp;
        const isCurved = user.isBeingSteered && user.steerCpX !== null && user.steerCpY !== null;

        ctx.strokeStyle = isDark ? '#4ade80' : '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.lineWidth = isCurved ? 4.5 : 3.5;
        ctx.shadowBlur = isCurved ? 12 : (isDark ? 8 : 4);

        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y);
        if (isCurved) {
          ctx.quadraticCurveTo(user.steerCpX, user.steerCpY, user.x, user.y);
        } else {
          ctx.lineTo(user.x, user.y);
        }
        ctx.stroke();

        // If dynamically steered, render subtle optical diffraction wavefront envelope
        if (isCurved && Math.abs(user.currentCurvature) > 8) {
          ctx.strokeStyle = isDark ? 'rgba(74, 222, 128, 0.35)' : 'rgba(34, 197, 94, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.quadraticCurveTo(user.steerCpX, user.steerCpY, user.x, user.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Phase shift badge at curved control apex
          ctx.fillStyle = isDark ? '#86efac' : '#15803d';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(`Δφ:${Math.round(user.activePhaseShift)}°`, user.steerCpX + 6, user.steerCpY - 4);
        }
      });

      ctx.restore();
      return;
    }

    const isSolution4 = (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4');
    if (isSolution4) {
      // SOLUTION 4 SPECIFIC BEAM RENDERING:
      // Active Li-Fi users: solid Green beam to current AP.
      // Wi-Fi Fallback users: thin GREY line to the central Wi-Fi Router at (500, 415),
      // with subtle data pulses and "WI-FI RF" tag.
      const wifiRouterPos = { x: 500, y: 415 };

      this.users.forEach(user => {
        if (user.isWifiFallback) {
          // THIN GREY LINE to Wi-Fi Router
          ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
          ctx.shadowColor = isDark ? '#94a3b8' : '#64748b';
          ctx.shadowBlur = 4;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);

          ctx.beginPath();
          ctx.moveTo(user.x, user.y);
          ctx.lineTo(wifiRouterPos.x, wifiRouterPos.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Animated RF signal wave packet travelling along the line
          const progress = (Date.now() * 0.0015 + user.id * 0.15) % 1.0;
          const packetX = user.x + (wifiRouterPos.x - user.x) * progress;
          const packetY = user.y + (wifiRouterPos.y - user.y) * progress;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(packetX, packetY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Small tag near user
          ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('WI-FI RF', (user.x + wifiRouterPos.x) / 2 - 15, (user.y + wifiRouterPos.y) / 2 - 4);
        } else if (user.currentAp) {
          // Solid Crisp Green Beam to AP
          ctx.strokeStyle = isDark ? '#4ade80' : '#22c55e';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#22c55e';
          ctx.shadowBlur = isDark ? 8 : 4;

          ctx.beginPath();
          ctx.moveTo(user.currentAp.x, user.currentAp.y);
          ctx.lineTo(user.x, user.y);
          ctx.stroke();
        }
      });

      ctx.restore();
      return;
    }

    // OTHER SOLUTIONS: Original Multi-State Beams & Particles
    // 1. Thick Orange Pulsing Beams (Imminent Threat Handover in progress)
    this.users.forEach(user => {
      if (user.threatTimer > 0 && user.threatenedAp) {
        const pulse = 0.6 + Math.sin(Date.now() * 0.02) * 0.4;
        ctx.strokeStyle = `rgba(249, 115, 22, ${pulse})`;
        ctx.lineWidth = 5;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(user.threatenedAp.x, user.threatenedAp.y);
        ctx.lineTo(user.x, user.y);
        ctx.stroke();
      }
    });

    // 2. Thick Green Beams (Active High-Speed Optical Transmission)
    this.users.forEach(user => {
      if (user.currentAp) {
        let alpha = 0.85;
        if (this.beamStyle === 'fade' && user.fadeProgress < 1.0) {
          alpha = user.fadeProgress;
        }

        ctx.strokeStyle = isDark ? `rgba(74, 222, 128, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = isDark ? 8 : 4;

        ctx.beginPath();
        ctx.moveTo(user.currentAp.x, user.currentAp.y);
        ctx.lineTo(user.x, user.y);
        ctx.stroke();

        // Draw previous AP fading out in 'fade' mode
        if (this.beamStyle === 'fade' && user.previousAp && user.fadeProgress < 1.0) {
          const fadeOutAlpha = (1.0 - user.fadeProgress) * 0.8;
          ctx.strokeStyle = `rgba(249, 115, 22, ${fadeOutAlpha})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(user.previousAp.x, user.previousAp.y);
          ctx.lineTo(user.x, user.y);
          ctx.stroke();
        }
      }
    });

    // 3. Thin Red Beams (Physical Failure Shadows)
    this.users.forEach(user => {
      if (user.isDropped && user.failedAp) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 4;

        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(user.failedAp.x, user.failedAp.y);
        ctx.lineTo(user.x, user.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 4. Laser Photon Particles (if beamStyle === 'pulse')
    if (this.beamStyle === 'pulse' && !this.isPaused) {
      this.particles.forEach(p => {
        p.update();
        const pos = p.pos;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Spawn or replenish particles
      if (this.particles.length < this.users.length * 2) {
        const u = this.users[Math.floor(Math.random() * this.users.length)];
        if (u && u.currentAp) {
          this.particles.push(new BeamParticle(u.currentAp.x, u.currentAp.y, u.x, u.y, '#ffffff', 0.02 + Math.random() * 0.02));
        }
      }
      // Prune excess
      if (this.particles.length > 80) this.particles.shift();
    }

    ctx.restore();
  }

  drawObstacles(ctx, isDark) {
    this.obstacles.forEach(obs => {
      // 1. Predictive Warning Zone (Detection Cone ahead of travel direction)
      // In Solution 2 & Solution 3, NO warning cones attached to obstacles!
      const isSolution2 = (this.activeSolution === 'predictive' || this.activeSolution === 'solution-2');
      const isSolution3 = (this.activeSolution === 'beam-steering' || this.activeSolution === 'solution-3');
      const isSolution4 = (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4');
      if (this.showZones && !isSolution2 && !isSolution3 && !isSolution4) {
        const poly = obs.getWarningZonePolygon();
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(251, 191, 36, 0.25)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);

        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 2. Moving Obstacle: Red Triangle (Walking Patron)
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const angle = obs.heading;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Red Triangle oriented forward
      const size = Math.max(obs.w, obs.h) * 0.65;
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.moveTo(size, 0);                 // Front tip
      ctx.lineTo(-size * 0.8, -size * 0.7); // Back left
      ctx.lineTo(-size * 0.5, 0);           // Inward rear indent
      ctx.lineTo(-size * 0.8, size * 0.7);  // Back right
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // White center indicator dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  drawUsers(ctx, isDark) {
    this.users.forEach(user => {
      const radius = 8;
      ctx.save();

      // Halo/glow if threatened, dropped, or on Wi-Fi fallback
      if (user.isWifiFallback) {
        ctx.fillStyle = '#16a34a';
        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 6;
      } else if (user.isDropped) {
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#991b1b';
      } else if (user.threatTimer > 0) {
        ctx.fillStyle = '#f97316';
        ctx.strokeStyle = '#c2410c';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = '#16a34a';
        ctx.strokeStyle = '#15803d';
      }

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(user.x, user.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // User Label
      ctx.font = 'bold 8px "Inter", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`U${user.id}`, user.x, user.y + 3);

      ctx.restore();
    });
  }

  drawAccessPoints(ctx, isDark) {
    this.aps.forEach(ap => {
      if (!ap.enabled) {
        // Disabled / Offline Access Point visual
        ctx.save();
        ctx.fillStyle = isDark ? '#1e293b' : '#cbd5e1';
        ctx.strokeStyle = isDark ? '#ef4444' : '#dc2626';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Strikethrough / X
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ap.x - 7, ap.y - 7);
        ctx.lineTo(ap.x + 7, ap.y + 7);
        ctx.moveTo(ap.x + 7, ap.y - 7);
        ctx.lineTo(ap.x - 7, ap.y + 7);
        ctx.stroke();

        // Offline Badge
        const badgeText = `AP-${ap.id + 1} [OFFLINE]`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(badgeText).width;
        const badgeW = textWidth + 12;
        const badgeH = 18;
        const badgeX = ap.x - badgeW / 2;
        const badgeY = ap.y - ap.radius - 22;

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, ap.x, badgeY + 12);
        ctx.restore();
        return;
      }

      const isFull = ap.isFull;
      const isNearFull = ap.load === ap.maxCapacity - 1;

      // 1. Radio / Optical beacon pulse glow
      const pulseRadius = ap.radius + 8 + Math.sin(ap.pulsePhase) * 4;
      ap.pulsePhase += 0.04;

      ctx.save();
      const glowColor = isFull
        ? 'rgba(239, 68, 68, 0.25)'
        : (isNearFull ? 'rgba(245, 158, 11, 0.25)' : 'rgba(37, 99, 235, 0.25)');

      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Distinct Royal Blue Circle (Access Point ceiling node)
      ctx.fillStyle = isFull ? '#dc2626' : (isNearFull ? '#d97706' : '#2563eb');
      ctx.strokeStyle = isDark ? '#93c5fd' : '#1d4ed8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#2563eb';
      ctx.shadowBlur = isDark ? 10 : 4;

      ctx.beginPath();
      ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3. Inner White Optical Diode
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // 4. Capacity Badge Label (e.g. "AP-1: 2/3")
      const badgeText = `AP-${ap.id + 1} [${ap.load}/${ap.maxCapacity}]`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(badgeText).width;
      const badgeW = textWidth + 12;
      const badgeH = 18;
      const badgeX = ap.x - badgeW / 2;
      const badgeY = ap.y - ap.radius - 22;

      ctx.fillStyle = isFull ? '#ef4444' : (isNearFull ? '#f59e0b' : '#1e40af');
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, ap.x, badgeY + 12);

      ctx.restore();
    });
  }

  drawCameraNodes(ctx, isDark) {
    if (!this.cameras) return;

    this.cameras.forEach(cam => {
      ctx.save();
      const x = cam.x;
      const y = cam.y;

      // 1. Octagonal / Diamond Mounting Bracket on floor/ceiling intersection
      ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
      ctx.strokeStyle = cam.status === 'TRACKING' ? '#38bdf8' : (isDark ? '#334155' : '#cbd5e1');
      ctx.lineWidth = 2;
      ctx.shadowColor = cam.status === 'TRACKING' ? '#38bdf8' : 'transparent';
      ctx.shadowBlur = cam.status === 'TRACKING' ? 8 : 0;

      const dSize = 16;
      ctx.beginPath();
      ctx.moveTo(x, y - dSize);
      ctx.lineTo(x + dSize, y);
      ctx.lineTo(x, y + dSize);
      ctx.lineTo(x - dSize, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 2. Camera Dome Housing
      ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3. Rotating Optical Camera Turret / Lens
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(cam.scanAngle);

      // Camera lens barrel
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(3, -2.5, 7, 5);

      // Lens optical element
      ctx.fillStyle = cam.status === 'TRACKING' ? '#22c55e' : '#38bdf8';
      ctx.shadowColor = cam.status === 'TRACKING' ? '#22c55e' : '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Center sensor diode
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      // 4. Camera Identifier Badge
      const camLabel = `CAM-${cam.id}`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const tw = ctx.measureText(camLabel).width;
      const bw = tw + 8;
      const bh = 14;
      const bx = x - bw / 2;
      const by = y - 24;

      ctx.fillStyle = isDark ? '#0f172a' : '#1e293b';
      ctx.strokeStyle = cam.status === 'TRACKING' ? '#38bdf8' : '#64748b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = cam.status === 'TRACKING' ? '#38bdf8' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(camLabel, x, by + 10);

      ctx.restore();
    });
  }

  drawCameraTracking(ctx, isDark) {
    if (!this.cameras) return;

    // 1. Draw Tracking Ray from camera to tracked obstacle
    this.cameras.forEach(cam => {
      if (cam.status === 'TRACKING' && cam.trackedObstacle) {
        const obs = cam.trackedObstacle;
        const ocx = obs.x + obs.w / 2;
        const ocy = obs.y + obs.h / 2;

        ctx.save();
        // Cyan tracking laser line
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(ocx, ocy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Small target reticle at obstacle center
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x - 2, obs.y - 2, obs.w + 4, obs.h + 4);

        // Coordinates & Velocity Tag
        const coordText = `[${Math.round(ocx)}, ${Math.round(ocy)}] (${obs.vx.toFixed(1)}, ${obs.vy.toFixed(1)})`;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText(coordText, ocx, obs.y - 8);

        ctx.restore();
      }
    });

    // 2. Draw Trajectory Vectors for moving obstacles
    this.obstacles.forEach(obs => {
      if (obs.isStopped) return;
      const ocx = obs.x + obs.w / 2;
      const ocy = obs.y + obs.h / 2;
      const heading = obs.heading;
      const fDist = 140;

      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ocx, ocy);
      ctx.lineTo(ocx + Math.cos(heading) * fDist, ocy + Math.sin(heading) * fDist);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // 3. Draw Queued Handover Previews (Dashed Cyan beam to target AP & Intercept crosshair)
    this.users.forEach(user => {
      if (user.isQueued && user.queuedTargetAp) {
        ctx.save();

        // Dashed Cyan Predictive Queuing Beam
        ctx.strokeStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);

        ctx.beginPath();
        ctx.moveTo(user.x, user.y);
        ctx.lineTo(user.queuedTargetAp.x, user.queuedTargetAp.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pulsing backup target badge at target AP
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(user.queuedTargetAp.x, user.queuedTargetAp.y, user.queuedTargetAp.radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        const qText = `QUEUED FOR U${user.id}`;
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.textAlign = 'center';
        ctx.fillText(qText, user.queuedTargetAp.x, user.queuedTargetAp.y + user.queuedTargetAp.radius + 16);

        // Target Crosshairs at Predicted Intercept Point
        if (user.predictedInterceptPoint) {
          const ix = user.predictedInterceptPoint.x;
          const iy = user.predictedInterceptPoint.y;

          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 10;

          // Crosshair circle
          ctx.beginPath();
          ctx.arc(ix, iy, 9, 0, Math.PI * 2);
          ctx.stroke();

          // Crosshair tick marks
          ctx.beginPath();
          ctx.moveTo(ix - 13, iy);
          ctx.lineTo(ix + 13, iy);
          ctx.moveTo(ix, iy - 13);
          ctx.lineTo(ix, iy + 13);
          ctx.stroke();

          // Intercept distance text
          ctx.fillStyle = '#f97316';
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.fillText(`INTERCEPT: ${Math.round(user.predictedInterceptDistance)}px`, ix, iy - 14);
        }

        ctx.restore();
      }
    });
  }

  // ==========================================================================
  // MAIN ANIMATION & UPDATE LOOP
  // ==========================================================================

  loop(timestamp) {
    const dt = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    this.frameCount++;
    if (this.frameCount % 30 === 0) {
      this.fps = Math.round(1 / dt) || 60;
      const fpsEl = document.getElementById('canvas-fps-badge');
      if (fpsEl) fpsEl.textContent = `${this.fps} FPS`;
    }

    if (!this.isPaused) {
      this.stats.simTimeSeconds += dt;
      this.updatePhysics(this.speedMultiplier);
      if (this.activeSolution === 'predictive' || this.activeSolution === 'solution-2') {
        this.updatePredictiveCameraSystem(this.speedMultiplier);
      } else if (this.activeSolution === 'beam-steering' || this.activeSolution === 'solution-3') {
        this.updateDynamicBeamSteering(this.speedMultiplier);
      } else if (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4') {
        this.updateFailSafeRecovery(this.speedMultiplier);
      } else {
        this.updateBeamScheduling();
      }
    }

    this.render();
    if (this.activeSolution === 'beam-steering' || this.activeSolution === 'solution-3') {
      this.renderSLMPhasePattern(dt);
    } else if (this.activeSolution === 'fail-safe' || this.activeSolution === 'solution-4') {
      this.updateNetworkStatusPanel();
    }
    this.updateHUD();

    requestAnimationFrame((t) => this.loop(t));
  }

  // ==========================================================================
  // REAL-TIME SLM PHASE COMPUTATION & DYNAMIC GRAYSCALE HOLOGRAM
  // ==========================================================================

  renderSLMPhasePattern(dt = 0.016) {
    const canvas = document.getElementById('slmCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!this.slmOffscreenCanvas) {
      this.slmOffscreenCanvas = document.createElement('canvas');
      this.slmOffscreenCanvas.width = 56;
      this.slmOffscreenCanvas.height = 52;
      this.slmOffscreenCtx = this.slmOffscreenCanvas.getContext('2d');
      this.slmImageData = this.slmOffscreenCtx.createImageData(56, 52);
      this.slmPhaseTime = 0;
    }

    // Find user with maximum active phase shift
    let maxUser = null;
    let maxShift = 0;
    this.users.forEach(u => {
      if (u.activePhaseShift > maxShift) {
        maxShift = u.activePhaseShift;
        maxUser = u;
      }
    });

    const isSteering = maxUser && maxUser.isBeingSteered && maxShift > 1.0;
    const thetaDeg = isSteering ? maxUser.deflectionAngle : 0;
    const shiftDeg = isSteering ? maxUser.activePhaseShift : 0;
    const thetaRad = thetaDeg * Math.PI / 180;

    // Advance phase time: moves much faster when actively steering
    const phaseSpeed = isSteering ? (2.8 + (shiftDeg / 15) * 4.5) : 0.9;
    this.slmPhaseTime += (this.isPaused ? 0 : dt) * phaseSpeed * this.speedMultiplier;

    // Grayscale holographic interference pattern generation:
    // I(x, y) = 128 + 127 * cos(kx * x + ky * y + phaseTime + quad * r^2)
    const imgData = this.slmImageData;
    const data = imgData.data;
    const w = 56;
    const h = 52;
    const cx = w / 2;
    const cy = h / 2;

    // Modulation wavevector: rotates and tilts with the deflection angle!
    const baseFreq = isSteering ? (0.35 + (thetaDeg / 30) * 0.45) : 0.28;
    const kx = Math.cos(thetaRad) * baseFreq;
    const ky = Math.sin(thetaRad) * baseFreq;
    const quad = isSteering ? 0.008 : 0.004;

    let idx = 0;
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const r2 = dx * dx + dy * dy;
        const phase = kx * dx + ky * dy + this.slmPhaseTime + quad * r2;
        // Grayscale intensity [0, 255]
        const intensity = Math.floor(128 + 127 * Math.cos(phase));

        data[idx] = intensity;     // R
        data[idx + 1] = intensity; // G
        data[idx + 2] = intensity; // B
        data[idx + 3] = 255;       // Alpha
        idx += 4;
      }
    }

    this.slmOffscreenCtx.putImageData(imgData, 0, 0);

    // Upscale to SLM canvas with crisp smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.slmOffscreenCanvas, 0, 0, canvas.width, canvas.height);

    // Subtle optical holographic grid overlay & reticles
    ctx.save();
    // Dark radial vignette edge
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 70, canvas.width / 2, canvas.height / 2, 140);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center Crosshairs
    ctx.strokeStyle = isSteering ? 'rgba(74, 222, 128, 0.45)' : 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 15);
    ctx.lineTo(canvas.width / 2, canvas.height - 15);
    ctx.moveTo(15, canvas.height / 2);
    ctx.lineTo(canvas.width - 15, canvas.height / 2);
    ctx.stroke();

    // Concentric aperture rings
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 45, 0, Math.PI * 2);
    ctx.arc(canvas.width / 2, canvas.height / 2, 85, 0, Math.PI * 2);
    ctx.stroke();

    // If actively steering: draw dynamic phase gradient deflection vector arrow
    if (isSteering) {
      const arrowLen = 35 + (thetaDeg / 30) * 22;
      const ax = canvas.width / 2 + Math.cos(thetaRad) * arrowLen;
      const ay = canvas.height / 2 + Math.sin(thetaRad) * arrowLen;

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, canvas.height / 2);
      ctx.lineTo(ax, ay);
      ctx.stroke();

      // Arrowhead
      const headAngle = Math.PI / 6;
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8 * Math.cos(thetaRad - headAngle), ay - 8 * Math.sin(thetaRad - headAngle));
      ctx.lineTo(ax - 8 * Math.cos(thetaRad + headAngle), ay - 8 * Math.sin(thetaRad + headAngle));
      ctx.closePath();
      ctx.fill();

      // Label at vector
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.shadowBlur = 4;
      ctx.fillText(`+${thetaDeg.toFixed(1)}°`, ax + 5, ay - 3);
    }

    ctx.restore();
  }

  boostObstacles() {
    this.obstacles.forEach(o => {
      // Increase speed by 40% up to max limit
      o.vx = Math.sign(o.vx || 1) * Math.min(5.0, Math.max(1.8, Math.abs(o.vx) * 1.35));
      o.vy = Math.sign(o.vy || 1) * Math.min(5.0, Math.max(1.8, Math.abs(o.vy) * 1.35));
    });
    this.logEvent('[SLM SIMULATION] Obstacle velocity boosted. Dynamic beam steering active.', 'system-info');
  }

  updatePhysics(speedFactor) {
    // In Solution 1 (Load Balancing), there are ZERO obstacles and NO moving elements except the connection transitions
    if (this.activeSolution === 'load-balance' || this.activeSolution === 'solution-1') {
      return;
    }
    this.obstacles.forEach(obs => obs.update(speedFactor, this.nativeWidth, this.nativeHeight));
  }

  updateHUD() {
    // Timer display
    const mins = Math.floor(this.stats.simTimeSeconds / 60);
    const secs = (this.stats.simTimeSeconds % 60).toFixed(1);
    const timeEl = document.getElementById('canvas-sim-time');
    if (timeEl) {
      timeEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
    }
  }

  updateUI() {
    // Update KPI numbers
    const elConnected = document.getElementById('stat-connected-users');
    const elProactive = document.getElementById('stat-proactive-handovers');
    const elRedirects = document.getElementById('stat-load-redirects');
    const elDrops = document.getElementById('stat-physical-drops');

    const connectedCount = this.users.filter(u => u.currentAp !== null).length;
    if (elConnected) elConnected.textContent = `${connectedCount}/${this.users.length}`;
    if (elProactive) elProactive.textContent = this.stats.proactiveHandovers;
    if (elRedirects) elRedirects.textContent = this.stats.loadRedirects;
    if (elDrops) elDrops.textContent = this.stats.physicalDrops;

    // Update AP Meters Matrix
    const metersContainer = document.getElementById('ap-meters-container');
    if (metersContainer) {
      let html = '';
      let totalCapacity = 0;
      let totalAssigned = 0;

      this.aps.forEach(ap => {
        if (ap.enabled) {
          totalCapacity += ap.maxCapacity;
          totalAssigned += ap.load;
        }
        const pct = ap.enabled ? Math.min(100, Math.round((ap.load / ap.maxCapacity) * 100)) : 0;

        let barColor = 'bg-blue-600';
        if (!ap.enabled) barColor = 'bg-slate-500';
        else if (ap.load >= ap.maxCapacity) barColor = 'bg-red-500 animate-pulse';
        else if (ap.load === ap.maxCapacity - 1) barColor = 'bg-amber-500';

        const statusText = ap.enabled
          ? `${ap.load}/${ap.maxCapacity}`
          : 'OFFLINE';

        html += `
          <div class="p-2 rounded-lg border ${ap.enabled ? 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/40' : 'border-red-500/30 bg-red-500/5'} cursor-pointer hover:border-blue-500/60 transition" onclick="window.lifiApp && window.lifiApp.toggleAP(${ap.id})" title="Click to toggle AP-${ap.id + 1} on/off">
            <div class="flex items-center justify-between text-[11px] mb-1">
              <span class="font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1">
                <span class="w-1.5 h-1.5 rounded-full ${ap.enabled ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                <span>AP-${ap.id + 1}</span>
              </span>
              <span class="font-mono text-[10px] ${ap.enabled ? (ap.load >= ap.maxCapacity ? 'text-red-500 font-bold' : 'text-slate-500') : 'text-red-400 font-bold'}">${statusText}</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
              <div class="${barColor} h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      });

      metersContainer.innerHTML = html;

      const satEl = document.getElementById('stat-network-saturation');
      if (satEl) {
        if (totalCapacity > 0) {
          const satPct = Math.round((totalAssigned / totalCapacity) * 100);
          satEl.textContent = `${satPct}% Saturated`;
        } else {
          satEl.textContent = `All APs Offline`;
        }
      }
    }

    // Update AP Toggle Buttons in Toolbar
    const toggleBtns = document.querySelectorAll('.ap-toggle-btn');
    toggleBtns.forEach(btn => {
      const apIdx = parseInt(btn.getAttribute('data-ap'), 10);
      const ap = this.aps[apIdx];
      if (ap) {
        if (ap.enabled) {
          btn.className = 'ap-toggle-btn px-2 py-1 rounded text-[11px] font-mono font-bold transition bg-blue-600 text-white shadow-sm hover:bg-blue-700';
        } else {
          btn.className = 'ap-toggle-btn px-2 py-1 rounded text-[11px] font-mono font-bold transition bg-slate-200 dark:bg-slate-700 text-slate-400 border border-red-500/40 line-through';
        }
      }
    });
  }

  logEvent(msg, type = 'system-info') {
    const list = document.getElementById('eventLogList');
    if (!list) return;

    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `log-entry ${type} p-1.5 rounded text-[11px] font-mono leading-tight`;
    entry.innerHTML = `<span class="text-slate-400">[${timeStr}]</span> ${msg}`;

    list.insertBefore(entry, list.firstChild);

    // Limit log memory to 40 items
    while (list.children.length > 40) {
      list.removeChild(list.lastChild);
    }
  }

  // ==========================================================================
  // EVENT BINDINGS & VIEW SWITCHING (4 SOLUTIONS)
  // ==========================================================================

  setSolution(solution) {
    this.activeSolution = solution;

    const viewHome = document.getElementById('view-home');
    const viewSim = document.getElementById('view-simulation');
    const navHome = document.getElementById('nav-btn-home');
    const navLB = document.getElementById('nav-btn-load-balance');
    const navPred = document.getElementById('nav-btn-predictive');
    const navBeam = document.getElementById('nav-btn-beam-steering');
    const navFail = document.getElementById('nav-btn-fail-safe');
    const panelLoad = document.getElementById('panel-load-distribution');
    const panelSLM = document.getElementById('panel-slm-computation');
    const panelNet = document.getElementById('panel-network-status');
    const containerForce = document.getElementById('container-force-congestion');

    if (solution === 'home') {
      viewHome?.classList.remove('hidden');
      viewSim?.classList.add('hidden');
      navHome?.classList.add('active');
      navLB?.classList.remove('active');
      navPred?.classList.remove('active');
      navBeam?.classList.remove('active');
      navFail?.classList.remove('active');
      return;
    }

    viewHome?.classList.add('hidden');
    viewSim?.classList.remove('hidden');
    navHome?.classList.remove('active');

    const titleEl = document.getElementById('solution-title');
    const subEl = document.getElementById('solution-subtitle');
    const tagEl = document.getElementById('solution-mode-tag');
    const switchBtnText = document.getElementById('btn-switch-solution-text');
    const presetsContainer = document.getElementById('solution-presets-container');

    if (solution === 'load-balance' || solution === 'solution-1') {
      navLB?.classList.add('active');
      navPred?.classList.remove('active');
      navBeam?.classList.remove('active');
      navFail?.classList.remove('active');
      panelLoad?.classList.remove('hidden');
      panelSLM?.classList.add('hidden');
      panelNet?.classList.add('hidden');
      containerForce?.classList.add('hidden');

      if (titleEl) titleEl.textContent = 'Load Balancing & Overload Redirection';
      if (subEl) subEl.textContent = 'Dynamic multi-user capacity management and overload redirection.';
      if (tagEl) {
        tagEl.textContent = 'NO OBSTACLES';
        tagEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-semibold';
      }
      if (switchBtnText) switchBtnText.textContent = 'Next: Predictive Sensing';

      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = String(this.defaultCapacity);

      const pTitle = document.getElementById('panel-action-title');
      const pGrid = document.getElementById('panel-action-buttons-grid');
      const pDesc = document.getElementById('panel-action-description');
      const legendPill = document.getElementById('canvas-legend-pill');

      if (pTitle) pTitle.textContent = 'Interactive Overload Actions';
      if (pGrid) {
        pGrid.innerHTML = `
          <button id="btn-panel-overload" class="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm flex items-center justify-center space-x-1">
            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
            <span>Burst Overload</span>
          </button>
          <button id="btn-panel-rebalance" class="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition flex items-center justify-center space-x-1 text-slate-700 dark:text-slate-200">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Rebalance All</span>
          </button>
        `;
        document.getElementById('btn-panel-overload')?.addEventListener('click', () => this.triggerAP2Overload());
        document.getElementById('btn-panel-rebalance')?.addEventListener('click', () => this.triggerRebalanceAll());
      }
      if (pDesc) {
        pDesc.innerHTML = 'Click <strong>Burst Overload</strong> or adjust the <strong>AP Capacity</strong> in the top toolbar to exceed limits and witness dynamic cascading Line of Sight redirection.';
      }
      if (legendPill) {
        legendPill.innerHTML = `
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>AP (Blue)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>User (Green)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-emerald-500"></span><span>Active LoS</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-red-500"></span><span>Overload / Cut</span></span>
        `;
      }
    } else if (solution === 'predictive' || solution === 'solution-2') {
      navLB?.classList.remove('active');
      navPred?.classList.add('active');
      navBeam?.classList.remove('active');
      navFail?.classList.remove('active');
      panelLoad?.classList.remove('hidden');
      panelSLM?.classList.add('hidden');
      panelNet?.classList.add('hidden');
      containerForce?.classList.add('hidden');

      if (titleEl) titleEl.textContent = 'Solution 2: Proactive Obstacle Sensing & Predictive Handover';
      if (subEl) subEl.textContent = 'Camera sensor tracking, trajectory prediction, proactive user queuing, and instant zero-latency handover.';
      if (tagEl) {
        tagEl.textContent = 'CAMERAS & QUEUING ACTIVE';
        tagEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-semibold';
      }
      if (switchBtnText) switchBtnText.textContent = 'Next: Dynamic Beam Steering';

      if (this.defaultCapacity < 5) {
        this.setCapacityLimit(5);
      }
      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = String(this.defaultCapacity);

      const pTitle = document.getElementById('panel-action-title');
      const pGrid = document.getElementById('panel-action-buttons-grid');
      const pDesc = document.getElementById('panel-action-description');
      const legendPill = document.getElementById('canvas-legend-pill');

      if (pTitle) pTitle.textContent = 'Predictive Sensing & Cancellation Controls';
      if (pGrid) {
        pGrid.innerHTML = `
          <button id="btn-panel-accel" class="px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm flex items-center justify-center space-x-1">
            <i data-lucide="fast-forward" class="w-3.5 h-3.5"></i>
            <span>Accelerate Obstacle</span>
          </button>
          <button id="btn-panel-invert" class="px-2.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition shadow-sm flex items-center justify-center space-x-1">
            <i data-lucide="arrow-left-right" class="w-3.5 h-3.5"></i>
            <span>Invert Direction</span>
          </button>
          <button id="btn-panel-stop" class="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition flex items-center justify-center space-x-1 text-slate-700 dark:text-slate-200">
            <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i>
            <span id="btn-panel-stop-text">Stop Obstacle</span>
          </button>
          <button id="btn-panel-rebalance" class="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition flex items-center justify-center space-x-1 text-slate-700 dark:text-slate-200">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Rebalance All</span>
          </button>
        `;
        document.getElementById('btn-panel-accel')?.addEventListener('click', () => this.accelerateObstacle(1));
        document.getElementById('btn-panel-invert')?.addEventListener('click', () => this.invertObstacleTrajectories());
        document.getElementById('btn-panel-stop')?.addEventListener('click', () => this.toggleStopObstacle(1));
        document.getElementById('btn-panel-rebalance')?.addEventListener('click', () => this.triggerRebalanceAll());
      }
      if (pDesc) {
        pDesc.innerHTML = 'Cameras track obstacle coordinates & trajectory. <strong>Queued users</strong> display in pulsing Orange with a Cyan backup link, <strong>switching instantly to Green</strong> on arrival. Click <strong>Invert Direction</strong> or <strong>Stop Obstacle</strong> to test immediate handover cancellation while preserving original connections!';
      }
      if (legendPill) {
        legendPill.innerHTML = `
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>AP</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>User</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 bg-cyan-400"></span><span>Camera</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-red-500 inline-block"></span><span>Obstacle</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-emerald-500"></span><span>Active</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-orange-500"></span><span>Queued</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-cyan-400"></span><span>Backup Link</span></span>
        `;
      }
    } else if (solution === 'beam-steering' || solution === 'solution-3') {
      navLB?.classList.remove('active');
      navPred?.classList.remove('active');
      navBeam?.classList.add('active');
      navFail?.classList.remove('active');
      panelLoad?.classList.add('hidden');
      panelSLM?.classList.remove('hidden');
      panelNet?.classList.add('hidden');
      containerForce?.classList.add('hidden');

      if (titleEl) titleEl.textContent = 'Solution 3: Optical Beam Steering (Zero Handover)';
      if (subEl) subEl.textContent = 'Real-time SLM phase computation curves optical beams around moving obstacles with zero AP handover.';
      if (tagEl) {
        tagEl.textContent = 'SLM BEAM STEERING ACTIVE';
        tagEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-semibold';
      }
      if (switchBtnText) switchBtnText.textContent = 'Next: Fail-Safe Recovery';

      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = String(this.defaultCapacity);

      // Re-enable and associate any dropped users - zero dropped in beam steering!
      this.users.forEach(u => {
        u.isDropped = false;
        u.failedAp = null;
        u.threatTimer = 0;
        u.isQueued = false;
      });

      const legendPill = document.getElementById('canvas-legend-pill');
      if (legendPill) {
        legendPill.innerHTML = `
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>AP (Blue)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>User (Green)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 bg-cyan-400"></span><span>Camera</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-red-500 inline-block"></span><span>Obstacle (No Cone)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-emerald-500"></span><span>Active LoS</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-emerald-400 rounded-full"></span><span>Bezier Curved Beam</span></span>
        `;
      }

      // Bind SLM panel buttons
      document.getElementById('btn-slm-speed-obstacle')?.addEventListener('click', () => this.boostObstacles());
      document.getElementById('btn-slm-invert-path')?.addEventListener('click', () => this.invertObstacleTrajectories());
    } else if (solution === 'fail-safe' || solution === 'solution-4') {
      navLB?.classList.remove('active');
      navPred?.classList.remove('active');
      navBeam?.classList.remove('active');
      navFail?.classList.add('active');
      panelLoad?.classList.add('hidden');
      panelSLM?.classList.add('hidden');
      panelNet?.classList.remove('hidden');
      containerForce?.classList.remove('hidden');

      if (titleEl) titleEl.textContent = 'Solution 4: Complete Congestion & Wi-Fi Fallback';
      if (subEl) subEl.textContent = 'Optical link failure detection, automated RF Wi-Fi backup offloading, and continuous 60 FPS self-healing Li-Fi reconnection.';
      if (tagEl) {
        tagEl.textContent = 'HYBRID LI-FI / WI-FI FALLBACK';
        tagEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-semibold';
      }
      if (switchBtnText) switchBtnText.textContent = 'Next: Load Balancing';

      const sel = document.getElementById('select-capacity');
      if (sel) sel.value = String(this.defaultCapacity);

      const legendPill = document.getElementById('canvas-legend-pill');
      if (legendPill) {
        legendPill.innerHTML = `
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>AP (Blue)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>User (Green)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 bg-cyan-400"></span><span>Camera</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-red-500 inline-block"></span><span>Obstacle</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-emerald-500"></span><span>Primary Li-Fi</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-3.5 h-0.5 bg-slate-400 border-b border-dashed border-slate-400"></span><span>Wi-Fi Fallback (Grey)</span></span>
          <span class="text-slate-600">|</span>
          <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-amber-500"></span><span>Wi-Fi Router</span></span>
        `;
      }

      // Bind Panel Buttons
      document.getElementById('btn-panel-force-congestion')?.addEventListener('click', () => this.forceCongestion());
      document.getElementById('btn-panel-self-heal')?.addEventListener('click', () => this.selfHealingRecovery());

      this.updateNetworkStatusPanel();
    }

    lucide.createIcons();
    this.updateUI();
  }

  bindEvents() {
    // Navigation
    document.getElementById('nav-brand-btn')?.addEventListener('click', () => this.setSolution('home'));
    document.getElementById('nav-btn-home')?.addEventListener('click', () => this.setSolution('home'));
    document.getElementById('nav-btn-load-balance')?.addEventListener('click', () => this.setSolution('load-balance'));
    document.getElementById('nav-btn-predictive')?.addEventListener('click', () => this.setSolution('predictive'));
    document.getElementById('nav-btn-beam-steering')?.addEventListener('click', () => this.setSolution('beam-steering'));
    document.getElementById('nav-btn-fail-safe')?.addEventListener('click', () => this.setSolution('fail-safe'));
    document.getElementById('btn-back-home')?.addEventListener('click', () => this.setSolution('home'));

    // Top Bar Force Congestion button
    document.getElementById('btn-force-congestion')?.addEventListener('click', () => this.forceCongestion());

    // 4 Solutions Grid Cards
    document.getElementById('card-solution-1')?.addEventListener('click', () => this.setSolution('load-balance'));
    document.getElementById('card-solution-2')?.addEventListener('click', () => this.setSolution('predictive'));
    document.getElementById('card-solution-3')?.addEventListener('click', () => this.setSolution('beam-steering'));
    document.getElementById('card-solution-4')?.addEventListener('click', () => this.setSolution('fail-safe'));

    // 3D Environment Model Card
    const card3D = document.getElementById('card-3d-model');
    if (card3D) {
      card3D.addEventListener('click', (e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          window.location.href = '3d_model.html';
        }
      });
    }

    // Switch / Cycle Solutions
    const solutionCycle = ['load-balance', 'predictive', 'beam-steering', 'fail-safe'];
    document.getElementById('btn-switch-solution')?.addEventListener('click', () => {
      const curIdx = solutionCycle.indexOf(this.activeSolution);
      const nextSolution = solutionCycle[(curIdx + 1) % solutionCycle.length];
      this.setSolution(nextSolution);
    });

    // AP Toggles in Toolbar
    const toggleBtns = document.querySelectorAll('.ap-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const apIdx = parseInt(btn.getAttribute('data-ap'), 10);
        this.toggleAP(apIdx);
      });
    });

    // Play / Pause
    const playPauseBtn = document.getElementById('btn-play-pause');
    const stepBtn = document.getElementById('btn-step-frame');
    playPauseBtn?.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      const icon = document.getElementById('icon-play-pause');
      const text = document.getElementById('text-play-pause');
      if (this.isPaused) {
        text.textContent = 'Play [Space]';
        icon.setAttribute('data-lucide', 'play');
        stepBtn.removeAttribute('disabled');
      } else {
        text.textContent = 'Pause [Space]';
        icon.setAttribute('data-lucide', 'pause');
        stepBtn.setAttribute('disabled', 'true');
      }
      lucide.createIcons();
      this.logEvent(`Simulation ${this.isPaused ? 'PAUSED' : 'RESUMED'}`, 'system-info');
    });

    // Step Forward
    stepBtn?.addEventListener('click', () => this.stepForward());

    // Reset
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => this.resetSimulation());

    // Speed Slider
    const speedSlider = document.getElementById('slider-speed');
    const speedLabel = document.getElementById('label-speed');
    speedSlider?.addEventListener('input', (e) => {
      this.speedMultiplier = parseFloat(e.target.value);
      speedLabel.textContent = `${this.speedMultiplier.toFixed(1)}x`;
    });

    // Capacity Selector
    document.getElementById('select-capacity')?.addEventListener('change', (e) => {
      this.setCapacityLimit(e.target.value);
    });

    // AP Load Distribution Panel Action Buttons
    document.getElementById('btn-panel-overload')?.addEventListener('click', () => this.triggerAP2Overload());
    document.getElementById('btn-panel-rebalance')?.addEventListener('click', () => this.triggerRebalanceAll());

    // Toggle Grid
    const gridBtn = document.getElementById('btn-toggle-grid');
    gridBtn?.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      gridBtn.textContent = `Grid: ${this.showGrid ? 'ON' : 'OFF'}`;
    });

    // Toggle Zones
    const zonesBtn = document.getElementById('btn-toggle-zones');
    zonesBtn?.addEventListener('click', () => {
      this.showZones = !this.showZones;
      zonesBtn.textContent = `Zones: ${this.showZones ? 'ON' : 'OFF'}`;
      zonesBtn.className = `px-2 py-1 rounded bg-slate-900/80 backdrop-blur border border-slate-700 text-[10px] ${this.showZones ? 'text-amber-400' : 'text-slate-400'} font-mono transition`;
    });

    // Theme Toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    themeBtn?.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.classList.toggle('dark');
      const sun = document.getElementById('icon-sun');
      const moon = document.getElementById('icon-moon');
      if (isDark) {
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
      } else {
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
      }
      lucide.createIcons();
    });

    // Audio Toggle
    const audioBtn = document.getElementById('btn-audio-toggle');
    audioBtn?.addEventListener('click', () => {
      this.audio.enabled = !this.audio.enabled;
      const icon = document.getElementById('icon-audio');
      if (this.audio.enabled) {
        icon.setAttribute('data-lucide', 'volume-2');
        audioBtn.classList.remove('opacity-50');
      } else {
        icon.setAttribute('data-lucide', 'volume-x');
        audioBtn.classList.add('opacity-50');
      }
      lucide.createIcons();
    });

    // Modal
    const infoBtn = document.getElementById('btn-info-modal');
    const modal = document.getElementById('infoModal');
    const closeBtn = document.getElementById('btn-close-modal');
    const gotItBtn = document.getElementById('btn-modal-gotit');

    infoBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
    closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
    gotItBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal?.classList.add('hidden');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        playPauseBtn?.click();
      } else if (e.key === '.') {
        this.stepForward();
      } else if (e.key.toLowerCase() === 'r') {
        this.resetSimulation();
      } else if (e.key === '1') {
        this.setSolution('load-balance');
      } else if (e.key === '2') {
        this.setSolution('predictive');
      } else if (e.key === '3') {
        this.setSolution('beam-steering');
      } else if (e.key === '4') {
        this.setSolution('fail-safe');
      } else if (e.key.toLowerCase() === 'h') {
        this.setSolution('home');
      }
    });

    // Canvas Hover Inspection
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.nativeWidth / rect.width;
      const scaleY = this.nativeHeight / rect.height;
      this.mousePos = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };

      this.inspectCanvasEntity(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mouseleave', () => {
      const tooltip = document.getElementById('canvasTooltip');
      if (tooltip) tooltip.classList.add('hidden');
    });

    // Window Resize Handling for Retina Canvas
    window.addEventListener('resize', () => this.setupCanvasDPI());
  }

  inspectCanvasEntity(clientX, clientY) {
    const tooltip = document.getElementById('canvasTooltip');
    const titleEl = document.getElementById('tooltip-title');
    const bodyEl = document.getElementById('tooltip-body');
    if (!tooltip) return;

    const m = this.mousePos;
    let found = null;

    // Check APs
    for (const ap of this.aps) {
      if (MathUtils.distance(m, ap.pos) <= ap.radius + 6) {
        found = {
          type: 'ap',
          title: `Access Point AP-${ap.id + 1}`,
          data: [
            `Load: ${ap.load} / ${ap.maxCapacity} connected`,
            `Status: ${ap.isFull ? 'SATURATED' : 'AVAILABLE'}`,
            `Optical Band: 430 THz Visible Light`,
            `Output Power: 18.5 dBm`
          ]
        };
        break;
      }
    }

    // Check Cameras (Solution 2 Sensors at Lane Intersections)
    if (!found && this.cameras) {
      for (const cam of this.cameras) {
        if (MathUtils.distance(m, cam.pos) <= 20) {
          found = {
            type: 'camera',
            title: `Optical Sensor ${cam.name}`,
            data: [
              `Position: (${cam.x}, ${cam.y}) [Lane Junction]`,
              `Sensor State: ${cam.status}`,
              `Tracked Target: ${cam.trackedObstacle ? `Obstacle #${cam.trackedObstacle.id}` : 'None (Radar Scanning)'}`,
              `Target Coords: ${cam.obstacleCoords ? `(${cam.obstacleCoords.x}, ${cam.obstacleCoords.y})` : 'N/A'}`,
              `Target Velocity: ${cam.obstacleVelocity ? `(${cam.obstacleVelocity.vx.toFixed(1)}, ${cam.obstacleVelocity.vy.toFixed(1)})` : 'N/A'}`
            ]
          };
          break;
        }
      }
    }

    // Check Users
    if (!found) {
      for (const u of this.users) {
        if (MathUtils.distance(m, u.pos) <= 12) {
          const apText = u.currentAp ? `AP-${u.currentAp.id + 1}` : 'Disconnected';
          let statusText = 'Active High-Speed';
          if (u.isDropped) {
            statusText = 'Dropped (Physical Cut)';
          } else if (u.isQueued) {
            statusText = `QUEUED FOR HANDOVER → AP-${u.queuedTargetAp.id + 1} (Threat: Obstacle #${u.queuedObstacle.id})`;
          } else if (u.threatTimer > 0) {
            statusText = 'Threat Warning (Orange)';
          }

          const data = [
            `Assigned: ${apText}`,
            `Link Status: ${statusText}`,
            `SNR: ${u.currentAp ? (32.4 - u.currentAp.distanceTo(u.pos) * 0.02).toFixed(1) : 0} dB`,
            `Zone: Table ${u.tableId}`
          ];

          if (u.isQueued) {
            data.push(`Target Intercept: ${Math.round(u.predictedInterceptDistance)} px`);
          }

          found = {
            type: 'user',
            title: `Stationary User #U${u.id}`,
            data
          };
          break;
        }
      }
    }

    // Check Obstacles
    if (!found) {
      for (const obs of this.obstacles) {
        if (MathUtils.pointInRect(m, obs.rect)) {
          found = {
            type: 'obstacle',
            title: `Moving Patron #${obs.id}`,
            data: [
              `State: ${obs.isStopped ? 'STOPPED / HALTED' : 'DYNAMICALLY MOVING'}`,
              `Lane: ${obs.laneType.toUpperCase()} walkway`,
              `Velocity: (${obs.vx.toFixed(1)}, ${obs.vy.toFixed(1)})`,
              `Lookahead Horizon: 180 px`,
              `Trajectory: ${Math.round(obs.heading * 180 / Math.PI)}°`
            ]
          };
          break;
        }
      }
    }

    if (found) {
      titleEl.textContent = found.title;
      bodyEl.innerHTML = found.data.map(d => `<div>${d}</div>`).join('');
      tooltip.classList.remove('hidden');

      // Position tooltip near cursor with viewport bounds clamp
      const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
      const tipX = Math.min(wrapperRect.width - 170, Math.max(10, clientX - wrapperRect.left + 15));
      const tipY = Math.min(wrapperRect.height - 110, Math.max(10, clientY - wrapperRect.top + 15));

      tooltip.style.left = `${tipX}px`;
      tooltip.style.top = `${tipY}px`;
    } else {
      tooltip.classList.add('hidden');
    }
  }
}

// ============================================================================
// BOOTSTRAP INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  window.lifiApp = new LiFiDigitalTwin();
  const hash = window.location.hash.toLowerCase();
  if (hash === '#load-balance' || hash === '#solution-1' || hash === '#solution1') {
    window.lifiApp.setSolution('load-balance');
  } else if (hash === '#predictive' || hash === '#solution-2') {
    window.lifiApp.setSolution('predictive');
  } else if (hash === '#beam-steering' || hash === '#solution-3') {
    window.lifiApp.setSolution('beam-steering');
  } else if (hash === '#fail-safe' || hash === '#solution-4' || hash === '#occlusion-recovery') {
    window.lifiApp.setSolution('fail-safe');
  }
  console.log('[LuminaLanes] Li-Fi Digital Twin engine running at 60 FPS.');
});
