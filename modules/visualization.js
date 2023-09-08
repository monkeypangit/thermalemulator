import * as THREE from '/external/three/three.module.js';
import { OrbitControls } from '/external/three/OrbitControls.js';
import { GLTFLoader } from '/external/three/GLTFLoader.js';

let scene, cube, camera, renderer, controls;
let surfaceTextures = [];
let initialTime = Date.now();

let cubeSizeX, cubeSizeY, cubeSizeZ;
let width, height, depth;

export function initializeScene(domElement) {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.0001, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true });

    controls = new OrbitControls(camera, renderer.domElement);
    controls.minPolarAngle = Math.PI / 16;
    controls.maxPolarAngle = 3 * Math.PI / 4;

    controls.minAzimuthAngle = -5 * Math.PI / 8;
    controls.maxAzimuthAngle = 5 * Math.PI / 8;

    controls.minDistance = 0.4;
    controls.maxDistance = 1.0;

    controls.rotateSpeed = 0.55;
    controls.dampingFactor = 0.05;
    controls.enableDamping = true;

    controls.enablePan = false;

    loadSceneGeometry();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Create and add the skysphere to the scene
    const skysphere = createGradientSkysphere();
    scene.add(skysphere);

    // Add directional light
    const mainLight = new THREE.SpotLight(0xffffff, 0.6, 0, Math.PI / 12, 0.5);
    mainLight.position.set(0, 1, 0);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.1;
    mainLight.shadow.camera.far = 2;
    mainLight.shadow.camera.fov = 35;
    mainLight.shadow.bias = -0.001;
    mainLight.shadow.radius = 5;
    mainLight.shadow.blurSamples = 25;
    scene.add(mainLight);

    const fillLight1 = new THREE.SpotLight(0xffffff, 0.1, 0, Math.PI / 12, 0.5);
    fillLight1.position.set(1, 1, 1);
    scene.add(fillLight1);

    const fillLight2 = new THREE.SpotLight(0xffffff, 0.1, 0, Math.PI / 12, 0.5);
    fillLight2.position.set(-1, 1, 1);
    scene.add(fillLight2);

    const fillLight3 = new THREE.SpotLight(0xffffff, 0.1, 0, Math.PI / 12, 0.5);
    fillLight3.position.set(1, 1, -1);
    scene.add(fillLight3);

    const fillLight4 = new THREE.SpotLight(0xffffff, 0.1, 0, Math.PI / 12, 0.5);
    fillLight4.position.set(-1, 1, -1);
    scene.add(fillLight4);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    camera.position.set(-0.2, 0.3, 0.5);
    domElement.appendChild(renderer.domElement);
}

export function resizeCanvas(width, height) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

export function initializeVisualization(w, h, d, cX, cY, cZ) {
    width = w;
    height = h;
    depth = d;
    cubeSizeX = cX;
    cubeSizeY = cY;
    cubeSizeZ = cZ;

    if (cube != undefined) {
        scene.remove(cube);
    }
    
    createTexturedCube();
}

function createTexturedCube() {
    surfaceTextures = [];
    surfaceTextures.push(createTexture(depth, height));
    surfaceTextures.push(createTexture(depth, height));

    surfaceTextures.push(createTexture(width, depth));
    surfaceTextures.push(createTexture(width, depth));

    surfaceTextures.push(createTexture(width, height));
    surfaceTextures.push(createTexture(width, height));

    // Create the cube
    const geometry = new THREE.BoxGeometry(width * cubeSizeX, height * cubeSizeY, depth * cubeSizeZ);
    const materials = surfaceTextures.map((texture) => {
        return new THREE.MeshStandardMaterial({ map: texture });
    });
    cube = new THREE.Mesh(geometry, materials);
    cube.castShadow = true;
    cube.rotateX(-Math.PI / 2);
    scene.add(cube);
}

function createTexture(sizeA, sizeB) {
    const canvas = document.createElement('canvas');
    canvas.width = sizeA;
    canvas.height = sizeB;
    const texture = new THREE.CanvasTexture(canvas);
    return texture
}

function createGradientSkysphere() {
    // Create a large sphere geometry
    const geometry = new THREE.SphereGeometry(5, 60, 40);
    geometry.scale(-1, 1, 1); // Make the normals face inwards

    // Create the gradient using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1e2129');
    gradient.addColorStop(0.5, '#1e2129');
    gradient.addColorStop(1, '#7592bd');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);

    // Create a material with the gradient texture
    const material = new THREE.MeshBasicMaterial({ map: texture });

    // Create a mesh with the geometry and material
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(-Math.PI)

    return mesh;
}

function loadSceneGeometry() {
    const loader = new GLTFLoader();
    let yPosition = -0.05

    // Load a glTF resource
    loader.load(
        // resource URL
        'deskmat.gltf',
        // called when the resource is loaded
        function (gltf) {
            gltf.scene.position.y = yPosition;

            gltf.scene.traverse(node => {
                if (node.isMesh) {
                    node.receiveShadow = true;
                    node.castShadow = true;
                }
            });

            scene.add(gltf.scene);
        },
        // called while loading is progressing
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // called when loading has errors
        function (error) {
            console.log('An error happened');
        }
    );
}

export function updateVisualization(temperatures) {

    let amplitude = 0.0005;  // Maximum distance from the initial point
    let frequency = 0.00025;  // Speed of oscillation
    
    // Store initial target position
    let initialTarget = new THREE.Vector3(0, 0, 0);  // Assume the initial target is at the origin
    
    // Get the elapsed time in milliseconds
    let currentTime = Date.now();
    let elapsedTime = currentTime - initialTime;

    // Calculate new target position as a gentle oscillation around the initial position
    let dx = 4 * amplitude * Math.sin(Math.sin(Math.sin(frequency * elapsedTime)));
    let dy = 2 * amplitude * Math.sin(Math.sin(Math.sin(1.5 * frequency * elapsedTime)));  // You can vary the frequency for each axis if desired
    let dz = 2 * amplitude * Math.sin(Math.sin(Math.sin(4 * frequency * elapsedTime)));    // You can vary the frequency for each axis if desired

    // Set the new target position
    controls.target.set(
        initialTarget.x + dx,
        initialTarget.y + dy,
        initialTarget.z + dz
    );

    // Update the controls
    controls.update();
    updateTextures(temperatures);
    renderer.render(scene, camera);
}

function updateTextures(temperatures) {
    updateTexture(temperatures, 0, depth, height, width - 1, (a, b, c) => toGridIndex(c, height - b - 1, depth - a - 1));
    updateTexture(temperatures, 1, depth, height, 0, (a, b, c) => toGridIndex(c, height - b - 1, a));

    updateTexture(temperatures, 2, width, depth, height - 1, (a, b, c) => toGridIndex(a, c, b));
    updateTexture(temperatures, 3, width, depth, 0, (a, b, c) => toGridIndex(a, c, depth - b - 1));

    updateTexture(temperatures, 4, width, height, depth - 1, (a, b, c) => toGridIndex(a, height - b - 1, c));
    updateTexture(temperatures, 5, width, height, 0, (a, b, c) => toGridIndex(width - a - 1, height - b - 1, c));
}

function updateTexture(temperatures, textureIndex, dimA, dimB, posC, toGridIndexFunc) {
    const canvas = surfaceTextures[textureIndex].image;
    const ctx = canvas.getContext('2d');
    
    for(let x = 0; x < dimA; x++) {
        for(let y = 0; y < dimB; y++) {
            ctx.fillStyle = colorFromTemperature(temperatures[toGridIndexFunc(x, y, posC)]);
            ctx.fillRect(x, y, 1, 1);
        }
    }
    
    surfaceTextures[textureIndex].needsUpdate = true;
}

function colorFromTemperature(temperature) {
    // Iron bow palette
    // https://stackoverflow.com/a/76760561

    const minTemp = 20;
    const maxTemp = 115;

    const percent = (Math.max(Math.min(temperature, maxTemp), minTemp) - minTemp) / maxTemp;

    var x = 433 * percent;
    var R = 4.18485e-6*x*x*x - 0.00532377*x*x + 2.19321*x - 39.1125;
    var G = 1.28826e-10*x*x*x*x*x-1.64251e-7*x*x*x*x+6.73208e-5*x*x*x-0.00808127*x*x+0.280643*x-1.61706;
    var B = 9.48804e-12*x*x*x*x*x-1.05015e-8*x*x*x*x+4.19544e-5*x*x*x-0.0232532*x*x+3.24907*x+30.466;
    var r = Math.floor(Math.max(0, R));
    var g = Math.floor(Math.max(0, G));
    var b = Math.floor(Math.max(0, B));

    return '#' + new THREE.Color("rgb(" + r +"," + g + "," + b + ")").convertSRGBToLinear().getHexString();
}

function toGridIndex(x, y, z) {
    return z * width * height + y * width + x; 
}
