const stepSize = 1; // Simulation step size in seconds
const iterationsPerTimestep = 100;

let ambientTemperature = 22;

let temperatures;
let heatInput;
let conductivities;
let heatCapacities;

let cubeSizeX, cubeSizeY, cubeSizeZ;
let width, height, depth;
let heaterWidth, heaterHeight, heaterPower;

let simulationKernel, gpu;

// Silicone heater
let siliconeHeaterDensity = 1100000; // g/m^3
let siliconeHeaterCapacity = 1.3; // J/gK
let siliconeHeaterConductivity = 1.0; // W/mK

// Material properties
let aluminiumDensity = 2710000; // g/m^3
let aluminiumHeatCapacity = 0.900; // J/gK
let aluminiumHeatConductivity = 273.0 // W/mK

// Magnetic mat (and silicone heater at this point)
let magneticMatDensity = 3500000; // g/m^3
let magneticMatHeatCapacity = 0.5; // J/gK
let magneticMatHeatConductivity = 1.0; // W/mK


export function getTemperatures() {
    return temperatures;
}

export function initializeSimulation(w, h, d, cX, cY, cZ, hW, hH, hP) {
    width = w;
    height = h;
    depth = d;
    cubeSizeX = cX;
    cubeSizeY = cY;
    cubeSizeZ = cZ;

    heaterWidth = hW;
    heaterHeight = hH;
    heaterPower = hP;

    temperatures = new Float32Array(width * height * depth);
    heatInput = new Float32Array(width * height * depth);
    conductivities = new Float32Array(width * height * depth);
    heatCapacities = new Float32Array(width * height * depth);

    if (simulationKernel != undefined) {
        simulationKernel.destroy();
        //gpu.destroy();
    }

    initializeGpu();

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < depth; z++) {
                const temperature = ambientTemperature;
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

export function updateSimulation() {
    const dt = stepSize / iterationsPerTimestep;

    // Heater
    const controlTemperature = temperatures[toGridIndex(Math.floor(width / 2), Math.floor(height / 2), 0)]
    const targetTemp = 110;

    const wattage = heaterPower;
    const heaterArea = heaterWidth * heaterHeight;
    const controlledWattage = wattage * (1 - 0.1 * Math.max(0, (controlTemperature - targetTemp + 5)));
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

    let temperaturesTexture = simulationKernel(temperatures, conductivities, heatCapacities, heatInput, dt, width, height, depth, cubeSizeX, cubeSizeY, cubeSizeZ);

    for (let iter = 0; iter < iterationsPerTimestep - 1; iter++) {
        let temp = simulationKernel(temperaturesTexture, conductivities, heatCapacities, heatInput, dt, width, height, depth, cubeSizeX, cubeSizeY, cubeSizeZ);
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
    
    simulationKernel = gpu.createKernel(function (temps, conds, heatCapacities, heatInput, dt, width, height, depth, cubeSizeX, cubeSizeY, cubeSizeZ) {
        const surfConv = 8; // Coefficient of surface convection
        const kSb = 0.0000000567; // Stefan-Boltzmann constant
        const e = 0.9; // Surface Emissivity Coefficient

        const Ta = 22; // ambient temperature
        const Ta2 = (Ta + 273) * (Ta + 273);
        const Ta4 = Ta2 * Ta2; // Ambient temperature in K raised to the power of 4

        const z = Math.floor(this.thread.x / (width * height));
        const y = Math.floor((this.thread.x - (z * width * height)) / width);
        const x = this.thread.x % width; //- (y * width) - (z * width * height);

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
            dQ -= surfConv * A * dt * dTa;
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
            dQ -= surfConv * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (z > 0) {
            let iN = toGridIndex(x, y, z - 1, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeY * dT * dt / cubeSizeZ;
        } else {
            const A = cubeSizeX * cubeSizeY;
            dQ -= surfConv * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (x < width - 1) {
            let iN = toGridIndex(x + 1, y, z, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeY * cubeSizeZ * dT * dt / cubeSizeX;
        } else {
            const A = cubeSizeY * cubeSizeZ;
            dQ -= surfConv * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (y < height - 1) {
            let iN = toGridIndex(x, y + 1, z, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeZ * dT * dt / cubeSizeY;
        } else {
            const A = cubeSizeX * cubeSizeZ;
            dQ -= surfConv * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        if (z < depth - 1) {
            let iN = toGridIndex(x, y, z + 1, width, height);
            const dT = temps[i] - temps[iN];
            const k_h = heatCoefficient(conds[i], conds[iN]);
            dQ -= k_h * cubeSizeX * cubeSizeY * dT * dt / cubeSizeZ;
        } else {
            const A = cubeSizeX * cubeSizeY;
            dQ -= surfConv * A * dt * dTa;
            dQ -= e * kSb * A * (Math.pow(temps[i] + 273, 4) - Ta4) * dt;
        }

        return temps[i] + dQ / heatCapacities[i];
    }).setOutput([temperatures.length]).setPipeline(true).setImmutable(true).setTactic('precision');
}