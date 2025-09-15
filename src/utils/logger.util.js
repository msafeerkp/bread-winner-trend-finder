import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.logFile = path.join(this.logDir, 'app.log');
        this.ensureLogDirectory();
        this.clearLogFile();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    clearLogFile() {
        if (fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, ""); // empty file
        } else {
            fs.writeFileSync(this.logFile, ""); // create empty file
        }
    }

    formatMessage(level, message) {

        // Format timestamp with milliseconds in India timezone (Asia/Kolkata)
        const now = new Date();
        const timestamp = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: true
        });
        const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
        return `[${timestamp}.${milliseconds}] [${level}] ${message}\n`;
    }

    log(level, message) {
        const formattedMessage = this.formatMessage(level, message);
        console.log(formattedMessage);
        fs.appendFileSync(this.logFile, formattedMessage);
    }

    info(message) {
        this.log('INFO', message);
    }

    error(message) {
        this.log('ERROR', message);
    }
}

export const logger = new Logger();
