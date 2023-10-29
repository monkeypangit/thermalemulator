import * as THREE from '../../external/three/three.module.js';
import { GLTFLoader } from '../../external/three/GLTFLoader.js';

export function createShadowFillLight(x, y, z, intensity) {
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

export function createFillLight(x, y, z, intensity) {
    const f = new THREE.SpotLight(0xffffff, intensity, 0, Math.PI / 12, 1);
    f.position.set(x, y, z);
    return f;
}

export function generateNoiseTexture(size, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Replace the next line with your noise generation logic
        const val = Math.floor(Math.random() * 255);
        data[i] = data[i + 1] = data[i + 2] = val;
        data[i + 3] = 255; // alpha
    }

    context.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

export function createRoundedRectangle(width, height, extrudeDepth, cornerRadius, bevelSize, material, hasHandle) {
    const shape = new THREE.Shape();

    const halfWidth = width * 0.5 - bevelSize;
    const halfHeight = height * 0.5 - bevelSize;

    shape.moveTo(-halfWidth + cornerRadius, -halfHeight);

    if (hasHandle) {
        const handleWidth = 0.06 + (width - 0.08) * 0.32;
        const handleDepth = 0.010;
        const halfHandleWidth = handleWidth * 0.5;

        shape.lineTo(-halfHandleWidth - cornerRadius, -halfHeight);
        shape.quadraticCurveTo(-halfHandleWidth, -halfHeight, -halfHandleWidth + cornerRadius, -halfHeight - cornerRadius);
        shape.lineTo(-halfHandleWidth + handleDepth - cornerRadius, -halfHeight - handleDepth + cornerRadius);
        shape.quadraticCurveTo(-halfHandleWidth + handleDepth, -halfHeight - handleDepth, -halfHandleWidth + handleDepth + cornerRadius, -halfHeight - handleDepth);
        shape.lineTo(halfHandleWidth - handleDepth - cornerRadius, -halfHeight - handleDepth);
        shape.quadraticCurveTo(halfHandleWidth - handleDepth, -halfHeight - handleDepth, +halfHandleWidth - handleDepth + cornerRadius, -halfHeight - handleDepth + cornerRadius);
        shape.lineTo(halfHandleWidth - cornerRadius, -halfHeight - cornerRadius);
        shape.quadraticCurveTo(halfHandleWidth, -halfHeight, halfHandleWidth + cornerRadius, -halfHeight );
    }

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
        depth: extrudeDepth - 2 * bevelSize,
        bevelEnabled: bevelEnabled,
        bevelThickness: bevelSize,
        bevelSize: bevelSize,
        bevelOffset: -bevelSize,
        bevelSegments: 1
    };

    const geometry = new THREE.ExtrudeBufferGeometry(shape, extrudeSettings);

    const positionArray = geometry.getAttribute('position').array;
    const uvs = [];

    const maxPosArray = Math.max(...positionArray);
    const minPosArray = Math.min(...positionArray);
    
    for (let i = 0; i < positionArray.length; i += 3) {
        const x = positionArray[i];
        const y = positionArray[i + 1];
        const z = positionArray[i + 2];
        
        // Check if this vertex is on the top/bottom face based on its normal
        // Assuming that if y is maximum/minimum, then it's top/bottom.
        // This is a naive check and might not work for all shapes and configurations!
        if (y === maxPosArray || y === minPosArray) {
            uvs.push(x, z);
        } else {
            uvs.push(x, y);
        }
    }
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(-Math.PI / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y += bevelSize;

    return mesh;
}

export function createTexture(sizeA, sizeB) {
    const canvas = document.createElement('canvas');
    canvas.width = sizeA;
    canvas.height = sizeB;
    const texture = new THREE.CanvasTexture(canvas);
    return texture
}

export function createGradientSkysphere() {
    // Create a large sphere geometry
    const geometry = new THREE.SphereGeometry(5, 60, 40);
    geometry.scale(-1, 1, 1); // Make the normals face inwards

    // Create the gradient using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#101216');
    gradient.addColorStop(0.5, '#1e2129');
    gradient.addColorStop(1, '#101216');
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

export function loadSceneGeometry(scene, progressCallback) {
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
        null,
        null,
    );
}

export function createMarker(material) {
    const geometry = new THREE.RingGeometry(0.002, 0.004, 32);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(-Math.PI / 2);
    return mesh;
}
