import * as THREE from '../external/three/three.module.js';
import { OrbitControls } from '../external/three/OrbitControls.js';
import { GLTFLoader } from '../external/three/GLTFLoader.js';

import { _getSimulationResolutionX } from './simulation.js';
import { _getSimulationResolutionY } from './simulation.js';
import { _getSimulationResolutionZ } from './simulation.js';
import { _getTemperature } from './simulation.js';
import { _getTemperatureGrid } from './simulation.js';

let scene, cube, plate, heater, magneticMat, peiSheet, camera, renderer, controls;
let cubeMaterials, plateMaterial, heaterMaterial, magneticMatMaterial, peiSheetMaterial;

let surfaceTextures = [];
let initialTime = Date.now();

export function _initializeScene(domElement) {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 10);
    renderer = new THREE.WebGLRenderer({ antialias: true }); // sortObjects: false

    controls = new OrbitControls(camera, renderer.domElement);
    controls.minPolarAngle = Math.PI / 16;
    controls.maxPolarAngle = 3 * Math.PI / 4;

    controls.minAzimuthAngle = -5 * Math.PI / 8;
    controls.maxAzimuthAngle = 5 * Math.PI / 8;

    controls.minDistance = 0.4;
    controls.maxDistance = 1.0;

    controls.rotateSpeed = 0.55;
    controls.dampingFactor = 0.1;
    controls.enableDamping = true;

    controls.enablePan = false;


    heaterMaterial = new THREE.MeshStandardMaterial({ color: 0xFF1808 });
    heaterMaterial.metalness = 0.0;
    heaterMaterial.roughness = 0.7;

    plateMaterial = new THREE.MeshStandardMaterial({ color: 0x606060 });
    plateMaterial.metalness = 0.5;
    plateMaterial.roughness = 0.5;

    magneticMatMaterial = new THREE.MeshStandardMaterial({ color: 0x050505 });
    magneticMatMaterial.metalness = 0.0;
    magneticMatMaterial.roughness = 0.9;

    peiSheetMaterial = new THREE.MeshStandardMaterial({ color: 0x402508 }); 
    peiSheetMaterial.metalness = 0.4;
    peiSheetMaterial.roughness = 0.6;
    //peiSheetMaterial.transparent = true;

    loadSceneGeometry();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Create and add the skysphere to the scene
    const skysphere = createGradientSkysphere();
    scene.add(skysphere);

    // Add directional light
    const mainLight = new THREE.SpotLight(0xffffff, 0.5, 0, Math.PI / 8, 1);
    mainLight.position.set(0, 1, -0.5);
    scene.add(mainLight);

    let topFillIntensity = 0.3;
    let bottomFillIntensity = 0.05;

    scene.add(createShadowFillLight(0.5, 1, 0.5, topFillIntensity));
    scene.add(createShadowFillLight(0.5, 1, -0.5, topFillIntensity));
    scene.add(createShadowFillLight(-0.5, 1, 0.5, topFillIntensity));
    scene.add(createShadowFillLight(-0.5, 1, -0.5, topFillIntensity));

    scene.add(createFillLight(1, -1, 1, bottomFillIntensity));
    scene.add(createFillLight(-1, -1, 1, bottomFillIntensity));
    scene.add(createFillLight(1, -1, -1, bottomFillIntensity));
    scene.add(createFillLight(-1, -1, -1, bottomFillIntensity));

    const bottomLight = new THREE.PointLight( 0xffFFFF, 0.4, 100 );
    bottomLight.position.set( 0, -0.3, 0 );
    bottomLight.distance = 0.4;
    scene.add( bottomLight );

    camera.position.set(-0.2, 0.3, 0.5);
    domElement.appendChild(renderer.domElement);
}

function createShadowFillLight(x, y, z, intensity) {
    const f = new THREE.SpotLight(0xffffff, intensity, 0, Math.PI / 12, 1);
    f.position.set(x, y, z);
    f.castShadow = true;
    f.shadow.mapSize.width = 512;
    f.shadow.mapSize.height = 512;
    f.shadow.camera.near = 0.1;
    f.shadow.camera.far = 4;
    f.shadow.camera.fov = 45;
    f.shadow.bias = -0.001;
    f.shadow.radius = 25;
    f.shadow.blurSamples = 25;

    return f;
}

function createFillLight(x, y, z, intensity) {
    const f = new THREE.SpotLight(0xffffff, intensity, 0, Math.PI / 12, 1);
    f.position.set(x, y, z);
    return f;
}

export function resizeCanvas(width, height) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

export function _resetVisualization(p) {
    createTexturedCube(p);
    createHeater(p);
    createPlate(p);
    createMagneticMat(p);
    createPeiSheet(p);
}

function createHeater(p) {
    if (heater != undefined) {
        scene.remove(heater);
    }

    heater = createRoundedRectangle(p.heater_width / 1000 - 0.002, p.heater_height / 1000 - 0.002, 0.002, 0.0025, 0, heaterMaterial);
    heater.position.y = -0.002 - 0.0001;
    scene.add(heater);
}

function createPlate(p) {
    if (plate != undefined) {
        scene.remove(plate);
    }

    plate = createRoundedRectangle(p.plate_width / 1000, p.plate_height / 1000, p.plate_depth / 1000, 0.0025, 0.0005, plateMaterial);
    plate.position.y = 0;
    scene.add(plate);
}

function createMagneticMat(p) {
    if (magneticMat != undefined) {
        scene.remove(magneticMat);
    }

    magneticMat = createRoundedRectangle(p.plate_width / 1000 - 0.004, p.plate_height / 1000 - 0.004, 0.002, 0.0025, 0, magneticMatMaterial);
    magneticMat.position.y = p.plate_depth / 1000 + 0.0001;
    scene.add(magneticMat);
}

function createPeiSheet(p) {
    if (peiSheet != undefined) {
        scene.remove(peiSheet);
    }

    peiSheet = createPeiSheetRoundedRectangle(p.plate_width / 1000 - 0.008, p.plate_height / 1000 - 0.008, 0.0004, 0.0025, 0, peiSheetMaterial);
    peiSheet.position.y = -0.0569; // p.plate_depth / 1000 + 0.002 + 0.0002; 
    peiSheet.position.x = 0.04 + 0.04 - (p.plate_width / 10000);
    peiSheet.position.z = -0.01 + 0.04 - (p.plate_height / 10000);

    scene.add(peiSheet);
}

function createRoundedRectangle(width, height, extrudeDepth, cornerRadius, bevelSize, material) {
    const shape = new THREE.Shape();

    const halfWidth = width * 0.5 - bevelSize;
    const halfHeight = height * 0.5 - bevelSize;

    shape.moveTo(-halfWidth + cornerRadius, -halfHeight);
    shape.lineTo(halfWidth - cornerRadius, -halfHeight);
    shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + cornerRadius);
    shape.lineTo(halfWidth, halfHeight - cornerRadius);
    shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - cornerRadius, halfHeight);
    shape.lineTo(-halfWidth + cornerRadius, halfHeight);
    shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - cornerRadius);
    shape.lineTo(-halfWidth, -halfHeight + cornerRadius);
    shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + cornerRadius, -halfHeight);

    let bevelEnabled = (bevelSize > 0);

    var extrudeSettings = {
        steps: 1,
        depth: extrudeDepth,
        bevelEnabled: bevelEnabled,
        bevelThickness: bevelSize,
        bevelSize: bevelSize,
        bevelOffset: 0,
        bevelSegments: 1
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(-Math.PI / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
}

function createPeiSheetRoundedRectangle(width, height, extrudeDepth, cornerRadius, bevelSize, material) {
    const shape = new THREE.Shape();

    const halfWidth = width * 0.5 - bevelSize;
    const halfHeight = height * 0.5 - bevelSize;
    const handleWidth = 0.08;
    const handleDepth = 0.010;
    const halfHandleWidth = handleWidth * 0.5;

    // Side of sheet
    shape.moveTo(-halfWidth + cornerRadius, -halfHeight);
    
    // handle
    shape.lineTo(-halfHandleWidth - cornerRadius, -halfHeight);
    shape.quadraticCurveTo(-halfHandleWidth, -halfHeight, -halfHandleWidth + cornerRadius, -halfHeight - cornerRadius);
    shape.lineTo(-halfHandleWidth + handleDepth - cornerRadius, -halfHeight - handleDepth + cornerRadius);
    shape.quadraticCurveTo(-halfHandleWidth + handleDepth, -halfHeight - handleDepth, -halfHandleWidth + handleDepth + cornerRadius, -halfHeight - handleDepth);
    shape.lineTo(halfHandleWidth - handleDepth - cornerRadius, -halfHeight - handleDepth);
    shape.quadraticCurveTo(halfHandleWidth - handleDepth, -halfHeight - handleDepth, +halfHandleWidth - handleDepth + cornerRadius, -halfHeight - handleDepth + cornerRadius);
    shape.lineTo(halfHandleWidth - cornerRadius, -halfHeight - cornerRadius);
    shape.quadraticCurveTo(halfHandleWidth, -halfHeight, halfHandleWidth + cornerRadius, -halfHeight );

    
    shape.lineTo(halfWidth - cornerRadius, -halfHeight);

    // Rest of sheet
    shape.lineTo(halfWidth - cornerRadius, -halfHeight);
    shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + cornerRadius);
    shape.lineTo(halfWidth, halfHeight - cornerRadius);
    shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - cornerRadius, halfHeight);
    shape.lineTo(-halfWidth + cornerRadius, halfHeight);
    shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - cornerRadius);
    shape.lineTo(-halfWidth, -halfHeight + cornerRadius);
    shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + cornerRadius, -halfHeight);

    var extrudeSettings = {
        steps: 1,
        depth: extrudeDepth,
        bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(-Math.PI / 2);
    mesh.rotateZ(Math.PI / 12 + 0.5 * width - 0.5 * height);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
}


function createTexturedCube(p) {
    if (cube != undefined) {
        scene.remove(cube);
    }

    let width = p.plate_width / 1000 + 0.001;
    let height = p.plate_height / 1000 + 0.001;
    let depth = (p.plate_depth / 1000) + 0.004 + 0.001;

    let rX = _getSimulationResolutionX();
    let rY = _getSimulationResolutionY();
    let rZ = _getSimulationResolutionZ();

    surfaceTextures = [];
    surfaceTextures.push(createTexture(rZ, rY));
    surfaceTextures.push(createTexture(rZ, rY));

    surfaceTextures.push(createTexture(rX, rZ));
    surfaceTextures.push(createTexture(rX, rZ));

    surfaceTextures.push(createTexture(rX, rY));
    surfaceTextures.push(createTexture(rX, rY));

    // Create the cube
    const geometry = new THREE.BoxGeometry(width, height, depth);
    cubeMaterials = surfaceTextures.map((texture) => {
        let material = new THREE.MeshStandardMaterial({ map: texture });
        material.transparent = true;
        return material;
    });

    cube = new THREE.Mesh(geometry, cubeMaterials);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.rotateX(-Math.PI / 2);
    cube.position.y = p.plate_depth / 1000 / 2;
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
    let yPosition = -0.06

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

export function _updateVisualization(opacity) {

    let amplitude = 0.0005;  // Maximum distance from the initial point
    let frequency = 0.00025;  // Speed of oscillation

    // Store initial target position
    let initialTarget = new THREE.Vector3(0, -0.01, 0);  // Assume the initial target is at the origin

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
    updateTextures();

    cubeMaterials.forEach((m) => m.opacity = opacity);
    peiSheetMaterial.opacity = 1-opacity;

    renderer.render(scene, camera);
}

function updateTextures() {
    let rX = _getSimulationResolutionX();
    let rY = _getSimulationResolutionY();
    let rZ = _getSimulationResolutionZ();

    updateTexture(0, rZ, rY, rX - 1, (a, b, c) => [c, rY - b - 1, rZ - a - 1]);
    updateTexture(1, rZ, rY, 0, (a, b, c) => [c, rY - b - 1, a]);

    updateTexture(2, rX, rZ, rY - 1, (a, b, c) => [a, c, b]);
    updateTexture(3, rX, rZ, 0, (a, b, c) => [a, c, rZ - b - 1]);

    updateTexture(4, rX, rY, rZ - 1, (a, b, c) => [a, rY - b - 1, c]);
    updateTexture(5, rX, rY, 0, (a, b, c) => [rX - a - 1, rY - b - 1, c]);
}

function updateTexture(textureIndex, dimA, dimB, posC, shiftCorrdinatesFunc) {
    const canvas = surfaceTextures[textureIndex].image;
    const ctx = canvas.getContext('2d');

    for (let x = 0; x < dimA; x++) {
        for (let y = 0; y < dimB; y++) {
            ctx.fillStyle = colorFromTemperature(_getTemperatureGrid(shiftCorrdinatesFunc(x, y, posC)));
            ctx.fillRect(x, y, 1, 1);
        }
    }

    surfaceTextures[textureIndex].needsUpdate = true;
}

function colorFromTemperature(temperature) {
    // Iron bow palette
    // https://stackoverflow.com/a/76760561

    const minTemp = 20;
    const maxTemp = 120;

    const percent = (Math.max(Math.min(temperature, maxTemp), minTemp) - minTemp) / maxTemp;

    var x = 433 * percent;
    var R = 4.18485e-6 * x * x * x - 0.00532377 * x * x + 2.19321 * x - 39.1125;
    var G = 1.28826e-10 * x * x * x * x * x - 1.64251e-7 * x * x * x * x + 6.73208e-5 * x * x * x - 0.00808127 * x * x + 0.280643 * x - 1.61706;
    var B = 9.48804e-12 * x * x * x * x * x - 1.05015e-8 * x * x * x * x + 4.19544e-5 * x * x * x - 0.0232532 * x * x + 3.24907 * x + 30.466;
    var r = Math.floor(Math.max(0, R));
    var g = Math.floor(Math.max(0, G));
    var b = Math.floor(Math.max(0, B));

    return '#' + new THREE.Color("rgb(" + r + "," + g + "," + b + ")").convertSRGBToLinear().getHexString();
}
