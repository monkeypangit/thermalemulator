import * as VISUALIZATION from './modules/visualization/visualization.js';
import * as SIMULATION from './modules/simulation/simulation.js';

{
const mmPerM = 1000; // millimeters per meter
const resolutionXY = 0.005; // X and Y resolution of simulation in meters

const simulation = new SIMULATION.Simulation();
const visualization = new VISUALIZATION.Visualization(simulation);

let timer = 0;
let isPaused = true;
let stepOnce = false;
let controlledWattage = 0;
let opacity = 0;
let ambientTempHover = false;
let thermistorLocations;
let heatBedDepth;

let useEmbeddedBedThermistor = false;
let controlThermistorLocation;
let hasMagneticSticker;

let layers = [];

let params = {};

let plot;
let plotData = [];

const thermistors = { 
    heater: 0, 
    plate: 1,
};

// All these numbers are approximate
const materials = {
    heater:
        // Glass fiber reinforced silicone rubber (Heater)
        {
            density: 1100000, // g/m^3
            capacity: 0.9, // J/gK
            conductivity: 0.3, // W/mK (from UI)
            emissivity: 0.9,
        },

    buildPlate:
        // Aluminium alloy 5083
        {
            density: 2650000, // g/m^3
            capacity: 0.9, // J/gK
            conductivity: 120, // W/mK (from UI)
            emissivity: 0.2,
        },

    magneticSticker:
        // Magnetic silicone rubber sheet (Magnetic sticker)
        // I have not been able to find any reference on this so these numbers are a best estimate.
        {
            density: 1100000, // g/m^3
            capacity: 0.9, // J/gK
            conductivity: 0.3, // W/mK (from UI)
            emissivity: 0.9,
        },

    peiSpringSteelSheet:
        // PEI spring steel sheet
        // This combines two layers of PEI with the spring steel core
        // You could split these into separate layers but I doubt it would change much
        // Density: (0.125×0.9×2+0.5×7.8)÷(0.125×2+0.5) = 5.5
        // Capacity: (2*0.9*0.125 + 0.42 * 0.5) / (2*0.125 + 0.5) = 0.58
        // Conductivity: (2*0.125+0.5)/(2×0.125/0.20+0.5/50) = 0.59
        {
            density: 5500000, // g/m^3
            capacity: 0.58, // J/gK
            conductivity: 0.6, // W/mK (from UI)
            emissivity: 0.9,
        },
};


function init() {
    window.addEventListener('resize', () => visualization.resizeCanvas(window.innerWidth, window.innerHeight), false);

    document.getElementById('startSimulationButton').addEventListener('click', () => { isPaused = !isPaused; updateStartButton(); });
    document.getElementById('stepSimulationButton').addEventListener('click', () => { isPaused = true; stepOnce = true; updateStartButton(); });
    document.getElementById('resetSimulationButton').addEventListener('click', resetSimulation);
    document.getElementById('bed_type_magnetic_sticker').addEventListener('change', resetSimulation);
    document.getElementById('bed_type_embedded_magnets').addEventListener('change', resetSimulation);

    inflateParamter(params, true, 'plate_width', 100, 400, 5, 250, (v) => "Width: " + v + " mm");
    inflateParamter(params, true, 'plate_height', 100, 400, 5, 250, (v) => "Depth: " + v + " mm)");
    inflateParamter(params, true, 'plate_depth', 3, 12, 1, 8, (v) => "Thickness: " + v + " mm)");
    inflateParamter(params, true, 'plate_conductivity', 50, 300, 10, materials.buildPlate.conductivity, (v) => "Thermal conductivity: " + v + " W/mK)");

    inflateParamter(params, true, 'heater_width', 80, 400, 5, 200, (v) =>"Width: " + v + " mm");
    inflateParamter(params, true, 'heater_height', 80, 400, 5, 200, (v) => "Depth: " + v + " mm)");

    inflateParamter(params, true, 'magnetic_sticker_conductivity', 0.2, 1.0, 0.01, materials.magneticSticker.conductivity, (v) => "Thermal conductivity: " + v.toFixed(2) + " W/mK");
    inflateParamter(params, true, 'heater_conductivity', 0.2, 2.0, 0.01, materials.heater.conductivity, (v) => "Thermal conductivity: " + v.toFixed(2) + " W/mK");
    inflateParamter(params, true, 'pei_sheet_conductivity', 0.2, 2.0, 0.01, materials.peiSpringSteelSheet.conductivity, (v) => "Thermal conductivity: " + v.toFixed(2) + " W/mK");

    inflateParamter(params, false, 'heater_power', 0.1, 2, 0.01, 0.8, (v) => "Rated power: " + v.toFixed(2) + " W/cm², " + (params.heater_width.get() / 10 * params.heater_height.get() / 10 * v).toFixed(0) + " W");

    inflateParamter(params, false, 'bed_convection_top', 0, 25, 1, 8, (v) => "Top: " + v + " W/m²K");
    inflateParamter(params, false, 'bed_convection_bottom', 0, 25, 1, 4, (v) => "Bottom: " + v + " W/m²K");

    inflateParamter(params, false, 'ambient_temperature', 0, 80, 1, 22, (v) => "Ambient temp: " + v + " °C");
    inflateParamter(params, false, 'target_temperature', 30, 115, 1, 110, (v) => "Target temperature: " + v + " °C");

    document.getElementById('control_thermistor_heater').addEventListener('change', updateControlThermistor);
    document.getElementById('control_thermistor_build_plate').addEventListener('change', updateControlThermistor);

    // Ambient temperature is a special case. It should reset simulation if time = 0
    params.ambient_temperature.el.addEventListener('change', () => { if (timer == 0) resetSimulation(); });
    params.ambient_temperature.el.addEventListener('input', () => { if (timer == 0) resetSimulation(); });

    document.getElementById("ambient_temperature_parameter").addEventListener('mouseenter', () => { ambientTempHover = true; });
    document.getElementById("ambient_temperature_parameter").addEventListener('mouseleave', () => { ambientTempHover = false; });

    document.getElementById('simulation').appendChild(visualization.getDomElement());

    // Sample data for demonstration purposes
    plotData = [[],[]];

    const plotEl = document.getElementById('plot');

    const options = {
        width: plotEl.clientWidth, // Set width of the chart
        height: plotEl.clientHeight, // Set height of the chart
        scales: {
            x: { range: [0, 900]},
            y: { range: [0, 150]},
        },
        legend: {
            show: false
        },
        axes: [
            { 
                values: (u, vals, space) => vals.map(v => (v / 60).toFixed(0)), 
                stroke: "#FFFFFF80", 
                grid: { stroke: "#FFFFFF80" }, 
                ticks: { stroke: "#FFFFFF80" }, 
                font: "10px Arial white", 
                size: 25, 
            },
            { 
                values: (u, vals, space) => vals.map(v => (v).toFixed(0)), 
                size: 35, 
                stroke: "#FFFFFF80", 
                grid: { stroke: "#FFFFFF80" }, 
                ticks: { stroke: "#FFFFFF80" }, 
                font: "10px Arial white", 
            }
        ],
        series: [
            {}, // This is a placeholder for the X-axis
            { stroke: "red", width: 1, label: "Temperature (°C)" }
        ]
    };

    plot = new uPlot(options, plotData, plotEl);
    
    resetSimulation();
}

function updateStartButton() {
    document.getElementById('startSimulationButton').innerHTML = isPaused ? "Play" : "Pause";
}

function updateControlThermistor() {
    let thermistorIndex = [... document.querySelectorAll("input[name=control_thermistor]")].findIndex(e=>e.checked);
    useEmbeddedBedThermistor = thermistorIndex == 1;
    controlThermistorLocation = thermistorLocations[thermistorIndex];
    simulation.recalculatePIDValues(useEmbeddedBedThermistor);
}

function resetSimulation() {
    document.getElementById('startSimulationButton').innerHTML = "Play";
    isPaused = true;
    updateStartButton();
    timer = 0;

    plotData[0].length = 0;
    plotData[1].length = 0;
    plot.setData(plotData);

    hasMagneticSticker = document.getElementById('bed_type_magnetic_sticker').checked;

    materials.heater.conductivity = params.heater_conductivity.get();
    materials.buildPlate.conductivity = params.plate_conductivity.get();
    materials.magneticSticker.conductivity = params.magnetic_sticker_conductivity.get();
    materials.peiSpringSteelSheet.conductivity = params.pei_sheet_conductivity.get();

    layers = [
        { material: materials.heater, sizeZ: 0.0015 },
        { material: materials.buildPlate, sizeZ: params.plate_depth.get() / mmPerM },
        { material: materials.magneticSticker, sizeZ: 0.0012 },
        { material: materials.peiSpringSteelSheet, sizeZ: 0.00075 },
    ];

    if (!hasMagneticSticker) layers.splice(2,1);

    // Make sure heater size is smaller than or equal to plate size
    if (params.heater_width.get() > params.plate_width.get()) {
        params.heater_width.set(params.plate_width.get());
        return; // resetSimulation will be triggered again
    }

    if (params.heater_height.get() > params.plate_height.get()) {
        params.heater_height.set(params.plate_height.get());
        return; // resetSimulation will be triggered again
    }

    // Update thermistor locations
    heatBedDepth = layers.reduce((a, l) =>  a + l.sizeZ, 0);
    
    thermistorLocations = [];
    thermistorLocations[thermistors.heater] = [params.plate_width.get() / mmPerM / 2, params.plate_height.get() / mmPerM / 2, 0];
    thermistorLocations[thermistors.plate] = [params.plate_width.get() / mmPerM / 2, params.plate_height.get() / mmPerM - 0.01, heatBedDepth / 2];

    simulation.reset(
        params.plate_width.get() / mmPerM,
        params.plate_height.get() / mmPerM,
        params.heater_width.get() / mmPerM,
        params.heater_height.get() / mmPerM,
        resolutionXY,
        layers,
        params.ambient_temperature.get(),
        useEmbeddedBedThermistor,
    );

    simulation.recalculatePIDValues(useEmbeddedBedThermistor);
    
    visualization.reset(
        params.plate_width.get() / mmPerM,
        params.plate_height.get() / mmPerM,
        params.plate_depth.get() / mmPerM,
        params.heater_width.get() / mmPerM,
        params.heater_height.get() / mmPerM,
        resolutionXY,
        layers,
        hasMagneticSticker,
    );

    // Set all UI labels
    params["heater_power"].updateLabel();
    updateControlThermistor();
    updateLabels();
}

function animate() {
    
    let starTime = Date.now();

    if (!isPaused || stepOnce) {
        stepOnce = false;
        timer+=1;

        controlledWattage = simulation.iterate(
            params.target_temperature.get(),
            params.heater_power.get(),
            params.ambient_temperature.get(),
            params.bed_convection_top.get(),
            params.bed_convection_bottom.get(),
            controlThermistorLocation,
        );

        // Update plot
        if (timer < 900) {
            const l = controlThermistorLocation;
            const controlTemp = simulation.getTemperature(l[0], l[1], l[2]);

            plotData[0].push(timer);
            plotData[1].push(controlTemp);
            plot.setData(plotData);
        }

        updateLabels();
    }

    for (const p in params) {
        if (params[p].resetSimulation) {
            params[p].setDisabled(timer > 0);

            document.getElementById("bed_type_magnetic_sticker").disabled = timer > 0;
            document.getElementById("bed_type_embedded_magnets").disabled = timer > 0;
        }
    }

    // Build plate thermal visualization animation
    if (timer > 0 || ambientTempHover) {
        opacity = Math.min(opacity + 0.2, 1);
    } else if (timer == 0) {
        opacity = Math.max(opacity - 0.2, 0);
    }

    // Update thermal visualization
    visualization.update(opacity);

    // Cap framerate
    let duration = Date.now() - starTime;
    setTimeout(() => requestAnimationFrame(animate), Math.max(0, 30 - duration));
    
}

function updateLabels() {
    let minutes = Math.floor(timer/60);
    let seconds = Math.floor(timer%60);

    if (minutes < 10) {
        minutes = "0" + minutes;
    }

    if (seconds < 10) {
        seconds = "0" + seconds;
    }

    document.getElementById('timer').innerText = "" + minutes + " min " + seconds + " s";
    
    let pW = params.plate_width.get() / mmPerM;
    let pH = params.plate_height.get() / mmPerM;
    let pD = heatBedDepth;

    document.getElementById('temperature-center').innerText = "Surface center: " + simulation.getTemperature(pW / 2, pH / 2, pD).toFixed(1) + " °C";
    document.getElementById('temperature-edge').innerText = "Surface edge: " + simulation.getTemperature(pW / 2, pW - 0.0175, pD).toFixed(1) + " °C";
    document.getElementById('temperature-corner').innerText = "Surface corner: " + simulation.getTemperature(0.0175, 0.0175, pD).toFixed(1) + " °C";
    document.getElementById('temperature-core').innerText = "Plate core: " + simulation.getTemperature(pW / 2, pH / 2, pD / 2).toFixed(1) + " °C";

    let controlThermistorHeaderEl = document.getElementById('control_thermistor_header');

    let temps = [];
    const lh = thermistorLocations[thermistors.heater];
    const lp = thermistorLocations[thermistors.plate]
    temps[thermistors.heater] = simulation.getTemperature(lh[0], lh[1], lh[2]);
    temps[thermistors.plate] = simulation.getTemperature(lp[0], lp[1], lp[2]);

    let els = [];
    els[thermistors.heater] = document.getElementById('temperature-heater');
    els[thermistors.plate] = document.getElementById('temperature-plate');

    // Check for overheatring
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

// Minimalistic UI data binding framework
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

init();
animate();
}
