/**
 * Smart Email Scheduling with AI-Powered Timing
 * Intelligent scheduling system that optimizes send times based on recipient behavior
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class SmartScheduler {
    constructor() {
        this.schedulingDataPath = path.join(__dirname, '..', 'data', 'scheduling');
        this.behavioralData = new Map();
        this.optimizationModels = new Map();
        this.scheduledEmails = new Map();
        this.timezoneData = new Map();
        
        this.initializeScheduler();
    }

    async initializeScheduler() {
        try {
            await this.createDataDirectories();
            await this.loadBehavioralData();
            await this.loadOptimizationModels();
            
            this.startSchedulingEngine();
            
            logger.info('Smart Email Scheduler initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Smart Scheduler:', error);
            throw error;
        }
    }

    async createDataDirectories() {
        const directories = [
            this.schedulingDataPath,
            path.join(this.schedulingDataPath, 'behavioral'),
            path.join(this.schedulingDataPath, 'models'),
            path.join(this.schedulingDataPath, 'scheduled')
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

    // AI-Powered Time Optimization
    async optimizeSendTime(emailData) {
        try {
            const recipient = emailData.recipient;
            const behavioralProfile = await this.getBehavioralProfile(recipient);
            const contextFactors = await this.analyzeContextFactors(emailData);
            const historicalData = await this.getHistoricalEngagementData(recipient);
            
            // Use machine learning model to predict optimal send time
            const optimalTime = await this.predictOptimalTime({
                recipient,
                behavioralProfile,
                contextFactors,
                historicalData,
                emailType: emailData.type || 'general',
                urgency: emailData.urgency || 'normal',
                industry: emailData.industry || 'general'
            });

            return {
                optimalTime: optimalTime.timestamp,
                confidence: optimalTime.confidence,
                factors: optimalTime.factors,
                alternatives: optimalTime.alternatives,
                reasoning: optimalTime.reasoning
            };
        } catch (error) {
            logger.error('Error optimizing send time:', error);
            // Fallback to default scheduling
            return this.getDefaultSendTime(emailData);
        }
    }

    async predictOptimalTime(data) {
        const { recipient, behavioralProfile, contextFactors, historicalData } = data;
        
        // Analyze recipient behavior patterns
        const behaviorAnalysis = this.analyzeBehaviorPatterns(behavioralProfile);
        
        // Consider timezone and working hours
        const timezoneOptimized = this.applyTimezoneOptimization(recipient, behaviorAnalysis);
        
        // Apply industry-specific timing rules
        const industryOptimized = this.applyIndustryTiming(data.industry, timezoneOptimized);
        
        // Consider email urgency and type
        const urgencyAdjusted = this.adjustForUrgency(industryOptimized, data.urgency, data.emailType);
        
        // Apply machine learning predictions
        const mlPrediction = await this.applyMLPrediction({
            recipient,
            historicalData,
            proposedTime: urgencyAdjusted,
            contextFactors
        });

        return {
            timestamp: mlPrediction.optimalTime,
            confidence: mlPrediction.confidence,
            factors: {
                behavior: behaviorAnalysis.score,
                timezone: timezoneOptimized.score,
                industry: industryOptimized.score,
                urgency: urgencyAdjusted.score,
                ml: mlPrediction.confidence
            },
            alternatives: mlPrediction.alternatives,
            reasoning: mlPrediction.reasoning
        };
    }

    analyzeBehaviorPatterns(behavioralProfile) {
        if (!behavioralProfile || !behavioralProfile.engagementHistory) {
            return { score: 0.5, patterns: [], optimalHours: [9, 10, 14, 15] };
        }

        const history = behavioralProfile.engagementHistory;
        const patterns = {
            openTimes: {},
            clickTimes: {},
            replyTimes: {},
            dayOfWeek: {},
            devicePreference: {},
            locationPreference: {}
        };

        // Analyze engagement patterns
        history.forEach(record => {
            const hour = new Date(record.timestamp).getHours();
            const day = new Date(record.timestamp).getDay();
            
            if (record.type === 'open') {
                patterns.openTimes[hour] = (patterns.openTimes[hour] || 0) + 1;
                patterns.dayOfWeek[day] = (patterns.dayOfWeek[day] || 0) + 1;
            }
            
            if (record.type === 'click') {
                patterns.clickTimes[hour] = (patterns.clickTimes[hour] || 0) + 1;
            }
            
            if (record.type === 'reply') {
                patterns.replyTimes[hour] = (patterns.replyTimes[hour] || 0) + 1;
            }
        });

        // Find optimal hours
        const optimalHours = this.findOptimalHours(patterns.openTimes);
        const optimalDays = this.findOptimalDays(patterns.dayOfWeek);
        
        // Calculate pattern strength score
        const patternScore = this.calculatePatternStrength(patterns);

        return {
            score: patternScore,
            patterns,
            optimalHours,
            optimalDays,
            devicePreference: this.analyzeDevicePreference(history),
            locationPreference: this.analyzeLocationPreference(history)
        };
    }

    findOptimalHours(hourData) {
        const hours = Object.keys(hourData).map(h => parseInt(h));
        const sortedHours = hours.sort((a, b) => hourData[b] - hourData[a]);
        return sortedHours.slice(0, 4); // Top 4 hours
    }

    findOptimalDays(dayData) {
        const days = Object.keys(dayData).map(d => parseInt(d));
        const sortedDays = days.sort((a, b) => dayData[b] - dayData[a]);
        return sortedDays.slice(0, 3); // Top 3 days
    }

    calculatePatternStrength(patterns) {
        let totalEngagements = 0;
        let concentratedEngagements = 0;

        // Calculate concentration of engagements
        Object.values(patterns.openTimes).forEach(count => {
            totalEngagements += count;
            if (count > 2) concentratedEngagements += count;
        });

        return totalEngagements > 0 ? concentratedEngagements / totalEngagements : 0.5;
    }

    applyTimezoneOptimization(recipient, behaviorAnalysis) {
        const timezone = this.getRecipientTimezone(recipient);
        const localTime = this.convertToLocalTime(new Date(), timezone);
        
        // Adjust optimal hours based on timezone
        const timezoneAdjustedHours = behaviorAnalysis.optimalHours.map(hour => {
            return (hour + timezone.offset) % 24;
        });

        return {
            score: 0.8,
            timezone: timezone.name,
            localTime: localTime,
            optimalHours: timezoneAdjustedHours,
            workingHours: this.getWorkingHoursForTimezone(timezone)
        };
    }

    applyIndustryTiming(industry, timezoneData) {
        const industryPatterns = {
            'technology': { optimalHours: [8, 9, 10, 14, 15, 16], avoidDays: [6, 0] },
            'finance': { optimalHours: [9, 10, 11, 14, 15, 16], avoidDays: [6, 0] },
            'healthcare': { optimalHours: [8, 9, 13, 14, 15], avoidDays: [0] },
            'education': { optimalHours: [9, 10, 14, 15, 16], avoidDays: [6, 0] },
            'retail': { optimalHours: [10, 11, 14, 15, 19, 20], avoidDays: [] },
            'general': { optimalHours: [9, 10, 14, 15], avoidDays: [6, 0] }
        };

        const pattern = industryPatterns[industry] || industryPatterns['general'];
        
        // Filter optimal hours based on industry patterns
        const industryOptimizedHours = timezoneData.optimalHours.filter(hour => 
            pattern.optimalHours.includes(hour)
        );

        return {
            score: industryOptimizedHours.length > 0 ? 0.85 : 0.6,
            industry,
            optimalHours: industryOptimizedHours.length > 0 ? industryOptimizedHours : pattern.optimalHours,
            avoidDays: pattern.avoidDays
        };
    }

    adjustForUrgency(industryData, urgency, emailType) {
        const urgencyMultipliers = {
            'critical': 1.0,
            'high': 0.9,
            'normal': 0.8,
            'low': 0.7
        };

        const typeAdjustments = {
            'newsletter': { hourShift: 0, dayShift: 0 },
            'promotional': { hourShift: 2, dayShift: 0 },
            'transactional': { hourShift: -1, dayShift: 0 },
            'follow-up': { hourShift: 1, dayShift: 1 }
        };

        const multiplier = urgencyMultipliers[urgency] || 0.8;
        const adjustment = typeAdjustments[emailType] || { hourShift: 0, dayShift: 0 };

        const adjustedHours = industryData.optimalHours.map(hour => 
            (hour + adjustment.hourShift + 24) % 24
        );

        return {
            score: industryData.score * multiplier,
            urgency,
            emailType,
            optimalHours: adjustedHours,
            hourShift: adjustment.hourShift,
            dayShift: adjustment.dayShift
        };
    }

    async applyMLPrediction(data) {
        // This would integrate with a real ML model
        // For now, using heuristic-based prediction
        const { proposedTime, historicalData } = data;
        
        let confidence = 0.7;
        let optimalTime = new Date();
        
        if (historicalData && historicalData.length > 0) {
            // Analyze historical success patterns
            const successfulSends = historicalData.filter(h => h.success);
            if (successfulSends.length > 0) {
                const avgSuccessHour = this.calculateAverageHour(successfulSends);
                optimalTime.setHours(avgSuccessHour);
                confidence += 0.2;
            }
        }

        // Generate alternative times
        const alternatives = this.generateAlternativeTimes(optimalTime, 3);

        return {
            optimalTime,
            confidence,
            alternatives,
            reasoning: `Based on ${historicalData?.length || 0} historical sends and behavioral patterns`
        };
    }

    // Scheduling Engine
    startSchedulingEngine() {
        // Check for scheduled emails every minute
        setInterval(() => {
            this.processScheduledEmails();
        }, 60000);

        // Initial processing
        this.processScheduledEmails();
    }

    async processScheduledEmails() {
        const now = new Date();
        const scheduledEmails = Array.from(this.scheduledEmails.values());
        
        for (const email of scheduledEmails) {
            if (new Date(email.scheduledTime) <= now && email.status === 'scheduled') {
                await this.sendScheduledEmail(email);
            }
        }
    }

    async scheduleEmail(emailData, optimization = true) {
        try {
            let sendTime;
            let schedulingReason;

            if (optimization) {
                const optimizationResult = await this.optimizeSendTime(emailData);
                sendTime = optimizationResult.optimalTime;
                schedulingReason = {
                    type: 'ai_optimized',
                    confidence: optimizationResult.confidence,
                    factors: optimizationResult.factors,
                    reasoning: optimizationResult.reasoning
                };
            } else {
                sendTime = this.getDefaultSendTime(emailData);
                schedulingReason = { type: 'default', reasoning: 'Default scheduling applied' };
            }

            const scheduledEmail = {
                id: this.generateScheduleId(),
                ...emailData,
                scheduledTime: sendTime,
                status: 'scheduled',
                schedulingReason,
                createdAt: new Date().toISOString(),
                attempts: 0,
                maxAttempts: 3
            };

            this.scheduledEmails.set(scheduledEmail.id, scheduledEmail);
            await this.saveScheduledEmail(scheduledEmail);

            logger.info(`Email scheduled for ${sendTime}: ${emailData.recipient}`);
            return scheduledEmail;
            
        } catch (error) {
            logger.error('Error scheduling email:', error);
            throw error;
        }
    }

    async sendScheduledEmail(scheduledEmail) {
        try {
            scheduledEmail.status = 'sending';
            scheduledEmail.attempts++;
            scheduledEmail.lastAttempt = new Date().toISOString();

            // Here you would integrate with your email sending system
            const result = await this.sendEmail(scheduledEmail);

            if (result.success) {
                scheduledEmail.status = 'sent';
                scheduledEmail.sentAt = new Date().toISOString();
                
                // Update behavioral data
                await this.updateBehavioralData(scheduledEmail.recipient, {
                    type: 'scheduled_sent',
                    timestamp: scheduledEmail.sentAt,
                    scheduledTime: scheduledEmail.scheduledTime,
                    success: true
                });
            } else {
                scheduledEmail.status = 'failed';
                scheduledEmail.error = result.error;
                
                if (scheduledEmail.attempts < scheduledEmail.maxAttempts) {
                    // Reschedule for later
                    const retryTime = new Date(Date.now() + 3600000); // 1 hour later
                    scheduledEmail.scheduledTime = retryTime;
                    scheduledEmail.status = 'scheduled';
                }
            }

            this.scheduledEmails.set(scheduledEmail.id, scheduledEmail);
            await this.saveScheduledEmail(scheduledEmail);

        } catch (error) {
            logger.error('Error sending scheduled email:', error);
            scheduledEmail.status = 'failed';
            scheduledEmail.error = error.message;
            this.scheduledEmails.set(scheduledEmail.id, scheduledEmail);
        }
    }

    // Behavioral Learning
    async updateBehavioralData(recipient, engagementData) {
        try {
            let profile = this.behavioralData.get(recipient);
            
            if (!profile) {
                profile = {
                    email: recipient,
                    engagementHistory: [],
                    preferences: {},
                    timezone: null,
                    deviceInfo: {},
                    lastUpdated: new Date().toISOString()
                };
            }

            profile.engagementHistory.push({
                ...engagementData,
                id: this.generateEngagementId()
            });

            // Update preferences based on engagement
            this.updatePreferencesFromEngagement(profile, engagementData);
            
            profile.lastUpdated = new Date().toISOString();
            this.behavioralData.set(recipient, profile);
            
            await this.saveBehavioralProfile(profile);
            
        } catch (error) {
            logger.error('Error updating behavioral data:', error);
        }
    }

    updatePreferencesFromEngagement(profile, engagementData) {
        const hour = new Date(engagementData.timestamp).getHours();
        const day = new Date(engagementData.timestamp).getDay();
        
        if (!profile.preferences.engagementHours) {
            profile.preferences.engagementHours = {};
        }
        
        if (!profile.preferences.engagementDays) {
            profile.preferences.engagementDays = {};
        }

        profile.preferences.engagementHours[hour] = 
            (profile.preferences.engagementHours[hour] || 0) + 1;
        
        profile.preferences.engagementDays[day] = 
            (profile.preferences.engagementDays[day] || 0) + 1;
    }

    // Utility Methods
    getDefaultSendTime(emailData) {
        const now = new Date();
        const defaultDelay = 300000; // 5 minutes
        return new Date(now.getTime() + defaultDelay);
    }

    generateScheduleId() {
        return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateEngagementId() {
        return `eng_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getRecipientTimezone(recipient) {
        // This would integrate with a timezone detection service
        return {
            name: 'America/New_York',
            offset: -5,
            country: 'US'
        };
    }

    convertToLocalTime(utcTime, timezone) {
        // Simplified timezone conversion
        const offset = timezone.offset * 60 * 60 * 1000;
        return new Date(utcTime.getTime() + offset);
    }

    getWorkingHoursForTimezone(timezone) {
        return {
            start: 9,
            end: 17,
            lunchStart: 12,
            lunchEnd: 13
        };
    }

    generateAlternativeTimes(baseTime, count) {
        const alternatives = [];
        for (let i = 1; i <= count; i++) {
            alternatives.push({
                time: new Date(baseTime.getTime() + (i * 3600000)), // +1 hour
                confidence: 0.8 - (i * 0.1)
            });
        }
        return alternatives;
    }

    calculateAverageHour(successfulSends) {
        const totalHours = successfulSends.reduce((sum, send) => {
            return sum + new Date(send.timestamp).getHours();
        }, 0);
        return Math.round(totalHours / successfulSends.length);
    }

    // Data Persistence
    async saveScheduledEmail(scheduledEmail) {
        const filePath = path.join(this.schedulingDataPath, 'scheduled', `${scheduledEmail.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(scheduledEmail, null, 2));
    }

    async saveBehavioralProfile(profile) {
        const filePath = path.join(this.schedulingDataPath, 'behavioral', `${profile.email}.json`);
        await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    }

    async loadBehavioralData() {
        try {
            const files = await fs.readdir(path.join(this.schedulingDataPath, 'behavioral'));
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.schedulingDataPath, 'behavioral', file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const profile = JSON.parse(data);
                    this.behavioralData.set(profile.email, profile);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading behavioral data:', error);
            }
        }
    }

    async loadOptimizationModels() {
        // Load ML models or create default ones
        this.optimizationModels.set('default', this.createDefaultModel());
    }

    createDefaultModel() {
        return {
            name: 'default',
            version: '1.0',
            accuracy: 0.75,
            lastTrained: new Date().toISOString(),
            features: ['hour', 'day', 'timezone', 'industry', 'email_type', 'urgency']
        };
    }

    // Email Sending Integration (placeholder)
    async sendEmail(emailData) {
        // This would integrate with your actual email sending system
        return {
            success: true,
            messageId: `msg_${Date.now()}`,
            sentAt: new Date().toISOString()
        };
    }

    // Analytics and Reporting
    async getSchedulingAnalytics(timeRange = '7d') {
        const scheduledEmails = Array.from(this.scheduledEmails.values());
        const behavioralProfiles = Array.from(this.behavioralData.values());
        
        return {
            overview: {
                totalScheduled: scheduledEmails.length,
                successfullySent: scheduledEmails.filter(e => e.status === 'sent').length,
                failed: scheduledEmails.filter(e => e.status === 'failed').length,
                pending: scheduledEmails.filter(e => e.status === 'scheduled').length
            },
            optimizationMetrics: {
                averageConfidence: this.calculateAverageOptimizationConfidence(scheduledEmails),
                behavioralProfiles: behavioralProfiles.length,
                activeModels: this.optimizationModels.size
            },
            performance: {
                averageDeliveryTime: this.calculateAverageDeliveryTime(scheduledEmails),
                optimizationSuccessRate: this.calculateOptimizationSuccessRate(scheduledEmails)
            }
        };
    }

    calculateAverageOptimizationConfidence(scheduledEmails) {
        const optimizedEmails = scheduledEmails.filter(e => 
            e.schedulingReason && e.schedulingReason.type === 'ai_optimized'
        );
        
        if (optimizedEmails.length === 0) return 0;
        
        const totalConfidence = optimizedEmails.reduce((sum, e) => {
            return sum + (e.schedulingReason.confidence || 0);
        }, 0);
        
        return totalConfidence / optimizedEmails.length;
    }

    calculateAverageDeliveryTime(scheduledEmails) {
        const sentEmails = scheduledEmails.filter(e => 
            e.status === 'sent' && e.sentAt && e.scheduledTime
        );
        
        if (sentEmails.length === 0) return 0;
        
        const totalTime = sentEmails.reduce((sum, e) => {
            const scheduled = new Date(e.scheduledTime).getTime();
            const sent = new Date(e.sentAt).getTime();
            return sum + (sent - scheduled);
        }, 0);
        
        return totalTime / sentEmails.length;
    }
}

module.exports = SmartScheduler;