/**
 * Email Reputation Monitoring and Scoring System
 * Comprehensive reputation tracking with real-time monitoring and alerting
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const dns = require('dns').promises;
const logger = require('./logger');

class ReputationMonitor extends EventEmitter {
    constructor() {
        super();
        this.reputationDataPath = path.join(__dirname, '..', 'data', 'reputation');
        this.blacklistDataPath = path.join(__dirname, '..', 'data', 'blacklists');
        this.monitoringData = new Map();
        this.reputationScores = new Map();
        this.blacklistChecks = new Map();
        this.domainReputation = new Map();
        
        this.monitoringInterval = 300000; // 5 minutes
        this.scoreUpdateInterval = 3600000; // 1 hour
        
        this.initializeMonitoring();
    }

    async initializeMonitoring() {
        try {
            await this.createDataDirectories();
            await this.loadMonitoringData();
            await this.loadReputationScores();
            await this.loadBlacklistData();
            
            this.startMonitoring();
            this.startScoreUpdates();
            
            logger.info('Email Reputation Monitor initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Reputation Monitor:', error);
            throw error;
        }
    }

    async createDataDirectories() {
        const directories = [
            this.reputationDataPath,
            this.blacklistDataPath,
            path.join(this.reputationDataPath, 'domains'),
            path.join(this.reputationDataPath, 'ip-reputation'),
            path.join(this.blacklistDataPath, 'checks')
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

    // Comprehensive Reputation Scoring
    calculateReputationScore(domain, ipAddress, emailMetrics) {
        let score = 50; // Base score
        const factors = {
            domainAge: 0,
            dnsSetup: 0,
            authentication: 0,
            sendingHistory: 0,
            engagementRates: 0,
            blacklistStatus: 0,
            spamComplaints: 0,
            bounceRates: 0,
            contentQuality: 0
        };

        // Domain age factor (0-10 points)
        factors.domainAge = this.calculateDomainAgeScore(domain);
        score += factors.domainAge;

        // DNS setup factor (0-15 points)
        factors.dnsSetup = this.calculateDNSSetupScore(domain);
        score += factors.dnsSetup;

        // Authentication factor (0-15 points)
        factors.authentication = this.calculateAuthenticationScore(domain);
        score += factors.authentication;

        // Sending history factor (0-20 points)
        factors.sendingHistory = this.calculateSendingHistoryScore(domain, emailMetrics);
        score += factors.sendingHistory;

        // Engagement rates factor (0-15 points)
        factors.engagementRates = this.calculateEngagementScore(emailMetrics);
        score += factors.engagementRates;

        // Blacklist status factor (-20 to 0 points)
        factors.blacklistStatus = this.calculateBlacklistScore(domain, ipAddress);
        score += factors.blacklistStatus;

        // Spam complaints factor (-15 to 0 points)
        factors.spamComplaints = this.calculateSpamComplaintScore(emailMetrics);
        score += factors.spamComplaints;

        // Bounce rates factor (-10 to 0 points)
        factors.bounceRates = this.calculateBounceRateScore(emailMetrics);
        score += factors.bounceRates;

        // Content quality factor (0-10 points)
        factors.contentQuality = this.calculateContentQualityScore(emailMetrics);
        score += factors.contentQuality;

        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));

        return {
            score: Math.round(score),
            trustLevel: this.determineTrustLevel(score),
            factors,
            lastCalculated: new Date().toISOString(),
            recommendations: this.generateReputationRecommendations(factors)
        };
    }

    calculateDomainAgeScore(domain) {
        // Check domain registration date and age
        const domainAge = this.getDomainAge(domain);
        
        if (domainAge > 365 * 3) return 10; // 3+ years
        if (domainAge > 365 * 2) return 8;  // 2+ years
        if (domainAge > 365) return 6;       // 1+ year
        if (domainAge > 180) return 4;       // 6+ months
        if (domainAge > 30) return 2;        // 1+ month
        return 0; // Less than 1 month
    }

    calculateDNSSetupScore(domain) {
        let score = 0;
        
        // Check for proper DNS records
        if (this.hasValidMXRecords(domain)) score += 5;
        if (this.hasValidSPFRecord(domain)) score += 3;
        if (this.hasValidDKIMRecord(domain)) score += 3;
        if (this.hasValidDMARCRecord(domain)) score += 4;
        
        return score;
    }

    calculateAuthenticationScore(domain) {
        let score = 0;
        
        // Check authentication setup
        if (this.checkSPFAuthentication(domain)) score += 5;
        if (this.checkDKIMAuthentication(domain)) score += 5;
        if (this.checkDMARCAuthentication(domain)) score += 5;
        
        return score;
    }

    calculateSendingHistoryScore(domain, emailMetrics) {
        if (!emailMetrics || !emailMetrics.history) return 0;
        
        const history = emailMetrics.history;
        let score = 0;
        
        // Volume consistency
        if (history.averageDailyVolume > 100) score += 5;
        if (history.volumeConsistency > 0.8) score += 5;
        
        // Sending duration
        if (history.sendingDuration > 180) score += 5; // 6+ months
        if (history.sendingDuration > 365) score += 5; // 1+ year
        
        return score;
    }

    calculateEngagementScore(emailMetrics) {
        if (!emailMetrics) return 0;
        
        let score = 0;
        
        if (emailMetrics.openRate > 0.25) score += 5; // 25%+ open rate
        if (emailMetrics.openRate > 0.35) score += 5; // 35%+ open rate
        
        if (emailMetrics.clickRate > 0.03) score += 3; // 3%+ click rate
        if (emailMetrics.clickRate > 0.05) score += 2; // 5%+ click rate
        
        return score;
    }

    calculateBlacklistScore(domain, ipAddress) {
        let score = 0;
        
        // Check various blacklists
        const blacklistResults = this.checkBlacklists(domain, ipAddress);
        
        blacklistResults.forEach(result => {
            if (result.listed) {
                score -= result.severity * 5; // -5 to -20 points per blacklist
            }
        });
        
        return Math.max(-20, score);
    }

    calculateSpamComplaintScore(emailMetrics) {
        if (!emailMetrics || !emailMetrics.spamComplaintRate) return 0;
        
        const rate = emailMetrics.spamComplaintRate;
        
        if (rate > 0.01) return -15; // 1%+ spam complaint rate
        if (rate > 0.005) return -10; // 0.5%+ spam complaint rate
        if (rate > 0.002) return -5;  // 0.2%+ spam complaint rate
        
        return 0;
    }

    calculateBounceRateScore(emailMetrics) {
        if (!emailMetrics || !emailMetrics.bounceRate) return 0;
        
        const rate = emailMetrics.bounceRate;
        
        if (rate > 0.1) return -10;  // 10%+ bounce rate
        if (rate > 0.05) return -7;  // 5%+ bounce rate
        if (rate > 0.02) return -3;  // 2%+ bounce rate
        
        return 0;
    }

    calculateContentQualityScore(emailMetrics) {
        if (!emailMetrics || !emailMetrics.contentAnalysis) return 0;
        
        const analysis = emailMetrics.contentAnalysis;
        let score = 0;
        
        if (analysis.spamScore < 5) score += 5; // Low spam score
        if (analysis.readabilityScore > 0.6) score += 3; // Good readability
        if (analysis.hasPersonalization) score += 2; // Personalized content
        
        return score;
    }

    determineTrustLevel(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 70) return 'fair';
        if (score >= 60) return 'poor';
        return 'bad';
    }

    // Real-time Monitoring
    startMonitoring() {
        setInterval(() => {
            this.performReputationChecks();
        }, this.monitoringInterval);
    }

    startScoreUpdates() {
        setInterval(() => {
            this.updateReputationScores();
        }, this.scoreUpdateInterval);
    }

    async performReputationChecks() {
        try {
            const domains = Array.from(this.monitoringData.keys());
            
            for (const domain of domains) {
                await this.checkDomainReputation(domain);
                await this.checkIPReputation(domain);
                await this.performBlacklistChecks(domain);
            }
            
            this.emit('reputationChecksCompleted', {
                timestamp: new Date().toISOString(),
                domainsChecked: domains.length
            });
            
        } catch (error) {
            logger.error('Error performing reputation checks:', error);
        }
    }

    async checkDomainReputation(domain) {
        try {
            // Check DNS records
            const dnsChecks = await this.performDNSChecks(domain);
            
            // Check authentication setup
            const authChecks = await this.performAuthenticationChecks(domain);
            
            // Check blacklist status
            const blacklistChecks = await this.checkBlacklists(domain);
            
            const reputationData = {
                domain,
                timestamp: new Date().toISOString(),
                dnsChecks,
                authChecks,
                blacklistChecks,
                overallScore: this.calculateOverallReputationScore(dnsChecks, authChecks, blacklistChecks)
            };
            
            this.domainReputation.set(domain, reputationData);
            await this.saveDomainReputationData(domain, reputationData);
            
            // Check for significant changes and emit alerts
            this.checkForReputationChanges(domain, reputationData);
            
        } catch (error) {
            logger.error(`Error checking domain reputation for ${domain}:`, error);
        }
    }

    async performDNSChecks(domain) {
        const checks = {
            mx: { valid: false, records: [] },
            spf: { valid: false, record: null },
            dkim: { valid: false, records: [] },
            dmarc: { valid: false, record: null },
            a: { valid: false, records: [] }
        };

        try {
            // MX Records
            try {
                checks.mx.records = await dns.resolveMx(domain);
                checks.mx.valid = checks.mx.records.length > 0;
            } catch (error) {
                checks.mx.error = error.message;
            }

            // SPF Record
            try {
                const spfRecords = await dns.resolveTxt(domain);
                const spfRecord = spfRecords.find(record => 
                    record.join('').startsWith('v=spf1')
                );
                checks.spf.record = spfRecord ? spfRecord.join('') : null;
                checks.spf.valid = !!spfRecord;
            } catch (error) {
                checks.spf.error = error.message;
            }

            // A Records
            try {
                checks.a.records = await dns.resolve4(domain);
                checks.a.valid = checks.a.records.length > 0;
            } catch (error) {
                checks.a.error = error.message;
            }

        } catch (error) {
            logger.error(`DNS check error for ${domain}:`, error);
        }

        return checks;
    }

    async performAuthenticationChecks(domain) {
        return {
            spf: await this.checkSPFAuthentication(domain),
            dkim: await this.checkDKIMAuthentication(domain),
            dmarc: await this.checkDMARCAuthentication(domain),
            timestamp: new Date().toISOString()
        };
    }

    async checkBlacklists(domain, ipAddress = null) {
        const blacklists = [
            'zen.spamhaus.org',
            'bl.spamcop.net',
            'cbl.abuseat.org',
            'b.barracudacentral.org',
            'dnsbl.sorbs.net',
            'spam.dnsbl.sorbs.net',
            'web.dnsbl.sorbs.net'
        ];

        const results = [];

        for (const blacklist of blacklists) {
            try {
                const isListed = await this.checkSingleBlacklist(domain, blacklist);
                results.push({
                    blacklist,
                    listed: isListed,
                    severity: this.getBlacklistSeverity(blacklist),
                    checkedAt: new Date().toISOString()
                });
            } catch (error) {
                results.push({
                    blacklist,
                    listed: false,
                    error: error.message,
                    checkedAt: new Date().toISOString()
                });
            }
        }

        return results;
    }

    async checkSingleBlacklist(domain, blacklist) {
        try {
            const lookupDomain = `${domain.split('.').reverse().join('.')}.${blacklist}`;
            await dns.resolve4(lookupDomain);
            return true; // Listed
        } catch (error) {
            if (error.code === 'ENOTFOUND') {
                return false; // Not listed
            }
            throw error;
        }
    }

    getBlacklistSeverity(blacklist) {
        const severityMap = {
            'zen.spamhaus.org': 5,
            'bl.spamcop.net': 4,
            'cbl.abuseat.org': 4,
            'b.barracudacentral.org': 3,
            'dnsbl.sorbs.net': 3,
            'spam.dnsbl.sorbs.net': 4,
            'web.dnsbl.sorbs.net': 2
        };
        
        return severityMap[blacklist] || 1;
    }

    // Alert System
    checkForReputationChanges(domain, newData) {
        const oldData = this.domainReputation.get(domain);
        
        if (!oldData) return;
        
        const scoreChange = newData.overallScore - oldData.overallScore;
        
        if (Math.abs(scoreChange) > 10) {
            this.emit('reputationAlert', {
                type: 'significant_change',
                domain,
                oldScore: oldData.overallScore,
                newScore: newData.overallScore,
                change: scoreChange,
                timestamp: new Date().toISOString()
            });
        }
        
        // Check for blacklist additions
        const oldBlacklists = oldData.blacklistChecks.filter(check => check.listed).length;
        const newBlacklists = newData.blacklistChecks.filter(check => check.listed).length;
        
        if (newBlacklists > oldBlacklists) {
            this.emit('blacklistAlert', {
                type: 'blacklisted',
                domain,
                blacklists: newData.blacklistChecks.filter(check => check.listed),
                timestamp: new Date().toISOString()
            });
        }
    }

    // Reputation Recommendations
    generateReputationRecommendations(factors) {
        const recommendations = [];
        
        if (factors.domainAge < 5) {
            recommendations.push({
                priority: 'high',
                category: 'domain',
                message: 'Consider using an older, established domain for better reputation',
                action: 'domain_age_improvement'
            });
        }
        
        if (factors.dnsSetup < 10) {
            recommendations.push({
                priority: 'high',
                category: 'dns',
                message: 'Improve DNS setup by adding missing SPF, DKIM, or DMARC records',
                action: 'dns_setup_improvement'
            });
        }
        
        if (factors.blacklistStatus < -5) {
            recommendations.push({
                priority: 'critical',
                category: 'blacklist',
                message: 'Address blacklist issues immediately - contact blacklist providers for removal',
                action: 'blacklist_removal'
            });
        }
        
        if (factors.spamComplaints < -5) {
            recommendations.push({
                priority: 'high',
                category: 'content',
                message: 'Reduce spam complaints by improving email content and targeting',
                action: 'content_improvement'
            });
        }
        
        if (factors.bounceRates < -5) {
            recommendations.push({
                priority: 'medium',
                category: 'list_management',
                message: 'Clean email list to reduce bounce rates',
                action: 'list_cleaning'
            });
        }
        
        return recommendations;
    }

    // Data Persistence
    async saveDomainReputationData(domain, data) {
        const filePath = path.join(this.reputationDataPath, 'domains', `${domain}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async loadMonitoringData() {
        // Load existing monitoring data
        try {
            const files = await fs.readdir(path.join(this.reputationDataPath, 'domains'));
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.reputationDataPath, 'domains', file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const reputationData = JSON.parse(data);
                    this.domainReputation.set(reputationData.domain, reputationData);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading monitoring data:', error);
            }
        }
    }

    async loadReputationScores() {
        // Load existing reputation scores
        try {
            const files = await fs.readdir(this.reputationDataPath);
            for (const file of files) {
                if (file.startsWith('score_') && file.endsWith('.json')) {
                    const filePath = path.join(this.reputationDataPath, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const scoreData = JSON.parse(data);
                    this.reputationScores.set(scoreData.domain, scoreData);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading reputation scores:', error);
            }
        }
    }

    async loadBlacklistData() {
        // Load existing blacklist data
        try {
            const files = await fs.readdir(this.blacklistDataPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.blacklistDataPath, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const blacklistData = JSON.parse(data);
                    this.blacklistChecks.set(blacklistData.domain, blacklistData);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading blacklist data:', error);
            }
        }
    }

    // Utility Methods
    getDomainAge(domain) {
        // This would integrate with WHOIS lookup
        // For now, return a default age
        return 365; // 1 year default
    }

    hasValidMXRecords(domain) {
        // Check if domain has valid MX records
        return true; // Placeholder
    }

    hasValidSPFRecord(domain) {
        // Check SPF record validity
        return true; // Placeholder
    }

    hasValidDKIMRecord(domain) {
        // Check DKIM record validity
        return true; // Placeholder
    }

    hasValidDMARCRecord(domain) {
        // Check DMARC record validity
        return true; // Placeholder
    }

    checkSPFAuthentication(domain) {
        // Check SPF authentication
        return true; // Placeholder
    }

    checkDKIMAuthentication(domain) {
        // Check DKIM authentication
        return true; // Placeholder
    }

    checkDMARCAuthentication(domain) {
        // Check DMARC authentication
        return true; // Placeholder
    }

    calculateOverallReputationScore(dnsChecks, authChecks, blacklistChecks) {
        let score = 0;
        
        // DNS score
        if (dnsChecks.mx.valid) score += 20;
        if (dnsChecks.spf.valid) score += 15;
        if (dnsChecks.dmarc.valid) score += 15;
        
        // Authentication score
        if (authChecks.spf) score += 10;
        if (authChecks.dkim) score += 10;
        if (authChecks.dmarc) score += 10;
        
        // Blacklist penalty
        const blacklistCount = blacklistChecks.filter(check => check.listed).length;
        score -= blacklistCount * 10;
        
        return Math.max(0, score);
    }

    // Analytics and Reporting
    async getReputationAnalytics(timeRange = '30d') {
        const domains = Array.from(this.domainReputation.values());
        const scores = Array.from(this.reputationScores.values());
        
        return {
            overview: {
                totalDomains: domains.length,
                averageScore: scores.length > 0 ? 
                    scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0,
                domainsByTrustLevel: this.getDomainsByTrustLevel(domains),
                blacklistedDomains: this.getBlacklistedDomains(domains)
            },
            trends: {
                scoreTrend: this.calculateScoreTrend(scores, timeRange),
                blacklistTrend: this.calculateBlacklistTrend(domains, timeRange)
            },
            alerts: this.getActiveAlerts(),
            recommendations: this.getGlobalRecommendations(domains)
        };
    }

    getDomainsByTrustLevel(domains) {
        const distribution = { excellent: 0, good: 0, fair: 0, poor: 0, bad: 0 };
        domains.forEach(domain => {
            const level = this.determineTrustLevel(domain.overallScore || 50);
            distribution[level]++;
        });
        return distribution;
    }

    getBlacklistedDomains(domains) {
        return domains.filter(domain => {
            const blacklistCount = domain.blacklistChecks?.filter(check => check.listed).length || 0;
            return blacklistCount > 0;
        }).length;
    }

    getActiveAlerts() {
        // Return current active alerts
        return [];
    }

    getGlobalRecommendations(domains) {
        // Generate global recommendations based on all domains
        return [];
    }
}

module.exports = ReputationMonitor;