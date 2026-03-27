// ============================================================
// TALLO CENTRAL - NULL SECTOR 7
// Versión: 1.0.0
// Núcleo del juego: eventos, ramas, UI, carga dinámica
// TODO EN UN SOLO ARCHIVO
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================
    const CONFIG = {
        version: '1.0.0',
        debugMode: true
    };

    let estado = {
        inicializado: false,
        ramaActual: null,
        ramasCargadas: new Map()
    };

    // ============================================================
    // SISTEMA DE EVENTOS (PUB/SUB)
    // ============================================================
    const eventos = {
        suscriptores: new Map(),
        
        on: function(evento, callback) {
            if (!this.suscriptores.has(evento)) {
                this.suscriptores.set(evento, []);
            }
            this.suscriptores.get(evento).push(callback);
            return this;
        },
        
        emit: function(evento, data = {}) {
            if (CONFIG.debugMode) console.log(`[EVENTO] ${evento}`, data);
            if (!this.suscriptores.has(evento)) return;
            for (const cb of this.suscriptores.get(evento)) {
                try { cb(data); } catch(e) { console.error(e); }
            }
        }
    };

    // ============================================================
    // GESTOR DE UI
    // ============================================================
    const uiManager = {
        contenedor: null,
        loadingOverlay: null,
        
        init: function() {
            this.contenedor = document.getElementById('game-container');
            this.loadingOverlay = document.getElementById('loading-overlay');
            if (!this.contenedor) {
                const app = document.getElementById('app');
                if (app) {
                    const container = document.createElement('div');
                    container.id = 'game-container';
                    app.appendChild(container);
                    this.contenedor = container;
                }
            }
            if (!this.loadingOverlay) {
                const app = document.getElementById('app');
                if (app) {
                    const overlay = document.createElement('div');
                    overlay.id = 'loading-overlay';
                    overlay.className = 'hidden';
                    overlay.innerHTML = '<div class="spinner"></div><p>Cargando...</p>';
                    app.appendChild(overlay);
                    this.loadingOverlay = overlay;
                }
            }
        },
        
        mostrarLoading: function(texto = 'Cargando...') {
            if (this.loadingOverlay) {
                const p = this.loadingOverlay.querySelector('p');
                if (p) p.textContent = texto;
                this.loadingOverlay.classList.remove('hidden');
            }
        },
        
        ocultarLoading: function() {
            if (this.loadingOverlay) this.loadingOverlay.classList.add('hidden');
        },
        
        mostrarToast: function(mensaje) {
            console.log('[TOAST]', mensaje);
            alert(mensaje);
        },
        
        limpiarPantalla: function() {
            if (this.contenedor) this.contenedor.innerHTML = '';
        }
    };

    // ============================================================
    // GESTOR DE RAMAS (CARGA DINÁMICA)
    // ============================================================
    const ramaManager = {
        registro: new Map(),
        
        registrar: function(nombre, modulo) {
            this.registro.set(nombre, modulo);
            eventos.emit('rama:registrada', { nombre });
            return true;
        },
        
        cargar: async function(nombre, ruta) {
            if (estado.ramasCargadas.has(nombre)) {
                return estado.ramasCargadas.get(nombre);
            }
            
            try {
                uiManager.mostrarLoading(`Cargando ${nombre}...`);
                
                if (estado.ramaActual) {
                    const actual = estado.ramasCargadas.get(estado.ramaActual);
                    if (actual && actual.descargar) await actual.descargar();
                    uiManager.limpiarPantalla();
                }
                
                const modulo = await import(ruta);
                
                const api = {
                    eventos, uiManager, ramaManager,
                    version: CONFIG.version
                };
                
                if (modulo.inicializar) {
                    await modulo.inicializar(api);
                }
                
                estado.ramasCargadas.set(nombre, modulo);
                estado.ramaActual = nombre;
                
                eventos.emit('rama:cargada', { nombre });
                uiManager.ocultarLoading();
                return modulo;
                
            } catch (error) {
                console.error(`Error cargando rama ${nombre}:`, error);
                uiManager.mostrarToast(`Error cargando ${nombre}`);
                uiManager.ocultarLoading();
                return null;
            }
        }
    };

    // ============================================================
    // RAMA DEL MENÚ (INCORPORADA DIRECTAMENTE)
    // ============================================================
    
    function crearRamaMenu() {
        let api = null;
        let scene, camera, renderer;
        let npcs = [];
        let bullets = [];
        let audioContext;
        let lastSpawnTime = 0;
        let currentSpawnInterval = 12;
        let THREE;
        
        const COLORS = {
            humanoPiel: [0xf5d0a9, 0xe0b87a],
            zombiePiel: [0x6b4c3b, 0x5a3e2e, 0x4a6b3b],
            humanoRopa: [0x4a6b3b, 0x2c3e2e, 0x8b5a2b],
            zombieRopa: [0x2a3a2a, 0x1a2a1a]
        };
        
        class NPC {
            constructor(group, isZombie, x, z) {
                this.group = group;
                this.isZombie = isZombie;
                this.x = x;
                this.z = z;
                this.targetX = x;
                this.targetZ = z;
                this.speed = isZombie ? 0.9 : 1.3;
                this.shootCooldown = 0;
                this.health = isZombie ? 50 : 100;
                this.group.position.set(x, 0, z);
            }
            
            update(delta, time) {
                if (Math.random() < 0.02 * (delta * 60)) {
                    this.targetX = this.x + (Math.random() - 0.5) * 7;
                    this.targetZ = this.z + (Math.random() - 0.5) * 7;
                    this.targetX = Math.max(-18, Math.min(18, this.targetX));
                    this.targetZ = Math.max(-18, Math.min(18, this.targetZ));
                }
                
                let dx = this.targetX - this.x;
                let dz = this.targetZ - this.z;
                let dist = Math.sqrt(dx*dx + dz*dz);
                if (dist > 0.3) {
                    let move = Math.min(this.speed * delta, dist);
                    this.x += (dx / dist) * move;
                    this.z += (dz / dist) * move;
                    this.group.position.set(this.x, Math.sin(time * 3) * 0.03, this.z);
                    let angle = Math.atan2(dx, dz);
                    this.group.rotation.y = angle;
                }
                
                let leftArm = this.group.children.find(c => c.position.x === -0.5);
                let rightArm = this.group.children.find(c => c.position.x === 0.5);
                if (leftArm) leftArm.rotation.z = Math.sin(time * 5) * 0.3;
                if (rightArm) rightArm.rotation.z = -Math.sin(time * 5) * 0.3;
                
                if (!this.isZombie && this.shootCooldown <= 0) {
                    let nearestZombie = null;
                    let nearestDist = 8;
                    for (let npc of npcs) {
                        if (npc.isZombie && npc.health > 0) {
                            let d = Math.hypot(this.x - npc.x, this.z - npc.z);
                            if (d < nearestDist) {
                                nearestDist = d;
                                nearestZombie = npc;
                            }
                        }
                    }
                    if (nearestZombie && nearestDist < 6) {
                        this.shoot(nearestZombie);
                        this.shootCooldown = 25;
                    }
                }
                if (this.shootCooldown > 0) this.shootCooldown -= delta * 60;
            }
            
            shoot(target) {
                let flash = new THREE.PointLight(0xff6600, 1, 3);
                flash.position.copy(this.group.position);
                flash.position.y = 0.8;
                scene.add(flash);
                setTimeout(() => scene.remove(flash), 100);
                
                bullets.push({
                    pos: { x: this.x, z: this.z, y: 0.6 },
                    target: target,
                    life: 60
                });
                
                if (audioContext && audioContext.state === 'running') {
                    let osc = audioContext.createOscillator();
                    let gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.frequency.value = 800;
                    gain.gain.value = 0.3;
                    osc.start();
                    gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
                    osc.stop(audioContext.currentTime + 0.3);
                }
            }
            
            takeDamage(amount) {
                this.health -= amount;
                if (this.health <= 0) {
                    scene.remove(this.group);
                    return true;
                }
                return false;
            }
        }
        
        function crearPersonaje3D(x, z, esZombie) {
            const grupo = new THREE.Group();
            
            const colorPiel = esZombie 
                ? COLORS.zombiePiel[Math.floor(Math.random() * COLORS.zombiePiel.length)]
                : COLORS.humanoPiel[Math.floor(Math.random() * COLORS.humanoPiel.length)];
            const colorRopa = esZombie
                ? COLORS.zombieRopa[Math.floor(Math.random() * COLORS.zombieRopa.length)]
                : COLORS.humanoRopa[Math.floor(Math.random() * COLORS.humanoRopa.length)];
            
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: colorRopa }));
            torso.position.y = 0.45;
            torso.castShadow = true;
            grupo.add(torso);
            
            const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), new THREE.MeshStandardMaterial({ color: colorPiel }));
            cabeza.position.y = 1.0;
            cabeza.castShadow = true;
            grupo.add(cabeza);
            
            const ojoBlanco = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            ojoBlanco.position.set(-0.14, 1.08, 0.41);
            grupo.add(ojoBlanco);
            const ojoBlanco2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            ojoBlanco2.position.set(0.14, 1.08, 0.41);
            grupo.add(ojoBlanco2);
            
            const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshStandardMaterial({ color: esZombie ? 0xff3333 : 0x2c3e2e }));
            pupila.position.set(-0.14, 1.07, 0.5);
            grupo.add(pupila);
            const pupila2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshStandardMaterial({ color: esZombie ? 0xff3333 : 0x2c3e2e }));
            pupila2.position.set(0.14, 1.07, 0.5);
            grupo.add(pupila2);
            
            if (!esZombie) {
                const arma = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
                arma.position.set(0.55, 0.85, 0.25);
                arma.rotation.z = -0.3;
                grupo.add(arma);
                const canion = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x555555 }));
                canion.position.set(0.8, 0.85, 0.3);
                canion.rotation.x = Math.PI / 2;
                grupo.add(canion);
            }
            
            const brazoIzq = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), new THREE.MeshStandardMaterial({ color: colorRopa }));
            brazoIzq.position.set(-0.5, 0.8, 0);
            grupo.add(brazoIzq);
            const brazoDer = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), new THREE.MeshStandardMaterial({ color: colorRopa }));
            brazoDer.position.set(0.5, 0.8, 0);
            grupo.add(brazoDer);
            
            const piernaIzq = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: colorRopa }));
            piernaIzq.position.set(-0.25, 0.25, 0);
            grupo.add(piernaIzq);
            const piernaDer = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: colorRopa }));
            piernaDer.position.set(0.25, 0.25, 0);
            grupo.add(piernaDer);
            
            grupo.position.set(x, 0, z);
            grupo.castShadow = true;
            return grupo;
        }
        
        function crearCasaGrande(x, z) {
            const grupo = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3.2), new THREE.MeshStandardMaterial({ color: 0xc9b6a0 }));
            base.position.y = 1.1;
            base.castShadow = true;
            grupo.add(base);
            const techo = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0xb85c1a }));
            techo.position.y = 2.3;
            techo.castShadow = true;
            grupo.add(techo);
            grupo.position.set(x, 0, z);
            return grupo;
        }
        
        function crearArbol(x, z) {
            const grupo = new THREE.Group();
            const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            tronco.position.y = 0.75;
            grupo.add(tronco);
            const copa = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshStandardMaterial({ color: 0x5a8f4c }));
            copa.position.y = 1.5;
            grupo.add(copa);
            grupo.position.set(x, 0, z);
            return grupo;
        }
        
        function spawnNuevoZombie() {
            let side = Math.floor(Math.random() * 4);
            let x, z, range = 19;
            if (side === 0) { x = -range; z = (Math.random() - 0.5) * range * 1.4; }
            else if (side === 1) { x = range; z = (Math.random() - 0.5) * range * 1.4; }
            else if (side === 2) { x = (Math.random() - 0.5) * range * 1.4; z = -range; }
            else { x = (Math.random() - 0.5) * range * 1.4; z = range; }
            
            let grupo = crearPersonaje3D(x, z, true);
            scene.add(grupo);
            npcs.push(new NPC(grupo, true, x, z));
            updateZombieCounter();
        }
        
        function updateZombieCounter() {
            const zombieCount = npcs.filter(n => n.isZombie && n.health > 0).length;
            const counter = document.getElementById('zombie-counter');
            if (counter) counter.innerHTML = `🧟 ZOMBIES: ${zombieCount}`;
        }
        
        function iniciarEscena3D(container) {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 40, 70);
            
            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.set(10, 8, 15);
            
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            container.appendChild(renderer.domElement);
            
            const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
            sunLight.position.set(12, 18, 6);
            sunLight.castShadow = true;
            scene.add(sunLight);
            scene.add(new THREE.AmbientLight(0x88aaff, 0.6));
            
            const ground = new THREE.Mesh(new THREE.PlaneGeometry(45, 45), new THREE.MeshStandardMaterial({ color: 0x5c9e4a }));
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -0.15;
            ground.receiveShadow = true;
            scene.add(ground);
            
            const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
            for (let i = -16; i <= 16; i += 5) {
                const calle = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 40), roadMat);
                calle.rotation.x = -Math.PI / 2;
                calle.position.set(i, -0.08, 0);
                scene.add(calle);
                const calle2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.5), roadMat);
                calle2.rotation.x = -Math.PI / 2;
                calle2.position.set(0, -0.08, i);
                scene.add(calle2);
            }
            
            const housePositions = [[-6,-6],[6,-6],[-6,6],[6,6],[-9,-9],[9,-9],[-9,9],[9,9],[0,-11],[0,11],[-11,0],[11,0]];
            housePositions.forEach(pos => scene.add(crearCasaGrande(pos[0], pos[1])));
            
            for (let i = 0; i < 70; i++) {
                let x = (Math.random() - 0.5) * 36;
                let z = (Math.random() - 0.5) * 36;
                if (Math.abs(x) < 13 && Math.abs(z) < 13) continue;
                scene.add(crearArbol(x, z));
            }
            
            for (let i = 0; i < 8; i++) {
                let x = (Math.random() - 0.5) * 14;
                let z = (Math.random() - 0.5) * 14;
                let grupo = crearPersonaje3D(x, z, false);
                scene.add(grupo);
                npcs.push(new NPC(grupo, false, x, z));
            }
            
            for (let i = 0; i < 8; i++) {
                let x = (Math.random() - 0.5) * 18;
                let z = (Math.random() - 0.5) * 18;
                let grupo = crearPersonaje3D(x, z, true);
                scene.add(grupo);
                npcs.push(new NPC(grupo, true, x, z));
            }
            
            updateZombieCounter();
            
            let time = 0, lastTime = performance.now();
            lastSpawnTime = performance.now() / 1000;
            
            function animate() {
                if (!scene || !renderer) return;
                let now = performance.now();
                let delta = Math.min(0.033, (now - lastTime) / 1000);
                lastTime = now;
                time += delta;
                
                let currentGameTime = performance.now() / 1000;
                if (currentGameTime - lastSpawnTime >= currentSpawnInterval) {
                    lastSpawnTime = currentGameTime;
                    spawnNuevoZombie();
                    if (currentSpawnInterval > 4) currentSpawnInterval -= 0.15;
                }
                
                for (let i = npcs.length-1; i >= 0; i--) {
                    npcs[i].update(delta, time);
                    if (npcs[i].health <= 0) {
                        scene.remove(npcs[i].group);
                        npcs.splice(i,1);
                        updateZombieCounter();
                    }
                }
                
                for (let i = bullets.length-1; i >= 0; i--) {
                    let b = bullets[i];
                    b.life -= delta * 60;
                    if (b.life <= 0 || !b.target || b.target.health <= 0) { bullets.splice(i,1); continue; }
                    let dx = b.target.x - b.pos.x, dz = b.target.z - b.pos.z, dist = Math.hypot(dx, dz);
                    if (dist < 0.6) {
                        if (b.target.takeDamage(30)) updateZombieCounter();
                        bullets.splice(i,1);
                    } else {
                        b.pos.x += (dx / dist) * 6 * delta;
                        b.pos.z += (dz / dist) * 6 * delta;
                        let bulletMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshStandardMaterial({ color: 0xffaa66 }));
                        bulletMesh.position.set(b.pos.x, 0.55, b.pos.z);
                        scene.add(bulletMesh);
                        setTimeout(() => scene.remove(bulletMesh), 40);
                    }
                }
                
                let camX = Math.sin(time * 0.08) * 9;
                let camZ = 14 + Math.cos(time * 0.12) * 3;
                camera.position.x = camX;
                camera.position.z = camZ;
                camera.position.y = 7 + Math.sin(time * 0.2) * 0.5;
                camera.lookAt(0, 1.5, 0);
                
                renderer.render(scene, camera);
                requestAnimationFrame(animate);
            }
            
            animate();
        }
        
        function iniciarAudio() {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            document.body.addEventListener('click', () => {
                if (audioContext.state === 'suspended') audioContext.resume();
            }, { once: true });
        }
        
        function mostrarMenu() {
            const container = document.getElementById('game-container');
            if (!container) return;
            
            container.innerHTML = `
                <div style="position: relative; width: 100%; height: 100%;">
                    <div id="menu-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></div>
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%); z-index: 2;"></div>
                    <div style="position: relative; z-index: 3; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%;">
                        <div style="text-align: center;">
                            <h1 style="font-size: 5rem; background: linear-gradient(135deg, #fff, #c86432); -webkit-background-clip: text; background-clip: text; color: transparent;">NULL SECTOR 7</h1>
                            <div style="width: 200px; height: 2px; background: linear-gradient(90deg, transparent, #c86432, transparent); margin: 0 auto;"></div>
                        </div>
                        <div style="margin-top: 60px; display: flex; flex-direction: column; gap: 18px; width: 280px;">
                            <button id="btn-nueva" style="background: linear-gradient(135deg, rgba(200,100,50,0.8), rgba(139,58,26,0.8)); border: 1px solid #e68a4a; color: white; padding: 14px 28px; border-radius: 8px; cursor: pointer; font-size: 1.1rem;">▶ NUEVA PARTIDA</button>
                            <button id="btn-cargar" style="background: rgba(0,0,0,0.7); border: 1px solid rgba(200,100,50,0.5); color: #e6e6e6; padding: 14px 28px; border-radius: 8px; cursor: pointer;">📁 CARGAR PARTIDA</button>
                            <button id="btn-opciones" style="background: rgba(0,0,0,0.7); border: 1px solid rgba(200,100,50,0.5); color: #e6e6e6; padding: 14px 28px; border-radius: 8px; cursor: pointer;">⚙️ OPCIONES</button>
                            <button id="btn-salir" style="background: rgba(0,0,0,0.7); border: 1px solid rgba(200,100,50,0.5); color: #e6e6e6; padding: 14px 28px; border-radius: 8px; cursor: pointer;">✖ SALIR</button>
                        </div>
                        <div style="position: absolute; bottom: 30px; color: rgba(255,255,255,0.5);">© 2026 NULL SECTOR 7</div>
                    </div>
                    <div id="zombie-counter" style="position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; color: #ff6666; font-family: monospace; font-weight: bold; z-index: 10;">🧟 ZOMBIES: 0</div>
                    <div id="spawn-timer" style="position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 20px; color: #ffaa66; font-family: monospace; z-index: 10;">⏱️ PRÓXIMO ZOMBIE: --s</div>
                </div>
            `;
            
            const canvasContainer = document.getElementById('menu-canvas');
            iniciarEscena3D(canvasContainer);
            iniciarAudio();
            
            document.getElementById('btn-nueva').onclick = () => {
                if (api && api.eventos) api.eventos.emit('menu:nueva_partida');
                alert('Conectado al tallo central');
            };
            document.getElementById('btn-cargar').onclick = () => alert('Cargar partida');
            document.getElementById('btn-opciones').onclick = () => alert('Opciones');
            document.getElementById('btn-salir').onclick = () => { if(confirm('¿Salir?')) window.close(); };
            
            function updateTimer() {
                const timerEl = document.getElementById('spawn-timer');
                if (timerEl && lastSpawnTime) {
                    let elapsed = (performance.now() / 1000) - lastSpawnTime;
                    let left = Math.max(0, currentSpawnInterval - elapsed);
                    timerEl.innerHTML = `⏱️ PRÓXIMO ZOMBIE: ${left.toFixed(1)}s`;
                }
                requestAnimationFrame(updateTimer);
            }
            updateTimer();
        }
        
        return {
            inicializar: async function(apiRecibida) {
                api = apiRecibida;
                console.log('[MENU] Inicializando...');
                
                return new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.type = 'importmap';
                    script.textContent = JSON.stringify({
                        imports: { three: 'https://unpkg.com/three@0.128.0/build/three.module.js' }
                    });
                    document.head.appendChild(script);
                    
                    const moduleScript = document.createElement('script');
                    moduleScript.type = 'module';
                    moduleScript.textContent = `
                        import * as THREE from 'three';
                        window.__THREE__ = THREE;
                        window.dispatchEvent(new Event('three-loaded'));
                    `;
                    document.head.appendChild(moduleScript);
                    
                    window.addEventListener('three-loaded', () => {
                        THREE = window.__THREE__;
                        mostrarMenu();
                        resolve();
                    }, { once: true });
                });
            },
            descargar: async function() {
                console.log('[MENU] Descargando...');
                if (renderer && renderer.domElement) renderer.domElement.remove();
                npcs = [];
                bullets = [];
            }
        };
    }
    
    // ============================================================
    // INICIALIZACIÓN DEL TALLO
    // ============================================================
    
    const tallo = {
        iniciar: async function() {
            if (estado.inicializado) return;
            
            console.log(`🚀 NULL SECTOR 7 - Tallo v${CONFIG.version}`);
            
            // Inicializar UI
            uiManager.init();
            
            // Agregar estilos si no existen
            if (!document.getElementById('tallo-styles')) {
                const style = document.createElement('style');
                style.id = 'tallo-styles';
                style.textContent = `
                    .hidden { display: none !important; }
                    #loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 10000; color: #fff; gap: 20px; }
                    .spinner { width: 60px; height: 60px; border: 4px solid rgba(200,100,50,0.2); border-top: 4px solid #c86432; border-radius: 50%; animation: spin 1s linear infinite; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `;
                document.head.appendChild(style);
            }
            
            // Crear la rama del menú y cargarla
            const menuRama = crearRamaMenu();
            await menuRama.inicializar({
                eventos, uiManager, ramaManager,
                version: CONFIG.version
            });
            
            estado.inicializado = true;
            eventos.emit('tallo:inicializado');
        }
    };
    
    window.NullSector7 = tallo;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tallo.iniciar());
    } else {
        tallo.iniciar();
    }
    
})();
