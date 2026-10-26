/**
 * Advanced Email Warming System
 * Professional email reputation management and warming campaigns
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class EmailWarmingSystem {
    constructor() {
        this.warmingDataPath = path.join(__dirname, '..', 'data', 'warming');
        this.reputationDataPath = path.join(__dirname, '..', 'data', 'reputation');
        this.campaignsPath = path.join(__dirname, '..', 'data', 'campaigns');
        this.warmingProfiles = new Map();
        this.reputationScores = new Map();
        this.activeCampaigns = new Map();
        
        this.initializeSystem();
    }

    async initializeSystem() {
        try {
            // Create data directories
            await this.createDataDirectories();
            
            // Load existing data
            await this.loadWarmingProfiles();
            await this.loadReputationScores();
            await this.loadActiveCampaigns();
            
            logger.info('Email Warming System initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Email Warming System:', error);
            throw error;
        }
    }

    async createDataDirectories() {
        const directories = [
            this.warmingDataPath,
            this.reputationDataPath,
            this.campaignsPath
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

    // Warming Profile Management
    async createWarmingProfile(profileData) {
        const profile = {
            id: uuidv4(),
            name: profileData.name,
            email: profileData.email,
            smtpConfig: profileData.smtpConfig,
            warmingSettings: {
                startVolume: profileData.startVolume || 10,
                targetVolume: profileData.targetVolume || 100,
                rampUpDays: profileData.rampUpDays || 30,
                dailyIncrease: profileData.dailyIncrease || 5,
                targetDomains: profileData.targetDomains || ['gmail.com', 'yahoo.com', 'outlook.com'],
                engagementRate: profileData.engagementRate || 0.15,
                bounceRate: profileData.bounceRate || 0.02,
                spamRate: profileData.spamRate || 0.01
            },
            reputation: {
                score: 0,
                trustLevel: 'new',
                lastUpdated: new Date().toISOString(),
                metrics: {
                    totalSent: 0,
                    totalDelivered: 0,
                    totalBounced: 0,
                    totalSpam: 0,
                    totalOpened: 0,
                    totalClicked: 0,
                    totalReplied: 0
                }
            },
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.warmingProfiles.set(profile.id, profile);
        await this.saveWarmingProfile(profile);
        
        logger.info(`Warming profile created: ${profile.name} (${profile.email})`);
        return profile;
    }

    async updateWarmingProfile(profileId, updates) {
        const profile = this.warmingProfiles.get(profileId);
        if (!profile) {
            throw new Error(`Warming profile not found: ${profileId}`);
        }

        Object.assign(profile, updates, {
            updatedAt: new Date().toISOString()
        });

        this.warmingProfiles.set(profileId, profile);
        await this.saveWarmingProfile(profile);
        
        logger.info(`Warming profile updated: ${profile.name}`);
        return profile;
    }

    async getWarmingProfile(profileId) {
        return this.warmingProfiles.get(profileId);
    }

    async getAllWarmingProfiles() {
        return Array.from(this.warmingProfiles.values());
    }

    // Reputation Management
    calculateReputationScore(profile) {
        const metrics = profile.reputation.metrics;
        const totalSent = metrics.totalSent || 1;
        
        // Calculate rates
        const deliveryRate = metrics.totalDelivered / totalSent;
        const bounceRate = metrics.totalBounced / totalSent;
        const spamRate = metrics.totalSpam / totalSent;
        const openRate = metrics.totalOpened / Math.max(metrics.totalDelivered, 1);
        const clickRate = metrics.totalClicked / Math.max(metrics.totalDelivered, 1);
        const replyRate = metrics.totalReplied / Math.max(metrics.totalDelivered, 1);

        // Calculate score (0-100)
        let score = 50; // Base score

        // Delivery factors
        score += deliveryRate * 30;
        score -= bounceRate * 40;
        score -= spamRate * 50;

        // Engagement factors
        score += openRate * 20;
        score += clickRate * 15;
        score += replyRate * 25;

        // Volume factors
        if (totalSent > 100) score += 10;
        if (totalSent > 500) score += 10;
        if (totalSent > 1000) score += 10;

        // Age factors
        const accountAge = Date.now() - new Date(profile.createdAt).getTime();
        const daysOld = accountAge / (1000 * 60 * 60 * 24);
        if (daysOld > 30) score += 5;
        if (daysOld > 90) score += 5;

        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));

        return Math.round(score);
    }

    determineTrustLevel(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 70) return 'fair';
        if (score >= 60) return 'poor';
        return 'bad';
    }

    async updateReputationMetrics(profileId, metrics) {
        const profile = this.warmingProfiles.get(profileId);
        if (!profile) {
            throw new Error(`Warming profile not found: ${profileId}`);
        }

        // Update metrics
        Object.keys(metrics).forEach(key => {
            if (profile.reputation.metrics.hasOwnProperty(key)) {
                profile.reputation.metrics[key] += metrics[key];
            }
        });

        // Recalculate reputation
        profile.reputation.score = this.calculateReputationScore(profile);
        profile.reputation.trustLevel = this.determineTrustLevel(profile.reputation.score);
        profile.reputation.lastUpdated = new Date().toISOString();

        this.warmingProfiles.set(profileId, profile);
        await this.saveWarmingProfile(profile);
        
        logger.info(`Reputation updated for ${profile.name}: Score ${profile.reputation.score}, Trust Level ${profile.reputation.trustLevel}`);
        return profile.reputation;
    }

    // Campaign Management
    async createWarmingCampaign(campaignData) {
        const campaign = {
            id: uuidv4(),
            name: campaignData.name,
            description: campaignData.description,
            profileId: campaignData.profileId,
            targetEmails: campaignData.targetEmails,
            templateId: campaignData.templateId,
            settings: {
                startDate: campaignData.startDate || new Date().toISOString(),
                endDate: campaignData.endDate,
                dailyLimit: campaignData.dailyLimit || 50,
                sendDelay: campaignData.sendDelay || 5000,
                randomizeDelay: campaignData.randomizeDelay !== false,
                trackOpens: campaignData.trackOpens !== false,
                trackClicks: campaignData.trackClicks !== false,
                followUpDays: campaignData.followUpDays || 3
            },
            status: 'scheduled',
            progress: {
                totalSent: 0,
                totalDelivered: 0,
                totalFailed: 0,
                totalOpened: 0,
                totalClicked: 0,
                currentDay: 1,
                isActive: false
            },
            schedule: this.generateCampaignSchedule(campaignData),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.activeCampaigns.set(campaign.id, campaign);
        await this.saveCampaign(campaign);
        
        logger.info(`Warming campaign created: ${campaign.name}`);
        return campaign;
    }

    generateCampaignSchedule(campaignData) {
        const schedule = [];
        const startDate = new Date(campaignData.startDate || Date.now());
        const days = campaignData.durationDays || 30;
        const dailyVolume = campaignData.dailyLimit || 50;

        for (let day = 0; day < days; day++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + day);
            
            // Progressive volume increase for warming
            const volume = Math.min(
                Math.floor(dailyVolume * (day + 1) / days),
                dailyVolume
            );

            schedule.push({
                day: day + 1,
                date: currentDate.toISOString(),
                volume: volume,
                sent: 0,
                delivered: 0,
                failed: 0,
                status: 'pending'
            });
        }

        return schedule;
    }

    async startCampaign(campaignId) {
        const campaign = this.activeCampaigns.get(campaignId);
        if (!campaign) {
            throw new Error(`Campaign not found: ${campaignId}`);
        }

        if (campaign.status !== 'scheduled') {
            throw new Error(`Campaign cannot be started from status: ${campaign.status}`);
        }

        campaign.status = 'active';
        campaign.progress.isActive = true;
        campaign.updatedAt = new Date().toISOString();

        await this.saveCampaign(campaign);
        
        logger.info(`Campaign started: ${campaign.name}`);
        return campaign;
    }

    async pauseCampaign(campaignId) {
        const campaign = this.activeCampaigns.get(campaignId);
        if (!campaign) {
            throw new Error(`Campaign not found: ${campaignId}`);
        }

        campaign.status = 'paused';
        campaign.progress.isActive = false;
        campaign.updatedAt = new Date().toISOString();

        await this.saveCampaign(campaign);
        
        logger.info(`Campaign paused: ${campaign.name}`);
        return campaign;
    }

    async stopCampaign(campaignId) {
        const campaign = this.activeCampaigns.get(campaignId);
        if (!campaign) {
            throw new Error(`Campaign not found: ${campaignId}`);
        }

        campaign.status = 'stopped';
        campaign.progress.isActive = false;
        campaign.updatedAt = new Date().toISOString();

        await this.saveCampaign(campaign);
        
        logger.info(`Campaign stopped: ${campaign.name}`);
        return campaign;
    }

    // Analytics and Reporting
    getCampaignAnalytics(campaignId) {
        const campaign = this.activeCampaigns.get(campaignId);
        if (!campaign) {
            throw new Error(`Campaign not found: ${campaignId}`);
        }

        const progress = campaign.progress;
        const totalTarget = campaign.targetEmails.length;

        return {
            overview: {
                totalSent: progress.totalSent,
                totalDelivered: progress.totalDelivered,
                totalFailed: progress.totalFailed,
                totalOpened: progress.totalOpened,
                totalClicked: progress.totalClicked,
                deliveryRate: progress.totalSent > 0 ? (progress.totalDelivered / progress.totalSent) * 100 : 0,
                openRate: progress.totalDelivered > 0 ? (progress.totalOpened / progress.totalDelivered) * 100 : 0,
                clickRate: progress.totalDelivered > 0 ? (progress.totalClicked / progress.totalDelivered) * 100 : 0
            },
            dailyProgress: campaign.schedule.map(day => ({
                day: day.day,
                date: day.date,
                target: day.volume,
                sent: day.sent,
                delivered: day.delivered,
                failed: day.failed,
                completion: day.volume > 0 ? (day.sent / day.volume) * 100 : 0
            })),
            reputationImpact: this.calculateReputationImpact(campaign),
            recommendations: this.generateRecommendations(campaign)
        };
    }

    calculateReputationImpact(campaign) {
        // Analyze how the campaign affects sender reputation
        const profile = this.warmingProfiles.get(campaign.profileId);
        if (!profile) return null;

        const beforeScore = profile.reputation.score;
        const afterScore = this.calculateReputationScore(profile);

        return {
            beforeScore,
            afterScore,
            impact: afterScore - beforeScore,
            trustLevelChange: profile.reputation.trustLevel
        };
    }

    generateRecommendations(campaign) {
        const recommendations = [];
        const analytics = campaign.progress;

        // Delivery rate recommendations
        const deliveryRate = analytics.totalSent > 0 ? analytics.totalDelivered / analytics.totalSent : 0;
        if (deliveryRate < 0.8) {
            recommendations.push({
                type: 'warning',
                priority: 'high',
                message: 'Low delivery rate detected. Consider reducing sending volume or checking email list quality.'
            });
        }

        // Open rate recommendations
        const openRate = analytics.totalDelivered > 0 ? analytics.totalOpened / analytics.totalDelivered : 0;
        if (openRate < 0.15) {
            recommendations.push({
                type: 'info',
                priority: 'medium',
                message: 'Low open rate. Consider improving subject lines and email content.'
            });
        }

        // Volume recommendations
        if (analytics.totalSent < campaign.targetEmails.length * 0.5) {
            recommendations.push({
                type: 'info',
                priority: 'low',
                message: 'Consider increasing daily sending volume to reach more recipients.'
            });
        }

        return recommendations;
    }

    // Data Persistence
    async saveWarmingProfile(profile) {
        const filePath = path.join(this.warmingDataPath, `${profile.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    }

    async loadWarmingProfiles() {
        try {
            const files = await fs.readdir(this.warmingDataPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.warmingDataPath, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const profile = JSON.parse(data);
                    this.warmingProfiles.set(profile.id, profile);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading warming profiles:', error);
            }
        }
    }

    async saveCampaign(campaign) {
        const filePath = path.join(this.campaignsPath, `${campaign.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(campaign, null, 2));
    }

    async loadActiveCampaigns() {
        try {
            const files = await fs.readdir(this.campaignsPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.campaignsPath, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const campaign = JSON.parse(data);
                    this.activeCampaigns.set(campaign.id, campaign);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading campaigns:', error);
            }
        }
    }

    // Utility Methods
    getSystemStats() {
        const profiles = Array.from(this.warmingProfiles.values());
        const campaigns = Array.from(this.activeCampaigns.values());

        return {
            profiles: {
                total: profiles.length,
                active: profiles.filter(p => p.status === 'active').length,
                paused: profiles.filter(p => p.status === 'paused').length,
                averageReputation: profiles.length > 0 ? 
                    profiles.reduce((sum, p) => sum + p.reputation.score, 0) / profiles.length : 0
            },
            campaigns: {
                total: campaigns.length,
                active: campaigns.filter(c => c.status === 'active').length,
                completed: campaigns.filter(c => c.status === 'completed').length,
                totalSent: campaigns.reduce((sum, c) => sum + c.progress.totalSent, 0),
                totalDelivered: campaigns.reduce((sum, c) => sum + c.progress.totalDelivered, 0)
            }
        };
    }
}

module.exports = EmailWarmingSystem;