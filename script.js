// --- SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
scene.fog = new THREE.Fog(0x000000, 300, 800);

// --- LIGHTING ---
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 15, 20);
scene.add(dirLight);

// --- UI & GAME STATE ---
const scoreEl = document.getElementById('score'); const livesEl = document.getElementById('lives'); const menuEl = document.getElementById('menu-overlay'); const hudEl = document.getElementById('hud'); const startButton = document.getElementById('start-button'); const finalScoreEl = document.getElementById('final-score'); const menuSubtitleEl = document.getElementById('menu-subtitle'); const damageFlashEl = document.getElementById('damage-flash');
let score, playerLives, isGameOver, gameStartTime;

// --- AUDIO ---
function playSound(src, volume = 0.5) { const sound = new Audio(src); sound.volume = volume; sound.play(); }

// --- 3D CROSSHAIR ---
const crosshair = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true, side: THREE.DoubleSide }));
crosshair.geometry.rotateX(Math.PI / 2);
scene.add(crosshair);

// --- STARFIELD ---
const starfield = new THREE.Points( new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 15000 }, () => (Math.random() - 0.5) * 1500).flat(), 3)), new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.8, sizeAttenuation: true }));
scene.add(starfield);

// --- PLAYER SHIP ---
const playerShip = new THREE.Group();
const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
const cockpit = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 8), wireframeMaterial);
cockpit.rotation.x = Math.PI / 2;
playerShip.add(cockpit);
const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 4, 8), wireframeMaterial);
fuselage.position.z = -2; fuselage.rotation.x = Math.PI / 2;
playerShip.add(fuselage);
const wingShear = new THREE.Matrix4().makeShear(0, 0, 0, 0, 0.5, 0);
const leftWing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 2.5), wireframeMaterial);
leftWing.geometry.applyMatrix4(wingShear); leftWing.position.set(-4, 0, -1.5);
playerShip.add(leftWing);
const rightWing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 2.5), wireframeMaterial);
rightWing.geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, -0.5, 0)); rightWing.position.set(4, 0, -1.5);
playerShip.add(rightWing);
scene.add(playerShip);
const muzzleFlash = new THREE.PointLight(0xff4136, 20, 30);
muzzleFlash.visible = false;
playerShip.add(muzzleFlash);

// --- OBJECT POOLS ---
const projectilePool = [], enemyProjectilePool = [], enemyPool = [], asteroidPool = [];
const POOL_SIZE = 50;
const enemyMaterial = new THREE.MeshBasicMaterial({ color: 0xC64600, wireframe: true });
const asteroidMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, flatShading: true });
const asteroidGeometry = new THREE.SphereGeometry(1, 5, 4);
const projectileGeometry = new THREE.CylinderGeometry(0.1, 0.1, 4, 8);
projectileGeometry.rotateX(Math.PI / 2);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xff4136, emissive: 0xff4136, emissiveIntensity: 2, });
for (let i = 0; i < POOL_SIZE; i++) {
    const p = new THREE.Mesh(projectileGeometry, projectileMaterial); p.isActive = false; scene.add(p); projectilePool.push(p);
    const ep = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), enemyMaterial); ep.isActive = false; scene.add(ep); enemyProjectilePool.push(ep);
    const e = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 0), enemyMaterial); e.isActive = false; scene.add(e); enemyPool.push(e);
}
for (let i = 0; i < 100; i++) { const a = new THREE.Mesh(asteroidGeometry, asteroidMaterial); a.isActive = false; scene.add(a); asteroidPool.push(a); }

// --- GAME LOGIC & CONTROLS ---
const mouse = new THREE.Vector2();
const keyboard = {};
const playerTargetPosition = new THREE.Vector3();
const PLAYER_SPEED = 2; const PLAYER_X_RANGE = 60; const PLAYER_Y_RANGE = 30;
let enemySpawnTimer = 0, asteroidSpawnTimer = 0;
let controlsEnabled = false;

function resetGame() { score = 0; playerLives = 3; isGameOver = false; gameStartTime = Date.now(); scoreEl.textContent = '0000'; livesEl.textContent = '3'; menuEl.classList.add('hidden'); hudEl.style.opacity = 1; menuSubtitleEl.style.display = 'none'; startButton.textContent = 'Restart Game'; document.body.style.cursor = 'none'; [...projectilePool, ...enemyProjectilePool, ...enemyPool, ...asteroidPool].forEach(obj => { obj.isActive = false; obj.visible = false; }); camera.position.set(0, 5, 50); playerShip.position.set(0,0,0); playerTargetPosition.set(0,0,0); controlsEnabled = true; }
function fireProjectile() { const p = projectilePool.find(proj => !proj.isActive); if (p) { p.isActive = true; p.visible = true; p.position.copy(playerShip.position); p.position.z -= 3; p.userData.velocity = new THREE.Vector3(0, 0, -1200); playSound('sounds/laser.mp3', 0.1); muzzleFlash.visible = true; setTimeout(() => muzzleFlash.visible = false, 60); } }
function enemyFire(enemy) { const p = enemyProjectilePool.find(proj => !proj.isActive); if (p) { p.isActive = true; p.visible = true; p.position.copy(enemy.position); p.userData.velocity = new THREE.Vector3().subVectors(playerShip.position, p.position).normalize().multiplyScalar(300); } }
function spawnEnemy() { const e = enemyPool.find(en => !en.isActive); if (e) { e.isActive = true; e.visible = true; e.position.x = (Math.random() - 0.5) * 150; e.position.y = (Math.random() - 0.5) * 75 + 5; e.position.z = -800; e.userData.speed = Math.random() * 100 + 180; e.userData.fireTimer = Math.random() * 2 + 1; } }
function spawnAsteroid() { const a = asteroidPool.find(ast => !ast.isActive); if(a) { a.isActive = true; a.visible = true; a.position.x = (Math.random() - 0.5) * (PLAYER_X_RANGE * 2.5); a.position.y = (Math.random() - 0.5) * (PLAYER_Y_RANGE * 2) + 5; a.position.z = -800; a.scale.setScalar(Math.random() * 6 + 1.5); a.userData.speed = Math.random() * 50 + 80; a.userData.rotation = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); } }
function takeDamage(amount) { if (isGameOver) return; playerLives -= amount; livesEl.textContent = Math.max(0, playerLives); playSound('sounds/damage.mp3'); renderer.domElement.classList.add('shake'); damageFlashEl.classList.add('active'); setTimeout(() => { renderer.domElement.classList.remove('shake'); damageFlashEl.classList.remove('active'); }, 400); if (playerLives <= 0) endGame(); }
function endGame() { if (isGameOver) return; isGameOver = true; controlsEnabled = false; playSound('sounds/gameOver.mp3'); menuEl.classList.remove('hidden'); hudEl.style.opacity = 0; finalScoreEl.textContent = score; menuSubtitleEl.style.display = 'block'; document.body.style.cursor = 'default'; }

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    starfield.position.z += 250 * delta;
    if (starfield.position.z > 1000) starfield.position.z -= 2000;

    if (!isGameOver && controlsEnabled) {
        // --- UNIFIED CONTROL LOGIC (WITH INVERTED Y-AXIS) ---
        // 1. Keyboard input modifies the unified `mouse` vector
        // UPDATED: Inverted the Y-axis controls
        if (keyboard['arrowup'] || keyboard['w']) mouse.y -= PLAYER_SPEED * delta; // Up goes down
        if (keyboard['arrowdown'] || keyboard['s']) mouse.y += PLAYER_SPEED * delta; // Down goes up
        if (keyboard['arrowleft'] || keyboard['a']) mouse.x -= PLAYER_SPEED * delta;
        if (keyboard['arrowright'] || keyboard['d']) mouse.x += PLAYER_SPEED * delta;

        // 2. Clamp the unified `mouse` vector to keep it on screen
        mouse.x = THREE.MathUtils.clamp(mouse.x, -1, 1);
        mouse.y = THREE.MathUtils.clamp(mouse.y, -1, 1);
        
        // 3. The ship's target is ALWAYS driven by the final `mouse` vector
        const targetX = mouse.x * PLAYER_X_RANGE;
        const targetY = -mouse.y * PLAYER_Y_RANGE + 5;
        
        // 4. Lerp the ship towards the final target position
        playerTargetPosition.lerp(new THREE.Vector3(targetX, targetY, 0), 0.1);
        playerShip.position.copy(playerTargetPosition);
        
        playerShip.rotation.z = (targetX - playerShip.position.x) * -0.02;
        playerShip.rotation.x = (targetY - playerShip.position.y) * 0.02;
        crosshair.position.set(playerShip.position.x, playerShip.position.y, -200);
        
        // --- The rest of the game loop is unchanged and stable ---
        const gameTime = (Date.now() - gameStartTime) / 1000;
        enemySpawnTimer -= delta; asteroidSpawnTimer -= delta;
        if (enemySpawnTimer <= 0) { spawnEnemy(); const spawnRate = 1.2 - Math.min(gameTime / 60, 1.0); enemySpawnTimer = Math.max(0.2, spawnRate); }
        if (asteroidSpawnTimer <= 0) { spawnAsteroid(); asteroidSpawnTimer = Math.random() * 0.5 + 0.25; }
        projectilePool.forEach(p => { if (p.isActive) { p.position.z += p.userData.velocity.z * delta; if (p.position.z < -900) { p.isActive = false; p.visible = false; } enemyPool.forEach(e => { if (e.isActive && p.isActive && p.position.distanceTo(e.position) < 4) { e.isActive = false; e.visible = false; p.isActive = false; p.visible = false; score += 10; scoreEl.textContent = String(score).padStart(4, '0'); playSound('sounds/explosion.mp3', 0.3); } }); asteroidPool.forEach(a => { if (a.isActive && p.isActive && p.position.distanceTo(a.position) < (a.scale.x)) { a.isActive = false; a.visible = false; p.isActive = false; p.visible = false; score += 5; scoreEl.textContent = String(score).padStart(4, '0'); playSound('sounds/explosion.mp3', 0.2); } }); } });
        enemyProjectilePool.forEach(p => { if (p.isActive) { p.position.addScaledVector(p.userData.velocity, delta); if (p.position.z > 50) { p.isActive = false; p.visible = false; } if (p.position.distanceTo(playerShip.position) < 3) { p.isActive = false; p.visible = false; takeDamage(1); } } });
        enemyPool.forEach(e => { if (e.isActive) { e.position.z += e.userData.speed * delta; e.rotation.x += 0.5 * delta; e.rotation.y += 0.5 * delta; e.userData.fireTimer -= delta; if(e.userData.fireTimer <= 0) { enemyFire(e); e.userData.fireTimer = Math.random() * 3 + 2; } if (e.position.z > camera.position.z) { e.isActive = false; e.visible = false; } } });
        asteroidPool.forEach(a => { if (a.isActive) { a.position.z += a.userData.speed * delta; a.rotation.x += a.userData.rotation.x * 0.5 * delta; a.rotation.y += a.userData.rotation.y * 0.5 * delta; if (a.position.z > camera.position.z) { a.isActive = false; a.visible = false; } if (a.position.distanceTo(playerShip.position) < (a.scale.x + 1.5)) { a.isActive = false; a.visible = false; takeDamage(1); } } });
    }
    renderer.render(scene, camera);
}

// --- EVENT LISTENERS ---
window.addEventListener('mousemove', (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; });
window.addEventListener('mousedown', () => { if (controlsEnabled) fireProjectile(); });
startButton.addEventListener('click', () => { playSound('sounds/select.mp3'); resetGame(); });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
window.addEventListener('keydown', (e) => { const key = e.key.toLowerCase(); keyboard[key] = true; if (key === ' ' && controlsEnabled) { e.preventDefault(); fireProjectile(); } });
window.addEventListener('keyup', (e) => { keyboard[e.key.toLowerCase()] = false; });

// --- INITIALIZATION ---
animate();