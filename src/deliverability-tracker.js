/**
 * Email Deliverability Tracking and Metrics System
 * Advanced tracking for email delivery, engagement, and performance metrics
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class DeliverabilityTracker {
    constructor() {
        this.metricsPath = path.join(__dirname, '..', 'data', 'deliverability-metrics');
        this.trackingData = new Map();
        this.realTimeMetrics = new Map();
        this.domainMetrics = new Map();
        this.ipMetrics = new Map();
        this.reputationScores = new Map();
        
        this.initializeTracker();
    }

    async initializeTracker() {
        try {
            await this.createMetricsDirectories();
            await this.loadHistoricalMetrics();
            await this.initializeRealTimeTracking();
            
            logger.info('Deliverability Tracker initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Deliverability Tracker:', error);
            throw error;
        }
    }

    async createMetricsDirectories() {
        const directories = [
            this.metricsPath,
            path.join(this.metricsPath, 'campaigns'),
            path.join(this.metricsPath, 'domains'),
            path.join(this.metricsPath, 'ips'),
            path.join(this.metricsPath, 'real-time'),
            path.join(this.metricsPath, 'reputation'),
            path.join(this.metricsPath, 'reports')
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }
            }
        }
    }

    // Advanced Email Tracking
    async trackEmailSend(emailData) {
        try {
            const trackingId = uuidv4();
            const trackingRecord = {
                id: trackingId,
                emailId: emailData.emailId,
                recipient: emailData.recipient,
                sender: emailData.sender,
                subject: emailData.subject,
                campaignId: emailData.campaignId,
                templateId: emailData.templateId,
                
                // Technical details
                smtpServer: emailData.smtpServer,
                ipAddress: emailData.ipAddress,
                domain: emailData.domain,
                port: emailData.port,
                
                // Timing and status
                sentAt: new Date().toISOString(),
                status: 'sent',
                
                // Tracking metadata
                trackingPixel: this.generateTrackingPixel(trackingId),
                clickTrackingUrl: this.generateClickTrackingUrl(trackingId),
                unsubscribeUrl: this.generateUnsubscribeUrl(trackingId),
                
                // Initial metrics
                metrics: {
                    deliveryTime: null,
                    bounceType: null,
                    bounceReason: null,
                    openTime: null,
                    clickTimes: [],
                    replyTime: null,
                    spamReportTime: null,
                    unsubscribeTime: null
                },
                
                // Quality indicators
                quality: {
                    spamScore: emailData.spamScore || 0,
                    contentScore: emailData.contentScore || 0,
                    reputationScore: emailData.reputationScore || 0
                }
            };

            this.trackingData.set(trackingId, trackingRecord);
            await this.saveTrackingRecord(trackingRecord);
            
            // Update real-time metrics
            await this.updateRealTimeMetrics('sent', trackingRecord);
            
            logger.info(`Email tracked: ${trackingId} to ${emailData.recipient}`);
            return trackingRecord;
            
        } catch (error) {
            logger.error('Error tracking email send:', error);
            throw error;
        }
    }

    async trackEmailDelivery(trackingId, deliveryData) {
        try {
            const record = this.trackingData.get(trackingId);
            if (!record) {
                throw new Error(`Tracking record not found: ${trackingId}`);
            }

            record.status = 'delivered';
            record.metrics.deliveryTime = new Date().toISOString();
            record.metrics.smtpResponse = deliveryData.smtpResponse;
            record.metrics.deliveryServer = deliveryData.server;
            
            // Calculate delivery time
            const sentTime = new Date(record.sentAt);
            const deliveryTime = new Date(record.metrics.deliveryTime);
            record.metrics.deliveryDuration = deliveryTime - sentTime;
            
            // Update domain metrics
            await this.updateDomainMetrics(record.domain, 'delivered');
            
            // Update IP metrics
            await this.updateIPMetrics(record.ipAddress, 'delivered');
            
            this.trackingData.set(trackingId, record);
            await this.saveTrackingRecord(record);
            
            // Update real-time metrics
            await this.updateRealTimeMetrics('delivered', record);
            
            logger.info(`Email delivered: ${trackingId} (${record.metrics.deliveryDuration}ms)`);
            return record;
            
        } catch (error) {
            logger.error('Error tracking email delivery:', error);
            throw error;
        }
    }

    async trackEmailBounce(trackingId, bounceData) {
        try {
            const record = this.trackingData.get(trackingId);
            if (!record) {
                throw new Error(`Tracking record not found: ${trackingId}`);
            }

            record.status = 'bounced';
            record.metrics.bounceType = bounceData.bounceType;
            record.metrics.bounceReason = bounceData.reason;
            record.metrics.bounceCode = bounceData.code;
            record.metrics.bouncedAt = new Date().toISOString();
            
            // Categorize bounce
            record.metrics.bounceCategory = this.categorizeBounce(bounceData);
            
            // Update domain metrics
            await this.updateDomainMetrics(record.domain, 'bounced', bounceData.bounceType);
            
            // Update IP metrics
            await this.updateIPMetrics(record.ipAddress, 'bounced', bounceData.bounceType);
            
            // Update reputation if hard bounce
            if (record.metrics.bounceCategory === 'hard') {
                await this.updateReputationScore(record.domain, 'bounce', -5);
            }
            
            this.trackingData.set(trackingId, record);
            await this.saveTrackingRecord(record);
            
            // Update real-time metrics
            await this.updateRealTimeMetrics('bounced', record);
            
            logger.warn(`Email bounced: ${trackingId} (${bounceData.bounceType})`);
            return record;
            
        } catch (error) {
            logger.error('Error tracking email bounce:', error);
            throw error;
        }
    }

    async trackEmailOpen(trackingId, openData = {}) {
        try {
            const record = this.trackingData.get(trackingId);
            if (!record) {
                throw new Error(`Tracking record not found: ${trackingId}`);
            }

            // Prevent duplicate opens
            if (record.metrics.openTime) {
                return record;
            }

            record.metrics.openTime = new Date().toISOString();
            record.metrics.openUserAgent = openData.userAgent;
            record.metrics.openIPAddress = openData.ipAddress;
            record.metrics.openClient = this.detectEmailClient(openData.userAgent);
            
            // Calculate open time
            const deliveryTime = new Date(record.metrics.deliveryTime || record.sentAt);
            const openTime = new Date(record.metrics.openTime);
            record.metrics.openDuration = openTime - deliveryTime;
            
            // Update domain metrics
            await this.updateDomainMetrics(record.domain, 'opened');
            
            // Update IP metrics
            await this.updateIPMetrics(record.ipAddress, 'opened');
            
            // Update reputation
            await this.updateReputationScore(record.domain, 'open', 2);
            
            this.trackingData.set(trackingId, record);
            await this.saveTrackingRecord(record);
            
            // Update real-time metrics
            await this.updateRealTimeMetrics('opened', record);
            
            logger.info(`Email opened: ${trackingId} (${record.metrics.openDuration}ms after delivery)`);
            return record;
            
        } catch (error) {
            logger.error('Error tracking email open:', error);
            throw error;
        }
    }

    async trackEmailClick(trackingId, clickData) {
        try {
            const record = this.trackingData.get(trackingId);
            if (!record) {
                throw new Error(`Tracking record not found: ${trackingId}`);
            }

            const clickRecord = {
                clickedAt: new Date().toISOString(),
                url: clickData.url,
                userAgent: clickData.userAgent,
                ipAddress: clickData.ipAddress,
                linkId: clickData.linkId
            };

            record.metrics.clickTimes.push(clickRecord);
            record.metrics.totalClicks = record.metrics.clickTimes.length;
            
            // Calculate click time
            const deliveryTime = new Date(record.metrics.deliveryTime || record.sentAt);
            const clickTime = new Date(clickRecord.clickedAt);
            clickRecord.clickDuration = clickTime - deliveryTime;
            
            // Update domain metrics
            await this.updateDomainMetrics(record.domain, 'clicked');
            
            // Update IP metrics
            await this.updateIPMetrics(record.ipAddress, 'clicked');
            
            // Update reputation
            await this.updateReputationScore(record.domain, 'click', 3);
            
            this.trackingData.set(trackingId, record);
            await this.saveTrackingRecord(record);
            
            // Update real-time metrics
            await this.updateRealTimeMetrics('clicked', record);
            
            logger.info(`Email clicked: ${trackingId} (${clickData.url})`);
            return record;
            
        } catch (error) {
            logger.error('Error tracking email click:', error);
            throw error;
        }
    }

    // Advanced Metrics and Analytics
    async getCampaignMetrics(campaignId, timeRange = '30d') {
        try {
            const campaignRecords = Array.from(this.trackingData.values())
                .filter(record => record.campaignId === campaignId);
            
            const metrics = {
                overview: {
                    totalSent: campaignRecords.length,
                    totalDelivered: campaignRecords.filter(r => r.status === 'delivered').length,
                    totalBounced: campaignRecords.filter(r => r.status === 'bounced').length,
                    totalOpened: campaignRecords.filter(r => r.metrics.openTime).length,
                    totalClicked: campaignRecords.filter(r => r.metrics.clickTimes.length > 0).length,
                    totalReplied: campaignRecords.filter(r => r.metrics.replyTime).length,
                    totalUnsubscribed: campaignRecords.filter(r => r.metrics.unsubscribeTime).length
                },
                
                rates: {
                    deliveryRate: this.calculateRate(campaignRecords, 'delivered'),
                    bounceRate: this.calculateRate(campaignRecords, 'bounced'),
                    openRate: this.calculateOpenRate(campaignRecords),
                    clickRate: this.calculateClickRate(campaignRecords),
                    clickToOpenRate: this.calculateClickToOpenRate(campaignRecords),
                    unsubscribeRate: this.calculateUnsubscribeRate(campaignRecords)
                },
                
                timing: {
                    averageDeliveryTime: this.calculateAverageDeliveryTime(campaignRecords),
                    averageOpenTime: this.calculateAverageOpenTime(campaignRecords),
                    averageClickTime: this.calculateAverageClickTime(campaignRecords)
                },
                
                quality: {
                    averageSpamScore: this.calculateAverageSpamScore(campaignRecords),
                    averageReputationScore: this.calculateAverageReputationScore(campaignRecords),
                    bounceBreakdown: this.getBounceBreakdown(campaignRecords)
                },
                
                engagement: {
                    byDomain: this.getEngagementByDomain(campaignRecords),
                    byTemplate: this.getEngagementByTemplate(campaignRecords),
                    byTimeOfDay: this.getEngagementByTimeOfDay(campaignRecords),
                    byDayOfWeek: this.getEngagementByDayOfWeek(campaignRecords)
                },
                
                deliverability: {
                    byProvider: this.getDeliverabilityByProvider(campaignRecords),
                    byIP: this.getDeliverabilityByIP(campaignRecords),
                    reputationTrends: this.getReputationTrends(campaignRecords)
                }
            };
            
            return metrics;
            
        } catch (error) {
            logger.error('Error getting campaign metrics:', error);
            throw error;
        }
    }

    async getRealTimeMetrics() {
        try {
            const now = new Date();
            const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            const recentRecords = Array.from(this.trackingData.values())
                .filter(record => new Date(record.sentAt) >= last24Hours);
            
            return {
                last24Hours: {
                    sent: recentRecords.length,
                    delivered: recentRecords.filter(r => r.status === 'delivered').length,
                    bounced: recentRecords.filter(r => r.status === 'bounced').length,
                    opened: recentRecords.filter(r => r.metrics.openTime).length,
                    clicked: recentRecords.filter(r => r.metrics.clickTimes.length > 0).length
                },
                
                currentHour: this.getCurrentHourMetrics(recentRecords),
                
                trends: {
                    delivery: this.getDeliveryTrend(recentRecords),
                    engagement: this.getEngagementTrend(recentRecords),
                    reputation: this.getReputationTrend(recentRecords)
                },
                
                alerts: this.getActiveAlerts(),
                
                topPerforming: {
                    domains: this.getTopPerformingDomains(recentRecords),
                    templates: this.getTopPerformingTemplates(recentRecords),
                    campaigns: this.getTopPerformingCampaigns(recentRecords)
                }
            };
            
        } catch (error) {
            logger.error('Error getting real-time metrics:', error);
            throw error;
        }
    }

    // Domain and IP Reputation Management
    async updateDomainMetrics(domain, action, bounceType = null) {
        try {
            if (!this.domainMetrics.has(domain)) {
                this.domainMetrics.set(domain, {
                    domain,
                    totalSent: 0,
                    totalDelivered: 0,
                    totalBounced: 0,
                    totalOpened: 0,
                    totalClicked: 0,
                    bounceBreakdown: { hard: 0, soft: 0, block: 0 },
                    reputationScore: 100,
                    lastUpdated: new Date().toISOString()
                });
            }
            
            const metrics = this.domainMetrics.get(domain);
            
            switch (action) {
                case 'sent':
                    metrics.totalSent++;
                    break;
                case 'delivered':
                    metrics.totalDelivered++;
                    break;
                case 'bounced':
                    metrics.totalBounced++;
                    if (bounceType) {
                        metrics.bounceBreakdown[bounceType] = (metrics.bounceBreakdown[bounceType] || 0) + 1;
                    }
                    break;
                case 'opened':
                    metrics.totalOpened++;
                    break;
                case 'clicked':
                    metrics.totalClicked++;
                    break;
            }
            
            // Update reputation score
            metrics.reputationScore = this.calculateDomainReputation(metrics);
            metrics.lastUpdated = new Date().toISOString();
            
            this.domainMetrics.set(domain, metrics);
            await this.saveDomainMetrics(metrics);
            
        } catch (error) {
            logger.error('Error updating domain metrics:', error);
        }
    }

    async updateIPMetrics(ipAddress, action, bounceType = null) {
        try {
            if (!this.ipMetrics.has(ipAddress)) {
                this.ipMetrics.set(ipAddress, {
                    ipAddress,
                    totalSent: 0,
                    totalDelivered: 0,
                    totalBounced: 0,
                    totalOpened: 0,
                    totalClicked: 0,
                    bounceBreakdown: { hard: 0, soft: 0, block: 0 },
                    reputationScore: 100,
                    blacklistStatus: 'clean',
                    lastUpdated: new Date().toISOString()
                });
            }
            
            const metrics = this.ipMetrics.get(ipAddress);
            
            switch (action) {
                case 'sent':
                    metrics.totalSent++;
                    break;
                case 'delivered':
                    metrics.totalDelivered++;
                    break;
                case 'bounced':
                    metrics.totalBounced++;
                    if (bounceType) {
                        metrics.bounceBreakdown[bounceType] = (metrics.bounceBreakdown[bounceType] || 0) + 1;
                    }
                    break;
                case 'opened':
                    metrics.totalOpened++;
                    break;
                case 'clicked':
                    metrics.totalClicked++;
                    break;
            }
            
            // Update reputation score
            metrics.reputationScore = this.calculateIPReputation(metrics);
            metrics.lastUpdated = new Date().toISOString();
            
            this.ipMetrics.set(ipAddress, metrics);
            await this.saveIPMetrics(metrics);
            
        } catch (error) {
            logger.error('Error updating IP metrics:', error);
        }
    }

    // Utility and Helper Methods
    generateTrackingPixel(trackingId) {
        return `<img src="http://localhost:3000/track/open/${trackingId}" width="1" height="1" border="0" style="display:block;width:1px;height:1px;border:0;" alt="">`;
    }

    generateClickTrackingUrl(trackingId) {
        return `http://localhost:3000/track/click/${trackingId}`;
    }

    generateUnsubscribeUrl(trackingId) {
        return `http://localhost:3000/unsubscribe/${trackingId}`;
    }

    detectEmailClient(userAgent) {
        if (!userAgent) return 'unknown';
        
        const clients = {
            'Gmail': /Gmail/,
            'Outlook': /Outlook|Microsoft/,
            'Apple Mail': /AppleWebKit.*Mac/,
            'Thunderbird': /Thunderbird/,
            'Yahoo Mail': /YahooMail/,
            'iPhone Mail': /iPhone.*Mobile/,
            'Android Mail': /Android.*Mobile/
        };
        
        for (const [client, regex] of Object.entries(clients)) {
            if (regex.test(userAgent)) {
                return client;
            }
        }
        
        return 'unknown';
    }

    categorizeBounce(bounceData) {
        const bounceType = bounceData.bounceType || bounceData.code;
        
        if (bounceType >= 500 && bounceType < 600) {
            return 'hard';
        } else if (bounceType >= 400 && bounceType < 500) {
            return 'soft';
        } else if (bounceData.reason && bounceData.reason.toLowerCase().includes('block')) {
            return 'block';
        }
        
        return 'unknown';
    }

    calculateRate(records, status) {
        const total = records.length;
        if (total === 0) return 0;
        
        const count = records.filter(r => r.status === status).length;
        return Math.round((count / total) * 100 * 100) / 100;
    }

    calculateOpenRate(records) {
        const delivered = records.filter(r => r.status === 'delivered').length;
        if (delivered === 0) return 0;
        
        const opened = records.filter(r => r.metrics.openTime).length;
        return Math.round((opened / delivered) * 100 * 100) / 100;
    }

    calculateClickRate(records) {
        const delivered = records.filter(r => r.status === 'delivered').length;
        if (delivered === 0) return 0;
        
        const clicked = records.filter(r => r.metrics.clickTimes.length > 0).length;
        return Math.round((clicked / delivered) * 100 * 100) / 100;
    }

    calculateClickToOpenRate(records) {
        const opened = records.filter(r => r.metrics.openTime).length;
        if (opened === 0) return 0;
        
        const clicked = records.filter(r => r.metrics.clickTimes.length > 0).length;
        return Math.round((clicked / opened) * 100 * 100) / 100;
    }

    calculateUnsubscribeRate(records) {
        const delivered = records.filter(r => r.status === 'delivered').length;
        if (delivered === 0) return 0;
        
        const unsubscribed = records.filter(r => r.metrics.unsubscribeTime).length;
        return Math.round((unsubscribed / delivered) * 100 * 100) / 100;
    }

    calculateDomainReputation(metrics) {
        let score = 100;
        
        // Deduct for bounces
        const bounceRate = metrics.totalBounced / Math.max(metrics.totalSent, 1);
        score -= bounceRate * 50;
        
        // Add for engagement
        const engagementRate = metrics.totalOpened / Math.max(metrics.totalDelivered, 1);
        score += engagementRate * 20;
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    calculateIPReputation(metrics) {
        let score = 100;
        
        // Deduct for bounces
        const bounceRate = metrics.totalBounced / Math.max(metrics.totalSent, 1);
        score -= bounceRate * 40;
        
        // Add for engagement
        const engagementRate = metrics.totalOpened / Math.max(metrics.totalDelivered, 1);
        score += engagementRate * 15;
        
        // Deduct for blacklist status
        if (metrics.blacklistStatus !== 'clean') {
            score -= 30;
        }
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    // Data Persistence
    async saveTrackingRecord(record) {
        const filePath = path.join(this.metricsPath, 'campaigns', `${record.campaignId || 'general'}_${record.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(record, null, 2));
    }

    async saveDomainMetrics(metrics) {
        const filePath = path.join(this.metricsPath, 'domains', `${metrics.domain}.json`);
        await fs.writeFile(filePath, JSON.stringify(metrics, null, 2));
    }

    async saveIPMetrics(metrics) {
        const filePath = path.join(this.metricsPath, 'ips', `${metrics.ipAddress}.json`);
        await fs.writeFile(filePath, JSON.stringify(metrics, null, 2));
    }

    async loadHistoricalMetrics() {
        try {
            // Load domain metrics
            const domainFiles = await fs.readdir(path.join(this.metricsPath, 'domains'));
            for (const file of domainFiles) {
                if (file.endsWith('.json')) {
                    const data = await fs.readFile(path.join(this.metricsPath, 'domains', file), 'utf8');
                    const metrics = JSON.parse(data);
                    this.domainMetrics.set(metrics.domain, metrics);
                }
            }
            
            // Load IP metrics
            const ipFiles = await fs.readdir(path.join(this.metricsPath, 'ips'));
            for (const file of ipFiles) {
                if (file.endsWith('.json')) {
                    const data = await fs.readFile(path.join(this.metricsPath, 'ips', file), 'utf8');
                    const metrics = JSON.parse(data);
                    this.ipMetrics.set(metrics.ipAddress, metrics);
                }
            }
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading historical metrics:', error);
            }
        }
    }

    async initializeRealTimeTracking() {
        // Initialize real-time tracking intervals
        setInterval(() => {
            this.processRealTimeUpdates();
        }, 30000); // Process every 30 seconds
    }

    async processRealTimeUpdates() {
        // Process real-time metric updates
        logger.debug('Processing real-time metric updates');
    }

    async updateRealTimeMetrics(action, record) {
        const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
        
        if (!this.realTimeMetrics.has(hourKey)) {
            this.realTimeMetrics.set(hourKey, {
                hour: hourKey,
                sent: 0,
                delivered: 0,
                bounced: 0,
                opened: 0,
                clicked: 0,
                updatedAt: new Date().toISOString()
            });
        }
        
        const metrics = this.realTimeMetrics.get(hourKey);
        
        switch (action) {
            case 'sent':
                metrics.sent++;
                break;
            case 'delivered':
                metrics.delivered++;
                break;
            case 'bounced':
                metrics.bounced++;
                break;
            case 'opened':
                metrics.opened++;
                break;
            case 'clicked':
                metrics.clicked++;
                break;
        }
        
        metrics.updatedAt = new Date().toISOString();
        this.realTimeMetrics.set(hourKey, metrics);
    }

    // Additional analytics methods
    getEngagementByDomain(records) {
        const byDomain = {};
        
        records.forEach(record => {
            const domain = record.recipient.split('@')[1];
            if (!byDomain[domain]) {
                byDomain[domain] = {
                    domain,
                    total: 0,
                    opened: 0,
                    clicked: 0,
                    bounced: 0
                };
            }
            
            byDomain[domain].total++;
            if (record.metrics.openTime) byDomain[domain].opened++;
            if (record.metrics.clickTimes.length > 0) byDomain[domain].clicked++;
            if (record.status === 'bounced') byDomain[domain].bounced++;
        });
        
        return Object.values(byDomain).map(domain => ({
            ...domain,
            openRate: Math.round((domain.opened / domain.total) * 100),
            clickRate: Math.round((domain.clicked / domain.total) * 100),
            bounceRate: Math.round((domain.bounced / domain.total) * 100)
        }));
    }

    getEngagementByTimeOfDay(records) {
        const byHour = Array(24).fill(0).map((_, hour) => ({
            hour,
            sent: 0,
            opened: 0,
            clicked: 0
        }));
        
        records.forEach(record => {
            const hour = new Date(record.sentAt).getHours();
            byHour[hour].sent++;
            if (record.metrics.openTime) byHour[hour].opened++;
            if (record.metrics.clickTimes.length > 0) byHour[hour].clicked++;
        });
        
        return byHour;
    }

    getCurrentHourMetrics(records) {
        const currentHour = new Date().getHours();
        const currentHourRecords = records.filter(record => 
            new Date(record.sentAt).getHours() === currentHour
        );
        
        return {
            hour: currentHour,
            sent: currentHourRecords.length,
            delivered: currentHourRecords.filter(r => r.status === 'delivered').length,
            opened: currentHourRecords.filter(r => r.metrics.openTime).length,
            clicked: currentHourRecords.filter(r => r.metrics.clickTimes.length > 0).length
        };
    }

    getActiveAlerts() {
        // Return active alerts based on metrics
        return [];
    }
}

module.exports = DeliverabilityTracker;