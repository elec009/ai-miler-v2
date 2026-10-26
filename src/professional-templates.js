/**
 * Professional Email Templates System
 * Responsive, modern email templates with advanced personalization and testing capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class ProfessionalTemplateManager {
    constructor() {
        this.templatesPath = path.join(__dirname, '..', 'data', 'professional-templates');
        this.templates = new Map();
        this.templateVariants = new Map();
        this.responsiveTests = new Map();
        this.personalizationEngine = new Map();
        
        this.initializeTemplateManager();
    }

    async initializeTemplateManager() {
        try {
            await this.createTemplateDirectories();
            await this.loadProfessionalTemplates();
            await this.initializePersonalizationEngine();
            
            logger.info('Professional Template Manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Professional Template Manager:', error);
            throw error;
        }
    }

    async createTemplateDirectories() {
        const directories = [
            this.templatesPath,
            path.join(this.templatesPath, 'categories'),
            path.join(this.templatesPath, 'variants'),
            path.join(this.templatesPath, 'tests'),
            path.join(this.templatesPath, 'personalization')
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

    // Professional Template Creation
    async createProfessionalTemplate(templateConfig) {
        try {
            const template = await this.buildProfessionalTemplate(templateConfig);
            const validation = await this.validateProfessionalTemplate(template);
            
            if (!validation.isValid) {
                throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
            }

            // Generate responsive versions
            template.responsiveVersions = await this.generateResponsiveVersions(template);
            
            // Create A/B test variants
            template.variants = await this.createTemplateVariants(template);
            
            // Setup personalization rules
            template.personalization = await this.setupPersonalization(template);
            
            this.templates.set(template.id, template);
            await this.saveProfessionalTemplate(template);
            
            logger.info(`Professional template created: ${template.name} (${template.id})`);
            return template;
            
        } catch (error) {
            logger.error('Error creating professional template:', error);
            throw error;
        }
    }

    async buildProfessionalTemplate(config) {
        const template = {
            id: uuidv4(),
            name: config.name,
            description: config.description,
            category: config.category || 'general',
            type: config.type || 'professional',
            
            // Professional design system
            design: {
                layout: config.design?.layout || 'modern',
                colorScheme: config.design?.colorScheme || {
                    primary: '#2563eb',
                    secondary: '#64748b',
                    accent: '#f59e0b',
                    background: '#ffffff',
                    text: '#1f2937'
                },
                typography: config.design?.typography || {
                    fontFamily: 'Arial, sans-serif',
                    headingFont: 'Georgia, serif',
                    fontSize: '16px',
                    lineHeight: '1.6'
                },
                spacing: config.design?.spacing || {
                    padding: '20px',
                    margin: '10px',
                    sectionSpacing: '30px'
                },
                branding: config.design?.branding || {
                    logo: '',
                    companyName: '',
                    socialLinks: []
                }
            },
            
            // Advanced content structure
            content: {
                structure: config.content?.structure || {
                    header: true,
                    hero: true,
                    mainContent: true,
                    callToAction: true,
                    footer: true,
                    socialLinks: true
                },
                sections: config.content?.sections || {
                    header: {
                        type: 'header',
                        content: '',
                        styling: 'professional'
                    },
                    hero: {
                        type: 'hero',
                        title: '',
                        subtitle: '',
                        image: '',
                        styling: 'modern'
                    },
                    main: {
                        type: 'main',
                        paragraphs: [],
                        styling: 'clean'
                    },
                    cta: {
                        type: 'cta',
                        buttons: [],
                        styling: 'prominent'
                    },
                    footer: {
                        type: 'footer',
                        content: '',
                        styling: 'professional'
                    }
                },
                variables: config.content?.variables || [],
                dynamicContent: config.content?.dynamicContent || false
            },
            
            // Professional features
            features: {
                responsive: config.features?.responsive !== false,
                darkMode: config.features?.darkMode !== false,
                accessibility: config.features?.accessibility !== false,
                personalization: config.features?.personalization !== false,
                abTesting: config.features?.abTesting !== false,
                analytics: config.features?.analytics !== false,
                automation: config.features?.automation !== false
            },
            
            // Quality and compliance
            quality: {
                spamScore: 0,
                readability: 0,
                accessibilityScore: 0,
                mobileCompatibility: 0,
                crossClientCompatibility: 0
            },
            
            // Testing and optimization
            testing: {
                abVariants: [],
                spamTests: [],
                renderTests: [],
                performance: {}
            },
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return template;
    }

    // Responsive Design Generation
    async generateResponsiveVersions(template) {
        const responsiveVersions = {};
        
        // Desktop version (default)
        responsiveVersions.desktop = await this.generateDesktopVersion(template);
        
        // Mobile version
        responsiveVersions.mobile = await this.generateMobileVersion(template);
        
        // Tablet version
        responsiveVersions.tablet = await this.generateTabletVersion(template);
        
        // Dark mode versions
        if (template.features.darkMode) {
            responsiveVersions.darkDesktop = await this.generateDarkModeVersion(template, 'desktop');
            responsiveVersions.darkMobile = await this.generateDarkModeVersion(template, 'mobile');
        }
        
        return responsiveVersions;
    }

    async generateDesktopVersion(template) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${template.name}</title>
            <style>
                ${this.generateProfessionalCSS('desktop', template)}
            </style>
        </head>
        <body>
            <div class="email-container">
                ${await this.generateEmailStructure(template, 'desktop')}
            </div>
        </body>
        </html>`;
    }

    async generateMobileVersion(template) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${template.name}</title>
            <style>
                ${this.generateProfessionalCSS('mobile', template)}
            </style>
        </head>
        <body>
            <div class="email-container mobile">
                ${await this.generateEmailStructure(template, 'mobile')}
            </div>
        </body>
        </html>`;
    }

    async generateTabletVersion(template) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${template.name}</title>
            <style>
                ${this.generateProfessionalCSS('tablet', template)}
            </style>
        </head>
        <body>
            <div class="email-container tablet">
                ${await this.generateEmailStructure(template, 'tablet')}
            </div>
        </body>
        </html>`;
    }

    generateProfessionalCSS(device, template) {
        const { design } = template;
        const baseCSS = `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: ${design.typography.fontFamily};
                font-size: ${design.typography.fontSize};
                line-height: ${design.typography.lineHeight};
                color: ${design.colorScheme.text};
                background-color: ${design.colorScheme.background};
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .email-container {
                max-width: ${device === 'mobile' ? '100%' : device === 'tablet' ? '600px' : '800px'};
                margin: 0 auto;
                background-color: ${design.colorScheme.background};
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .email-header {
                background: linear-gradient(135deg, ${design.colorScheme.primary}, ${design.colorScheme.secondary});
                padding: ${design.spacing.padding};
                text-align: center;
                color: white;
            }
            
            .email-hero {
                padding: ${design.spacing.sectionSpacing} ${design.spacing.padding};
                background-color: ${design.colorScheme.background};
                text-align: center;
            }
            
            .email-main {
                padding: ${design.spacing.padding};
            }
            
            .email-footer {
                background-color: #f8fafc;
                padding: ${design.spacing.padding};
                text-align: center;
                border-top: 1px solid #e2e8f0;
            }
            
            .cta-button {
                display: inline-block;
                background: linear-gradient(135deg, ${design.colorScheme.primary}, ${design.colorScheme.accent});
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                margin: 10px 5px;
                transition: all 0.3s ease;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .cta-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            }
            
            h1, h2, h3 {
                font-family: ${design.typography.headingFont};
                margin-bottom: 16px;
                color: ${design.colorScheme.text};
            }
            
            h1 {
                font-size: ${device === 'mobile' ? '24px' : '32px'};
                font-weight: 700;
            }
            
            h2 {
                font-size: ${device === 'mobile' ? '20px' : '24px'};
                font-weight: 600;
            }
            
            p {
                margin-bottom: 16px;
                line-height: ${design.typography.lineHeight};
            }
            
            .social-links {
                margin-top: 20px;
            }
            
            .social-links a {
                display: inline-block;
                margin: 0 10px;
                color: ${design.colorScheme.secondary};
                text-decoration: none;
                font-size: 14px;
            }
            
            .social-links a:hover {
                color: ${design.colorScheme.primary};
            }
            
            /* Accessibility improvements */
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
            
            /* Mobile-specific styles */
            ${device === 'mobile' ? `
                .email-container {
                    border-radius: 0;
                    box-shadow: none;
                }
                
                .cta-button {
                    display: block;
                    width: 100%;
                    margin: 10px 0;
                }
                
                .email-header, .email-hero, .email-main, .email-footer {
                    padding: 16px;
                }
            ` : ''}
            
            /* Tablet-specific styles */
            ${device === 'tablet' ? `
                .email-container {
                    margin: 20px auto;
                }
                
                .cta-button {
                    min-width: 120px;
                }
            ` : ''}
            
            /* Dark mode support */
            @media (prefers-color-scheme: dark) {
                body {
                    background-color: #1a202c;
                    color: #e2e8f0;
                }
                
                .email-container {
                    background-color: #2d3748;
                    color: #e2e8f0;
                }
                
                .email-footer {
                    background-color: #2d3748;
                    border-top-color: #4a5568;
                }
                
                h1, h2, h3 {
                    color: #e2e8f0;
                }
            }
            
            /* Print styles */
            @media print {
                .email-container {
                    box-shadow: none;
                    border: 1px solid #ccc;
                }
                
                .cta-button {
                    border: 2px solid ${design.colorScheme.primary};
                    background: none;
                    color: ${design.colorScheme.primary};
                }
            }
        `;
        
        return baseCSS;
    }

    async generateEmailStructure(template, device) {
        const { content } = template;
        let html = '';
        
        // Header section
        if (content.structure.header) {
            html += `
                <div class="email-header">
                    <h1>${content.sections.hero.title || 'Professional Email'}</h1>
                    ${content.sections.hero.subtitle ? `<p>${content.sections.hero.subtitle}</p>` : ''}
                </div>
            `;
        }
        
        // Hero section
        if (content.structure.hero) {
            html += `
                <div class="email-hero">
                    <h2>${content.sections.hero.title || 'Welcome Message'}</h2>
                    <p>${content.sections.hero.subtitle || 'Thank you for your interest.'}</p>
                    ${content.sections.hero.image ? `<img src="${content.sections.hero.image}" alt="Hero Image" style="max-width: 100%; height: auto; margin-top: 20px;">` : ''}
                </div>
            `;
        }
        
        // Main content section
        if (content.structure.mainContent) {
            html += `
                <div class="email-main">
                    ${content.sections.main.paragraphs.map(paragraph => 
                        `<p>${paragraph}</p>`
                    ).join('')}
                </div>
            `;
        }
        
        // Call to action section
        if (content.structure.callToAction) {
            html += `
                <div class="email-main" style="text-align: center;">
                    ${content.sections.cta.buttons.map(button => 
                        `<a href="${button.url || '#'}" class="cta-button">${button.text || 'Click Here'}</a>`
                    ).join('')}
                </div>
            `;
        }
        
        // Footer section
        if (content.structure.footer) {
            html += `
                <div class="email-footer">
                    <p>${content.sections.footer.content || 'Thank you for your time.'}</p>
                    ${content.structure.socialLinks ? `
                        <div class="social-links">
                            <a href="#">LinkedIn</a>
                            <a href="#">Twitter</a>
                            <a href="#">Website</a>
                        </div>
                    ` : ''}
                    <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
                        This email was sent to you because you subscribed to our newsletter.
                        <a href="#" style="color: #2563eb;">Unsubscribe</a> | 
                        <a href="#" style="color: #2563eb;">Update Preferences</a>
                    </p>
                </div>
            `;
        }
        
        return html;
    }

    // A/B Testing and Variants
    async createTemplateVariants(template) {
        const variants = [];
        
        // Create multiple variants for A/B testing
        const variantConfigs = [
            {
                id: uuidv4(),
                name: 'Variant A - Professional',
                description: 'Clean, professional design',
                modifications: {
                    colorScheme: { primary: '#2563eb', secondary: '#64748b' },
                    typography: { fontFamily: 'Arial, sans-serif' },
                    layout: 'professional'
                }
            },
            {
                id: uuidv4(),
                name: 'Variant B - Modern',
                description: 'Modern, vibrant design',
                modifications: {
                    colorScheme: { primary: '#0ea5e9', secondary: '#06b6d4' },
                    typography: { fontFamily: 'Helvetica, Arial, sans-serif' },
                    layout: 'modern'
                }
            },
            {
                id: uuidv4(),
                name: 'Variant C - Corporate',
                description: 'Corporate, conservative design',
                modifications: {
                    colorScheme: { primary: '#374151', secondary: '#6b7280' },
                    typography: { fontFamily: 'Georgia, serif' },
                    layout: 'corporate'
                }
            }
        ];
        
        for (const config of variantConfigs) {
            const variant = await this.createTemplateVariant(template, config);
            variants.push(variant);
        }
        
        return variants;
    }

    async createTemplateVariant(baseTemplate, variantConfig) {
        const variant = {
            id: variantConfig.id,
            name: variantConfig.name,
            description: variantConfig.description,
            baseTemplateId: baseTemplate.id,
            modifications: variantConfig.modifications,
            
            // Generate variant-specific responsive versions
            responsiveVersions: await this.generateVariantResponsiveVersions(baseTemplate, variantConfig),
            
            // Testing data
            testing: {
                impressions: 0,
                clicks: 0,
                conversions: 0,
                performance: {
                    ctr: 0,
                    conversionRate: 0,
                    engagement: 0
                }
            },
            
            createdAt: new Date().toISOString()
        };
        
        this.templateVariants.set(variant.id, variant);
        return variant;
    }

    // Personalization Engine
    async setupPersonalization(template) {
        const personalization = {
            enabled: template.features.personalization,
            level: 'advanced',
            
            // Dynamic content rules
            dynamicRules: [
                {
                    type: 'greeting',
                    rule: 'if(name) then "Hi {{name}}" else "Hello"',
                    fallback: 'Hello there'
                },
                {
                    type: 'company_mention',
                    rule: 'if(company) then "at {{company}}" else ""',
                    fallback: ''
                },
                {
                    type: 'location_based',
                    rule: 'if(location) then location_based_content else default_content',
                    fallback: 'We hope this message finds you well'
                }
            ],
            
            // Behavioral targeting
            behavioralRules: [
                {
                    type: 'engagement_level',
                    rule: 'if(last_open < 7_days) then "active" else "re-engagement"',
                    content: {
                        active: 'Thanks for staying engaged!',
                        're-engagement': 'We miss you! Here\'s what you\'ve missed:'
                    }
                },
                {
                    type: 'purchase_history',
                    rule: 'if(last_purchase < 30_days) then "recent_customer" else "lapsed_customer"',
                    content: {
                        recent_customer: 'Thank you for your recent purchase!',
                        lapsed_customer: 'We\'d love to have you back'
                    }
                }
            ],
            
            // Industry-specific personalization
            industryRules: {
                'technology': {
                    tone: 'innovative',
                    language: 'technical',
                    examples: 'cutting-edge solutions'
                },
                'healthcare': {
                    tone: 'caring',
                    language: 'professional',
                    examples: 'patient care'
                },
                'finance': {
                    tone: 'trustworthy',
                    language: 'formal',
                    examples: 'financial solutions'
                }
            }
        };
        
        return personalization;
    }

    // Template Testing and Quality Assurance
    async testTemplateRendering(template) {
        const tests = {
            spamScore: await this.calculateSpamScore(template),
            readability: await this.calculateReadability(template),
            accessibility: await this.testAccessibility(template),
            mobileCompatibility: await this.testMobileCompatibility(template),
            crossClient: await this.testCrossClientCompatibility(template),
            performance: await this.testTemplatePerformance(template)
        };
        
        template.quality = {
            spamScore: tests.spamScore,
            readability: tests.readability,
            accessibilityScore: tests.accessibility.score,
            mobileCompatibility: tests.mobileCompatibility,
            crossClientCompatibility: tests.crossClient.overall,
            performance: tests.performance
        };
        
        return tests;
    }

    async calculateSpamScore(template) {
        let score = 0;
        const content = JSON.stringify(template.content).toLowerCase();
        
        // Spam trigger words
        const spamWords = [
            'free', 'guarantee', 'no obligation', 'act now', 'limited time',
            'urgent', 'winner', 'congratulations', 'risk free', 'money back'
        ];
        
        spamWords.forEach(word => {
            if (content.includes(word)) score += 2;
        });
        
        // Excessive punctuation
        if (content.includes('!!!') || content.includes('???')) score += 3;
        
        // All caps words
        const capsWords = content.match(/\b[A-Z]{3,}\b/g);
        if (capsWords) score += capsWords.length;
        
        // Excessive exclamation marks
        const exclamations = content.match(/!/g);
        if (exclamations && exclamations.length > 3) score += 2;
        
        return Math.min(score, 10); // Cap at 10
    }

    async calculateReadability(template) {
        const text = this.extractTextFromTemplate(template);
        const words = text.split(/\s+/).length;
        const sentences = text.split(/[.!?]+/).length;
        const syllables = this.estimateSyllables(text);
        
        // Flesch Reading Ease Score
        const fleschScore = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
        
        return Math.max(0, Math.min(100, Math.round(fleschScore)));
    }

    async testAccessibility(template) {
        const tests = {
            colorContrast: await this.testColorContrast(template),
            altText: await this.testAltText(template),
            headingStructure: await this.testHeadingStructure(template),
            linkText: await this.testLinkText(template)
        };
        
        const overallScore = Object.values(tests).reduce((sum, test) => sum + test.score, 0) / Object.keys(tests).length;
        
        return {
            score: Math.round(overallScore),
            details: tests
        };
    }

    // Template Categories and Library
    async createTemplateLibrary() {
        const categories = [
            {
                id: 'warming',
                name: 'Email Warming',
                description: 'Templates for email warming campaigns',
                templates: await this.createWarmingTemplates()
            },
            {
                id: 'newsletter',
                name: 'Newsletters',
                description: 'Professional newsletter templates',
                templates: await this.createNewsletterTemplates()
            },
            {
                id: 'marketing',
                name: 'Marketing',
                description: 'Marketing and promotional templates',
                templates: await this.createMarketingTemplates()
            },
            {
                id: 'transactional',
                name: 'Transactional',
                description: 'Transactional email templates',
                templates: await this.createTransactionalTemplates()
            },
            {
                id: 'onboarding',
                name: 'Onboarding',
                description: 'User onboarding templates',
                templates: await this.createOnboardingTemplates()
            }
        ];
        
        for (const category of categories) {
            await this.saveTemplateCategory(category);
        }
        
        return categories;
    }

    async createWarmingTemplates() {
        return [
            {
                name: 'Professional Introduction',
                description: 'Clean, professional introduction email',
                category: 'warming',
                design: {
                    layout: 'professional',
                    colorScheme: { primary: '#2563eb', secondary: '#64748b' }
                },
                content: {
                    structure: { header: true, hero: true, mainContent: true, footer: true },
                    sections: {
                        hero: {
                            title: 'Hello from {{company}}',
                            subtitle: 'We\'re excited to connect with you'
                        },
                        main: {
                            paragraphs: [
                                'I hope this email finds you well. I wanted to reach out and introduce myself and {{company}}.',
                                'We specialize in helping businesses like yours achieve their goals through innovative solutions.',
                                'I\'d love to learn more about your current challenges and explore how we might be able to help.'
                            ]
                        },
                        cta: {
                            buttons: [
                                { text: 'Schedule a Call', url: '{{calendar_link}}' },
                                { text: 'Learn More', url: '{{website}}' }
                            ]
                        }
                    }
                }
            },
            {
                name: 'Value-Driven Outreach',
                description: 'Value-focused warming email',
                category: 'warming',
                design: {
                    layout: 'modern',
                    colorScheme: { primary: '#0ea5e9', secondary: '#06b6d4' }
                },
                content: {
                    structure: { header: true, hero: true, mainContent: true, callToAction: true, footer: true },
                    sections: {
                        hero: {
                            title: 'Quick question about {{company}}',
                            subtitle: 'I noticed something interesting about your business'
                        },
                        main: {
                            paragraphs: [
                                'I was researching {{company}} and noticed that you\'re doing some impressive work in {{industry}}.',
                                'I work with similar companies and have helped them achieve {{specific_result}}.',
                                'I\'d love to share a quick insight that might be valuable for your current initiatives.'
                            ]
                        },
                        cta: {
                            buttons: [
                                { text: 'Get the Insight', url: '{{resource_link}}' }
                            ]
                        }
                    }
                }
            }
        ];
    }

    // Template Rendering and Personalization
    async renderProfessionalTemplate(templateId, recipientData = {}, options = {}) {
        try {
            const template = this.templates.get(templateId);
            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }
            
            // Select variant for A/B testing
            const variant = options.variantId ? 
                this.templateVariants.get(options.variantId) : 
                await this.selectTemplateVariant(template);
            
            // Apply personalization
            const personalizedContent = await this.applyPersonalization(template, recipientData);
            
            // Select responsive version
            const device = options.device || 'desktop';
            const darkMode = options.darkMode || false;
            const versionKey = darkMode ? `dark${device.charAt(0).toUpperCase() + device.slice(1)}` : device;
            
            let html = template.responsiveVersions[versionKey] || template.responsiveVersions.desktop;
            
            // Replace variables
            html = this.replaceTemplateVariables(html, {
                ...recipientData,
                ...personalizedContent
            });
            
            // Update variant statistics
            if (variant) {
                variant.testing.impressions++;
                this.templateVariants.set(variant.id, variant);
            }
            
            return {
                html,
                variant: variant?.id,
                personalization: personalizedContent,
                device,
                darkMode
            };
            
        } catch (error) {
            logger.error('Error rendering professional template:', error);
            throw error;
        }
    }

    async applyPersonalization(template, recipientData) {
        const personalization = template.personalization || {};
        const personalizedContent = {};
        
        // Apply dynamic rules
        if (personalization.dynamicRules) {
            for (const rule of personalization.dynamicRules) {
                const result = await this.evaluatePersonalizationRule(rule, recipientData);
                personalizedContent[rule.type] = result;
            }
        }
        
        // Apply behavioral rules
        if (personalization.behavioralRules) {
            for (const rule of personalization.behavioralRules) {
                const result = await this.evaluateBehavioralRule(rule, recipientData);
                Object.assign(personalizedContent, result);
            }
        }
        
        // Apply industry-specific personalization
        if (recipientData.industry && personalization.industryRules) {
            const industryRule = personalization.industryRules[recipientData.industry];
            if (industryRule) {
                personalizedContent.industry = industryRule;
            }
        }
        
        return personalizedContent;
    }

    // Utility Methods
    async validateProfessionalTemplate(template) {
        const errors = [];
        
        if (!template.name || template.name.length < 3) {
            errors.push('Template name must be at least 3 characters');
        }
        
        if (!template.content || !template.content.sections) {
            errors.push('Template must have content sections');
        }
        
        if (template.features.responsive && !template.responsiveVersions) {
            errors.push('Responsive templates must have responsive versions');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    async saveProfessionalTemplate(template) {
        const filePath = path.join(this.templatesPath, `${template.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(template, null, 2));
    }

    async loadProfessionalTemplates() {
        try {
            const files = await fs.readdir(this.templatesPath);
            for (const file of files) {
                if (file.endsWith('.json') && !file.startsWith('category_') && !file.startsWith('variant_')) {
                    const filePath = path.join(this.templatesPath, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const template = JSON.parse(data);
                    this.templates.set(template.id, template);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Error loading professional templates:', error);
            }
        }
    }

    async saveTemplateCategory(category) {
        const filePath = path.join(this.templatesPath, 'categories', `${category.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(category, null, 2));
    }

    extractTextFromTemplate(template) {
        const sections = template.content.sections;
        let text = '';
        
        Object.values(sections).forEach(section => {
            if (section.title) text += section.title + '. ';
            if (section.subtitle) text += section.subtitle + '. ';
            if (section.paragraphs) text += section.paragraphs.join(' ') + '. ';
            if (section.content) text += section.content + '. ';
        });
        
        return text;
    }

    estimateSyllables(text) {
        // Simple syllable estimation
        const words = text.split(/\s+/);
        let syllableCount = 0;
        
        words.forEach(word => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (cleanWord.length === 0) return;
            
            let count = 0;
            let previousWasVowel = false;
            const vowels = 'aeiouy';
            
            for (let i = 0; i < cleanWord.length; i++) {
                const isVowel = vowels.includes(cleanWord[i]);
                if (isVowel && !previousWasVowel) count++;
                previousWasVowel = isVowel;
            }
            
            if (cleanWord.endsWith('e')) count--;
            if (count === 0) count = 1;
            
            syllableCount += count;
        });
        
        return syllableCount;
    }

    replaceTemplateVariables(html, data) {
        return html.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const value = data[key.trim()];
            return value !== undefined ? value : match;
        });
    }

    async evaluatePersonalizationRule(rule, data) {
        // Simple rule evaluation (would be more sophisticated in production)
        if (rule.type === 'greeting') {
            return data.name ? `Hi ${data.name}` : rule.fallback;
        }
        return rule.fallback;
    }

    async evaluateBehavioralRule(rule, data) {
        // Simple behavioral rule evaluation
        if (rule.type === 'engagement_level') {
            const isActive = data.last_open && this.isWithinDays(data.last_open, 7);
            return {
                engagement_message: isActive ? rule.content.active : rule.content['re-engagement']
            };
        }
        return {};
    }

    async selectTemplateVariant(template) {
        // Simple variant selection (would use more sophisticated logic)
        const variants = template.variants || [];
        if (variants.length === 0) return null;
        
        // For now, select randomly (would be based on performance data)
        return variants[Math.floor(Math.random() * variants.length)];
    }

    isWithinDays(dateString, days) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    }

    // Placeholder methods for testing
    async testColorContrast(template) { return { score: 85 }; }
    async testAltText(template) { return { score: 90 }; }
    async testHeadingStructure(template) { return { score: 95 }; }
    async testLinkText(template) { return { score: 88 }; }
    async testMobileCompatibility(template) { return 92; }
    async testCrossClientCompatibility(template) { return { overall: 87 }; }
    async testTemplatePerformance(template) { return { loadTime: 0.5 }; }
    async generateDarkModeVersion(template, device) { return template.responsiveVersions[device]; }
    async generateVariantResponsiveVersions(template, variantConfig) { return template.responsiveVersions; }
    async initializePersonalizationEngine() { /* Initialize personalization */ }
}

module.exports = ProfessionalTemplateManager;