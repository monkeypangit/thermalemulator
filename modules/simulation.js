const stepSize = 1; // Simulation step size in seconds
const iterationsPerTimestep = 100;

// Size of sides of cubes in meters
const cubeSizeX = 0.005;
const cubeSizeY = 0.005;
const cubeSizeZ = 0.002;

// Grid arrays holding simulation data
let temperatures;
let heatInput;
let conductivities;
let heatCapacities;

// Dimensions in grid cubes for things
let width, height, depth;
let heaterWidth, heaterHeight;

let simulationKernel, gpu;

// Silicone heater
let siliconeHeaterDensity = 1100000; // g/m^3
let siliconeHeaterCapacity = 1.3; // J/gK
let siliconeHeaterConductivity; // W/mK (from UI)

// Material properties
let aluminiumDensity = 2710000; // g/m^3
let aluminiumHeatCapacity = 0.900; // J/gK
let aluminiumHeatConductivity = 273.0 // W/mK

// Magnetic mat (and silicone heater at this point)
let magneticMatDensity = 3500000; // g/m^3
let magneticMatHeatCapacity = 0.5; // J/gK
let magneticMatHeatConductivity; // W/mK (from UI)

// PID regulator, constants and error terms
let Kp, Ki, Kd;
let Ep, Ei;

export function _getTemperatureGrid(p) { return temperatures[toGridIndex(p[0], p[1], p[2])]; }

export function _getTemperature(p) {
    let x = Math.min(Math.max(Math.floor(p[0] / 1000 / cubeSizeX), 0), width - 1);
    let y = Math.min(Math.max(Math.floor(p[1] / 1000 / cubeSizeY), 0), height - 1);
    let z = Math.min(Math.max(Math.floor(p[2] / 1000 / cubeSizeZ), 0), depth - 1);

    return temperatures[toGridIndex(x, y, z)];
}



export function _getSimulationResolutionX() { return width; }
export function _getSimulationResolutionY() { return height; }
export function _getSimulationResolutionZ() { return depth; }

export function _resetSimulation(p) {

    width = Math.floor(p.plate_width / 1000 / cubeSizeX);
    height = Math.floor(p.plate_height / 1000 / cubeSizeY);
    depth = Math.floor(p.plate_depth / 1000 / cubeSizeZ) + 2;

    heaterWidth = Math.floor(p.heater_width / 1000 / cubeSizeX);
    heaterHeight = Math.floor(p.heater_height / 1000 / cubeSizeX);

    temperatures = new Float32Array(width * height * depth);
    heatInput = new Float32Array(width * height * depth);
    conductivities = new Float32Array(width * height * depth);
    heatCapacities = new Float32Array(width * height * depth);

    siliconeHeaterConductivity = p.magnetic_mat_conductivity;
    magneticMatHeatConductivity = p.heater_conductivity;
    
    Ep = 0;
    Ei = 0;

    if (simulationKernel != undefined) {
        simulationKernel.destroy();
        //gpu.destroy();
    }

    initializeGpu();

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < depth; z++) {
                const temperature = p.ambient_temperature;
                if (z == 0) {
                    const heatCapacity = siliconeHeaterCapacity * siliconeHeaterDensity * cubeSizeX * cubeSizeY * cubeSizeZ;
                    const heatConductivity = siliconeHeaterConductivity;

                    let i = toGridIndex(x, y, z)
                    temperatures[i] = temperature;
                    conductivities[i] = heatConductivity; // W/mK
                    heatCapacities[i] = heatCapacity; // J/(cube*K)
                } else if (z == depth - 1 ) {
                    const heatCapacity = magneticMatHeatCapacity * magneticMatDensity * cubeSizeX * cubeSizeY * cubeSizeZ;
                    const heatConductivity = magneticMatHeatConductivity;

                    let i = toGridIndex(x, y, z)
                    temperatures[i] = temperature;
                    conductivities[i] = heatConductivity; // W/mK
                    heatCapacities[i] = heatCapacity; // J/(cube*K)
                } else {
                    const heatCapacity = aluminiumHeatCapacity * aluminiumDensity * cubeSizeX * cubeSizeY * cubeSizeZ;
                    const heatConductivity = aluminiumHeatConductivity;

                    let i = toGridIndex(x, y, z)
                    temperatures[i] = temperature;
                    conductivities[i] = heatConductivity; // W/mK
                    heatCapacities[i] = heatCapacity; // J/(cube*K)
                } 
            }
        }
    }
}

function updatePID(controlTemperature, targetTemperature, dt) {
    let Ep_new = (targetTemperature - controlTemperature);
    Ei = 0.85 * Ei + Ep * dt
    let Ed = (Ep_new - Ep) / dt;

    Ep = Ep_new;
    return Kp * Ep + Ki * Ei + Kd * Ed;
}

export function _iterateSimulation(p, thermistorLocation) {

    // Calculate a coefficient that compensates for the heating delay between the heater and the thermistor
    // The coefficient increases with vertical offset dsitance
    let controlTemperature = _getTemperature(thermistorLocation);

    let thermistorLocationCompensation = thermistorLocation[2];
    let buildPlateSizeCompensation = (width * height * cubeSizeX * cubeSizeY) / (0.25*0.25);

    Kp = 200 * (1 + thermistorLocationCompensation * 500) * buildPlateSizeCompensation;
    Ki = 75 / (1 + thermistorLocationCompensation * 25000) * buildPlateSizeCompensation;
    Kd = 5 * (1 + thermistorLocationCompensation * 100000) * buildPlateSizeCompensation;

    let k = updatePID(controlTemperature, p.target_temperature, stepSize);

    let heaterPowerTotal = p.heater_power * heaterWidth * cubeSizeX * 100 * heaterHeight * cubeSizeY * 100;

    let bed_convection_mid = (p.bed_convection_top + p.bed_convection_bottom) / 2;
    
    const dt = stepSize / iterationsPerTimestep;

    // Heater
    const controlledWattage = Math.min(Math.max(k, 0), heaterPowerTotal);

    const heaterArea = heaterWidth * heaterHeight;
    const joulesPerIteration = controlledWattage * (stepSize / iterationsPerTimestep);
    const joulePerGridElement = joulesPerIteration / heaterArea;

    const heaterStartX = Math.floor((width - heaterWidth) / 2);
    const heaterStartY = Math.floor((height - heaterHeight) / 2);

    const heaterEndX = heaterStartX + heaterWidth;
    const heaterEndY = heaterStartY + heaterHeight;

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            heatInput[toGridIndex(x, y, 0)] = (x >= heaterStartX  && x < heaterEndX) && (y >= heaterStartY && y < heaterEndY) ? joulePerGridElement : 0;
        }
    }

    let temperaturesTexture = simulationKernel(
        temperatures, 
        conductivities, 
        heatCapacities, 
        heatInput, 
        dt, 
        width, 
        height, 
        depth, 
        cubeSizeX, 
        cubeSizeY, 
        cubeSizeZ, 
        p.ambient_temperature, 
        p.bed_convection_top, 
        p.bed_convection_bottom, 
        bed_convection_mid);

    for (let iter = 0; iter < iterationsPerTimestep; iter++) {
        let temp = simulationKernel(
            temperaturesTexture, 
            conductivities, 
            heatCapacities, 
            heatInput, 
            dt, 
            width, 
            height, 
            depth, 
            cubeSizeX, 
            cubeSizeY, 
            cubeSizeZ, 
            p.ambient_temperature, 
            p.bed_convection_top, 
            p.bed_convection_bottom, 
            bed_convection_mid);

        temperaturesTexture.delete();
        temperaturesTexture = temp;
    }

    temperatures.set(temperaturesTexture.toArray());
    temperaturesTexture.delete();

    return controlledWattage;
}

function toGridIndex(x, y, z) {
    return z * width * height + y * width + x;
}

// Create GPU kernel for calculating heat exchange
function initializeGpu() {

    // There is an unresolved issue with the gpu.js library where behaves differently depending on browser.
    // So if the first way does not work, then try the other.
    if (gpu == undefined) {
        try {
            gpu = new GPU();
        } catch (error) {
            gpu = new GPU.GPU();
        }
    }
    
    simulationKernel = gpu.createKernel(function (
        temps, 
        conds, 
        heatCapacities, 
        heatInput, 
        dt, 
        width, 
        height, 
        depth, 
        cubeSizeX, 
        cubeSizeY, 
        cubeSizeZ, 
        ambientTemparature, 
        heatConvectionTop, 
        heatConvectionBottom, 
        heatConvectionMid) {
        
        const surfConvTop = heatConvectionTop;
        const surfConvMid = heatConvectionMid;
        const surfConvBottom = heatConvectionBottom;
        
        const surfConv = 8; // Coefficient of surface convection
        const kSb = 0.0000000567; // Stefan-Boltzmann constant
        const e = 0.9; // Surface Emissivity Coefficient

        const Ta = ambientTemparature; // ambient temperature
        const Ta2 = (Ta + 273) * (Ta + 273);
        const Ta4 = Ta2 * Ta2; // Ambient temperature in K raised to the power of 4

        const z = Math.floor(this.thread.x / (width * height));
        const y = Math.floor((this.thread.x - (z * width * height)) / width);
        const x = this.thread.x % width;

        function toGridIndex(x, y, z, width, height) { return z * width * height + y * width + x; }
        function heatCoefficient(a, b) { return 2 / (1 / a + 1 / b); }

        const i = this.thread.x;
        let dQ = 0.0;

        // heat input
        dQ += heatInput[i];

        // Temperature differences
        const dTa = temps[i] - Ta;

        if (x > 0) {
            let iN = toGridIndex(x - 1, y, z, width, height);
            // Temperature difference
            const dT = temps[i] - temps[iN];
            // Harmonic mean of thermal conductivities
            const k_h = heatCoefficient(conds[i], conds[iN]);
            // -k_h * A * dT * dt / dX;
            dQ -= k_h * cubeSizeY * cubeSizeZ * dT * dt / cubeSizeX;
        } else {
            const A = cubeSizeY * cubeSizeZ; // Surface area
            // Heat convection on surface
            dQ -= surfConvMid * A * dt * dTa;
            // Heat radiation
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (y > 0) {
            let iN = toGridIndex(x, y - 1, z, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeZ * dT * dt / cubeSizeY;
        } else {
            const A = cubeSizeX * cubeSizeZ;
            dQ -= surfConvMid * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (z > 0) {
            let iN = toGridIndex(x, y, z - 1, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeY * dT * dt / cubeSizeZ;
        } else {
            const A = cubeSizeX * cubeSizeY;
            dQ -= surfConvBottom * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (x < width - 1) {
            let iN = toGridIndex(x + 1, y, z, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeY * cubeSizeZ * dT * dt / cubeSizeX;
        } else {
            const A = cubeSizeY * cubeSizeZ;
            dQ -= surfConvMid * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (y < height - 1) {
            let iN = toGridIndex(x, y + 1, z, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeZ * dT * dt / cubeSizeY;
        } else {
            const A = cubeSizeX * cubeSizeZ;
            dQ -= surfConvMid * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (z < depth - 1) {
            let iN = toGridIndex(x, y, z + 1, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeY * dT * dt / cubeSizeZ;
        } else {
            const A = cubeSizeX * cubeSizeY;
            dQ -= surfConvTop * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        return temps[i] + dQ / heatCapacities[i];
    }).setOutput([temperatures.length]).setPipeline(true).setImmutable(true).setTactic('precision');
}