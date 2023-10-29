import { PIDController } from './pidcontroller.js';

const stepSize = 1; // Simulation step size in seconds
const iterationsPerTimestep = 25;
const cmPerM = 100; // The number of centimeters in a meter
const kSb = 0.0000000567; // Stefan-Boltzmann constant

// The hCRFactor is an arbitrary compensation factor. It compensates for the simulation not taking heating of the air into account.
// In real world scenarios there would form a thin film of hot air around the surface of hot objects giving lower temperature delta
// and thus lower heat radiation.
const emissivityCompensationFactor = 0.85; 

export class Simulation {

    reset(plateWidth, plateHeight, heaterWidth, heaterHeight, resolutionXY, layers, ambientTemperature) {
        this.sizeX = plateWidth;
        this.sizeY = plateHeight;
    
        this.heaterSizeX = heaterWidth;
        this.heaterSizeY = heaterHeight;
    
        this.resolutionXY = resolutionXY;
    
        // size is assumed to be evenly divisible by resolution. If not, the simulation will be inaccurate.
        this.countX = Math.round(this.sizeX / this.resolutionXY);
        this.countY = Math.round(this.sizeY / this.resolutionXY);
    
        this.heaterCountX = this.heaterSizeX / this.resolutionXY;
        this.heaterCountY = this.heaterSizeY / this.resolutionXY;
    
        this.layers = layers;
    
        this.temperatures = new Float32Array(this.countX * this.countY * this.layers.length);
        this.dQs = new Float32Array(this.countX * this.countY * this.layers.length);
        
        for (let i = 0; i < this.temperatures.length; i++) {
            this.temperatures[i] = ambientTemperature;
        }
    }

    iterate(targetTemp, heaterPower, ambientTemp, convectionTop, convectionBottom, thermistorLocation) {

        // Calculate a coefficient that compensates for the heating delay between the heater and the thermistor
        const tl = thermistorLocation;
        const controlTemperature = this.getTemperature(tl[0], tl[1], tl[2]);
        let controlledWattage;
    
        // Set timestep
        const dt = stepSize / iterationsPerTimestep;
    
        for (let t = 0; t < iterationsPerTimestep; t++) {
    
            // Reset this.dQs
            for (let i = 0; i < this.dQs.length; i++) {
                this.dQs[i] = 0;
            }
    
            const k = this.pid.update(targetTemp, controlTemperature, dt);
    
            // Heater
            const heaterArea = this.heaterSizeX * this.heaterSizeY * cmPerM * cmPerM;
            const heaterPowerTotal = heaterPower * heaterArea;
    
            controlledWattage = Math.min(Math.max(k, 0), heaterPowerTotal);
    
            const joulesPerIteration = controlledWattage * dt;
            const joulePerGridElement = joulesPerIteration / (this.heaterCountX * this.heaterCountY);
    
            const heaterStartX = Math.floor((this.countX - this.heaterCountX) / 2);
            const heaterStartY = Math.floor((this.countY - this.heaterCountY) / 2);
    
            const heaterEndX = heaterStartX + this.heaterCountX;
            const heaterEndY = heaterStartY + this.heaterCountY;
    
            for (let y = 0; y < this.countY; y++) {
                for (let x = 0; x < this.countX; x++) {
                    if ((x >= heaterStartX && x < heaterEndX) && (y >= heaterStartY && y < heaterEndY)) {
                        this.dQs[this.toGridIndex(x, y, 0)] = joulePerGridElement;
                    }                
                }
            }
    
            // Conduction
            for (let l = 0; l < this.layers.length; l++) {
                for (let y = 0; y < this.countY; y++) {
                    for (let x = 0; x < this.countX; x++) {
                        let i = this.toGridIndex(x, y, l);
    
                        if (x < this.countX - 1) {
                            let ii = this.toGridIndex(x + 1, y, l);
    
                            const dT = this.temperatures[i] - this.temperatures[ii]; // Temperature diff
                            const k_h = this.layers[l].material.conductivity;
                            const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area of heat flux
                            const dx = this.resolutionXY; // Distance of heat flux
                            let dQ = k_h * A * dT * dt / dx; // Calculate conduction during timestemp in joules
                            this.dQs[i] -= dQ;
                            this.dQs[ii] += dQ;
                        }
    
                        if (y < this.countY - 1) {
                            let ii = this.toGridIndex(x, y + 1, l);
    
                            const dT = this.temperatures[i] - this.temperatures[ii]; // Temperature diff
                            const k_h = this.layers[l].material.conductivity;
                            const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area of heat flux
                            const dx = this.resolutionXY; // Distance of heat flux
                            let dQ = k_h * A * dT * dt / dx; // Calculate conduction during timestemp in joules
                            this.dQs[i] -= dQ;
                            this.dQs[ii] += dQ;
                        }
    
                        if (l < this.layers.length - 1) {
                            let ii = this.toGridIndex(x, y, l + 1);
    
                            const dT = this.temperatures[i] - this.temperatures[ii]; // Temperature diff
                            const k1Inv = 0.5 * this.layers[l].sizeZ / this.layers[l].material.conductivity;
                            const k2Inv = 0.5 * this.layers[l + 1].sizeZ / this.layers[l + 1].material.conductivity;
                            const k_h_dx = 1 / (k1Inv + k2Inv); // Harmonic mean of conductivities (this has 1 / dx baked into it as part of the harmonic mean)
                            const A = this.resolutionXY * this.resolutionXY; // Surface area of heat flux
                            let dQ = k_h_dx * A * dT * dt; // Calculate conduction during timestemp in joules
                            this.dQs[i] -= dQ;
                            this.dQs[ii] += dQ;
                        }
                    }
                }
            }

            const Ta4 = Math.pow(ambientTemp + 273, 4); // Ambient temperature in kelvin to the power of 4

            // Convection / radiation top
            for (let y = 0; y < this.countY; y++) {
                const e = this.layers[this.layers.length - 1].material.emissivity;
                const A = this.resolutionXY * this.resolutionXY; // Surface area
    
                for (let x = 0; x < this.countX; x++) {
                    let i = this.toGridIndex(x, y, this.layers.length - 1);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionTop * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }
    
            // Convection / radiation bottom
            for (let y = 0; y < this.countY; y++) {
                const e = this.layers[0].material.emissivity;
                const A = this.resolutionXY * this.resolutionXY; // Surface area
    
                for (let x = 0; x < this.countX; x++) {
                    let i = this.toGridIndex(x, y, 0);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionBottom * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }
    
            // Convection / Radiation front edge
            for (let l = 0; l < this.layers.length; l++) {
                const e = this.layers[l].material.emissivity;
                const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area
    
                for (let x = 0; x < this.countX; x++) {
                    let i = this.toGridIndex(x, 0, l);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionTop * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }
    
            // Convection / Radiation back edge
            for (let l = 0; l < this.layers.length; l++) {
                const e = this.layers[l].material.emissivity;
                const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area
    
                for (let x = 0; x < this.countX; x++) {
                    let i = this.toGridIndex(x, this.countY - 1, l);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionTop * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }
    
            // Convection / Radiation left edge
            for (let l = 0; l < this.layers.length; l++) {
                const e = this.layers[l].material.emissivity;
                const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area
    
                for (let y = 0; y < this.countY; y++) {
                    let i = this.toGridIndex(0, y, l);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionTop * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }
    
            // Convection / Radiation right edge
            for (let l = 0; l < this.layers.length; l++) {
                const e = this.layers[l].material.emissivity;
                const A = this.resolutionXY * this.layers[l].sizeZ; // Surface area
    
                for (let y = 0; y < this.countY; y++) {
                    let i = this.toGridIndex(this.countX - 1, y, l);
                    const dTa = this.temperatures[i] - ambientTemp;
                    this.dQs[i] -= convectionTop * A * dt * dTa; // Heat convection on surface
                    this.dQs[i] -= e * kSb * A * (Math.pow(this.temperatures[i] + 273, 4) - Ta4) * dt * emissivityCompensationFactor; // Heat radiation
                }
            }

            // Update this.temperatures
            for (let l = 0; l < this.layers.length; l++) {
                const c = this.layers[l].material.capacity * this.layers[l].material.density * this.resolutionXY * this.resolutionXY * this.layers[l].sizeZ;
                for (let y = 0; y < this.countY; y++) {
                    for (let x = 0; x < this.countX; x++) {
                        let i = this.toGridIndex(x, y, l);
                        this.temperatures[i] += this.dQs[i] / c;
                    }
                }
            }

        }
        return controlledWattage;
    }

    recalculatePIDValues(useEmbeddedBedThermistor) {
        const embeddedThermistorFactor = useEmbeddedBedThermistor ? 5 : 1;
    
        // Approximate steady state heat convection and radiation as a function of heater wattage at 90 degrees
        const T_a = 20;
        const T_0 = 85;
        const T_1 = 95;
    
        const A = 2 * this.sizeX * this.sizeY; // Approximate total surface area
    
        const dQc_0 = 5 * A * (T_0 - T_a);
        const dQc_1 = 5 * A * (T_1 - T_a);
    
        const e = 0.9; // Thermal emissivity
    
        const dQr_0 = e * kSb * A * (Math.pow(T_0 + 273, 4) - Math.pow(T_a + 273, 4)); 
        const dQr_1 = e * kSb * A * (Math.pow(T_1 + 273, 4) - Math.pow(T_a + 273, 4));
    
        const dQ_tot_0 = dQc_0 + dQr_0;
        const dQ_tot_1 = dQc_1 + dQr_1;
    
        const K = (T_1-T_0) / (dQ_tot_1 - dQ_tot_0) / embeddedThermistorFactor; // Steady state gain
    
        const c = this.layers.reduce((a, l) => a + l.material.density * l.material.capacity * this.sizeX * this.sizeY * l.sizeZ, 0);
        const T1 = 1.5 * (2/3 * c * (T_1 - T_a)) / dQ_tot_1;
        
        const L = 10 * embeddedThermistorFactor;
    
        const Ti = L * (3.33 * T1 + L) / (T1 + 0.1 * L);
        const Td = L * T1 / (3.33 * T1 + L);
    
        const Kp = 0.9 / K * T1 / L;
        const Ki = Kp / Ti;
        const Kd = Kp * Td;
    
        this.pid = new PIDController(Kp, Ki, Kd);
    }

    // Get temperature from world coordinates
    getTemperature(x, y, z) {
        const xx = Math.min(Math.max(Math.round(x / this.resolutionXY), 0), this.countX - 1);
        const yy = Math.min(Math.max(Math.round(y / this.resolutionXY), 0), this.countY - 1);

        let layerHeight = 0;
        let layerIndex = 0;
        for (; layerIndex < this.layers.length - 1; layerIndex++) {
            layerHeight += this.layers[layerIndex].sizeZ;
            if (z < layerHeight) break;
        }

        return this.temperatures[this.toGridIndex(xx, yy, layerIndex)];
    }

    // Get temperature from grid coordinates
    getTemperatureGrid(x, y, z) {
        const xx = Math.min(Math.max(x, 0), this.countX - 1);
        const yy = Math.min(Math.max(y, 0), this.countY - 1);
        const zz = Math.min(Math.max(z, 0), this.layers.length - 1);

        return this.temperatures[this.toGridIndex(xx, yy, zz)];
    }

    toGridIndex(x, y, z) {
        return z * this.countX * this.countY + y * this.countX + x;
    } 
}
