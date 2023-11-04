
export class Plot {

    constructor(plotEl) {
        // Sample data for demonstration purposes
        this.plotData = [[],[]];

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

        this.plot = new uPlot(options, this.plotData, plotEl);
    }

    add(time, temp) {
        this.plotData[0].push(time);
        this.plotData[1].push(temp);
        this.plot.setData(this.plotData);
    }

    reset() {
        this.plotData[0].length = 0;
        this.plotData[1].length = 0;
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