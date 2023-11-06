
import uPlot from '../../external/uplot/uPlot.esm.js';

export class Plot {

    constructor(plotEl) {
        // Sample data for demonstration purposes
        this.plotData = [Array(900).fill().map((_, i) => i+1), [], [], [], [], [], [], []];

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
                    stroke: "#FFFFFFFF", 
                    grid: { stroke: "#FFFFFF40" }, 
                    ticks: { stroke: "#FFFFFF40" }, 
                    font: "11px Arial white", 
                    size: 25, 
                },
                { 
                    values: (u, vals, space) => vals.map(v => (v).toFixed(0)), 
                    size: 35, 
                    stroke: "#FFFFFFFF", 
                    grid: { stroke: "#FFFFFF40" }, 
                    ticks: { stroke: "#FFFFFF40" }, 
                    font: "11px Arial white", 
                }
            ],
            series: [
                {}, // This is a placeholder for the X-axis
                { stroke: "#FFFFFF20", width: 1, label: "(°C)" },
                { stroke: "#FFFFFF40", width: 1, label: "(°C)" },
                { stroke: "#FFFFFF60", width: 1, label: "(°C)" },
                { stroke: "#FFFFFF80", width: 1, label: "(°C)" },
                { stroke: "#FFFFFFA0", width: 1, label: "(°C)" },
                { stroke: "red", width: 1, label: "(°C)" },
            ]
        };

        this.plot = new uPlot(options, this.plotData, plotEl);
    }

    add(time, temp) {
        this.plotData[6].push(temp);
        this.plot.setData(this.plotData);
    }

    reset() {
        this.plotData[1] = this.plotData[2];
        this.plotData[2] = this.plotData[3];
        this.plotData[3] = this.plotData[4];
        this.plotData[4] = this.plotData[5];
        this.plotData[5] = this.plotData[6];
        this.plotData[6] = [];
        this.plot.setData(this.plotData);
    }

    download() {
        if (this.plotData[0].length == 0) {
            alert("No experiment data captured yet");
            return;
        }

        const csv = this.plotData[1].map(e => e.toFixed(2)).join("\n");
        navigator.clipboard.writeText(csv);
        alert("Data copied to clipboard");
    }
}