import { initializeScene } from '/modules/visualization.js';
import { updateVisualization } from '/modules/visualization.js';
import { resizeCanvas } from '/modules/visualization.js';
import { initializeVisualization } from '/modules/visualization.js';
import { initializeSimulation } from '/modules/simulation.js';
import { updateSimulation } from '/modules/simulation.js';
import { getTemperatures } from '/modules/simulation.js';

let timer = 0;
let isPaused = true;
let stepOnce = false;

// Size of sides of cubes in meters
let cubeSizeX = 0.005;
let cubeSizeY = 0.005;
let cubeSizeZ = 0.002;

// Number of cubes in each dimension
let width;
let height;
let depth;

let plate_width, plate_height, plate_depth;
let heater_width, heater_height, heater_power;

let plate_width_label, plate_height_label, plate_depth_label;
let heater_width_label, heater_height_label, heater_power_label, heater_power_total_label;

function init() {
    window.addEventListener('resize', () => resizeCanvas(window.innerWidth, window.innerHeight), false );

    document.getElementById('startSimulationButton').addEventListener('click', () => isPaused = false);
    document.getElementById('pauseSimulationButton').addEventListener('click', () => isPaused = true);
    document.getElementById('stepSimulationButton').addEventListener('click', () => stepOnce = true);
    document.getElementById('resetSimulationButton').addEventListener('click', resetSimulation);

    [plate_width, plate_width_label] = inflateParamter('plate_width', 100, 400, 5, 250);
    [plate_height, plate_height_label] = inflateParamter('plate_height', 100, 400, 5, 250);
    [plate_depth, plate_depth_label] = inflateParamter('plate_depth', 4, 10, 2, 8);

    [heater_width, heater_width_label]= inflateParamter('heater_width', 100, 400, 5, 200);
    [heater_height, heater_height_label]= inflateParamter('heater_height', 100, 400, 5, 200);
    [heater_power, heater_power_label]= inflateParamter('heater_power', 0.1, 2, 0.05, 0.4);

    heater_power_total_label = document.getElementById('heater_power_total_label');

    let rootElement = document.getElementById('simulation');
    initializeScene(rootElement);

    resetSimulation();
    updateLabels(0);
}

function inflateParamter(parameter_name, min, max, step, value) {
    document.getElementById(parameter_name+'_parameter').innerHTML = `
    <span id="${parameter_name}_label"></span>
    <div class="range-widget">
    <button id="${parameter_name}_decrease" class="parameter-button">-</button>
    <input class="parameter-range" id="${parameter_name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <button id="${parameter_name}_increase" class="parameter-button">+</button>
    </div>`;

    let paramEl = document.getElementById(parameter_name);
    let paramLabelEl = document.getElementById(parameter_name + "_label");

    paramEl.addEventListener('change', resetSimulation); 
    paramEl.addEventListener('input', resetSimulation);
    
    document.getElementById(parameter_name+"_decrease").addEventListener('click', () => { paramEl.value = Number(paramEl.value) - step; resetSimulation(); });
    document.getElementById(parameter_name+"_increase").addEventListener('click', () => { paramEl.value = Number(paramEl.value) + step; resetSimulation(); });

    return [paramEl, paramLabelEl];
}

function resetSimulation() {
    isPaused = true;
    timer = 0;

    let plateWidth = Number(plate_width.value);
    let plateHeight = Number(plate_height.value);
    let plateDepth =  Number(plate_depth.value);

    let heaterWidth = Number(heater_width.value);
    let heaterHeight = Number(heater_height.value);
    let heaterPower = Number(heater_power.value);

    if (heaterWidth > plateWidth) {
        heaterWidth = plateWidth;
        heater_width.value = heaterWidth;
    }

    if (heaterHeight > plateHeight) {
        heaterHeight = plateHeight;
        heater_height.value = heaterHeight;
    }

    width = Math.floor(Number(plateWidth) / 1000 / cubeSizeX);
    height = Math.floor(Number(plateHeight) / 1000 / cubeSizeY);
    depth = Math.floor(Number(plateDepth) / 1000 / cubeSizeZ) + 2;

    let hW = Math.floor(Number(heaterWidth) / 1000 / cubeSizeX);
    let hH = Math.floor(Number(heaterHeight) / 1000 / cubeSizeY);

    let heaterPowerTotal = heaterPower * heaterWidth / 10 * heaterHeight / 10;

    initializeSimulation(width, height, depth, cubeSizeX, cubeSizeY, cubeSizeZ, hW, hH, heaterPowerTotal);
    initializeVisualization(width, height, depth, cubeSizeX, cubeSizeY, cubeSizeZ);
    updateLabels(0);

    plate_width_label.innerText = "Width: (" + plateWidth + " mm)";
    plate_height_label.innerText = "Depth: (" + plateHeight + " mm)";
    plate_depth_label.innerText = "Height: (" + plateDepth + " mm)";

    heater_width_label.innerText = "Width: (" + heaterWidth + " mm)";
    heater_height_label.innerText = "Depth: (" + heaterHeight + " mm)";
    heater_power_label.innerText = "Power: (" + heaterPower + " W/cm³ of heater)";
    heater_power_total_label.innerText = "Total: (" + heaterPowerTotal.toFixed(2) + " W)";
}

function animate() {
    if (!isPaused || stepOnce) {
        stepOnce = false;
        timer++;

        let controlledWattage = updateSimulation();
        updateLabels(controlledWattage);
    }

    updateVisualization(getTemperatures());
    requestAnimationFrame(animate);
}

function updateLabels(controlledWattage) {
    let temperatures = getTemperatures()
    document.getElementById('timer').innerText = "Seconds: " + timer;
    document.getElementById('temperature-center').innerText = "Center: " + temperatures[toGridIndex(Math.floor(width / 2), Math.floor(height / 2), depth - 1)].toFixed(2);
    document.getElementById('temperature-edge').innerText = "Edge: " + temperatures[toGridIndex(Math.floor(width / 2), 0, depth - 1)].toFixed(2);
    document.getElementById('temperature-corner').innerText = "Corner: " + temperatures[toGridIndex(0, 0, depth - 1)].toFixed(2);
    document.getElementById('temperature-core').innerText = "Core: " + temperatures[toGridIndex(Math.floor(width / 2), Math.floor(height / 2), Math.floor(depth / 2))].toFixed(2);
    document.getElementById('temperature-thermistor').innerText = "Build plate (back edge): " + temperatures[toGridIndex(Math.floor(width / 2), height - 1, depth - 2)].toFixed(2);
    document.getElementById('temperature-heater').innerText = "Heater: " + temperatures[toGridIndex(Math.floor(width / 2), Math.floor(height / 2), 0)].toFixed(2);
    document.getElementById('heater-controlled-wattage').innerText = "Heater: " + controlledWattage.toFixed(0);
}

function toGridIndex(x, y, z) {
    return z * width * height + y * width + x;
}

init();
animate();

