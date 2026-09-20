/**
 * LuminaLanes — 3D Library Digital Twin Entry Point
 * File: static/3d_main.js
 * 
 * Functionality:
 * - Imports LibraryEnvironment from ./LibraryScene.js
 * - Instantiates and initializes the 3D scene
 * - Sets up a continuous requestAnimationFrame loop calling environment.render()
 */

import { LibraryEnvironment } from './LibraryScene.js';

// 1. Instantiate the 3D Library Digital Twin environment
const environment = new LibraryEnvironment('canvas-container');

// 2. Initialize scene, camera, lights, static room, and entities
environment.init();

// Expose environment to window for debugging or WebSocket telemetry integration
window.libraryEnvironment = environment;

// 3. Continuous 60 FPS requestAnimationFrame render loop
function animate() {
  requestAnimationFrame(animate);
  environment.render();
}

// Start rendering
animate();
console.log('[3d_main.js] Continuous 3D render loop started.');
