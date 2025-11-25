// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3003/api' 
    : 'https://pushups-m8vq.onrender.com/api';

// Global state
let scene, camera, renderer, spheres = [], raycaster, mouse, touchStart, isDragging = false;
let selectedSphere = null, currentSphereId = null;
let physics = { gravity: 0, damping: 0.98, restitution: 0.8 };

// ============ INITIALIZATION ============

// Christmas emojis for loading screen
const christmasEmojis = ['🎄', '🎅', '⛄', '🎁', '❄️', '🔔', '⭐', '🕯️', '🦌', '🤶'];

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
    scene.background = new THREE.Color(0x0a0e1a);
    scene.fog = new THREE.Fog(0x0a0e1a, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 15;

    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x4ade80, 1, 100);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x22c55e, 0.5, 100);
    pointLight2.position.set(-10, -10, -10);
    scene.add(pointLight2);

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
}

// ============ SPHERE CREATION ============

function createSphere(data) {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    
    // Load texture
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(data.image_url);
    
    // Create green ornament-like material
    const material = new THREE.MeshPhongMaterial({
        map: texture,
        color: data.is_failed ? 0xff0000 : 0x4ade80,
        emissive: data.is_failed ? 0x660000 : 0x1a4d2e,
        emissiveIntensity: 0.2,
        shininess: 100,
        reflectivity: 0.8,
        envMap: null,
        combine: THREE.MixOperation,
        reflectivity: 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Set position (random if not saved, otherwise use saved position)
    if (data.position_x !== 0 || data.position_y !== 0 || data.position_z !== 0) {
        mesh.position.set(data.position_x, data.position_y, data.position_z);
    } else {
        mesh.position.set(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );
    }

    // Physics properties
    mesh.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
    );

    mesh.userData = {
        id: data.id,
        name: data.name,
        bio: data.bio,
        image_url: data.image_url,
        is_failed: data.is_failed,
        isDragging: false,
        originalPosition: mesh.position.clone()
    };

    scene.add(mesh);
    spheres.push(mesh);
    
    return mesh;
}

function updateSphereColor(sphereId, isFailed) {
    const sphere = spheres.find(s => s.userData.id === sphereId);
    if (sphere) {
        sphere.material.color.setHex(isFailed ? 0xff0000 : 0x4ade80);
        sphere.material.emissive.setHex(isFailed ? 0x660000 : 0x1a4d2e);
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

        // Boundary collision (invisible walls)
        const boundary = 12;
        if (Math.abs(sphere.position.x) > boundary) {
            sphere.position.x = Math.sign(sphere.position.x) * boundary;
            sphere.velocity.x *= -physics.restitution;
        }
        if (Math.abs(sphere.position.y) > boundary) {
            sphere.position.y = Math.sign(sphere.position.y) * boundary;
            sphere.velocity.y *= -physics.restitution;
        }
        if (Math.abs(sphere.position.z) > boundary) {
            sphere.position.z = Math.sign(sphere.position.z) * boundary;
            sphere.velocity.z *= -physics.restitution;
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
            const minDistance = 2; // Sum of radii

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
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    updatePhysics();
    
    // Rotate spheres slightly
    spheres.forEach(sphere => {
        sphere.rotation.y += 0.005;
    });

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
    getMousePosition(event);
    
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
    }
}

function onTouchMove(event) {
    event.preventDefault();
    
    if (selectedSphere && isDragging) {
        getMousePosition(event);
        raycaster.setFromCamera(mouse, camera);
        
        const distance = selectedSphere.position.distanceTo(camera.position);
        const point = new THREE.Vector3();
        raycaster.ray.at(distance, point);
        
        selectedSphere.position.copy(point);
        
        // Calculate velocity for throw
        if (touchStart) {
            const deltaX = event.touches[0].clientX - touchStart.x;
            const deltaY = event.touches[0].clientY - touchStart.y;
            const deltaTime = Date.now() - touchStart.time;
            
            selectedSphere.velocity.x = (deltaX / deltaTime) * 0.05;
            selectedSphere.velocity.y = -(deltaY / deltaTime) * 0.05;
            
            touchStart = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: Date.now()
            };
        }
    } else if (!isDragging) {
        // Camera rotation by swiping
        if (event.touches.length === 1 && touchStart) {
            const deltaX = event.touches[0].clientX - touchStart.x;
            const deltaY = event.touches[0].clientY - touchStart.y;
            
            camera.rotation.y += deltaX * 0.005;
            camera.rotation.x += deltaY * 0.005;
            
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
    
    if (selectedSphere && isDragging) {
        selectedSphere.userData.isDragging = false;
        selectedSphere = null;
        isDragging = false;
    }
    touchStart = null;
}

function onMouseDown(event) {
    getMousePosition(event);
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(spheres);

    if (intersects.length > 0) {
        selectedSphere = intersects[0].object;
        selectedSphere.userData.isDragging = true;
        isDragging = true;
    }
}

function onMouseMove(event) {
    if (selectedSphere && isDragging) {
        getMousePosition(event);
        raycaster.setFromCamera(mouse, camera);
        
        const distance = selectedSphere.position.distanceTo(camera.position);
        const point = new THREE.Vector3();
        raycaster.ray.at(distance, point);
        
        selectedSphere.position.copy(point);
        selectedSphere.velocity.set(
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05
        );
    }
}

function onMouseUp() {
    if (selectedSphere && isDragging) {
        selectedSphere.userData.isDragging = false;
        selectedSphere = null;
        isDragging = false;
    }
}

function onClick(event) {
    if (isDragging) return;
    
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

// ============ API FUNCTIONS ============

async function fetchSpheres() {
    try {
        const response = await fetch(`${API_BASE_URL}/spheres`);
        if (!response.ok) throw new Error('Failed to fetch spheres');
        const data = await response.json();
        
        data.forEach(sphereData => {
            createSphere(sphereData);
        });
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching spheres:', error);
        showToast('Failed to load spheres', 'error');
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

// File input display
document.getElementById('image-input').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || 'No file chosen';
    document.getElementById('file-name').textContent = fileName;
});

// Add sphere form
document.getElementById('add-sphere-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = document.getElementById('submit-sphere');
    submitButton.disabled = true;
    submitButton.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('name', document.getElementById('name-input').value);
    formData.append('bio', document.getElementById('bio-input').value);
    formData.append('image', document.getElementById('image-input').files[0]);
    
    try {
        await createNewSphere(formData);
        closeAddModal();
    } catch (error) {
        // Error already shown in createNewSphere
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