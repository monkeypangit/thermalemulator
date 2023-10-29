export class PIDController {
    constructor(Kp, Ki, Kd) {
        this.Kp = Kp;         // Proportional gain
        this.Ki = Ki;         // Integral gain
        this.Kd = Kd;         // Derivative gain

        this.smoothedValue = 0;

        this.previousError = 0;
        this.integral = 0;

        this.tau = 500;  // Time constant for integral decay in seconds
        this.smoothTau = 10;  // Time constant for integral decay in seconds
    }

    /**
     * Calculate PID output
     * 
     * @param {Number} setpoint - Desired set value
     * @param {Number} actualValue - Current system value
     * @param {Number} dt - Change in time since the last update (in seconds)
     * 
     * @returns {Number} Output that should be applied to the system
     */
    update(setpoint, actualValue, dt) {
        const error = setpoint - actualValue;

        // Calculate the decay factor and apply it to the integral
        const decayFactor = Math.exp(-dt / this.tau);
        this.integral = decayFactor * this.integral + error * dt;

        // Clamping the integral
        const maxIntegralValue = 100;  // This value should be chosen based on your system's needs
        this.integral = Math.min(Math.max(this.integral, -maxIntegralValue), maxIntegralValue);

        const P = this.Kp * error;
        const I = this.Ki * this.integral;
        const D = this.Kd * (error - this.previousError) / dt;

        this.previousError = error;

        const pidValue =  P + I + D;

        const blendFactor = Math.exp(-dt / this.smoothTau);
        this.smoothedValue = (blendFactor * this.smoothedValue + (1 - blendFactor) * pidValue);

        return this.smoothedValue;
    }
}
