/**
 * Professional Error Handling and Logging System
 * Advanced logging with structured data, alerting, and performance monitoring
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json, errors } = format;
// Generate UUID without external dependency
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

class ProfessionalLogger {
    constructor() {
        this.logsPath = null;
        this.errorTracking = {
            patterns: new Map(),
            frequency: new Map(),
            severity: new Map(),
            contexts: new Map(),
            resolutions: new Map()
        };
        this.performanceMetrics = {
            operations: new Map(),
            thresholds: new Map(),
            trends: new Map(),
            alerts: new Map()
        };
        this.alertThresholds = {
            error_rate: { warning: 5, critical: 10 },
            response_time: { warning: 2000, critical: 5000 },
            memory_usage: { warning: 80, critical: 90 },
            disk_usage: { warning: 85, critical: 95 },
            failed_emails: { warning: 10, critical: 25 },
            bounce_rate: { warning: 5, critical: 10 }
        };
        this.logRotation = new Map();
        
        this.initializeLogger();
    }

    initializeLogger() {
        try {
            this.createLogDirectories();
            this.setupWinstonLogger();
            this.setupErrorTracking();
            this.setupPerformanceMonitoring();
            this.setupAlertSystem();
        } catch (error) {
            console.error('Failed to initialize Professional Logger:', error);
        }
    }

    createLogDirectories() {
        // Disabled: No logs folder creation to avoid filling up disk storage
    }

    setupWinstonLogger() {
        // Custom format for different log levels
        const customFormat = combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            errors({ stack: true }),
            printf(({ level, message, timestamp, stack, ...metadata }) => {
                let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
                const meta = { ...metadata };
                delete meta.message;
                
                if (Object.keys(meta).length > 0) {
                    logMessage += ` | ${JSON.stringify(meta)}`;
                }
                
                if (stack) {
                    logMessage += `\n${stack}`;
                }
                
                return logMessage;
            })
        );

        // Colorized format for console
        const consoleFormat = combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss.SSS' }),
            printf(({ level, message, timestamp, ...metadata }) => {
                let logMessage = `${timestamp} ${level}: ${message}`;
                const meta = { ...metadata };
                delete meta.message;
                
                if (Object.keys(meta).length > 0) {
                    logMessage += ` | ${JSON.stringify(meta)}`;
                }
                
                return logMessage;
            })
        );

        this.logger = createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: customFormat,
            defaultMeta: { 
                service: 'ai-mailer',
                environment: process.env.NODE_ENV || 'development',
                version: process.env.APP_VERSION || '1.0.0'
            },
            transports: [
                // Console transport with colors (no disk storage used)
                new transports.Console({
                    format: consoleFormat,
                    level: 'debug'
                })
            ],
            
            // Handle uncaught exceptions and promise rejections in console
            exceptionHandlers: [
                new transports.Console({
                    format: consoleFormat
                })
            ],
            
            rejectionHandlers: [
                new transports.Console({
                    format: consoleFormat
                })
            ]
        });
    }

    setupErrorTracking() {
        this.errorTracking = {
            patterns: new Map(),
            frequency: new Map(),
            severity: new Map(),
            contexts: new Map(),
            resolutions: new Map()
        };

        // Common error patterns to track
        this.errorPatterns = [
            {
                name: 'SMTP_CONNECTION_FAILED',
                pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
                severity: 'high',
                category: 'network'
            },
            {
                name: 'AUTHENTICATION_FAILED',
                pattern: /AUTH|LOGIN|CREDENTIALS/,
                severity: 'high',
                category: 'security'
            },
            {
                name: 'RATE_LIMIT_EXCEEDED',
                pattern: /RATE_LIMIT|TOO_MANY_REQUESTS/,
                severity: 'medium',
                category: 'performance'
            },
            {
                name: 'TEMPLATE_RENDER_ERROR',
                pattern: /TEMPLATE|RENDER|COMPILE/,
                severity: 'medium',
                category: 'application'
            },
            {
                name: 'DATABASE_CONNECTION_LOST',
                pattern: /DATABASE|CONNECTION|TIMEOUT/,
                severity: 'high',
                category: 'infrastructure'
            },
            {
                name: 'MEMORY_LEAK_DETECTED',
                pattern: /MEMORY|LEAK|OUT_OF_MEMORY/,
                severity: 'critical',
                category: 'performance'
            },
            {
                name: 'SECURITY_VIOLATION',
                pattern: /SECURITY|UNAUTHORIZED|FORBIDDEN/,
                severity: 'critical',
                category: 'security'
            }
        ];
    }

    setupPerformanceMonitoring() {
        this.performanceMetrics = {
            operations: new Map(),
            thresholds: new Map(),
            trends: new Map(),
            alerts: new Map()
        };

        // Performance thresholds
        this.performanceThresholds = {
            email_send: { warning: 2000, critical: 5000 }, // milliseconds
            template_render: { warning: 500, critical: 2000 },
            database_query: { warning: 1000, critical: 3000 },
            api_response: { warning: 1000, critical: 5000 },
            file_operation: { warning: 500, critical: 2000 },
            network_request: { warning: 3000, critical: 10000 }
        };

        // Start performance monitoring
        this.startPerformanceMonitoring();
    }

    setupAlertSystem() {
        this.alertThresholds = {
            error_rate: { warning: 5, critical: 10 }, // errors per minute
            response_time: { warning: 2000, critical: 5000 }, // milliseconds
            memory_usage: { warning: 80, critical: 90 }, // percentage
            disk_usage: { warning: 85, critical: 95 }, // percentage
            failed_emails: { warning: 10, critical: 25 }, // percentage
            bounce_rate: { warning: 5, critical: 10 } // percentage
        };

        this.alertChannels = {
            email: process.env.ALERT_EMAIL,
            webhook: process.env.ALERT_WEBHOOK,
            slack: process.env.ALERT_SLACK_WEBHOOK
        };
    }

    get level() {
        return this.logger ? this.logger.level : 'info';
    }

    set level(newLevel) {
        if (this.logger) {
            this.logger.level = newLevel;
        }
    }

    // Advanced Logging Methods
    log(level, message, metadata = {}) {
        const logEntry = {
            ...metadata,
            timestamp: new Date().toISOString(),
            requestId: metadata.requestId || uuidv4(),
            userId: metadata.userId,
            sessionId: metadata.sessionId,
            correlationId: metadata.correlationId
        };

        if (this.logger) {
            this.logger.log(level, message, logEntry);
        } else {
            console.log(`[${(level || 'info').toUpperCase()}] ${message}`, metadata);
        }
        
        // Track errors for analysis
        if (level === 'error' || level === 'warn') {
            this.trackError({ message, ...logEntry });
        }
        
        return { message, ...logEntry };
    }

    info(message, metadata = {}) {
        return this.log('info', message, metadata);
    }

    warn(message, metadata = {}) {
        return this.log('warn', message, metadata);
    }

    error(message, error, metadata = {}) {
        let errorMetadata = { ...metadata };
        
        if (error instanceof Error) {
            errorMetadata.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code,
                errno: error.errno,
                syscall: error.syscall
            };
        } else if (error && typeof error === 'object') {
            errorMetadata = { ...error, ...metadata };
        } else if (typeof error === 'string') {
            errorMetadata.error = { message: error };
        }
        
        return this.log('error', message, errorMetadata);
    }

    debug(message, metadata = {}) {
        return this.log('debug', message, metadata);
    }

    // Specialized Logging Methods
    logEmailOperation(operation, details) {
        const logData = {
            type: 'email_operation',
            operation,
            details: {
                recipient: details.recipient,
                subject: details.subject,
                template: details.template,
                campaign: details.campaign,
                smtp_server: details.smtpServer,
                duration: details.duration,
                success: details.success,
                error: details.error
            }
        };
        
        const level = details.success ? 'info' : 'error';
        return this.log(level, `Email operation: ${operation}`, logData);
    }

    logSecurityEvent(event, details) {
        const logData = {
            type: 'security',
            event,
            details: {
                ip_address: details.ipAddress,
                user_agent: details.userAgent,
                user_id: details.userId,
                resource: details.resource,
                action: details.action,
                result: details.result,
                reason: details.reason
            }
        };
        
        const level = details.result === 'blocked' ? 'warn' : 'info';
        return this.log(level, `Security event: ${event}`, logData);
    }

    logPerformanceMetric(operation, duration, details = {}) {
        const logData = {
            type: 'performance',
            operation,
            duration,
            details
        };
        
        // Check performance thresholds
        this.checkPerformanceThreshold(operation, duration, details);
        
        return this.log('info', `Performance: ${operation} took ${duration}ms`, logData);
    }

    logAuditEvent(action, resource, details) {
        const logData = {
            type: 'audit',
            action,
            resource,
            details: {
                user_id: details.userId,
                timestamp: details.timestamp,
                changes: details.changes,
                previous_value: details.previousValue,
                new_value: details.newValue,
                ip_address: details.ipAddress,
                user_agent: details.userAgent
            }
        };
        
        return this.log('info', `Audit: ${action} on ${resource}`, logData);
    }

    logWarmingEvent(event, details) {
        const logData = {
            type: 'warming',
            event,
            details: {
                campaign_id: details.campaignId,
                profile_id: details.profileId,
                recipient: details.recipient,
                action: details.action,
                metrics: details.metrics,
                result: details.result
            }
        };
        
        return this.log('info', `Warming event: ${event}`, logData);
    }

    // Error Tracking and Analysis
    trackError(logEntry) {
        const errorKey = this.generateErrorKey(logEntry);
        
        if (!this.errorTracking.frequency.has(errorKey)) {
            this.errorTracking.frequency.set(errorKey, {
                count: 0,
                firstSeen: new Date(),
                lastSeen: new Date(),
                instances: []
            });
        }
        
        const errorData = this.errorTracking.frequency.get(errorKey);
        errorData.count++;
        errorData.lastSeen = new Date();
        errorData.instances.push({
            timestamp: new Date(),
            context: logEntry
        });
        
        // Keep only recent instances (last 100)
        if (errorData.instances.length > 100) {
            errorData.instances = errorData.instances.slice(-100);
        }
        
        // Categorize error
        const category = this.categorizeError(logEntry);
        errorData.category = category;
        
        // Check if we need to send an alert
        this.checkErrorAlert(errorKey, errorData);
        
        return errorKey;
    }

    generateErrorKey(logEntry) {
        if (logEntry.error) {
            return `${logEntry.error.name}:${logEntry.error.code || 'unknown'}`;
        }
        return logEntry.message || 'unknown_error';
    }

    categorizeError(logEntry) {
        for (const pattern of this.errorPatterns) {
            const errorMessage = logEntry.error ? 
                `${logEntry.error.name} ${logEntry.error.message} ${logEntry.error.code || ''}` : 
                logEntry.message;
            
            if (pattern.pattern.test(errorMessage)) {
                return {
                    name: pattern.name,
                    severity: pattern.severity,
                    category: pattern.category
                };
            }
        }
        
        return {
            name: 'UNKNOWN_ERROR',
            severity: 'medium',
            category: 'general'
        };
    }

    checkErrorAlert(errorKey, errorData) {
        const now = new Date();
        const timeWindow = 5 * 60 * 1000; // 5 minutes
        const recentErrors = errorData.instances.filter(instance => 
            now - instance.timestamp < timeWindow
        );
        
        // Alert if error frequency exceeds threshold
        if (recentErrors.length > 10) {
            this.sendAlert('error_spike', {
                errorKey,
                recentCount: recentErrors.length,
                timeWindow: '5 minutes',
                severity: 'high'
            });
        }
    }

    // Performance Monitoring
    startPerformanceMonitoring() {
        // Monitor system performance
        const sysInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 60000); // Every minute
        if (sysInterval && sysInterval.unref) sysInterval.unref();
        
        // Monitor memory usage
        const memInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, 30000); // Every 30 seconds
        if (memInterval && memInterval.unref) memInterval.unref();
    }

    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        const metrics = {
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                external: Math.round(memUsage.external / 1024 / 1024) // MB
            },
            cpu: {
                user: Math.round(cpuUsage.user / 1000), // milliseconds
                system: Math.round(cpuUsage.system / 1000) // milliseconds
            },
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
        
        this.logPerformanceMetric('system_metrics', 0, metrics);
        
        // Check for memory alerts
        const memoryUsagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
        if (memoryUsagePercent > this.alertThresholds.memory_usage.critical) {
            this.sendAlert('high_memory_usage', {
                usage: memoryUsagePercent,
                threshold: this.alertThresholds.memory_usage.critical,
                severity: 'critical'
            });
        }
    }

    checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        if (usagePercent > this.alertThresholds.memory_usage.warning) {
            this.log('warn', 'High memory usage detected', {
                type: 'performance',
                usage: Math.round(usagePercent),
                threshold: this.alertThresholds.memory_usage.warning,
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
                }
            });
        }
    }

    checkPerformanceThreshold(operation, duration, details) {
        const thresholds = this.performanceThresholds[operation];
        if (!thresholds) return;
        
        if (duration > thresholds.critical) {
            this.log('error', `Critical performance issue: ${operation}`, {
                type: 'performance',
                operation,
                duration,
                threshold: thresholds.critical,
                severity: 'critical'
            });
            
            this.sendAlert('performance_degradation', {
                operation,
                duration,
                threshold: thresholds.critical,
                severity: 'critical'
            });
        } else if (duration > thresholds.warning) {
            this.log('warn', `Performance warning: ${operation}`, {
                type: 'performance',
                operation,
                duration,
                threshold: thresholds.warning,
                severity: 'warning'
            });
        }
    }

    // Alert System
    async sendAlert(alertType, data) {
        const alert = {
            id: uuidv4(),
            type: alertType,
            severity: data.severity || 'medium',
            message: this.generateAlertMessage(alertType, data),
            data,
            timestamp: new Date().toISOString(),
            acknowledged: false
        };
        
        // Log alert
        this.log('warn', `ALERT: ${alert.message}`, {
            type: 'alert',
            alertId: alert.id,
            alertType,
            severity: alert.severity
        });
        
        // Send to external channels
        await this.sendExternalAlert(alert);
        
        // Save alert to file
        await this.saveAlert(alert);
    }

    generateAlertMessage(alertType, data) {
        const messages = {
            error_spike: `Error rate spike detected: ${data.recentCount} errors in ${data.timeWindow}`,
            high_memory_usage: `High memory usage: ${data.usage}% (threshold: ${data.threshold}%)`,
            performance_degradation: `Performance degradation: ${data.operation} took ${data.duration}ms`,
            security_violation: `Security violation detected: ${data.reason}`,
            smtp_connection_failed: `SMTP connection failed: ${data.server}`,
            authentication_failed: `Authentication failed for user: ${data.userId}`,
            rate_limit_exceeded: `Rate limit exceeded: ${data.limit} requests in ${data.timeframe}`
        };
        
        return messages[alertType] || `Alert: ${alertType}`;
    }

    async sendExternalAlert(alert) {
        // Send to configured channels
        if (this.alertChannels.webhook) {
            await this.sendWebhookAlert(alert);
        }
        
        if (this.alertChannels.slack && alert.severity === 'critical') {
            await this.sendSlackAlert(alert);
        }
        
        if (this.alertChannels.email && alert.severity === 'critical') {
            await this.sendEmailAlert(alert);
        }
    }

    async sendWebhookAlert(alert) {
        try {
            const https = require('https');
            const data = JSON.stringify(alert);
            
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };
            
            const req = https.request(this.alertChannels.webhook, options, (res) => {
                this.log('info', `Webhook alert sent: ${res.statusCode}`, {
                    type: 'alert',
                    alertId: alert.id,
                    statusCode: res.statusCode
                });
            });
            
            req.on('error', (error) => {
                this.log('error', 'Failed to send webhook alert', {
                    type: 'alert',
                    alertId: alert.id,
                    error: error.message
                });
            });
            
            req.write(data);
            req.end();
            
        } catch (error) {
            this.log('error', 'Failed to send webhook alert', {
                type: 'alert',
                alertId: alert.id,
                error: error.message
            });
        }
    }

    async sendSlackAlert(alert) {
        // Slack webhook implementation would go here
        this.log('info', `Slack alert would be sent for: ${alert.message}`, {
            type: 'alert',
            alertId: alert.id
        });
    }

    async sendEmailAlert(alert) {
        // Email alert implementation would go here
        this.log('info', `Email alert would be sent for: ${alert.message}`, {
            type: 'alert',
            alertId: alert.id
        });
    }

    async saveAlert(alert) {
        // In-memory alert tracking only - no file creation to save disk space
        return;
    }

    // Log Analysis and Reporting
    async getErrorReport(timeRange = '24h') {
        const now = new Date();
        const startTime = new Date(now.getTime() - this.parseTimeRange(timeRange));
        
        const errors = Array.from(this.errorTracking.frequency.entries()).map(([key, data]) => ({
            errorKey: key,
            count: data.count,
            firstSeen: data.firstSeen,
            lastSeen: data.lastSeen,
            category: data.category,
            severity: data.severity
        }));
        
        return {
            timeRange,
            totalErrors: errors.reduce((sum, e) => sum + e.count, 0),
            uniqueErrors: errors.length,
            topErrors: errors.sort((a, b) => b.count - a.count).slice(0, 10),
            byCategory: this.groupByCategory(errors),
            bySeverity: this.groupBySeverity(errors),
            trends: this.calculateErrorTrends(errors, startTime, now)
        };
    }

    async getPerformanceReport(timeRange = '24h') {
        const metrics = Array.from(this.performanceMetrics.operations.entries()).map(([operation, data]) => ({
            operation,
            averageDuration: data.totalDuration / data.count,
            count: data.count,
            minDuration: data.minDuration,
            maxDuration: data.maxDuration,
            lastDuration: data.lastDuration
        }));
        
        return {
            timeRange,
            operations: metrics,
            systemHealth: this.calculateSystemHealth(),
            recommendations: this.generatePerformanceRecommendations(metrics)
        };
    }

    parseTimeRange(timeRange) {
        const match = timeRange.match(/^(\d+)([smhd])$/);
        if (!match) return 24 * 60 * 60 * 1000; // Default to 24 hours
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        const multipliers = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };
        
        return value * multipliers[unit];
    }

    groupByCategory(errors) {
        const byCategory = {};
        errors.forEach(error => {
            if (!byCategory[error.category]) {
                byCategory[error.category] = 0;
            }
            byCategory[error.category] += error.count;
        });
        return byCategory;
    }

    groupBySeverity(errors) {
        const bySeverity = {};
        errors.forEach(error => {
            if (!bySeverity[error.severity]) {
                bySeverity[error.severity] = 0;
            }
            bySeverity[error.severity] += error.count;
        });
        return bySeverity;
    }

    calculateErrorTrends(errors, startTime, endTime) {
        // Calculate error trends over time
        return {
            increasing: errors.filter(e => e.lastSeen > new Date(endTime.getTime() - 3600000)).length,
            decreasing: errors.filter(e => e.lastSeen < new Date(endTime.getTime() - 7200000)).length,
            stable: errors.filter(e => 
                e.lastSeen <= new Date(endTime.getTime() - 3600000) && 
                e.lastSeen >= new Date(endTime.getTime() - 7200000)
            ).length
        };
    }

    calculateSystemHealth() {
        const memUsage = process.memoryUsage();
        const health = {
            memory: {
                used: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
                status: 'healthy'
            },
            uptime: {
                value: process.uptime(),
                status: 'healthy'
            },
            errors: {
                recent: this.getRecentErrorCount(),
                status: 'healthy'
            }
        };
        
        // Determine overall status
        if (health.memory.used > 90) health.memory.status = 'critical';
        else if (health.memory.used > 80) health.memory.status = 'warning';
        
        if (health.errors.recent > 10) health.errors.status = 'warning';
        else if (health.errors.recent > 25) health.errors.status = 'critical';
        
        return health;
    }

    getRecentErrorCount() {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 3600000);
        
        return Array.from(this.errorTracking.frequency.values())
            .filter(error => new Date(error.lastSeen) > oneHourAgo)
            .reduce((sum, error) => sum + error.count, 0);
    }

    generatePerformanceRecommendations(metrics) {
        const recommendations = [];
        
        metrics.forEach(metric => {
            if (metric.averageDuration > 2000) {
                recommendations.push({
                    operation: metric.operation,
                    issue: 'High average response time',
                    recommendation: 'Consider optimization or caching',
                    priority: 'high'
                });
            }
            
            if (metric.maxDuration > metric.averageDuration * 3) {
                recommendations.push({
                    operation: metric.operation,
                    issue: 'High variance in response times',
                    recommendation: 'Investigate inconsistent performance',
                    priority: 'medium'
                });
            }
        });
        
        return recommendations;
    }

    // Utility Methods
    generateRequestId() {
        return uuidv4();
    }

    createCorrelationId() {
        return uuidv4();
    }

    formatDuration(milliseconds) {
        if (milliseconds < 1000) {
            return `${milliseconds}ms`;
        } else if (milliseconds < 60000) {
            return `${(milliseconds / 1000).toFixed(2)}s`;
        } else {
            return `${(milliseconds / 60000).toFixed(2)}m`;
        }
    }

    // Cleanup and Maintenance
    async cleanup() {
        // No log files on disk to clean up
        return;
    }
}

// Create singleton instance
const logger = new ProfessionalLogger();

// Export both the logger instance and the class
module.exports = logger;
module.exports.ProfessionalLogger = ProfessionalLogger;