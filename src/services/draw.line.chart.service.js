let priceLabels = [];
let priceData = [];
let priceCounter = 0;

let rsiLabels = [];
let rsiData = [];
let rsiCounter = 0;

const MAX_POINTS = 10000;

export class DrawLineChartService {
    constructor(wss) {
        this.wsLocal = null;
        wss.on('connection', (ws, req) => {
            if (req.url === '/chart-data') {
                this.wsLocal = ws;
            } else {
            ws.close();
            }
        });
        let lab = 1;
        setInterval(() => {
            if (this.wsLocal && this.wsLocal.readyState === this.wsLocal.OPEN) {
                this.wsLocal.send(JSON.stringify({label: new Date().toISOString().split('T')[1], data: {
                    rsi: Math.floor(Math.random() * (70 - 30 + 1)) + 30, 
                    price: Math.floor(Math.random() * (70 - 30 + 1)) + 30
                }}));
                 
            }
        }, 1000);
    }
    sendData(data) {
        if (this.wsLocal && this.wsLocal.readyState === this.wsLocal.OPEN) {
            this.wsLocal.send(JSON.stringify(data));
        }
    }
}