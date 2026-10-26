/**
 * Professional Dashboard with Analytics and Reporting
 * Real-time monitoring and comprehensive reporting system
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('./logger');

class DashboardManager extends EventEmitter {
    constructor(warmingSystem) {
        super();
        this.warmingSystem = warmingSystem;
        this.analyticsDataPath = path.join(__dirname, '..', 'data', 'analytics');
        this.reportsPath = path.join(__dirname, '..', 'data', 'reports');
        this.realTimeMetrics = new Map();
        this.dashboardCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        
        this.initializeDashboard();
    }

    async initializeDashboard() {
        try {
            await this.createDataDirectories();
            this.startRealTimeMonitoring();
            this.scheduleReportGeneration();
            
            logger.info('Professional Dashboard initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Dashboard:', error);
            throw error;
        }
    }

    async createDataDirectories() {
        const directories = [
            this.analyticsDataPath,
            this.reportsPath
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

    // Real-time Monitoring
    startRealTimeMonitoring() {
        // Monitor every 30 seconds
        setInterval(() => {
            this.updateRealTimeMetrics();
        }, 30000);

        // Initial update
        this.updateRealTimeMetrics();
    }

    updateRealTimeMetrics() {
        try {
            const systemStats = this.warmingSystem.getSystemStats();
            const campaigns = Array.from(this.warmingSystem.activeCampaigns.values());
            const profiles = Array.from(this.warmingSystem.warmingProfiles.values());

            const metrics = {
                timestamp: new Date().toISOString(),
                systemHealth: this.calculateSystemHealth(profiles, campaigns),
                performance: this.calculatePerformanceMetrics(campaigns),
                reputation: this.calculateReputationMetrics(profiles),
                deliverability: this.calculateDeliverabilityMetrics(campaigns),
                alerts: this.generateAlerts(profiles, campaigns)
            };

            this.realTimeMetrics.set('current', metrics);
            this.emit('metricsUpdated', metrics);
            
            // Store historical data
            this.storeHistoricalMetrics(metrics);
            
        } catch (error) {
            logger.error('Error updating real-time metrics:', error);
        }
    }

    calculateSystemHealth(profiles, campaigns) {
        const activeProfiles = profiles.filter(p => p.status === 'active').length;
        const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
        const avgReputation = profiles.length > 0 ? 
            profiles.reduce((sum, p) => sum + p.reputation.score, 0) / profiles.length : 0;

        return {
            status: avgReputation > 70 ? 'healthy' : avgReputation > 50 ? 'warning' : 'critical',
            activeProfiles,
            activeCampaigns,
            averageReputation: Math.round(avgReputation),
            uptime: process.uptime(),
            lastUpdated: new Date().toISOString()
        };
    }

    calculatePerformanceMetrics(campaigns) {
        const totalSent = campaigns.reduce((sum, c) => sum + c.progress.totalSent, 0);
        const totalDelivered = campaigns.reduce((sum, c) => sum + c.progress.totalDelivered, 0);
        const totalOpened = campaigns.reduce((sum, c) => sum + c.progress.totalOpened, 0);
        const totalClicked = campaigns.reduce((sum, c) => sum + c.progress.totalClicked, 0);

        return {
            totalSent,
            totalDelivered,
            totalOpened,
            totalClicked,
            deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
            openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
            clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
            averageSendTime: this.calculateAverageSendTime(campaigns)
        };
    }

    calculateReputationMetrics(profiles) {
        const reputationDistribution = {
            excellent: 0,
            good: 0,
            fair: 0,
            poor: 0,
            bad: 0
        };

        const domainReputation = {};

        profiles.forEach(profile => {
            reputationDistribution[profile.reputation.trustLevel]++;
            
            // Track reputation by domain
            if (profile.smtpConfig && profile.smtpConfig.host) {
                const domain = profile.smtpConfig.host;
                if (!domainReputation[domain]) {
                    domainReputation[domain] = { count: 0, totalScore: 0 };
                }
                domainReputation[domain].count++;
                domainReputation[domain].totalScore += profile.reputation.score;
            }
        });

        // Calculate average reputation per domain
        Object.keys(domainReputation).forEach(domain => {
            const data = domainReputation[domain];
            domainReputation[domain].averageScore = data.totalScore / data.count;
        });

        return {
            reputationDistribution,
            domainReputation,
            totalProfiles: profiles.length,
            averageScore: profiles.length > 0 ? 
                profiles.reduce((sum, p) => sum + p.reputation.score, 0) / profiles.length : 0
        };
    }

    calculateDeliverabilityMetrics(campaigns) {
        const domainStats = {};
        const bounceReasons = {};
        const spamReasons = {};

        campaigns.forEach(campaign => {
            // This would be enhanced with actual email tracking data
            if (campaign.targetEmails) {
                campaign.targetEmails.forEach(email => {
                    const domain = email.split('@')[1];
                    if (!domainStats[domain]) {
                        domainStats[domain] = { sent: 0, delivered: 0, bounced: 0, spam: 0 };
                    }
                    domainStats[domain].sent++;
                });
            }
        });

        return {
            domainStats,
            bounceRate: this.calculateOverallBounceRate(campaigns),
            spamRate: this.calculateOverallSpamRate(campaigns),
            deliverabilityScore: this.calculateDeliverabilityScore(campaigns),
            topPerformingDomains: this.getTopPerformingDomains(domainStats),
            problematicDomains: this.getProblematicDomains(domainStats)
        };
    }

    // Analytics Dashboard
    async getDashboardData(userId = null, timeRange = '24h') {
        const cacheKey = `${userId || 'global'}_${timeRange}`;
        const cachedData = this.dashboardCache.get(cacheKey);
        
        if (cachedData && Date.now() - cachedData.timestamp < this.cacheTimeout) {
            return cachedData.data;
        }

        try {
            const data = await this.generateDashboardData(userId, timeRange);
            this.dashboardCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            logger.error('Error generating dashboard data:', error);
            throw error;
        }
    }

    async generateDashboardData(userId, timeRange) {
        const profiles = Array.from(this.warmingSystem.warmingProfiles.values());
        const campaigns = Array.from(this.warmingSystem.activeCampaigns.values());
        const historicalData = await this.getHistoricalData(timeRange);

        return {
            overview: {
                totalProfiles: profiles.length,
                activeCampaigns: campaigns.filter(c => c.status === 'active').length,
                totalSent: campaigns.reduce((sum, c) => sum + c.progress.totalSent, 0),
                averageReputation: profiles.length > 0 ? 
                    Math.round(profiles.reduce((sum, p) => sum + p.reputation.score, 0) / profiles.length) : 0
            },
            charts: {
                reputationTrend: this.generateReputationTrend(historicalData),
                volumeTrend: this.generateVolumeTrend(historicalData),
                deliverabilityTrend: this.generateDeliverabilityTrend(historicalData),
                domainPerformance: this.generateDomainPerformanceChart(campaigns)
            },
            metrics: this.realTimeMetrics.get('current') || await this.getCurrentMetrics(),
            recentActivity: await this.getRecentActivity(timeRange),
            topPerformers: this.getTopPerformers(profiles, campaigns),
            alerts: this.generateAlerts(profiles, campaigns),
            recommendations: this.generateSmartRecommendations(profiles, campaigns)
        };
    }

    // Report Generation
    async generateReport(reportType, options = {}) {
        const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            let reportData;
            
            switch (reportType) {
                case 'performance':
                    reportData = await this.generatePerformanceReport(options);
                    break;
                case 'reputation':
                    reportData = await this.generateReputationReport(options);
                    break;
                case 'deliverability':
                    reportData = await this.generateDeliverabilityReport(options);
                    break;
                case 'warming':
                    reportData = await this.generateWarmingReport(options);
                    break;
                default:
                    throw new Error(`Unknown report type: ${reportType}`);
            }

            const report = {
                id: reportId,
                type: reportType,
                title: this.getReportTitle(reportType),
                generatedAt: new Date().toISOString(),
                period: options.period || '30d',
                data: reportData,
                summary: this.generateReportSummary(reportData),
                recommendations: this.generateReportRecommendations(reportData, reportType)
            };

            await this.saveReport(report);
            return report;
            
        } catch (error) {
            logger.error(`Error generating ${reportType} report:`, error);
            throw error;
        }
    }

    async generatePerformanceReport(options) {
        const campaigns = Array.from(this.warmingSystem.activeCampaigns.values());
        const period = options.period || '30d';
        const startDate = this.getPeriodStartDate(period);

        const filteredCampaigns = campaigns.filter(c => 
            new Date(c.createdAt) >= startDate
        );

        return {
            overview: {
                totalCampaigns: filteredCampaigns.length,
                totalSent: filteredCampaigns.reduce((sum, c) => sum + c.progress.totalSent, 0),
                totalDelivered: filteredCampaigns.reduce((sum, c) => sum + c.progress.totalDelivered, 0),
                averageDeliveryRate: this.calculateAverageDeliveryRate(filteredCampaigns),
                averageOpenRate: this.calculateAverageOpenRate(filteredCampaigns),
                averageClickRate: this.calculateAverageClickRate(filteredCampaigns)
            },
            campaignBreakdown: filteredCampaigns.map(campaign => ({
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                sent: campaign.progress.totalSent,
                delivered: campaign.progress.totalDelivered,
                opened: campaign.progress.totalOpened,
                clicked: campaign.progress.totalClicked,
                deliveryRate: this.calculateCampaignDeliveryRate(campaign),
                openRate: this.calculateCampaignOpenRate(campaign),
                clickRate: this.calculateCampaignClickRate(campaign),
                performanceScore: this.calculateCampaignPerformanceScore(campaign)
            })),
            trends: this.generatePerformanceTrends(filteredCampaigns, period)
        };
    }

    async generateReputationReport(options) {
        const profiles = Array.from(this.warmingSystem.warmingProfiles.values());
        const period = options.period || '30d';

        return {
            overview: {
                totalProfiles: profiles.length,
                averageReputation: profiles.length > 0 ? 
                    profiles.reduce((sum, p) => sum + p.reputation.score, 0) / profiles.length : 0,
                reputationDistribution: this.getReputationDistribution(profiles),
                trustLevelDistribution: this.getTrustLevelDistribution(profiles)
            },
            profileDetails: profiles.map(profile => ({
                id: profile.id,
                name: profile.name,
                email: profile.email,
                reputationScore: profile.reputation.score,
                trustLevel: profile.reputation.trustLevel,
                lastUpdated: profile.reputation.lastUpdated,
                metrics: profile.reputation.metrics,
                trend: this.calculateReputationTrend(profile, period)
            })),
            recommendations: this.generateReputationRecommendations(profiles)
        };
    }

    // Alert System
    generateAlerts(profiles, campaigns) {
        const alerts = [];

        // Reputation alerts
        profiles.forEach(profile => {
            if (profile.reputation.score < 50) {
                alerts.push({
                    type: 'warning',
                    category: 'reputation',
                    message: `Low reputation score for ${profile.name}: ${profile.reputation.score}`,
                    profileId: profile.id,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Campaign alerts
        campaigns.forEach(campaign => {
            if (campaign.status === 'active') {
                const deliveryRate = campaign.progress.totalSent > 0 ? 
                    campaign.progress.totalDelivered / campaign.progress.totalSent : 0;
                
                if (deliveryRate < 0.7) {
                    alerts.push({
                        type: 'error',
                        category: 'deliverability',
                        message: `Low delivery rate for campaign ${campaign.name}: ${(deliveryRate * 100).toFixed(1)}%`,
                        campaignId: campaign.id,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        return alerts;
    }

    // Utility Methods
    async saveReport(report) {
        const filePath = path.join(this.reportsPath, `${report.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    }

    getPeriodStartDate(period) {
        const now = new Date();
        switch (period) {
            case '7d':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d':
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            case '90d':
                return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
    }

    calculateAverageDeliveryRate(campaigns) {
        if (campaigns.length === 0) return 0;
        const totalRate = campaigns.reduce((sum, c) => {
            const rate = c.progress.totalSent > 0 ? 
                c.progress.totalDelivered / c.progress.totalSent : 0;
            return sum + rate;
        }, 0);
        return (totalRate / campaigns.length) * 100;
    }

    // Add more utility methods as needed...
}

module.exports = DashboardManager;