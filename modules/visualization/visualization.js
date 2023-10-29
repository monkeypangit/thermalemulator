import * as THREE from '../../external/three/three.module.js';
import { OrbitControls } from '../../external/three/OrbitControls.js';

import * as UTIL from './visutils.js';

const resolutionZ = 0.0005;

export class Visualization {

    constructor(simulation, onLoaded) {
        this.initialTime = Date.now();
        this.simulation = simulation;

        // Scene
        this.scene = new THREE.Scene();
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 10);
        this.camera.position.set(-0.2, 0.3, 0.5);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.minPolarAngle = Math.PI / 16;
        this.controls.maxPolarAngle = 3 * Math.PI / 4;
        this.controls.minAzimuthAngle = -5 * Math.PI / 8;
        this.controls.maxAzimuthAngle = 5 * Math.PI / 8;
        this.controls.minDistance = 0.4;
        this.controls.maxDistance = 1.0;
        this.controls.rotateSpeed = 0.55;
        this.controls.dampingFactor = 0.1;
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.update();

        // Create noise texture for pei sheet
        const noiseScale = 5;
        const noiseTexture = UTIL.generateNoiseTexture(512, noiseScale);
        noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
        noiseTexture.repeat.set(noiseScale, noiseScale);

        // Materials
        this.heaterMaterial = new THREE.MeshStandardMaterial({ color: 0xFF1808, metalness: 0.0, roughness: 0.7 });
        this.plateMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, metalness: 0.6, roughness: 0.45 });
        this.magneticStickerMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.0, roughness: 0.9 });
        this.peiSheetMaterial = new THREE.MeshStandardMaterial({ color: 0x3f290c, metalness: 0.9, roughness: 0.42, transparent: true, bumpMap: noiseTexture, bumpScale: 0.0001 });
        this.dotMarkerMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000, metalness: 0.0, roughness: 1});

        // Load scene geometry
        UTIL.loadSceneGeometry(this.scene);

        // Create and add the skysphere to the scene
        const skysphere = UTIL.createGradientSkysphere();
        this.scene.add(skysphere);

        // Main light
        const mainLight = new THREE.SpotLight(0xffffff, 0.5, 0, Math.PI / 8, 1);
        mainLight.position.set(0, 1, -0.5);
        this.scene.add(mainLight);

        // Top fill lights
        const topFillIntensity = 0.3;
        this.scene.add(UTIL.createShadowFillLight(0.5, 1, 0.5, topFillIntensity));
        this.scene.add(UTIL.createShadowFillLight(0.5, 1, -0.5, topFillIntensity));
        this.scene.add(UTIL.createShadowFillLight(-0.5, 1, 0.5, topFillIntensity));
        this.scene.add(UTIL.createShadowFillLight(-0.5, 1, -0.5, topFillIntensity));

        // Main light bottom
        const bottomLight = new THREE.PointLight( 0xffFFFF, 0.4, 100 );
        bottomLight.position.set( 0, -0.3, 0 );
        bottomLight.distance = 0.4;
        this.scene.add(bottomLight);
        
        // Bottom fill lights
        const bottomFillIntensity = 0.05;
        this.scene.add(UTIL.createFillLight(1, -1, 1, bottomFillIntensity));
        this.scene.add(UTIL.createFillLight(-1, -1, 1, bottomFillIntensity));
        this.scene.add(UTIL.createFillLight(1, -1, -1, bottomFillIntensity));
        this.scene.add(UTIL.createFillLight(-1, -1, -1, bottomFillIntensity));
    }

    getDomElement() {
        return this.renderer.domElement;
    }

    resizeCanvas(width, height) {
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
    }

    reset(plateWidth, plateHeight, plateDepth, heaterWidth, heaterHeight, resolutionXY, layers, hasMagneticSticker) {
        this.sizeX = plateWidth;
        this.sizeY = plateHeight;
        this.sizeZ = layers.reduce((a, l) =>  a + l.sizeZ, 0);

        this.countX = this.sizeX / resolutionXY;
        this.countY = this.sizeY / resolutionXY;
        this.countZ = Math.floor(this.sizeZ / resolutionZ);

        this.layers = layers;
        this.resolutionXY = resolutionXY;
        let stackHeight = 0.0;

        // Heater
        if (this.heater != undefined) this.scene.remove(this.heater);
        this.heater = UTIL.createRoundedRectangle(heaterWidth - 0.002, heaterHeight - 0.002, 0.0015, 0.0025, 0.00025, this.heaterMaterial);
        this.heater.position.y += stackHeight;
        this.scene.add(this.heater);
        stackHeight += 0.0015;

        // Build plate
        if (this.plate != undefined) this.scene.remove(this.plate);
        this.plate = UTIL.createRoundedRectangle(plateWidth, plateHeight, plateDepth, 0.0025, 0.0005, this.plateMaterial);
        this.plate.position.y += stackHeight;
        this.scene.add(this.plate);
        stackHeight += plateDepth;

        // Magnetic sticker
        if (this.magneticSticker != undefined) this.scene.remove(this.magneticSticker);
        if (hasMagneticSticker) {
            this.magneticSticker = UTIL.createRoundedRectangle(plateWidth - 0.004, plateHeight - 0.004, 0.0012, 0.0025, 0.00025, this.magneticStickerMaterial);
            this.magneticSticker.position.y += stackHeight;
            this.scene.add(this.magneticSticker);
            stackHeight += 0.0012
        }

        // PEI spring steel sheet
        if (this.peiSheet != undefined) this.scene.remove(this.peiSheet);
        const edgeOffset = hasMagneticSticker ? 0.008 : 0.006;
        this.peiSheet = UTIL.createRoundedRectangle(plateWidth - edgeOffset, plateHeight - edgeOffset, 0.00075, 0.0025, 0.00025, this.peiSheetMaterial, true);
        this.peiSheet.position.y += stackHeight;
        this.scene.add(this.peiSheet);
        // Dont add the pei sheet to the stack height, it causes z-sorting issues with transparency

        // Thermistor markers
        if (this.thermistorMarkerCenter != undefined) this.scene.remove(this.thermistorMarkerCenter);
        this.thermistorMarkerCenter = UTIL.createMarker(this.dotMarkerMaterial);
        this.thermistorMarkerCenter.position.y += stackHeight + 0.001;
        this.scene.add(this.thermistorMarkerCenter);

        if (this.thermistorMarkerCorner != undefined) this.scene.remove(this.thermistorMarkerCorner);
        this.thermistorMarkerCorner = UTIL.createMarker(this.dotMarkerMaterial);
        this.thermistorMarkerCorner.position.y += stackHeight + 0.001;
        this.thermistorMarkerCorner.position.x = -this.sizeX / 2 + 0.0125
        this.thermistorMarkerCorner.position.z = +this.sizeY / 2 - 0.0125
        this.scene.add(this.thermistorMarkerCorner);

        if (this.thermistorMarkerEdge != undefined) this.scene.remove(this.thermistorMarkerEdge);
        this.thermistorMarkerEdge = UTIL.createMarker(this.dotMarkerMaterial);
        this.thermistorMarkerEdge.position.y += stackHeight + 0.001;
        this.thermistorMarkerEdge.position.x = this.sizeX / 2 - 0.0125
        this.scene.add(this.thermistorMarkerEdge);

        // Thermal cube
        if (this.cube != undefined) this.scene.remove(this.cube);

        this.surfaceTextures = [];
        this.surfaceTextures.push(UTIL.createTexture(this.countZ, this.countY));
        this.surfaceTextures.push(UTIL.createTexture(this.countZ, this.countY));

        this.surfaceTextures.push(UTIL.createTexture(this.countX, this.countZ));
        this.surfaceTextures.push(UTIL.createTexture(this.countX, this.countZ));

        this.surfaceTextures.push(UTIL.createTexture(this.countX, this.countY));
        this.surfaceTextures.push(UTIL.createTexture(this.countX, this.countY));

        // Create the cube
        const geometry = new THREE.BoxGeometry(this.sizeX, this.sizeY, stackHeight + 0.0005);
        this.cubeMaterials = this.surfaceTextures.map((texture) => {
            const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
            return material;
        });

        this.cube = new THREE.Mesh(geometry, this.cubeMaterials);
        this.cube.castShadow = true;
        this.cube.receiveShadow = true;
        this.cube.rotateX(-Math.PI / 2);
        this.cube.position.y = stackHeight / 2;
        this.scene.add(this.cube);
    }
    
    update(opacity) {

        let amplitude = 0.0005;  // Maximum distance from the initial point
        let frequency = 0.00025;  // Speed of oscillation

        // Store initial target position
        let initialTarget = new THREE.Vector3(0, -0.01, 0);  // Assume the initial target is at the origin

        // Get the elapsed time in milliseconds
        let currentTime = Date.now();
        let elapsedTime = currentTime - this.initialTime;

        // Calculate new target position as a gentle oscillation around the initial position
        let dx = 4 * amplitude * Math.sin(Math.sin(Math.sin(frequency * elapsedTime)));
        let dy = 2 * amplitude * Math.sin(Math.sin(Math.sin(1.5 * frequency * elapsedTime)));  // You can vary the frequency for each axis if desired
        let dz = 2 * amplitude * Math.sin(Math.sin(Math.sin(4 * frequency * elapsedTime)));    // You can vary the frequency for each axis if desired

        // Set the new target position
        this.controls.target.set(
            initialTarget.x + dx,
            initialTarget.y + dy,
            initialTarget.z + dz
        );

        this._updateTextures();

        // Handle thermal visualization switch animation
        this.cubeMaterials.forEach((m) => m.opacity = opacity);
        this.peiSheetMaterial.opacity = 1 - opacity;

        // Update the controls and render
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _updateTextures() {

        // Right
        const canvasRight = this.surfaceTextures[0].image;
        const ctxRight = canvasRight.getContext('2d')
        for (let u = 0; u < canvasRight.width; u++) {
            for (let v = 0; v < canvasRight.height; v++) {
                ctxRight.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(this.countX - 1, v, this._getGridZCoordinate(u * resolutionZ)));
                ctxRight.fillRect(canvasRight.width - u - 1, canvasRight.height - v - 1, 1, 1);
            }
        }

        // Left
        const canvasLeft = this.surfaceTextures[1].image;
        const ctxLeft = canvasLeft.getContext('2d')
        for (let u = 0; u < canvasLeft.width; u++) {
            for (let v = 0; v < canvasLeft.height; v++) {
                ctxLeft.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(0, v, this._getGridZCoordinate(u * resolutionZ)));
                ctxLeft.fillRect(u, v, 1, 1);
            }
        }

        // Back
        const canvasBack = this.surfaceTextures[2].image;
        const ctxBack = canvasBack.getContext('2d')
        for (let u = 0; u < canvasBack.width; u++) {
            for (let v = 0; v < canvasBack.height; v++) {
                ctxBack.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(u, this.countY, this._getGridZCoordinate(v * resolutionZ)));
                ctxBack.fillRect(u, v, 1, 1);
            }
        }

        // Front
        const canvasFront = this.surfaceTextures[3].image;
        const ctxFront = canvasFront.getContext('2d')
        for (let u = 0; u < canvasFront.width; u++) {
            for (let v = 0; v < canvasFront.height; v++) {
                ctxFront.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(u, 0, this._getGridZCoordinate(v * resolutionZ)));
                ctxFront.fillRect(u, canvasFront.height - v - 1, 1, 1);
            }
        }

        // Top
        const canvasTop = this.surfaceTextures[4].image;
        const ctxTop = canvasTop.getContext('2d')
        for (let u = 0; u < canvasTop.width; u++) {
            for (let v = 0; v < canvasTop.height; v++) {
                ctxTop.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(u, v, this.layers.length - 1));
                ctxTop.fillRect(u, v, 1, 1);
            }
        }

        // Bottom
        const canvasBottom = this.surfaceTextures[5].image;
        const ctxBottom = canvasBottom.getContext('2d')
        for (let u = 0; u < canvasBottom.width; u++) {
            for (let v = 0; v < canvasBottom.height; v++) {
                ctxBottom.fillStyle = this._colorFromTemperature(this.simulation.getTemperatureGrid(u, v, 0));
                ctxBottom.fillRect(u, v, 1, 1);
            }
        }

        this.surfaceTextures.forEach((t) => t.needsUpdate = true);
    }

    _getGridZCoordinate(zWorld) {
        let layerHeight = 0;
        let layerIndex = 0;
        for (; layerIndex < this.layers.length - 1; layerIndex++) {
            layerHeight += this.layers[layerIndex].sizeZ;
            if (zWorld < layerHeight) break;
        }

        return layerIndex;     
    }

    _colorFromTemperature(temperature) {
        // Iron bow thermal color palette
        // https://stackoverflow.com/a/76760561

        const minTemp = 20;
        const maxTemp = 120;

        const percent = (Math.max(Math.min(temperature, maxTemp), minTemp) - minTemp) / maxTemp;

        const x = 433 * percent;
        const R = 4.18485e-6 * x * x * x - 0.00532377 * x * x + 2.19321 * x - 39.1125;
        const G = 1.28826e-10 * x * x * x * x * x - 1.64251e-7 * x * x * x * x + 6.73208e-5 * x * x * x - 0.00808127 * x * x + 0.280643 * x - 1.61706;
        const B = 9.48804e-12 * x * x * x * x * x - 1.05015e-8 * x * x * x * x + 4.19544e-5 * x * x * x - 0.0232532 * x * x + 3.24907 * x + 30.466;
        const r = Math.floor(Math.max(0, R));
        const g = Math.floor(Math.max(0, G));
        const b = Math.floor(Math.max(0, B));

        return '#' + new THREE.Color("rgb(" + r + "," + g + "," + b + ")").convertSRGBToLinear().getHexString();
    }
}