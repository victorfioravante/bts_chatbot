const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../data/logs");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
    }),
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: "bitsler-bot-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      maxSize: "50m",
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;
