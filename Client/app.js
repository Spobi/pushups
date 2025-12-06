// Configuration
const API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3003/api';
    }
    
    // Production - all domains point to the same backend
    return 'https://pushups-m8vq.onrender.com/api';
})();

// ============ PUSHUP COUNTER CONFIGURATION ============
// UPDATE THIS NUMBER TO CHANGE THE TOTAL PUSHUPS DISPLAYED
const TOTAL_PUSHUPS = 21100;
// ======================================================

// Global state
let scene, camera, renderer, spheres = [], raycaster, mouse, touchStart, isDragging = false;
let selectedSphere = null, currentSphereId = null;
let physics = { gravity: 0, damping: 0.98, restitution: 0.8 };
let gridIndex = 0; // Track position in grid
let touchStartPosition = null; // Track initial touch position for tap vs drag detection
let lastPinchDistance = 0; // Track pinch zoom distance
let mouseDownPosition = null; // Track mouse down position for click vs drag detection
let hasDraggedMouse = false; // Track if mouse has been dragged
let treeStar = null; // The gold star at top of tree
let cameraTarget = { x: 0, y: -10 }; // Where the camera is looking
let isPanning = false; // Track if we're panning the camera
let panStart = { x: 0, y: 0 }; // Track pan start position
let pushupCounter = null; // The 3D pushup counter display
let counterAnimationStarted = false; // Track if counter animation has started
let currentCounterValue = 0; // Current displayed counter value

// ============ STAR GEOMETRY CREATION ============

function createStarGeometry(outerRadius, innerRadius, points) {
    const shape = new THREE.Shape();
    const angleStep = Math.PI / points;
    
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = i * angleStep - Math.PI / 2; // Start from top
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        if (i === 0) {
            shape.moveTo(x, y);
        } else {
            shape.lineTo(x, y);
        }
    }
    shape.closePath();
    
    // Extrude to give it depth
    const extrudeSettings = {
        depth: 0.5,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.1,
        bevelSegments: 3
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function createTreeStar() {
    // Create 5-pointed star geometry
    const starGeometry = createStarGeometry(3, 1.2, 5);
    
    // Load the buff Santa image as texture
    const textureLoader = new THREE.TextureLoader();
    const santaTexture = textureLoader.load('./buff-santa.jpg');
    
    // Create gold reflective material with Santa image overlay
    const starMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd700, // Gold color
        emissive: 0xcc9900,
        emissiveIntensity: 0.9,
        shininess: 100,
        specular: 0xffffcc,
        reflectivity: 0.2
    });
    
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    
    // Create a circular plane for the Santa image in the center of the star
    const circleGeometry = new THREE.CircleGeometry(1.5, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
        map: santaTexture,
        transparent: false
    });
    const santaCircle = new THREE.Mesh(circleGeometry, circleMaterial);
    santaCircle.position.z = 0.35; // Slightly in front of star
    
    // Create a group to hold both
    const starGroup = new THREE.Group();
    starGroup.add(starMesh);
    starGroup.add(santaCircle);
    
    // Position at top of tree (above row 0)
    starGroup.position.set(0, 6, 0);
    
    // Rotate to face camera
    starGroup.rotation.x = 0;
    starGroup.rotation.y = 0;
    
    // Enable shadows
    starMesh.castShadow = true;
    starMesh.receiveShadow = true;
    
    scene.add(starGroup);
    treeStar = starGroup;
    
    return starGroup;
}

function updateStarPosition() {
    if (!treeStar) return;
    
    // Position star above the top of the tree
    // The tree grows downward, so the top is always at y=0 or slightly above
    const starY = 5; // Fixed position above the tree top
    treeStar.position.set(0, starY, 0);
}

// ============ TREE TRIANGLE BACKGROUND ============

function createPineNeedleTexture() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Higher resolution for better detail
    canvas.width = 512;
    canvas.height = 512;
    
    // Base dark green background
    ctx.fillStyle = '#1a4d2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw layers of pine needle clusters
    const needleColors = ['#2d5a3a', '#1e5530', '#3a6b48', '#244f35', '#1a5c2e', '#2a6640'];
    
    // Draw many small needle clusters
    for (let i = 0; i < 800; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const clusterSize = 8 + Math.random() * 12;
        const rotation = Math.random() * Math.PI * 2;
        
        drawNeedleCluster(ctx, x, y, clusterSize, rotation, needleColors);
    }
    
    // Add some lighter highlights
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const clusterSize = 6 + Math.random() * 8;
        const rotation = Math.random() * Math.PI * 2;
        
        drawNeedleCluster(ctx, x, y, clusterSize, rotation, ['#4a7a58', '#5a8a68', '#3d6b4a']);
    }
    
    // Add subtle dark shadows
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const clusterSize = 10 + Math.random() * 15;
        const rotation = Math.random() * Math.PI * 2;
        
        drawNeedleCluster(ctx, x, y, clusterSize, rotation, ['#0f3320', '#153d28', '#1a4430']);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 8); // Tile the texture
    
    return texture;
}

function drawNeedleCluster(ctx, x, y, size, rotation, colors) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Draw 5-8 needles radiating from center point
    const needleCount = 5 + Math.floor(Math.random() * 4);
    
    for (let i = 0; i < needleCount; i++) {
        const angle = (i / needleCount) * Math.PI - Math.PI / 2; // Fan out upward
        const needleLength = size * (0.7 + Math.random() * 0.3);
        const needleWidth = 1 + Math.random() * 1.5;
        
        ctx.beginPath();
        ctx.strokeStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.lineWidth = needleWidth;
        ctx.lineCap = 'round';
        
        // Draw needle as a slightly curved line
        const endX = Math.cos(angle) * needleLength;
        const endY = Math.sin(angle) * needleLength;
        const controlX = Math.cos(angle) * needleLength * 0.5 + (Math.random() - 0.5) * 3;
        const controlY = Math.sin(angle) * needleLength * 0.5 + (Math.random() - 0.5) * 3;
        
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();
    }
    
    ctx.restore();
}

function createTreeTriangle() {
    // Create a triangle shape for the Christmas tree background
    const shape = new THREE.Shape();
    
    // Triangle dimensions - sized to fit behind all spheres
    // Top point aligns with star, bottom spans wider than bottom row
    const topY = 4;         // Just below the star
    const bottomY = -48;    // Below the last row of spheres
    const bottomWidth = 55; // Wide enough for 10 spheres in bottom row
    
    // Draw triangle: start at top, go to bottom-left, bottom-right, back to top
    shape.moveTo(0, topY);                    // Top point (centered)
    shape.lineTo(-bottomWidth / 2, bottomY); // Bottom left
    shape.lineTo(bottomWidth / 2, bottomY);  // Bottom right
    shape.lineTo(0, topY);                   // Back to top
    
    // Create geometry from shape
    const geometry = new THREE.ShapeGeometry(shape);
    
    // Generate UV coordinates for texture mapping
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const uvAttribute = geometry.attributes.position;
    const uvArray = [];
    
    for (let i = 0; i < uvAttribute.count; i++) {
        const x = uvAttribute.getX(i);
        const y = uvAttribute.getY(i);
        
        // Map positions to 0-1 UV range
        const u = (x - boundingBox.min.x) / (boundingBox.max.x - boundingBox.min.x);
        const v = (y - boundingBox.min.y) / (boundingBox.max.y - boundingBox.min.y);
        
        uvArray.push(u, v);
    }
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
    
    // Compute normals for proper lighting
    geometry.computeVertexNormals();
    
    // Create pine needle texture
    const pineTexture = createPineNeedleTexture();
    
    // Use MeshStandardMaterial for shadow receiving
    const material = new THREE.MeshStandardMaterial({
        map: pineTexture,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0
    });
    
    const triangle = new THREE.Mesh(geometry, material);
    
    // Position behind the spheres on z-axis (closer for softer shadows)
    triangle.position.z = -2;
    
    // Enable shadow receiving
    triangle.receiveShadow = true;
    
    scene.add(triangle);
    
    return triangle;
}

// ============ PUSHUP COUNTER DISPLAY ============

function createCounterTexture(value) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // High resolution for crisp text
    canvas.width = 512;
    canvas.height = 384;
    
    // Create gradient background (festive red with slight depth)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#c41e3a');    // Christmas red
    gradient.addColorStop(0.5, '#a01830');
    gradient.addColorStop(1, '#8b1528');
    
    // Draw rounded rectangle background
    const cornerRadius = 40;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cornerRadius, 0);
    ctx.lineTo(canvas.width - cornerRadius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
    ctx.lineTo(canvas.width, canvas.height - cornerRadius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
    ctx.lineTo(cornerRadius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
    ctx.lineTo(0, cornerRadius);
    ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
    ctx.closePath();
    ctx.fill();
    
    // Add subtle border
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Add inner glow/highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Draw "TOTAL PUSHUPS" header
    ctx.fillStyle = '#1a5c2e';  // Christmas green
    ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add text shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillText('TOTAL PUSHUPS', canvas.width / 2, 80);
    
    // Draw the number (large and bold)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 140px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    // Format number with commas
    const formattedNumber = Math.floor(value).toLocaleString();
    ctx.fillText(formattedNumber, canvas.width / 2, 240);
    
    // Add a small decorative element (💪 emoji effect with circles)
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw small decorative dots
    ctx.fillStyle = '#ffd700';
    const dotY = 330;
    for (let i = 0; i < 5; i++) {
        const dotX = canvas.width / 2 - 60 + i * 30;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
}

function createPushupCounter() {
    // Create the counter display as a 3D plane
    const width = 20;
    const height = 15;
    
    // Create geometry with slight rounded corners effect via segments
    const geometry = new THREE.PlaneGeometry(width, height);
    
    // Create initial texture with 0
    const texture = createCounterTexture(0);
    
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    const counterMesh = new THREE.Mesh(geometry, material);
    
    // Position to the right of the tree
    // Tree extends to about x=25 at bottom, so place counter at x=45
    counterMesh.position.set(45, -15, 2);
    
    // Slight rotation to give 3D feel
    counterMesh.rotation.y = -0.15;
    
    // Enable shadows
    counterMesh.castShadow = true;
    counterMesh.receiveShadow = true;
    
    // Store reference for animation
    counterMesh.userData = {
        texture: texture,
        targetValue: TOTAL_PUSHUPS,
        currentValue: 0
    };
    
    scene.add(counterMesh);
    pushupCounter = counterMesh;
    
    return counterMesh;
}

function updateCounterDisplay(value) {
    if (!pushupCounter) return;
    
    // Create new texture with updated value
    const newTexture = createCounterTexture(value);
    
    // Dispose old texture
    if (pushupCounter.material.map) {
        pushupCounter.material.map.dispose();
    }
    
    // Apply new texture
    pushupCounter.material.map = newTexture;
    pushupCounter.material.needsUpdate = true;
    pushupCounter.userData.currentValue = value;
    currentCounterValue = value;
}

function animateCounterUp() {
    if (!pushupCounter || counterAnimationStarted) return;
    
    counterAnimationStarted = true;
    const targetValue = TOTAL_PUSHUPS;
    const duration = 2000; // 2 seconds for the count-up
    const startTime = Date.now();
    const startValue = 0;
    
    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }
    
    function updateCounter() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuart(progress);
        
        const currentValue = Math.floor(startValue + (targetValue - startValue) * easedProgress);
        updateCounterDisplay(currentValue);
        
        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    }
    
    updateCounter();
}

// ============ INITIALIZATION ============

// Christmas emojis for loading screen
const christmasEmojis = ['🎄', '🎅', '⛄', '🎁', '⭐', '🌟', '❄️', '🕯️', '🦌', '🤶', '💯'];

function createFallingEmoji() {
    const emojiContainer = document.getElementById('emoji-container');
    const emoji = document.createElement('div');
    emoji.className = 'falling-emoji';
    emoji.textContent = christmasEmojis[Math.floor(Math.random() * christmasEmojis.length)];
    emoji.style.left = Math.random() * 100 + '%';
    emoji.style.animationDuration = (2 + Math.random() * 3) + 's';
    emoji.style.animationDelay = Math.random() * 2 + 's';
    emojiContainer.appendChild(emoji);

    setTimeout(() => emoji.remove(), 5000);
}

// Create falling emojis during loading
const emojiInterval = setInterval(() => {
    if (document.getElementById('loading-screen').classList.contains('hidden')) {
        clearInterval(emojiInterval);
    } else {
        createFallingEmoji();
    }
}, 200);

// ============ THREE.JS SETUP ============

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // White background
    // Remove fog for cleaner white background
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(cameraTarget.x, cameraTarget.y, 40); // Use cameraTarget for initial position
    camera.lookAt(cameraTarget.x, cameraTarget.y, 0); // Look at target

    // Renderer with shadow support
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting - higher ambient for softer shadows
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    // Main directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(5, 15, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -60;
    directionalLight.shadow.radius = 4; // Softer shadow edges
    scene.add(directionalLight);

    // Secondary softer light
    const pointLight = new THREE.PointLight(0xffffff, 0.3, 100);
    pointLight.position.set(-10, 10, -10);
    scene.add(pointLight);

    // Ground plane to receive shadows - expanded for larger tree
    const groundGeometry = new THREE.PlaneGeometry(150, 150);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -55; // Position below 10-row tree
    ground.receiveShadow = true;
    scene.add(ground);

    // Raycaster for click detection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
    
    // Create the gold star at the top of the tree
    createTreeStar();
    
    // Create Christmas tree triangle behind spheres
    createTreeTriangle();
    
    // Create the pushup counter display
    createPushupCounter();
}

// ============ SPHERE CREATION ============

function createSphere(data) {
    const geometry = new THREE.SphereGeometry(2, 32, 32); // Increased size from 1 to 2
    
    // Load texture
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(data.image_url);
    
    // Center the texture on the sphere
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    // Adjust texture offset and repeat to center it
    // This makes the center of the image appear on the front of the sphere
    texture.offset.set(0.25, 0); // Center horizontally
    texture.repeat.set(1, 1); // Show 100% of image
    texture.center.set(0.5, 0.5); // Set rotation center
    
    // Create material with color based on failure status
    const material = new THREE.MeshPhongMaterial({
        map: texture,
        color: data.is_failed ? 0xff2222 : 0xe8fff0,
        emissive: data.is_failed ? 0x990000 : 0x1a4d2e,
        emissiveIntensity: 0.1,
        shininess: 100,
        reflectivity: 0.8,
        envMap: null,
        combine: THREE.MixOperation,
        reflectivity: 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Enable shadow casting
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Arrange spheres in triangle formation (Christmas tree style)
    // Tree structure: Row 0 = 1 sphere, Row 1 = 2 spheres, ... Row 9 = 10 spheres
    // Total capacity: 1+2+3+4+5+6+7+8+9+10 = 55 spheres (supports 50+)
    const spacing = 5; // Space between spheres
    
    // Calculate triangle position
    // Find which row this sphere belongs to
    let row = 0;
    let rowStartIndex = 0;
    while (rowStartIndex + row + 1 <= gridIndex) {
        rowStartIndex += row + 1;
        row++;
    }
    
    // Position within the row (0-indexed)
    const col = gridIndex - rowStartIndex;
    const spheresInRow = row + 1;
    
    // Center the triangle and flip it upside down (point at top)
    // Invert the row so row 0 is at the top
    const invertedRow = row;
    const offsetX = (spheresInRow - 1) * spacing / 2;
    
    mesh.position.set(
        col * spacing - offsetX,
        -invertedRow * spacing, // Negative to go down from top
        0 // All spheres on same plane
    );
    
    gridIndex++; // Increment for next sphere

    // Physics properties - start with no initial velocity
    mesh.velocity = new THREE.Vector3(0, 0, 0);

    mesh.userData = {
        id: data.id,
        name: data.name,
        bio: data.bio,
        image_url: data.image_url,
        is_failed: data.is_failed,
        isDragging: false,
        originalPosition: mesh.position.clone(),
        gridRow: row,
        gridCol: col
    };

    scene.add(mesh);
    spheres.push(mesh);
    
    return mesh;
}

function updateSphereColor(sphereId, isFailed) {
    const sphere = spheres.find(s => s.userData.id === sphereId);
    if (sphere) {
        sphere.material.color.setHex(isFailed ? 0xff2222 : 0xe8fff0);
        sphere.material.emissive.setHex(isFailed ? 0x990000 : 0x1a4d2e);
        sphere.material.emissiveIntensity = 0.1;
        sphere.userData.is_failed = isFailed;
    }
}

function removeSphere(sphereId) {
    const index = spheres.findIndex(s => s.userData.id === sphereId);
    if (index !== -1) {
        scene.remove(spheres[index]);
        spheres[index].geometry.dispose();
        spheres[index].material.dispose();
        spheres.splice(index, 1);
    }
}

// ============ PHYSICS & ANIMATION ============

function updatePhysics() {
    if (isDragging && selectedSphere) return;

    spheres.forEach(sphere => {
        if (sphere.userData.isDragging) return;

        // Update position based on velocity
        sphere.position.add(sphere.velocity);

        // Keep spheres on the same Z plane (z=0) for better collisions
        sphere.position.z = 0;
        sphere.velocity.z = 0;

        // Boundary collision (invisible walls) - expanded for 10-row tree
        const boundaryX = 30; // Wide enough for bottom row (10 spheres)
        const boundaryY = 50; // Tall enough for 10 rows
        if (Math.abs(sphere.position.x) > boundaryX) {
            sphere.position.x = Math.sign(sphere.position.x) * boundaryX;
            sphere.velocity.x *= -physics.restitution;
        }
        if (sphere.position.y > 10) { // Top boundary
            sphere.position.y = 10;
            sphere.velocity.y *= -physics.restitution;
        }
        if (sphere.position.y < -boundaryY) { // Bottom boundary
            sphere.position.y = -boundaryY;
            sphere.velocity.y *= -physics.restitution;
        }

        // Apply damping
        sphere.velocity.multiplyScalar(physics.damping);
    });

    // Sphere-to-sphere collision
    for (let i = 0; i < spheres.length; i++) {
        for (let j = i + 1; j < spheres.length; j++) {
            const sphere1 = spheres[i];
            const sphere2 = spheres[j];

            if (sphere1.userData.isDragging || sphere2.userData.isDragging) continue;

            const distance = sphere1.position.distanceTo(sphere2.position);
            const minDistance = 4; // Sum of radii (2 + 2)

            if (distance < minDistance) {
                // Calculate collision response
                const normal = new THREE.Vector3()
                    .subVectors(sphere2.position, sphere1.position)
                    .normalize();

                const relativeVelocity = new THREE.Vector3()
                    .subVectors(sphere1.velocity, sphere2.velocity);

                const speed = relativeVelocity.dot(normal);

                if (speed < 0) continue;

                // Apply impulse
                const impulse = normal.multiplyScalar(speed * physics.restitution);
                sphere1.velocity.sub(impulse);
                sphere2.velocity.add(impulse);

                // Separate spheres
                const overlap = (minDistance - distance) / 2;
                const separation = normal.multiplyScalar(overlap);
                sphere1.position.sub(separation);
                sphere2.position.add(separation);
                
                // Keep on same Z plane after collision
                sphere1.position.z = 0;
                sphere2.position.z = 0;
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    updatePhysics();
    
    // Animate the tree star (gentle floating and rotation)
    if (treeStar) {
        const time = Date.now() * 0.001;
        treeStar.position.y = 6 + Math.sin(time) * 0.3; // Gentle bobbing above tree
        treeStar.rotation.z = Math.sin(time * 0.5) * 0.1; // Slight wobble
    }
    
    // Animate the pushup counter (gentle floating)
    if (pushupCounter) {
        const time = Date.now() * 0.001;
        pushupCounter.position.y = -15 + Math.sin(time * 0.8 + 1) * 0.5; // Gentle bobbing
        pushupCounter.rotation.y = -0.15 + Math.sin(time * 0.3) * 0.03; // Very subtle rotation
    }
    
    // Don't rotate spheres - keep images visible

    renderer.render(scene, camera);
}

// ============ INPUT HANDLING ============

function getMousePosition(event) {
    if (event.touches) {
        mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    } else {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
}

function onTouchStart(event) {
    event.preventDefault();
    
    // Handle pinch zoom with two fingers
    if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
        return;
    }
    
    getMousePosition(event);
    
    // Store initial touch position for tap detection
    touchStartPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(spheres);

    if (intersects.length > 0) {
        selectedSphere = intersects[0].object;
        selectedSphere.userData.isDragging = true;
        isDragging = true;
        touchStart = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
            time: Date.now()
        };
    } else {
        touchStart = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
            time: Date.now()
        };
    }
}

function onTouchMove(event) {
    event.preventDefault();
    
    // Handle pinch zoom with two fingers
    if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (lastPinchDistance > 0) {
            const delta = distance - lastPinchDistance;
            const zoomSpeed = 0.8;
            
            // Zoom camera
            camera.position.z -= delta * zoomSpeed;
            // Clamp zoom - extended range for larger tree
            camera.position.z = Math.max(10, Math.min(120, camera.position.z));
            
            // Keep looking at the same target
            camera.lookAt(cameraTarget.x, cameraTarget.y, 0);
        }
        
        lastPinchDistance = distance;
        return;
    }
    
    if (selectedSphere && isDragging) {
        getMousePosition(event);
        raycaster.setFromCamera(mouse, camera);
        
        const distance = selectedSphere.position.distanceTo(camera.position);
        const point = new THREE.Vector3();
        raycaster.ray.at(distance, point);
        
        selectedSphere.position.copy(point);
        selectedSphere.position.z = 0; // Keep on same plane
        
        // Calculate velocity for throw
        if (touchStart) {
            const deltaX = event.touches[0].clientX - touchStart.x;
            const deltaY = event.touches[0].clientY - touchStart.y;
            const deltaTime = Date.now() - touchStart.time;
            
            selectedSphere.velocity.x = (deltaX / deltaTime) * 0.05;
            selectedSphere.velocity.y = -(deltaY / deltaTime) * 0.05;
            selectedSphere.velocity.z = 0; // No Z velocity
            
            touchStart = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: Date.now()
            };
        }
    } else if (!isDragging && !selectedSphere) {
        // Camera panning by swiping on empty space
        if (event.touches.length === 1 && touchStart) {
            const deltaX = event.touches[0].clientX - touchStart.x;
            const deltaY = event.touches[0].clientY - touchStart.y;
            
            // Scale pan speed based on zoom level
            const panSpeed = camera.position.z * 0.003;
            
            cameraTarget.x -= deltaX * panSpeed;
            cameraTarget.y += deltaY * panSpeed;
            
            // Update camera position and look-at
            camera.position.x = cameraTarget.x;
            camera.position.y = cameraTarget.y;
            camera.lookAt(cameraTarget.x, cameraTarget.y, 0);
            
            touchStart = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: Date.now()
            };
        }
    }
}

function onTouchEnd(event) {
    event.preventDefault();
    
    // Reset pinch zoom tracking
    if (event.touches.length < 2) {
        lastPinchDistance = 0;
    }
    
    // Check if this was a tap (no significant movement) vs a drag
    if (touchStartPosition && event.changedTouches.length > 0) {
        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const deltaX = Math.abs(endX - touchStartPosition.x);
        const deltaY = Math.abs(endY - touchStartPosition.y);
        const tapThreshold = 10; // pixels
        
        // If movement was minimal, treat as a tap
        if (deltaX < tapThreshold && deltaY < tapThreshold && selectedSphere) {
            openDetailModal(selectedSphere.userData.id);
        }
    }
    
    if (selectedSphere && isDragging) {
        selectedSphere.userData.isDragging = false;
        selectedSphere = null;
        isDragging = false;
    }
    
    touchStart = null;
    touchStartPosition = null;
}

function onMouseDown(event) {
    getMousePosition(event);
    
    // Store initial mouse position for drag detection
    mouseDownPosition = { x: event.clientX, y: event.clientY };
    hasDraggedMouse = false;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(spheres);

    if (intersects.length > 0) {
        selectedSphere = intersects[0].object;
        selectedSphere.userData.isDragging = true;
        isDragging = true;
    } else {
        // No sphere clicked - start panning
        isPanning = true;
        panStart = { x: event.clientX, y: event.clientY };
    }
}

function onMouseMove(event) {
    // Check if mouse has moved significantly (drag detection)
    if (mouseDownPosition && !hasDraggedMouse) {
        const deltaX = Math.abs(event.clientX - mouseDownPosition.x);
        const deltaY = Math.abs(event.clientY - mouseDownPosition.y);
        const dragThreshold = 5; // pixels
        
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
            hasDraggedMouse = true;
        }
    }
    
    if (selectedSphere && isDragging) {
        getMousePosition(event);
        raycaster.setFromCamera(mouse, camera);
        
        const distance = selectedSphere.position.distanceTo(camera.position);
        const point = new THREE.Vector3();
        raycaster.ray.at(distance, point);
        
        selectedSphere.position.copy(point);
        selectedSphere.position.z = 0; // Keep on same plane
        selectedSphere.velocity.set(
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05,
            0 // No Z velocity
        );
    } else if (isPanning) {
        // Pan the camera
        const deltaX = event.clientX - panStart.x;
        const deltaY = event.clientY - panStart.y;
        
        // Scale pan speed based on zoom level
        const panSpeed = camera.position.z * 0.002;
        
        cameraTarget.x -= deltaX * panSpeed;
        cameraTarget.y += deltaY * panSpeed;
        
        // Update camera position and look-at
        camera.position.x = cameraTarget.x;
        camera.position.y = cameraTarget.y;
        camera.lookAt(cameraTarget.x, cameraTarget.y, 0);
        
        panStart = { x: event.clientX, y: event.clientY };
    }
}

function onMouseUp() {
    if (selectedSphere && isDragging) {
        selectedSphere.userData.isDragging = false;
        selectedSphere = null;
        isDragging = false;
    }
    isPanning = false;
    mouseDownPosition = null;
}

function onClick(event) {
    // Only open modal if we didn't drag
    if (hasDraggedMouse) {
        hasDraggedMouse = false;
        return;
    }
    
    getMousePosition(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(spheres);

    if (intersects.length > 0) {
        const sphere = intersects[0].object;
        openDetailModal(sphere.userData.id);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseWheel(event) {
    event.preventDefault();
    
    // Zoom camera based on scroll direction
    const zoomSpeed = 10.0;
    camera.position.z += event.deltaY * zoomSpeed * 0.01;
    
    // Clamp zoom - extended range for larger tree
    camera.position.z = Math.max(10, Math.min(120, camera.position.z));
    
    // Keep looking at the same target
    camera.lookAt(cameraTarget.x, cameraTarget.y, 0);
}

// ============ API FUNCTIONS ============

async function fetchSpheres() {
    const startTime = Date.now();
    
    try {
        const response = await fetch(`${API_BASE_URL}/spheres`);
        if (!response.ok) throw new Error('Failed to fetch spheres');
        const data = await response.json();
        
        data.forEach(sphereData => {
            createSphere(sphereData);
        });
        
        // Ensure loading screen shows for at least 3 seconds
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 3000 - elapsedTime);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching spheres:', error);
        showToast('Failed to load spheres', 'error');
        
        // Still wait minimum time even on error
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 3000 - elapsedTime);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
        
        hideLoading();
    }
}

async function createNewSphere(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create sphere');
        }

        const data = await response.json();
        createSphere(data);
        showToast('Successfully joined the challenge!', 'success');
        return data;
    } catch (error) {
        console.error('Error creating sphere:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

async function fetchSphereDetails(sphereId) {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres/${sphereId}`);
        if (!response.ok) throw new Error('Failed to fetch sphere details');
        return await response.json();
    } catch (error) {
        console.error('Error fetching sphere details:', error);
        showToast('Failed to load details', 'error');
        throw error;
    }
}

async function addComment(sphereId, commentText, authorName) {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres/${sphereId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                comment_text: commentText,
                author_name: authorName || 'Anonymous'
            })
        });

        if (!response.ok) throw new Error('Failed to add comment');
        return await response.json();
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Failed to add comment', 'error');
        throw error;
    }
}

async function toggleFailureStatus(sphereId, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres/${sphereId}/toggle-failure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to toggle status');
        }

        const data = await response.json();
        updateSphereColor(sphereId, data.is_failed);
        showToast(`Status ${data.is_failed ? 'failed' : 'active'}`, 'success');
        return data;
    } catch (error) {
        console.error('Error toggling failure:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

async function deleteSphere(sphereId, adminPassword) {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres/${sphereId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ adminPassword })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete sphere');
        }

        removeSphere(sphereId);
        closeDetailModal();
        showToast('Sphere deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting sphere:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

// ============ UI FUNCTIONS ============

function hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        // Start the counter animation after loading screen fades out
        animateCounterUp();
    }, 500);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openAddModal() {
    document.getElementById('add-modal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('add-modal').classList.remove('active');
    document.getElementById('add-sphere-form').reset();
    document.getElementById('file-name').textContent = 'No file chosen';
    document.getElementById('file-name').style.color = '#666';
    document.getElementById('file-name').style.fontWeight = 'normal';
    croppedImageBlob = null;
    cropImage = null;
}

async function openDetailModal(sphereId) {
    currentSphereId = sphereId;
    const modal = document.getElementById('detail-modal');
    
    try {
        const data = await fetchSphereDetails(sphereId);
        
        document.getElementById('detail-image').src = data.sphere.image_url;
        document.getElementById('detail-name').textContent = data.sphere.name;
        document.getElementById('detail-bio').textContent = data.sphere.bio || 'No bio provided';
        
        // Update skull button
        const skullButton = document.getElementById('skull-button');
        if (data.sphere.is_failed) {
            skullButton.classList.add('active');
        } else {
            skullButton.classList.remove('active');
        }
        
        // Display comments
        const commentsList = document.getElementById('comments-list');
        if (data.comments.length === 0) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
        } else {
            commentsList.innerHTML = data.comments.map(comment => `
                <div class="comment">
                    <div class="comment-author">${comment.author_name || 'Anonymous'}</div>
                    <div class="comment-text">${comment.comment_text}</div>
                    <div class="comment-date">${new Date(comment.created_at).toLocaleDateString()}</div>
                </div>
            `).join('');
        }
        
        modal.classList.add('active');
    } catch (error) {
        console.error('Error opening detail modal:', error);
    }
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
    document.getElementById('add-comment-form').reset();
    currentSphereId = null;
}

// ============ IMAGE CROPPING MODAL FUNCTIONALITY ============

let croppedImageBlob = null;
let cropImage = null;
let cropZoom = 1;
let cropPosition = { x: 0, y: 0 };
let isCropping = false;
let cropDragStart = { x: 0, y: 0 };

function openCropModal(file) {
    console.log('Opening crop modal for:', file.name);
    const modal = document.getElementById('crop-modal');
    const cropImageEl = document.getElementById('crop-image');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        cropImageEl.src = e.target.result;
        cropImage = new Image();
        cropImage.src = e.target.result;
        
        cropImage.onload = function() {
            console.log('Image loaded for cropping:', cropImage.width, 'x', cropImage.height);
            initializeCropPosition();
            modal.classList.add('active');
        };
    };
    
    reader.readAsDataURL(file);
}

function initializeCropPosition() {
    const cropImageEl = document.getElementById('crop-image');
    const circleSize = 300;
    
    // Calculate scale to cover the circle
    let scale;
    if (cropImage.width > cropImage.height) {
        scale = circleSize / cropImage.height;
    } else {
        scale = circleSize / cropImage.width;
    }
    
    const scaledWidth = cropImage.width * scale;
    const scaledHeight = cropImage.height * scale;
    
    cropImageEl.style.width = scaledWidth + 'px';
    cropImageEl.style.height = scaledHeight + 'px';
    
    // Center the image
    cropPosition.x = (circleSize - scaledWidth) / 2;
    cropPosition.y = (circleSize - scaledHeight) / 2;
    
    cropImageEl.style.left = cropPosition.x + 'px';
    cropImageEl.style.top = cropPosition.y + 'px';
    
    // Reset zoom
    cropZoom = 1;
    document.getElementById('zoom-slider').value = 100;
}

function closeCropModal() {
    document.getElementById('crop-modal').classList.remove('active');
}

function resetCropPosition() {
    initializeCropPosition();
}

function onCropDragStart(e) {
    isCropping = true;
    
    if (e.type === 'touchstart') {
        cropDragStart.x = e.touches[0].clientX - cropPosition.x;
        cropDragStart.y = e.touches[0].clientY - cropPosition.y;
    } else {
        cropDragStart.x = e.clientX - cropPosition.x;
        cropDragStart.y = e.clientY - cropPosition.y;
    }
    
    e.preventDefault();
}

function onCropDragMove(e) {
    if (!isCropping) return;
    
    const cropImageEl = document.getElementById('crop-image');
    if (!cropImageEl) return;
    
    if (e.type === 'touchmove') {
        cropPosition.x = e.touches[0].clientX - cropDragStart.x;
        cropPosition.y = e.touches[0].clientY - cropDragStart.y;
    } else {
        cropPosition.x = e.clientX - cropDragStart.x;
        cropPosition.y = e.clientY - cropDragStart.y;
    }
    
    cropImageEl.style.left = cropPosition.x + 'px';
    cropImageEl.style.top = cropPosition.y + 'px';
    
    e.preventDefault();
}

function onCropDragEnd(e) {
    if (isCropping) {
        isCropping = false;
    }
    // Don't prevent default here to allow other interactions
}

function onZoomChange(e) {
    const zoomValue = parseInt(e.target.value);
    cropZoom = zoomValue / 100;
    
    const cropImageEl = document.getElementById('crop-image');
    const circleSize = 300;
    
    // Calculate new dimensions
    let baseScale;
    if (cropImage.width > cropImage.height) {
        baseScale = circleSize / cropImage.height;
    } else {
        baseScale = circleSize / cropImage.width;
    }
    
    const scaledWidth = cropImage.width * baseScale * cropZoom;
    const scaledHeight = cropImage.height * baseScale * cropZoom;
    
    // Get center point before zoom
    const oldWidth = parseInt(cropImageEl.style.width);
    const oldHeight = parseInt(cropImageEl.style.height);
    const centerX = cropPosition.x + oldWidth / 2;
    const centerY = cropPosition.y + oldHeight / 2;
    
    // Apply new dimensions
    cropImageEl.style.width = scaledWidth + 'px';
    cropImageEl.style.height = scaledHeight + 'px';
    
    // Adjust position to maintain center
    cropPosition.x = centerX - scaledWidth / 2;
    cropPosition.y = centerY - scaledHeight / 2;
    
    cropImageEl.style.left = cropPosition.x + 'px';
    cropImageEl.style.top = cropPosition.y + 'px';
}

async function confirmCrop() {
    console.log('Confirming crop');
    
    return new Promise((resolve, reject) => {
        try {
            const cropImageEl = document.getElementById('crop-image');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const size = 512; // Output size
            canvas.width = size;
            canvas.height = size;
            
            // Create circular clipping path
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // Calculate scale from preview (300px) to final (512px)
            const scale = size / 300;
            
            // Draw the image at the positioned location, scaled up
            const scaledX = cropPosition.x * scale;
            const scaledY = cropPosition.y * scale;
            const scaledWidth = parseInt(cropImageEl.style.width) * scale;
            const scaledHeight = parseInt(cropImageEl.style.height) * scale;
            
            ctx.drawImage(cropImage, scaledX, scaledY, scaledWidth, scaledHeight);
            
            // Convert to blob
            canvas.toBlob((blob) => {
                if (blob) {
                    croppedImageBlob = blob;
                    console.log('Crop successful, blob size:', blob.size);
                    closeCropModal();
                    
                    // Update file name to show image is ready
                    document.getElementById('file-name').textContent = 'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Photo positioned and ready';
                    document.getElementById('file-name').style.color = '#2d5016';
                    document.getElementById('file-name').style.fontWeight = '600';
                    
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create image blob'));
                }
            }, 'image/jpeg', 0.9);
        } catch (err) {
            reject(err);
        }
    });
}

// ============ EVENT LISTENERS ============

document.getElementById('add-button').addEventListener('click', openAddModal);
document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
document.getElementById('detail-modal-close').addEventListener('click', closeDetailModal);

// Close modals on background click
document.getElementById('add-modal').addEventListener('click', (e) => {
    if (e.target.id === 'add-modal') closeAddModal();
});
document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') closeDetailModal();
});

// File input display - opens crop modal
document.getElementById('image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        openCropModal(file);
    }
});

// Crop modal event listeners
const cropCircle = document.getElementById('crop-circle');
if (cropCircle) {
    cropCircle.addEventListener('mousedown', onCropDragStart);
    cropCircle.addEventListener('mousemove', onCropDragMove);
    cropCircle.addEventListener('mouseup', onCropDragEnd);
    cropCircle.addEventListener('mouseleave', onCropDragEnd);
    
    cropCircle.addEventListener('touchstart', onCropDragStart, { passive: false });
    cropCircle.addEventListener('touchmove', onCropDragMove, { passive: false });
    cropCircle.addEventListener('touchend', onCropDragEnd, { passive: false });
}

document.getElementById('zoom-slider').addEventListener('input', onZoomChange);
document.getElementById('crop-reset-btn').addEventListener('click', resetCropPosition);
document.getElementById('crop-confirm-btn').addEventListener('click', confirmCrop);

// Add sphere form
document.getElementById('add-sphere-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = document.getElementById('submit-sphere');
    submitButton.disabled = true;
    submitButton.textContent = 'Uploading...';
    
    try {
        // Check if image was cropped
        if (!croppedImageBlob) {
            throw new Error('Please select and position a photo first');
        }
        
        const formData = new FormData();
        formData.append('name', document.getElementById('name-input').value);
        formData.append('bio', document.getElementById('bio-input').value);
        formData.append('image', croppedImageBlob, 'profile.jpg');
        
        await createNewSphere(formData);
        closeAddModal();
    } catch (error) {
        console.error('Error submitting form:', error);
        showToast(error.message || 'Failed to upload', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Join Challenge';
    }
});

// Add comment form
document.getElementById('add-comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const commentText = document.getElementById('comment-text').value;
    const authorName = document.getElementById('comment-author').value;
    
    try {
        await addComment(currentSphereId, commentText, authorName);
        // Refresh the modal
        await openDetailModal(currentSphereId);
        document.getElementById('comment-text').value = '';
        document.getElementById('comment-author').value = '';
    } catch (error) {
        // Error already shown
    }
});

// Skull button
document.getElementById('skull-button').addEventListener('click', async () => {
    const password = prompt('Enter password to toggle failure status:');
    if (password) {
        try {
            await toggleFailureStatus(currentSphereId, password);
            // Refresh modal
            await openDetailModal(currentSphereId);
        } catch (error) {
            // Error already shown
        }
    }
});

// Delete button
document.getElementById('delete-sphere-button').addEventListener('click', async () => {
    const confirmed = confirm('Are you sure you want to delete this sphere? This cannot be undone.');
    if (confirmed) {
        const adminPassword = prompt('Enter admin password:');
        if (adminPassword) {
            await deleteSphere(currentSphereId, adminPassword);
        }
    }
});

// ============ INITIALIZE APPLICATION ============

initThreeJS();
fetchSpheres();
animate();