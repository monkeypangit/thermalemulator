import { _initializeScene } from './modules/visualization.js';
import { _updateVisualization } from './modules/visualization.js';
import { resizeCanvas } from './modules/visualization.js';
import { _resetVisualization } from './modules/visualization.js';
import { _resetSimulation } from './modules/simulation.js';
import { _iterateSimulation } from './modules/simulation.js';
import { _getTemperature } from './modules/simulation.js';

let timer = 0;
let isPaused = true;
let stepOnce = false;

let params = {};

let thermistors = { heater: 0, plate: 1 };
let thermistorLocations;

let controlledWattage = 0;

let opacity = 0;

let ambientTempHover = false;

function init() {
    window.addEventListener('resize', () => resizeCanvas(window.innerWidth, window.innerHeight), false );

    document.getElementById('startSimulationButton').addEventListener('click', () => { isPaused = !isPaused; updateStartButton(); });
    document.getElementById('stepSimulationButton').addEventListener('click', () => { isPaused = true; stepOnce = true; updateStartButton(); });
    document.getElementById('resetSimulationButton').addEventListener('click', resetSimulation);

    inflateParamter(params, true, 'plate_width', 100, 400, 5, 250, (v) => "Width: " + v + " mm");
    inflateParamter(params, true, 'plate_height', 100, 400, 5, 250, (v) => "Depth: " + v + " mm)");
    inflateParamter(params, true, 'plate_depth', 4, 10, 2, 8, (v) => "Thickness: " + v + " mm)");

    inflateParamter(params, true, 'heater_width', 80, 400, 5, 200, (v) =>"Width: " + v + " mm");
    inflateParamter(params, true, 'heater_height', 80, 400, 5, 200, (v) => "Depth: " + v + " mm)");

    inflateParamter(params, true, 'magnetic_mat_conductivity', 0.5, 1.5, 0.5, 1, (v) => "Thermal conductivity: " + v.toFixed(1) + " W/mK");
    inflateParamter(params, true, 'heater_conductivity', 0.5, 1.5, 0.5, 1, (v) => "Thermal conductivity: " + v.toFixed(1) + " W/mK");

    inflateParamter(params, false, 'heater_power', 0.1, 2, 0.05, 0.8, (v) => "Rated power: " + v.toFixed(2) + " W/cm², " + (params.heater_width.get() / 10 * params.heater_height.get() / 10 * v).toFixed(0) + " W");

    inflateParamter(params, false, 'bed_convection_top', 5, 50, 1, 8, (v) => "Top: " + v + " W/m²K");
    inflateParamter(params, false, 'bed_convection_bottom', 5, 50, 1, 8, (v) => "Bottom: " + v + " W/m²K");

    inflateParamter(params, false, 'ambient_temperature', 0, 80, 1, 22, (v) => "Ambient temp: " + v + " °C");
    inflateParamter(params, false, 'target_temperature', 30, 115, 5, 110, (v) => "Target temperature: " + v + " °C");

    // Ambient temperature is a special case. It should reset simulation if time = 0
    params.ambient_temperature.el.addEventListener('change', () => { if (timer == 0) resetSimulation(); });
    params.ambient_temperature.el.addEventListener('input', () => { if (timer == 0) resetSimulation(); });

    document.getElementById("ambient_temperature_parameter").addEventListener('mouseenter', () => { ambientTempHover = true; });
    document.getElementById("ambient_temperature_parameter").addEventListener('mouseleave', () => { ambientTempHover = false; });

    let rootElement = document.getElementById('simulation');
    _initializeScene(rootElement);

    resetSimulation();
}

function updateStartButton() {
    document.getElementById('startSimulationButton').innerHTML = isPaused ? "Play" : "Pause";
}

function inflateParamter(group, resetSimulationOnChange, parameter_name, min, max, step, value, updateLabelFunc) {
    document.getElementById(parameter_name+'_parameter').innerHTML = `
    <span id="${parameter_name}_label"></span>
    <div class="range-widget">
    <button id="${parameter_name}_decrease" class="parameter-button">-</button>
    <input class="parameter-range" id="${parameter_name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <button id="${parameter_name}_increase" class="parameter-button">+</button>
    </div>`;

    let paramEl = document.getElementById(parameter_name);
    let paramLabelEl = document.getElementById(parameter_name + "_label");

    let updateLabel = () => paramLabelEl.innerText = updateLabelFunc(Number(paramEl.value));
    let change = () => paramEl.dispatchEvent(new Event('change'));

    paramEl.addEventListener('change', updateLabel); 
    paramEl.addEventListener('input', updateLabel);
    
    let increase = document.getElementById(parameter_name+"_increase");
    let decrease = document.getElementById(parameter_name+"_decrease")

    decrease.addEventListener('click', () => { paramEl.value = Number(paramEl.value) - step; updateLabel(); });
    increase.addEventListener('click', () => { paramEl.value = Number(paramEl.value) + step; updateLabel(); });
    
    group[parameter_name] = {};
    group[parameter_name].el = paramEl;
    group[parameter_name].label = paramLabelEl;
    group[parameter_name].updateLabel = updateLabel;
    group[parameter_name].get = () => Number(group[parameter_name].el.value);
    group[parameter_name].set = (v) => { paramEl.value = v; change(); };
    group[parameter_name].resetSimulation = resetSimulationOnChange;
    group[parameter_name].setDisabled = (disabled) => {
        paramEl.disabled = disabled;
        decrease.disabled = disabled;
        increase.disabled = disabled;
    };

    if (resetSimulationOnChange) { 
        paramEl.addEventListener('change', resetSimulation); 
        paramEl.addEventListener('input', resetSimulation);
        increase.addEventListener('click', resetSimulation);
        decrease.addEventListener('click', resetSimulation);
    }

    updateLabel();
}

function gatherParamterValues() {

    let v = {};
    for (const p in params) {
        v[p] = params[p].get();
    }

    return v;
}

function resetSimulation() {

    let v = gatherParamterValues();
    
    document.getElementById('startSimulationButton').innerHTML = "Play";
    isPaused = true;
    updateStartButton();
    timer = 0;

    // Make sure heater size is smaller than or equal to plate size
    if (v.heater_width > v.plate_width) {
        params.heater_width.set(v.plate_width);
        return; // resetSimulation will be triggered again
    }

    if (v.heater_height > v.plate_height) {
        params.heater_height.set(v.plate_height)
        return; // resetSimulation will be triggered again
    }

    // Update thermistor locations
    thermistorLocations = [];
    thermistorLocations[thermistors.heater] = [v.plate_width / 2, v.plate_height / 2, 0];
    thermistorLocations[thermistors.plate] = [v.plate_width / 2, v.plate_height - 10, v.plate_depth - 2];

    _resetSimulation(v);
    _resetVisualization(v);

    // Set all UI labels
    params["heater_power"].updateLabel();
    updateLabels(v);
}

function animate() {
    let starTime = Date.now();

    if (!isPaused || stepOnce) {
        stepOnce = false;
        timer+=1;

        let v = gatherParamterValues();
        let thermistorIndex = [... document.querySelectorAll("input[name=control_thermistor]")].findIndex(e=>e.checked);
        let selectedThermistorLocation = thermistorLocations[thermistorIndex];

        controlledWattage = _iterateSimulation(v, selectedThermistorLocation);
        updateLabels(v);
    }

    for (const p in params) {
        if (params[p].resetSimulation) {
            params[p].setDisabled(timer > 0);
        }
    }

    if (timer > 0 || ambientTempHover) {
        opacity = Math.min(opacity + 0.2, 1);
    } else if (timer == 0) {
        opacity = Math.max(opacity - 0.05, 0);
    }

    _updateVisualization(opacity);

    // Cap framerate
    let endTime = Date.now();
    let duration = endTime - starTime;
    setTimeout(() => requestAnimationFrame(animate), Math.max(0, 30 - duration));
}

function updateLabels(v) {
    let minutes = Math.floor(timer/60);
    let seconds = Math.floor(timer%60);

    if (minutes < 10) {
        minutes = "0" + minutes;
    }

    if (seconds < 10) {
        seconds = "0" + seconds;
    }

    document.getElementById('timer').innerText = "" + minutes + " min " + seconds + " s";
    
    let pW = v.plate_width;
    let pH = v.plate_height;
    let pD = v.plate_depth;

    document.getElementById('temperature-center').innerText = "Surface center: " + _getTemperature([pW / 2, pH / 2, pD]).toFixed(1) + " °C";
    document.getElementById('temperature-edge').innerText = "Surface edge: " + _getTemperature([pW / 2, 0, pD]).toFixed(1) + " °C";
    document.getElementById('temperature-corner').innerText = "Surface corner: " + _getTemperature([0, 0, pD]).toFixed(1) + " °C";
    
    document.getElementById('temperature-core').innerText = "Plate core: " + _getTemperature([pW / 2, pH / 2, pD / 2]).toFixed(1) + " °C";

    let controlThermistorHeaderEl = document.getElementById('control_thermistor_header');

    let temps = [];
    temps[thermistors.heater] = _getTemperature(thermistorLocations[thermistors.heater]);
    temps[thermistors.plate] = _getTemperature(thermistorLocations[thermistors.plate]);

    let els = [];
    els[thermistors.heater] = document.getElementById('temperature-heater');
    els[thermistors.plate] = document.getElementById('temperature-plate');

    let heaterOverheating = (temps[thermistors.heater] > 116);
    let plateOverheating = (temps[thermistors.plate] > 116);

    controlThermistorHeaderEl.style.color = (heaterOverheating || plateOverheating) ? "#FF0000" : "#FFFFFF";
    controlThermistorHeaderEl.innerText = (heaterOverheating || plateOverheating) ? "Control thermistor (Overheating!)" : "Control thermistor";
    
    els[thermistors.heater].style.color = (heaterOverheating) ? "#FF0000" : "#FFFFFF";
    els[thermistors.plate].style.color = (plateOverheating) ? "#FF0000" : "#FFFFFF";

    els[thermistors.heater].innerText = "Heater: " + temps[thermistors.heater].toFixed(1) + " °C";
    els[thermistors.plate].innerText = "Build plate (back edge): " + temps[thermistors.plate].toFixed(1) + " °C";

    if (heaterOverheating) els[thermistors.heater].innerText += " (Overheating!)"

    document.getElementById('heater-controlled-wattage').innerText = "Controlled output: " + controlledWattage.toFixed(0) + " W";
}

init();
animate();

