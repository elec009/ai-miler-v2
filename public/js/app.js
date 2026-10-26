/**
 * AI Mailer Pro - Modern Desktop-Grade Web Application Controller
 * Real-time WebSocket sync, SMTP latency monitoring, live deliverability scanner,
 * audience cleaner, and responsive template studio.
 */

class AIMailerDashboard {
    constructor() {
        this.currentSection = 'dashboard';
        this.smtpServers = [];
        this.emails = [];
        this.templates = {};
        this.config = {};
        this.isRunning = false;
        this.currentSpeed = 'balanced';
        this.soundEnabled = true;
        this.logs = [];
        this.ws = null;
        this.previewMode = 'desktop';

        // SMTP Inbox Tester & Filter State
        this.checkerResults = [];
        this.checkerRunning = false;
        this.checkerFilter = 'all';
        this.workingSmtps = [];

        // Mailbox Activity Monitor & Live IMAP Subscription State
        this.monitorResults = [];
        this.monitorRunning = false;
        this.monitorFilter = 'all';
        this.monitorKeywords = [];
        this.activeSubscriptionAccount = null;
        this.subscriptionEvents = [];
        this.selectedInspectAccount = null;
        this.selectedInspectMessage = null;
        this.monitorConcurrency = 10;
        this.monitorStartTime = 0;

        // Combo SMTP Hunter State
        this.hunterResults = [];
        this.hunterRunning = false;
        this.hunterFilter = 'all';

        // Spam trigger vocabulary database
        this.spamKeywords = [
            '100% free', 'act now', 'apply now', 'as seen on', 'bargain', 'beneficiary',
            'best price', 'big bucks', 'billion dollars', 'bonus', 'buy direct', 'call now',
            'cancel at any time', 'cash bonus', 'cash prize', 'casino', 'certified',
            'cheap', 'claim now', 'clearance', 'click below', 'click here now',
            'compare rates', 'congratulations', 'credit card offers', 'cures',
            'dear friend', 'direct email', 'direct marketing', 'discount',
            'double your income', 'earn extra cash', 'earn money', 'eliminate debt',
            'exclusive deal', 'expect to earn', 'extra income', 'fast cash',
            'financial freedom', 'free consultation', 'free gift', 'free info',
            'free membership', 'free money', 'free preview', 'free sample',
            'free trial', 'full refund', 'get out of debt', 'get paid',
            'giveaway', 'guaranteed', 'hidden assets', 'income from home',
            'increase sales', 'instant', 'investment', 'join millions',
            'limited time', 'lowest price', 'make money', 'millionaire',
            'miracle', 'money back', 'mortgage rates', 'multi-level marketing',
            'no catch', 'no cost', 'no credit check', 'no experience',
            'no fees', 'no gimmick', 'no hidden costs', 'no obligation',
            'no purchase necessary', 'no risk', 'no strings attached',
            'not spam', 'now only', 'obligation', 'once in a lifetime',
            'one time', 'online marketing', 'open immediately', 'order now',
            'pennies a day', 'potential earnings', 'prize', 'promise',
            'pure profit', 'refund', 'remove', 'reverse aging', 'risk-free',
            'satisfaction guaranteed', 'save big', 'save money', 'score',
            'see for yourself', 'special promotion', 'stainless steel',
            'stop snoring', 'terms and conditions', 'this isn\'t spam',
            'time limited', 'unlimited', 'unsolicited', 'urgent',
            'valuable', 'viagra', 'vicodin', 'warranty', 'weight loss',
            'while supplies last', 'win', 'winner', 'winning', 'work from home'
        ];

        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupEventListeners();
        this.setupMonitorEventListeners();
        this.setupHunterEventListeners();
        this.setupDropzone();
        this.setupWebSocket();

        // Load application data in parallel
        await Promise.allSettled([
            this.loadStatus(),
            this.loadStatistics(),
            this.loadConfig(),
            this.loadSmtp(),
            this.loadEmails(),
            this.loadTemplates(),
            this.loadLogs()
        ]);

        // Auto-refresh interval (every 10s for stats)
        setInterval(() => {
            if (!this.isRunning) {
                this.loadStatistics(true);
            }
        }, 10000);

        console.log('AI Mailer Pro initialized successfully.');
    }

    /* ==========================================================================
       Navigation & Section Management
       ========================================================================== */

    setupNavigation() {
        const navItems = document.querySelectorAll('.app-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                if (section) {
                    this.switchSection(section);
                }
            });
        });
    }

    switchSection(sectionId) {
        this.currentSection = sectionId;

        // Update nav items active state
        document.querySelectorAll('.app-nav-item').forEach(el => {
            if (el.dataset.section === sectionId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // Update section visibility
        document.querySelectorAll('.app-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const targetSec = document.getElementById(`section-${sectionId}`);
        if (targetSec) {
            targetSec.classList.add('active');
        }

        // Section-specific refresh triggers
        if (sectionId === 'templates') {
            this.updateTemplateEditor();
        } else if (sectionId === 'smtp') {
            this.renderSmtpCards();
        } else if (sectionId === 'emails') {
            this.analyzeEmailList();
        } else if (sectionId === 'inbox-tester') {
            this.updateCheckerLineCount();
            this.renderCheckerResults();
        } else if (sectionId === 'mailbox-monitor') {
            this.updateMonitorLineCount();
            this.renderMonitorResults();
        } else if (sectionId === 'combo-hunter') {
            this.updateHunterLineCount();
            this.renderHunterResults();
        }
    }

    /* ==========================================================================
       WebSocket Connection & Real-time Telemetry
       ========================================================================== */

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('Telemetry WebSocket connected.');
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (e) {
                    console.error('Error parsing WS message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed. Reconnecting in 3s...');
                setTimeout(() => this.setupWebSocket(), 3000);
            };

            this.ws.onerror = (err) => {
                console.warn('WebSocket error:', err);
            };
        } catch (e) {
            console.error('WebSocket init error:', e);
        }
    }

    handleWebSocketMessage(msg) {
        if (msg.type === 'progress') {
            this.updateProgress(msg.data);
        } else if (msg.type === 'log') {
            this.appendLogEntry('info', msg.data);
        } else if (msg.type === 'error') {
            this.appendLogEntry('error', msg.data);
        } else if (msg.type === 'status') {
            this.setRunningState(msg.data.running);
            if (!msg.data.running) {
                this.playChime('finish');
                this.showToast('Campaign execution completed.', 'info');
                this.loadStatistics();
            }
        } else if (msg.type === 'spam-alert') {
            this.showSpamAlertModal(msg.data);
            this.showToast(msg.data?.message || 'CRITICAL: Letter dropped into Spam / Not In Box!', 'error');
            this.setRunningState(false);
        } else if (msg.type === 'inbox-hit') {
            this.playChime('inbox');
            this.showToast(`[Smart Guard] \u2705 Verified INBOX: ${msg.data.host}:${msg.data.port}`, 'success');
        } else if (msg.type === 'spam-drop') {
            this.playChime('error');
            this.showToast(`[Smart Guard] \u26A0\uFE0F Quarantined to ${msg.data.folder || 'Spam'}: ${msg.data.host}`, 'warning');
        } else if (msg.type === 'smtp-checker-progress') {
            this.handleCheckerProgress(msg.data);
        } else if (msg.type === 'smtp-checker-finished') {
            this.handleCheckerFinished(msg.data);
        } else if (msg.type === 'monitor-progress') {
            this.handleMonitorProgress(msg.data);
        } else if (msg.type === 'monitor-finished') {
            this.handleMonitorFinished(msg.data);
        } else if (msg.type === 'monitor-subscription-event') {
            this.handleSubscriptionEvent(msg.data);
        } else if (msg.type === 'monitor-subscription-stopped') {
            this.handleSubscriptionStopped(msg.data);
        } else if (msg.type === 'combo-hunter-progress') {
            this.handleHunterProgress(msg.data);
        } else if (msg.type === 'combo-hunter-hit') {
            this.handleHunterHit(msg.data);
        } else if (msg.type === 'combo-hunter-delivery-update') {
            this.handleHunterDeliveryUpdate(msg.data);
        } else if (msg.type === 'combo-hunter-done') {
            this.handleHunterDone(msg.data);
        }
    }

    /* ==========================================================================
       Audio Feedback (Synthetic Web Audio API)
       ========================================================================== */

    playChime(type = 'click') {
        if (!this.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
                osc.start();
                osc.stop(ctx.currentTime + 0.08);
            } else if (type === 'success') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            } else if (type === 'inbox') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
                osc.frequency.setValueAtTime(739.99, ctx.currentTime + 0.09); // F#5
                osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.18); // A5
                gain.gain.setValueAtTime(0.16, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
            } else if (type === 'spam-alarm') {
                this.startSpamAlarmLoop();
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(240, ctx.currentTime);
                osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            } else if (type === 'finish') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
            }
        } catch (e) {}
    }

    startSpamAlarmLoop() {
        this.stopSpamAlarm();
        if (!this.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.alarmAudioContext = ctx;
            let count = 0;
            const playSirenBurst = () => {
                if (!this.alarmAudioContext || count >= 16) {
                    this.stopSpamAlarm();
                    return;
                }
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sawtooth';
                const freq = (count % 2 === 0) ? 880 : 554;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0.18, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
                osc.start();
                osc.stop(ctx.currentTime + 0.22);
                count++;
            };
            playSirenBurst();
            this.spamAlarmTimer = setInterval(playSirenBurst, 250);
        } catch (e) {
            console.warn('Spam alarm error:', e);
        }
    }

    stopSpamAlarm() {
        if (this.spamAlarmTimer) {
            clearInterval(this.spamAlarmTimer);
            this.spamAlarmTimer = null;
        }
        if (this.alarmAudioContext) {
            try { this.alarmAudioContext.close(); } catch (e) {}
            this.alarmAudioContext = null;
        }
    }

    showSpamAlertModal(data = {}) {
        this.playChime('spam-alarm');
        const modalEl = document.getElementById('spamAlertModal');
        if (!modalEl) return;
        
        const titleEl = document.getElementById('spamAlertTitle');
        const msgEl = document.getElementById('spamAlertMessage');
        if (titleEl) {
            titleEl.textContent = data.title || `${data.testedCount || 0} SMTPs Tested: 0 Landed in INBOX`;
        }
        if (msgEl && data.message) {
            msgEl.textContent = data.message;
        }

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }

    /* ==========================================================================
       DOM Event Handlers Setup
       ========================================================================== */

    setupEventListeners() {
        // Sound toggle
        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                this.soundEnabled = !this.soundEnabled;
                const icon = document.getElementById('soundIcon');
                if (icon) {
                    icon.className = this.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute text-danger';
                }
                this.showToast(`Sound alerts ${this.soundEnabled ? 'enabled' : 'disabled'}`, 'info');
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const icon = document.getElementById('refreshIcon');
                if (icon) icon.classList.add('fa-spin');
                await Promise.allSettled([
                    this.loadStatus(),
                    this.loadStatistics(),
                    this.loadConfig(),
                    this.loadSmtp(),
                    this.loadEmails(),
                    this.loadTemplates()
                ]);
                setTimeout(() => {
                    if (icon) icon.classList.remove('fa-spin');
                }, 600);
                this.showToast('Workspace refreshed', 'info');
            });
        }

        // Campaign controls
        document.getElementById('startBtn')?.addEventListener('click', () => this.startCampaign(false));
        document.getElementById('stopBtn')?.addEventListener('click', () => this.stopCampaign());
        document.getElementById('dryRunBtn')?.addEventListener('click', () => this.startCampaign(true));

        // Speed preset pills
        document.querySelectorAll('.speed-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setSpeedPreset(btn.dataset.speed);
            });
        });

        // Quick Test Send Modal
        document.getElementById('quickTestModalBtn')?.addEventListener('click', () => this.openQuickTestModal());
        document.getElementById('executeTestSendBtn')?.addEventListener('click', () => this.executeQuickTestSend());

        // SMTP Hub Controls
        document.getElementById('testAllSmtpBtn')?.addEventListener('click', () => this.testAllSmtp());
        document.getElementById('openAddSmtpModalBtn')?.addEventListener('click', () => this.openSmtpModal());
        document.getElementById('saveSmtpModalBtn')?.addEventListener('click', () => this.saveSmtpFromModal());
        document.getElementById('testSingleSmtpModalBtn')?.addEventListener('click', () => this.testSingleSmtpModal());
        document.getElementById('toggleSmtpBulkBtn')?.addEventListener('click', () => {
            const el = document.getElementById('smtpBulkContainer');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('saveRawSmtpBtn')?.addEventListener('click', () => this.saveRawSmtp());

        document.getElementById('smartCleanBtn')?.addEventListener('click', () => this.cleanEmailList(true));
        document.getElementById('saveEmailsBtn')?.addEventListener('click', () => this.saveEmailList());
        document.getElementById('clearEmailsBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.clearAllEmails();
        });
        document.getElementById('emailsTextarea')?.addEventListener('input', () => this.analyzeEmailList());

        // Template Studio Controls
        document.getElementById('templateLangSelect')?.addEventListener('change', () => this.onTemplateCategoryChange());
        document.getElementById('templateTypeSelect')?.addEventListener('change', () => this.onTemplateCategoryChange());
        document.getElementById('templateFileSelect')?.addEventListener('change', () => this.onTemplateFileChange());
        document.getElementById('templateEditor')?.addEventListener('input', () => this.onTemplateEditorInput());
        document.getElementById('saveCurrentTemplateBtn')?.addEventListener('click', () => this.saveCurrentTemplate());
        document.getElementById('loadPresetModalBtn')?.addEventListener('click', () => this.openPresetsModal());

        // Track last focused input/textarea across the entire app
        document.addEventListener('focusin', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                this.lastActiveInput = e.target;
            }
        });

        // Token Insertion Chips
        document.querySelectorAll('.token-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                this.insertTokenIntoEditor(chip.dataset.token, chip);
            });
        });

        // Template Preview Desktop / Mobile Toggles
        document.getElementById('previewDesktopBtn')?.addEventListener('click', () => {
            this.previewMode = 'desktop';
            document.getElementById('previewDesktopBtn').classList.add('active');
            document.getElementById('previewMobileBtn').classList.remove('active');
            document.getElementById('previewFrameWrap').classList.remove('mobile-view');
        });
        document.getElementById('previewMobileBtn')?.addEventListener('click', () => {
            this.previewMode = 'mobile';
            document.getElementById('previewMobileBtn').classList.add('active');
            document.getElementById('previewDesktopBtn').classList.remove('active');
            document.getElementById('previewFrameWrap').classList.add('mobile-view');
        });

        // BCC Settings
        document.getElementById('saveBccSettingsBtn')?.addEventListener('click', () => this.saveBccSettings());

        // System Settings
        document.getElementById('saveSystemConfigBtn')?.addEventListener('click', () => this.saveSystemConfig());

        // Live Terminal Controls
        document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
            this.logs = [];
            this.renderLogs();
        });
        document.getElementById('copyLogsBtn')?.addEventListener('click', () => {
            const text = this.logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n');
            navigator.clipboard.writeText(text);
            this.showToast('Terminal logs copied to clipboard', 'info');
        });
        document.getElementById('logSearchInput')?.addEventListener('input', () => this.renderLogs());
        document.getElementById('logLevelFilter')?.addEventListener('change', () => this.renderLogs());

        // SMTP Inbox Tester & Server Verifier Controls
        const rawInput = document.getElementById('checkerRawSmtpInput');
        if (rawInput) {
            rawInput.addEventListener('input', () => this.updateCheckerLineCount());
        }

        document.getElementById('checkerPasteBtn')?.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                    const el = document.getElementById('checkerRawSmtpInput');
                    el.value = (el.value ? el.value.trim() + '\n' : '') + text.trim();
                    this.updateCheckerLineCount();
                    this.showToast('Pasted SMTP credentials from clipboard', 'info');
                }
            } catch (err) {
                this.showToast('Please paste directly into the box using Ctrl+V', 'warning');
            }
        });

        document.getElementById('checkerClearBtn')?.addEventListener('click', () => {
            const el = document.getElementById('checkerRawSmtpInput');
            if (el) el.value = '';
            this.updateCheckerLineCount();
            this.showToast('Raw credentials cleared', 'info');
        });

        document.getElementById('startCheckerBtn')?.addEventListener('click', () => this.startSmtpInboxTest());
        document.getElementById('stopCheckerBtn')?.addEventListener('click', () => this.stopSmtpInboxTest());
        document.getElementById('saveWorkingSmtpBtn')?.addEventListener('click', () => this.saveWorkingSmtpToHub());
        document.getElementById('exportWorkingSmtpBtn')?.addEventListener('click', () => this.exportWorkingSmtps());

        // Result filters
        ['all', 'inbox', 'spam', 'failed'].forEach(type => {
            document.getElementById(`filterBtn${type.charAt(0).toUpperCase() + type.slice(1)}`)?.addEventListener('click', (e) => {
                document.querySelectorAll('#section-inbox-tester [data-filter]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.checkerFilter = type;
                this.renderCheckerResults();
            });
        });
    }

    /* ==========================================================================
       Dropzone & File Uploads
       ========================================================================== */

    setupDropzone() {
        const dropzone = document.getElementById('emailDropzone');
        const fileInput = document.getElementById('emailFileInput');
        if (!dropzone || !fileInput) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                this.handleEmailFileUpload(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleEmailFileUpload(e.target.files[0]);
            }
        });
    }

    handleEmailFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            // Parse CSV or raw lines
            const lines = text.split(/[\r\n,;]+/).map(s => s.trim()).filter(s => s && s.includes('@'));
            const textarea = document.getElementById('emailsTextarea');
            if (textarea) {
                const current = textarea.value.trim();
                textarea.value = current ? current + '\n' + lines.join('\n') : lines.join('\n');
                this.analyzeEmailList();
                this.showToast(`Imported ${lines.length} emails from ${file.name}`, 'success');
            }
        };
        reader.readAsText(file);
    }

    /* ==========================================================================
       Status & Statistics
       ========================================================================== */

    async loadStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            this.setRunningState(data.running);
            if (data.progress) {
                this.updateProgress(data.progress);
            }
        } catch (e) {
            console.error('Error loading status:', e);
        }
    }

    async loadStatistics(quiet = false) {
        try {
            const res = await fetch('/api/statistics');
            const data = await res.json();
            
            document.getElementById('dashTotalEmails').textContent = (data.totalEmails || 0).toLocaleString();
            document.getElementById('dashTotalSmtp').textContent = (data.totalSmtpServers || 0).toLocaleString();
            document.getElementById('sidebarEmailsBadge').textContent = (data.totalEmails || 0).toLocaleString();
            document.getElementById('sidebarSmtpBadge').textContent = (data.totalSmtpServers || 0).toLocaleString();

            if (data.progress) {
                this.updateProgress(data.progress);
            }
        } catch (e) {
            if (!quiet) console.error('Error loading stats:', e);
        }
    }

    setRunningState(running, isDryRun = false) {
        this.isRunning = running;
        const pill = document.getElementById('engineStatusPill');
        const text = document.getElementById('engineStatusText');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const dryRunBtn = document.getElementById('dryRunBtn');

        if (running) {
            if (pill) {
                pill.className = isDryRun ? 'engine-status-pill dry-run' : 'engine-status-pill running';
            }
            if (text) text.textContent = isDryRun ? 'DRY-RUN SIMULATION' : 'CAMPAIGN BROADCASTING';
            if (startBtn) startBtn.disabled = true;
            if (dryRunBtn) dryRunBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
        } else {
            if (pill) pill.className = 'engine-status-pill stopped';
            if (text) text.textContent = 'SYSTEM IDLE';
            if (startBtn) startBtn.disabled = false;
            if (dryRunBtn) dryRunBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
        }
    }

    updateProgress(progress) {
        if (!progress) return;
        const sent = Number(progress.sent) || 0;
        const failed = Number(progress.failed) || 0;
        const total = (Number(progress.total) > 0)
            ? Number(progress.total)
            : ((this.emails && this.emails.length > 0) ? this.emails.length : (sent + failed || 1));
        const totalDone = sent + failed;
        const percent = total > 0 ? Math.min(100, Math.round((totalDone / total) * 100)) : 0;

        const sentEl = document.getElementById('sentCount');
        const failedEl = document.getElementById('failedCount');
        const remEl = document.getElementById('remainingCount');
        const barEl = document.getElementById('progressBar');
        const lblEl = document.getElementById('progressPercentLabel');
        const rateEl = document.getElementById('dashDeliveryRate');

        if (sentEl) sentEl.textContent = sent.toLocaleString();
        if (failedEl) failedEl.textContent = failed.toLocaleString();
        if (remEl) remEl.textContent = Math.max(0, total - totalDone).toLocaleString();
        if (barEl) barEl.style.width = `${percent}%`;
        if (lblEl) lblEl.textContent = `${percent}% Complete`;

        if (totalDone > 0 && rateEl) {
            const successRate = Math.round((sent / totalDone) * 100);
            rateEl.textContent = `${successRate}%`;
        }
    }

    /* ==========================================================================
       Campaign Execution
       ========================================================================== */

    async startCampaign(dryRun = false, extraOpts = {}) {
        this.playChime('click');
        try {
            // Read wizard test settings as default fallback if not explicitly passed
            const wizardEmail = document.getElementById('wizardTestEmail')?.value?.trim();
            const wizardPass = document.getElementById('wizardTestPassword')?.value?.trim();
            const wizardGuard = document.getElementById('wizardSmartInboxGuard')?.checked;
            const wizardInterval = parseInt(document.getElementById('wizardTestInterval')?.value, 10);

            const testEmail = extraOpts.testEmail || wizardEmail || (this.config?.testEmail ? (typeof this.config.testEmail === 'string' ? this.config.testEmail : this.config.testEmail.email) : '');
            const testPassword = extraOpts.testPassword !== undefined ? extraOpts.testPassword : (wizardPass || (this.config?.testEmail && typeof this.config.testEmail === 'object' ? this.config.testEmail.password : ''));
            const smartInboxGuard = extraOpts.smartInboxGuard !== undefined ? extraOpts.smartInboxGuard : (wizardGuard !== undefined ? wizardGuard : Boolean(testPassword));
            const testInterval = extraOpts.testInterval || wizardInterval || (this.config?.testEmail && typeof this.config.testEmail === 'object' ? this.config.testEmail.interval : 20);

            const payload = { 
                dryRun, 
                testEmail, 
                testPassword, 
                smartInboxGuard, 
                testInterval,
                ...extraOpts 
            };
            const res = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                this.setRunningState(true, dryRun);
                this.showToast(dryRun ? 'Dry run simulation started' : 'Live email campaign started!', 'success');
                this.playChime('success');
            } else {
                const detailMsg = (data.details && Array.isArray(data.details) && data.details.length > 0)
                    ? `: ${data.details.join(', ')}`
                    : '';
                const fullMsg = `${data.error || 'Failed to start campaign'}${detailMsg}`;
                this.showToast(fullMsg, 'error');
                this.playChime('error');
            }
        } catch (e) {
            this.showToast(e.message, 'error');
            this.playChime('error');
        }
    }

    async stopCampaign() {
        this.playChime('click');
        try {
            const res = await fetch('/api/stop', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.setRunningState(false);
                this.showToast('Campaign aborted gracefully.', 'warning');
            } else {
                this.showToast(data.error || 'Failed to stop campaign', 'error');
            }
        } catch (e) {
            this.showToast(e.message, 'error');
        }
    }

    toggleWizardPassVisibility() {
        const passInput = document.getElementById('wizardTestPassword');
        const icon = document.getElementById('wizardPassEyeIcon');
        if (!passInput || !icon) return;
        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.className = 'fas fa-eye-slash text-warning';
        } else {
            passInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    async testWizardInboxPlacement() {
        const testEmail = document.getElementById('wizardTestEmail')?.value?.trim();
        const testPassword = document.getElementById('wizardTestPassword')?.value?.trim();
        const statusEl = document.getElementById('wizardInboxTestStatus');
        const btn = document.getElementById('btnWizardTestInbox');

        if (!testEmail || !testEmail.includes('@')) {
            this.showToast('Please enter a valid Test Email first.', 'warning');
            return;
        }
        if (!testPassword) {
            this.showToast('Please enter Test Email Password to enable IMAP verification.', 'warning');
            return;
        }

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.className = 'small mt-1 text-info text-center';
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Testing candidate SMTPs & checking IMAP...';
        }
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/smart-inbox-qualify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetEmail: testEmail,
                    targetPassword: testPassword,
                    sampleCount: 2
                })
            });
            const data = await res.json();
            if (data.success) {
                if (data.inboxHits > 0) {
                    this.playChime('inbox');
                    if (statusEl) {
                        statusEl.className = 'small mt-1 text-success text-center fw-bold';
                        statusEl.innerHTML = `<i class="fas fa-check-circle me-1"></i> Verified! ${data.inboxHits} SMTP reached INBOX. Stored to hitters.`;
                    }
                    this.showToast(`Preflight passed: Verified INBOX hitter saved. Ready to launch.`, 'success');
                } else {
                    if (statusEl) {
                        statusEl.className = 'small mt-1 text-danger text-center fw-bold';
                        statusEl.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i> Alert: 0 of ${data.testedCount} SMTPs reached INBOX!`;
                    }
                    this.showSpamAlertModal({
                        title: 'Letter Dropped in Spam / Not In Box!',
                        message: `Tested ${data.testedCount} candidate SMTPs, but none reached INBOX. The email dropped into Spam folder or was not in box. Campaign halted!`
                    });
                }
            } else {
                if (statusEl) {
                    statusEl.className = 'small mt-1 text-danger text-center';
                    statusEl.textContent = data.error || 'Preflight check failed.';
                }
                this.showToast(data.error || 'Preflight check failed', 'error');
            }
        } catch (e) {
            if (statusEl) {
                statusEl.className = 'small mt-1 text-danger text-center';
                statusEl.textContent = e.message;
            }
            this.showToast(e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    startCampaignFromWizard() {
        const sendDelay = parseInt(document.getElementById('wizardSendDelay').value, 10) || 3000;
        const cooldown = parseInt(document.getElementById('wizardCooldown').value, 10) || 5000;
        const testEmail = document.getElementById('wizardTestEmail').value.trim();
        const testPassword = (document.getElementById('wizardTestPassword')?.value || '').trim();
        const smartInboxGuard = document.getElementById('wizardSmartInboxGuard')?.checked || false;
        const testInterval = parseInt(document.getElementById('wizardTestInterval').value, 10) || 20;
        const defaultLang = document.getElementById('wizardLangSelect').value;

        // Auto update config before start
        this.updateConfigSilent({
            sendDelayMs: sendDelay,
            smtpCooldownMs: cooldown,
            defaultLang: defaultLang,
            testEmail: testEmail ? { 
                email: testEmail, 
                password: testPassword, 
                interval: testInterval, 
                smartInboxFilter: smartInboxGuard || Boolean(testPassword) 
            } : null
        }).then(() => {
            this.switchSection('dashboard');
            this.startCampaign(false, {
                testEmail,
                testPassword,
                smartInboxGuard: smartInboxGuard || Boolean(testPassword),
                testInterval
            });
        });
    }

    setSpeedPreset(speed) {
        this.currentSpeed = speed;
        let delay = 3000;
        let cooldown = 5000;

        if (speed === 'stealth') {
            delay = 10000;
            cooldown = 15000;
            this.showToast('Stealth Mode: Safe pacing (10s delay, 15s cooldown)', 'info');
        } else if (speed === 'turbo') {
            delay = 600;
            cooldown = 1500;
            this.showToast('Turbo Mode: High speed broadcast (600ms delay)', 'warning');
        } else {
            this.showToast('Balanced Mode: Standard rotation (3s delay, 5s cooldown)', 'info');
        }

        this.updateConfigSilent({ sendDelayMs: delay, smtpCooldownMs: cooldown });
    }

    /* ==========================================================================
       SMTP Node Management
       ========================================================================== */

    async loadSmtp() {
        try {
            const res = await fetch('/api/smtp');
            this.smtpServers = await res.json();
            this.renderSmtpCards();
            this.populateQuickTestSmtpSelect();
        } catch (e) {
            console.error('Error loading SMTP servers:', e);
        }
    }

    renderSmtpCards() {
        const container = document.getElementById('smtpCardsGrid');
        const rawTextarea = document.getElementById('smtpRawTextarea');
        const summary = document.getElementById('smtpCountSummary');
        if (!container) return;

        summary.textContent = `${this.smtpServers.length} SMTP nodes configured for load-balancing`;

        // Update raw textarea with domains support (host|port|user|pass|domains)
        if (rawTextarea) {
            rawTextarea.value = this.smtpServers.map(s => {
                const domainsStr = Array.isArray(s.domains) && s.domains.length > 0
                    ? `|${s.domains.join(',')}`
                    : (typeof s.domains === 'string' && s.domains.trim() ? `|${s.domains.trim()}` : '');
                return `${s.host}|${s.port}|${s.user}|${s.pass}${domainsStr}`;
            }).join('\n');
        }

        if (this.smtpServers.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center p-4 text-muted bg-dark rounded border border-subtle">
                    <i class="fas fa-server fa-2x mb-2"></i>
                    <p class="mb-0">No SMTP servers added. Click "Add SMTP Node" to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.smtpServers.map((s, idx) => {
            const domainsList = Array.isArray(s.domains)
                ? s.domains
                : (typeof s.domains === 'string' && s.domains.trim() ? s.domains.split(',').map(d => d.trim()).filter(Boolean) : []);

            const domainsBadgeHtml = domainsList.length > 0 ? `
                <div class="mt-2 pt-2 border-top border-subtle">
                    <div class="d-flex align-items-center justify-content-between mb-1">
                        <span class="small text-muted" style="font-size: 0.73rem;"><i class="fas fa-bullseye text-cyan me-1"></i><strong>Verified Target Domains (${domainsList.length}):</strong></span>
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                        ${domainsList.map(d => `<span class="badge bg-dark text-cyan border border-cyan-subtle" style="font-size: 0.7rem; padding: 2px 6px;"><i class="fas fa-check-circle text-success me-1"></i>${this.escapeHtml(d)}</span>`).join('')}
                    </div>
                </div>
            ` : `
                <div class="mt-2 pt-2 border-top border-subtle">
                    <span class="text-muted" style="font-size: 0.72rem;"><i class="fas fa-globe me-1"></i>Universal relay (all recipient domains)</span>
                </div>
            `;

            return `
            <div class="smtp-card" id="smtp-card-${idx}">
                <div class="smtp-card-header">
                    <div class="smtp-host-title">
                        <i class="fas fa-network-wired text-cyan"></i>
                        <span>${this.escapeHtml(s.host)}</span>
                    </div>
                    <span class="ping-pill untested" id="ping-pill-${idx}">
                        <i class="fas fa-circle-notch"></i> Untested
                    </span>
                </div>
                <div class="small text-muted mb-2">
                    <div><strong>Port:</strong> ${s.port} &bull; <strong>SSL/TLS:</strong> ${s.port == 465 ? 'SSL' : 'STARTTLS'}</div>
                    <div class="text-truncate"><strong>User:</strong> ${this.escapeHtml(s.user)}</div>
                </div>
                ${domainsBadgeHtml}
                <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top border-subtle">
                    <button class="btn-app btn-app-outline btn-app-sm" onclick="dashboard.testSingleSmtp(${idx})">
                        <i class="fas fa-bolt text-warning"></i> Ping Test
                    </button>
                    <div>
                        <button class="btn-app btn-app-outline btn-app-sm me-1" onclick="dashboard.editSmtp(${idx})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-app btn-app-outline btn-app-sm text-danger" onclick="dashboard.deleteSmtp(${idx})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    async testSingleSmtp(idx) {
        const s = this.smtpServers[idx];
        if (!s) return;
        const pill = document.getElementById(`ping-pill-${idx}`);
        if (pill) {
            pill.className = 'ping-pill testing';
            pill.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        }

        try {
            const res = await fetch('/api/smtp/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(s)
            });
            const data = await res.json();
            if (data.success) {
                if (pill) {
                    pill.className = 'ping-pill ok';
                    pill.innerHTML = `<i class="fas fa-check-circle"></i> ${data.latencyMs}ms`;
                }
                this.showToast(`SMTP Node #${idx + 1} connected in ${data.latencyMs}ms`, 'success');
            } else {
                if (pill) {
                    pill.className = 'ping-pill failed';
                    pill.innerHTML = '<i class="fas fa-times-circle"></i> Failed';
                }
                this.showToast(`SMTP Node #${idx + 1} error: ${data.error}`, 'error');
            }
        } catch (e) {
            if (pill) {
                pill.className = 'ping-pill failed';
                pill.innerHTML = '<i class="fas fa-times-circle"></i> Error';
            }
        }
    }

    async testAllSmtp() {
        this.showToast('Starting health check across all SMTP nodes...', 'info');
        try {
            const res = await fetch('/api/smtp/test-all', { method: 'POST' });
            const data = await res.json();
            if (data.results) {
                data.results.forEach((r, idx) => {
                    const pill = document.getElementById(`ping-pill-${idx}`);
                    if (pill) {
                        if (r.status === 'ok') {
                            pill.className = 'ping-pill ok';
                            pill.innerHTML = `<i class="fas fa-check-circle"></i> ${r.latencyMs}ms`;
                        } else {
                            pill.className = 'ping-pill failed';
                            pill.innerHTML = '<i class="fas fa-times-circle"></i> Failed';
                        }
                    }
                });
                const okCount = data.results.filter(r => r.status === 'ok').length;
                this.showToast(`Verification complete: ${okCount}/${data.results.length} nodes operational`, 'success');
                this.playChime('success');
            }
        } catch (e) {
            this.showToast('SMTP batch test error: ' + e.message, 'error');
        }
    }

    openSmtpModal(editIdx = -1) {
        document.getElementById('smtpEditIndex').value = editIdx;
        const title = document.getElementById('smtpModalTitle');
        const feedback = document.getElementById('smtpTestFeedback');
        if (feedback) feedback.style.display = 'none';

        if (editIdx >= 0 && this.smtpServers[editIdx]) {
            const s = this.smtpServers[editIdx];
            title.innerHTML = '<i class="fas fa-edit text-cyan me-2"></i> Edit SMTP Node';
            document.getElementById('smtpHostInput').value = s.host;
            document.getElementById('smtpPortInput').value = s.port;
            document.getElementById('smtpUserInput').value = s.user;
            document.getElementById('smtpPassInput').value = s.pass;
            const domainsInput = document.getElementById('smtpDomainsInput');
            if (domainsInput) {
                domainsInput.value = Array.isArray(s.domains) ? s.domains.join(', ') : (s.domains || '');
            }
        } else {
            title.innerHTML = '<i class="fas fa-server text-cyan me-2"></i> Add SMTP Node';
            document.getElementById('smtpHostInput').value = '';
            document.getElementById('smtpPortInput').value = '587';
            document.getElementById('smtpUserInput').value = '';
            document.getElementById('smtpPassInput').value = '';
            const domainsInput = document.getElementById('smtpDomainsInput');
            if (domainsInput) domainsInput.value = '';
        }

        const modal = new bootstrap.Modal(document.getElementById('smtpModal'));
        modal.show();
    }

    editSmtp(idx) {
        this.openSmtpModal(idx);
    }

    async saveSmtpFromModal() {
        const idx = parseInt(document.getElementById('smtpEditIndex').value, 10);
        const host = document.getElementById('smtpHostInput').value.trim();
        const port = document.getElementById('smtpPortInput').value.trim();
        const user = document.getElementById('smtpUserInput').value.trim();
        const pass = document.getElementById('smtpPassInput').value.trim();
        const domainsInput = document.getElementById('smtpDomainsInput');
        const rawDomains = domainsInput ? domainsInput.value.trim() : '';
        const domains = rawDomains ? rawDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean) : [];

        if (!host || !port || !user || !pass) {
            this.showToast('Please fill in all SMTP fields', 'warning');
            return;
        }

        const node = { host, port, user, pass, domains };
        if (idx >= 0) {
            this.smtpServers[idx] = node;
        } else {
            this.smtpServers.push(node);
        }

        await this.syncSmtpToServer();
        bootstrap.Modal.getInstance(document.getElementById('smtpModal'))?.hide();
        this.renderSmtpCards();
        this.showToast('SMTP Node saved successfully', 'success');
    }

    async testSingleSmtpModal() {
        const host = document.getElementById('smtpHostInput').value.trim();
        const port = document.getElementById('smtpPortInput').value.trim();
        const user = document.getElementById('smtpUserInput').value.trim();
        const pass = document.getElementById('smtpPassInput').value.trim();
        const feedback = document.getElementById('smtpTestFeedback');

        if (!host || !port || !user || !pass) {
            this.showToast('Please enter all credentials before testing', 'warning');
            return;
        }

        if (feedback) {
            feedback.style.display = 'block';
            feedback.className = 'mt-3 p-2 rounded small bg-dark text-cyan border border-subtle';
            feedback.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Testing connection to ' + host + '...';
        }

        try {
            const res = await fetch('/api/smtp/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, user, pass })
            });
            const data = await res.json();
            if (data.success) {
                feedback.className = 'mt-3 p-2 rounded small bg-success bg-opacity-25 text-success border border-success';
                feedback.innerHTML = `<i class="fas fa-check-circle me-1"></i> Success! Verified in ${data.latencyMs}ms`;
            } else {
                feedback.className = 'mt-3 p-2 rounded small bg-danger bg-opacity-25 text-danger border border-danger';
                feedback.innerHTML = `<i class="fas fa-times-circle me-1"></i> ${data.error}`;
            }
        } catch (e) {
            if (feedback) {
                feedback.className = 'mt-3 p-2 rounded small bg-danger bg-opacity-25 text-danger border border-danger';
                feedback.innerHTML = `<i class="fas fa-times-circle me-1"></i> ${e.message}`;
            }
        }
    }

    async deleteSmtp(idx) {
        if (!confirm('Are you sure you want to remove this SMTP node?')) return;
        this.smtpServers.splice(idx, 1);
        await this.syncSmtpToServer();
        this.renderSmtpCards();
        this.showToast('SMTP Node removed', 'info');
    }

    async saveRawSmtp() {
        const text = document.getElementById('smtpRawTextarea').value;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
        for (const line of lines) {
            const parts = line.split('|');
            const [host, port, user, pass] = parts;
            if (host && port && user && pass) {
                const rawDomains = parts[4] ? parts[4].trim() : '';
                const domains = rawDomains ? rawDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean) : [];
                parsed.push({ host: host.trim(), port: parseInt(port.trim(), 10), user: user.trim(), pass: pass.trim(), domains });
            }
        }

        this.smtpServers = parsed;
        await this.syncSmtpToServer();
        this.renderSmtpCards();
        document.getElementById('smtpBulkContainer').style.display = 'none';
        this.showToast(`Saved ${parsed.length} SMTP nodes`, 'success');
    }

    async syncSmtpToServer() {
        try {
            await fetch('/api/smtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credentials: this.smtpServers })
            });
            this.loadStatistics(true);
            this.populateQuickTestSmtpSelect();
        } catch (e) {
            this.showToast('Error syncing SMTP list: ' + e.message, 'error');
        }
    }

    /* ==========================================================================
       Audience & Smart Email List Cleaner
       ========================================================================== */

    async loadEmails() {
        try {
            const res = await fetch('/api/emails');
            this.emails = await res.json();
            const textarea = document.getElementById('emailsTextarea');
            if (textarea) {
                textarea.value = this.emails.join('\n');
                this.analyzeEmailList();
            }
        } catch (e) {
            console.error('Error loading emails:', e);
        }
    }

    analyzeEmailList() {
        const textarea = document.getElementById('emailsTextarea');
        if (!textarea) return;

        const rawList = textarea.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const seen = new Set();
        let valid = 0;
        let duplicates = 0;
        const domains = {};

        for (const email of rawList) {
            if (emailRegex.test(email)) {
                if (seen.has(email)) {
                    duplicates++;
                } else {
                    seen.add(email);
                    valid++;
                    const d = email.split('@')[1];
                    domains[d] = (domains[d] || 0) + 1;
                }
            }
        }

        document.getElementById('statTotalEmails').textContent = rawList.length.toLocaleString();
        document.getElementById('statValidEmails').textContent = valid.toLocaleString();
        document.getElementById('statDupEmails').textContent = duplicates.toLocaleString();

        const sortedDomains = Object.entries(domains).sort((a, b) => b[1] - a[1]);
        const topDomain = sortedDomains.length > 0 ? sortedDomains[0][0] : '-';
        document.getElementById('statTopDomain').textContent = topDomain;

        // Render domain chips
        const chipsContainer = document.getElementById('domainChipsContainer');
        if (chipsContainer) {
            if (sortedDomains.length === 0) {
                chipsContainer.innerHTML = '<span class="text-muted small">No valid domains detected yet.</span>';
            } else {
                chipsContainer.innerHTML = sortedDomains.slice(0, 8).map(([domain, count]) => `
                    <span class="domain-breakdown-chip">
                        <span>${this.escapeHtml(domain)}</span>
                        <span class="count">${count}</span>
                    </span>
                `).join('');
            }
        }
    }

    async cleanEmailList(save = false) {
        const textarea = document.getElementById('emailsTextarea');
        if (!textarea) return;

        const rawList = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (rawList.length === 0) {
            this.showToast('Email list is empty', 'warning');
            return;
        }

        this.showToast('Running smart deduplication and syntax cleaning...', 'info');
        try {
            const res = await fetch('/api/emails/clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: rawList, save })
            });
            const data = await res.json();
            if (data.success) {
                textarea.value = data.cleanedEmails.join('\n');
                this.emails = data.cleanedEmails;
                this.analyzeEmailList();
                this.showToast(`Cleaned! Kept ${data.validCount} valid (${data.duplicateCount} duplicates & ${data.invalidCount} invalid removed)`, 'success');
                this.playChime('success');
            }
        } catch (e) {
            this.showToast('Cleaning error: ' + e.message, 'error');
        }
    }

    async saveEmailList() {
        const textarea = document.getElementById('emailsTextarea');
        if (!textarea) return;

        const lines = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
        try {
            await fetch('/api/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: lines })
            });
            this.emails = lines;
            this.loadStatistics(true);
            this.showToast(`Saved ${lines.length} recipient addresses`, 'success');
        } catch (e) {
            this.showToast('Error saving emails: ' + e.message, 'error');
        }
    }

    async clearAllEmails() {
        const textarea = document.getElementById('emailsTextarea');
        if (textarea) {
            textarea.value = '';
        }
        this.emails = [];
        this.analyzeEmailList();

        try {
            await fetch('/api/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: [] })
            });
            this.loadStatistics(true);
            this.showToast('Recipient email list cleared successfully', 'success');
            this.playChime('click');
        } catch (e) {
            this.showToast('Error clearing email list on server: ' + e.message, 'error');
        }
    }

    /* ==========================================================================
       Template Studio & Deliverability AI Scanner
       ========================================================================== */

    async loadTemplates() {
        try {
            const res = await fetch('/api/templates');
            this.templates.letters = await res.json();

            const [subRes, linkRes, footRes] = await Promise.all([
                fetch('/api/subjects'),
                fetch('/api/links'),
                fetch('/api/footers')
            ]);
            this.templates.subjects = await subRes.json();
            this.templates.links = await linkRes.json();
            this.templates.footers = await footRes.json();

            this.onTemplateCategoryChange();
        } catch (e) {
            console.error('Error loading templates:', e);
        }
    }

    updateTemplateEditor() {
        if (!this.templates || !this.templates.letters) {
            this.loadTemplates();
        } else {
            this.onTemplateCategoryChange();
        }
    }

    onTemplateCategoryChange() {
        const lang = document.getElementById('templateLangSelect').value;
        const type = document.getElementById('templateTypeSelect').value;
        const fileSelect = document.getElementById('templateFileSelect');
        if (!fileSelect) return;

        fileSelect.innerHTML = '';
        const group = this.templates[type] || {};
        const items = group[lang] || [];

        if (type === 'letters' || type === 'footers') {
            if (Array.isArray(items) && items.length > 0) {
                items.forEach((item, idx) => {
                    const opt = document.createElement('option');
                    opt.value = item.name;
                    opt.textContent = item.name;
                    fileSelect.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = 'letter1.html';
                opt.textContent = 'letter1.html (New)';
                fileSelect.appendChild(opt);
            }
        } else {
            // subjects or links
            const opt = document.createElement('option');
            opt.value = `${type}.txt`;
            opt.textContent = `${type}.txt (${items.length || 0} entries)`;
            fileSelect.appendChild(opt);
        }

        this.onTemplateFileChange();
    }

    onTemplateFileChange() {
        const lang = document.getElementById('templateLangSelect').value;
        const type = document.getElementById('templateTypeSelect').value;
        const fileName = document.getElementById('templateFileSelect').value;
        const editor = document.getElementById('templateEditor');
        if (!editor) return;

        let content = '';
        const group = this.templates[type] || {};
        const items = group[lang] || [];

        if (type === 'letters' || type === 'footers') {
            const match = Array.isArray(items) ? items.find(i => i.name === fileName) : null;
            content = match ? match.content : '<!-- New Template -->\n<h1>Hello {name}</h1>\n<p>Click here: {link}</p>';
        } else if (type === 'subjects' || type === 'links') {
            content = Array.isArray(items) ? items.join('\n') : '';
        }

        editor.value = content;
        this.onTemplateEditorInput();
    }

    onTemplateEditorInput() {
        const editor = document.getElementById('templateEditor');
        if (!editor) return;
        const content = editor.value;

        // Update char counter
        document.getElementById('editorCharCount').textContent = `${content.length} chars`;

        // Run live deliverability inspector
        this.inspectDeliverability(content);

        // Update live iframe preview
        this.renderLivePreview(content);
    }

    insertTokenIntoEditor(token, chipElement = null) {
        // Find target input/textarea: active element, last recorded input, or default to templateEditor
        let target = this.lastActiveInput;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            target = active;
        }
        if (!target || !document.body.contains(target)) {
            target = document.getElementById('templateEditor');
        }
        if (!target) return;

        const start = target.selectionStart !== undefined ? target.selectionStart : (target.value ? target.value.length : 0);
        const end = target.selectionEnd !== undefined ? target.selectionEnd : (target.value ? target.value.length : 0);
        const text = target.value || '';
        target.value = text.substring(0, start) + token + text.substring(end);
        target.selectionStart = target.selectionEnd = start + token.length;
        target.focus();

        // Dispatch input/change events so preview and char counter update
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        if (target.id === 'templateEditor') {
            this.onTemplateEditorInput();
        }

        // Copy token to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(token).catch(() => {});
        }

        // Visual feedback
        if (chipElement) {
            chipElement.classList.add('token-chip-copied');
            setTimeout(() => chipElement.classList.remove('token-chip-copied'), 700);
        }

        const feedback = document.getElementById('tokenInsertFeedback');
        if (feedback) {
            feedback.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i> Inserted <code>${token}</code> at cursor! (Copied)`;
            clearTimeout(this._tokenFeedbackTimeout);
            this._tokenFeedbackTimeout = setTimeout(() => {
                feedback.innerHTML = `<i class="fas fa-mouse-pointer me-1 text-cyan"></i> Click chip to insert & copy`;
            }, 2500);
        }
    }

    inspectDeliverability(text) {
        const lower = text.toLowerCase();
        let score = 100;
        const detectedSpamWords = [];

        // 1. Check spam keywords
        for (const kw of this.spamKeywords) {
            if (lower.includes(kw)) {
                detectedSpamWords.push(kw);
                score -= 8;
            }
        }

        // 2. Check uppercase ratio
        const letters = text.replace(/[^a-zA-Z]/g, '');
        if (letters.length > 20) {
            const uppers = text.replace(/[^A-Z]/g, '');
            const ratio = uppers.length / letters.length;
            if (ratio > 0.35) {
                score -= 15;
            }
        }

        // 3. Check excessive punctuation
        if (/!{2,}/.test(text)) score -= 10;
        if (/\${2,}/.test(text)) score -= 10;

        // 4. Check for opt-out or unsubscribe
        const hasUnsub = lower.includes('unsubscribe') || lower.includes('{footer}') || lower.includes('abmelden');
        if (!hasUnsub && text.length > 100) {
            score -= 10;
        }

        score = Math.max(10, Math.min(100, score));

        // Update UI
        const valEl = document.getElementById('spamScoreValue');
        const barEl = document.getElementById('spamScoreBar');
        const feedbackEl = document.getElementById('spamFeedback');

        if (valEl) {
            valEl.textContent = score;
            valEl.className = score >= 80 ? 'score-safe' : (score >= 60 ? 'score-warn' : 'score-danger');
        }
        if (barEl) {
            barEl.style.width = `${score}%`;
            barEl.className = score >= 80 ? 'progress-bar bg-success' : (score >= 60 ? 'progress-bar bg-warning' : 'progress-bar bg-danger');
        }
        if (feedbackEl) {
            if (score >= 85) {
                feedbackEl.innerHTML = '<i class="fas fa-check-circle text-success me-1"></i> Clean formatting & excellent deliverability health score.';
            } else if (detectedSpamWords.length > 0) {
                feedbackEl.innerHTML = `<i class="fas fa-exclamation-triangle text-warning me-1"></i> Trigger words found: <span class="text-danger">${detectedSpamWords.slice(0, 3).join(', ')}</span>`;
            } else {
                feedbackEl.innerHTML = '<i class="fas fa-info-circle text-info me-1"></i> Consider adding an unsubscribe token or reducing ALL-CAPS text.';
            }
        }
    }

    renderLivePreview(content) {
        const iframe = document.getElementById('templateLiveIframe');
        if (!iframe) return;

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const previewRandomId = '7' + Math.floor(10000 + Math.random() * 90000);

        let rendered = content || '';

        // Resolve spintax in preview
        let spintaxRegex = /(?:\{|\[)([^{}[\]]+?\|[^{}[\]]+?)(?:\}|\])/g;
        let maxPasses = 3;
        while (spintaxRegex.test(rendered) && maxPasses-- > 0) {
            rendered = rendered.replace(spintaxRegex, (match, opts) => {
                const parts = opts.split('|');
                return parts[0] || '';
            });
        }

        // Random alphanumeric tokens
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:nl|randomStr):?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (m, len) => {
            const l = parseInt(len || 8, 10);
            return '7kX9a2B1qR'.slice(0, l);
        });

        // Numeric tokens
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:n|randomNum):?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (m, len) => {
            const l = parseInt(len || 6, 10);
            return '482910'.slice(0, l);
        });

        // Lowercase & Uppercase letters
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)l:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/g, (m, len) => 'abcdef'.slice(0, parseInt(len || 6, 10)));
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)L:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/g, (m, len) => 'ABCDEF'.slice(0, parseInt(len || 6, 10)));

        // Security Code
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)code:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '482910');

        // Date & Time
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:date|datum)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, dateStr);
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:time|zeit|uhrzeit)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, timeStr);
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:year|jahr)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, String(now.getFullYear()));

        // Order & Customer & Amount
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:orderId|order[-_]?id|orderNumber)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '#918237402');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:customerId|customer[-_]?id)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '581928471');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:amount|betrag)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '149,50 €');

        // Random ID
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:random[-_]?id|reference[-_]?id):?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, previewRandomId);

        // Name, Email, User, Domain
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:name|fullName|vorname)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'Alexander Weber');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)email(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'a.weber@example.de');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)user(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'a.weber');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)domain(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'example.de');

        // Security tokens
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)hash(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '7f8a9b0c1d2e3f4a');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)uuid(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'e3b0c442-98fc-1c14-9afb-f4c8996fb924');

        // Subject, Header, Footer
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)subject(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, 'Wichtige Mitteilung');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)header(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '<div style="padding:10px 0;border-bottom:1px solid #eee;font-size:12px;color:#666;">Offizielle Mitteilung</div>');
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)footer(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, '<div style="font-size: 11px; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">Wenn Sie keine Mitteilungen mehr wünschen, <a href="#">klicken Sie hier zur Abmeldung</a>.</div>');

        // Destination link with dynamic params
        const sampleLink = `https://comanopabotafdcota.42web.io?uid=${previewRandomId}`;
        rendered = rendered.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:link|url|action[-_]?url|action[-_]?link)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, sampleLink);

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(rendered);
        doc.close();
    }

    async saveCurrentTemplate() {
        const lang = document.getElementById('templateLangSelect').value;
        const type = document.getElementById('templateTypeSelect').value;
        const fileName = document.getElementById('templateFileSelect').value;
        const content = document.getElementById('templateEditor').value;

        try {
            let endpoint = '';
            let body = {};

            if (type === 'letters') {
                endpoint = `/api/templates/${lang}/${fileName}`;
                body = { content };
            } else if (type === 'footers') {
                endpoint = `/api/footers/${lang}/${fileName}`;
                body = { content };
            } else if (type === 'subjects') {
                endpoint = `/api/subjects/${lang}`;
                body = { subjects: content.split('\n').map(s => s.trim()).filter(Boolean) };
            } else if (type === 'links') {
                endpoint = `/api/links/${lang}`;
                body = { links: content.split('\n').map(s => s.trim()).filter(Boolean) };
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(`Template ${fileName} saved successfully`, 'success');
                this.loadTemplates();
            }
        } catch (e) {
            this.showToast('Error saving template: ' + e.message, 'error');
        }
    }

    async openPresetsModal() {
        try {
            const res = await fetch('/api/templates/presets');
            const presets = await res.json();
            const container = document.getElementById('presetsContainer');
            if (container) {
                container.innerHTML = presets.map((p, idx) => `
                    <div class="col-md-4">
                        <div class="p-3 rounded border border-subtle bg-dark h-100 d-flex flex-column justify-content-between">
                            <div>
                                <span class="badge bg-primary mb-2">${p.category}</span>
                                <h6 class="fw-bold text-white mb-2">${p.name}</h6>
                                <p class="text-muted small mb-3 text-truncate">Subject: ${this.escapeHtml(p.subject)}</p>
                            </div>
                            <button class="btn-app btn-app-outline btn-app-sm w-100" onclick="dashboard.applyPreset(${idx})">
                                <i class="fas fa-download"></i> Apply Template
                            </button>
                        </div>
                    </div>
                `).join('');
            }
            new bootstrap.Modal(document.getElementById('presetsModal')).show();
        } catch (e) {
            this.showToast('Error fetching presets: ' + e.message, 'error');
        }
    }

    async applyPreset(idx) {
        try {
            const res = await fetch('/api/templates/presets');
            const presets = await res.json();
            const preset = presets[idx];
            if (preset) {
                const editor = document.getElementById('templateEditor');
                if (editor) {
                    editor.value = preset.html;
                    this.onTemplateEditorInput();
                }
                bootstrap.Modal.getInstance(document.getElementById('presetsModal'))?.hide();
                this.showToast(`Loaded "${preset.name}" preset`, 'success');
            }
        } catch (e) {
            this.showToast(e.message, 'error');
        }
    }

    /* ==========================================================================
       Quick Test Email Modal (Inbox Preview)
       ========================================================================== */

    populateQuickTestSmtpSelect() {
        const select = document.getElementById('testSendSmtpSelect');
        if (!select) return;
        select.innerHTML = '';
        this.smtpServers.forEach((s, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${s.host}:${s.port} (${s.user})`;
            select.appendChild(opt);
        });
    }

    openQuickTestModal() {
        this.populateQuickTestSmtpSelect();
        const alertBox = document.getElementById('testSendResultAlert');
        if (alertBox) alertBox.style.display = 'none';

        const modal = new bootstrap.Modal(document.getElementById('quickTestModal'));
        modal.show();
    }

    async executeQuickTestSend() {
        const recipient = document.getElementById('testSendRecipient').value.trim();
        const smtpIdx = parseInt(document.getElementById('testSendSmtpSelect').value, 10);
        const subject = document.getElementById('testSendSubject').value.trim();
        const htmlBody = document.getElementById('testSendBody').value;
        const alertBox = document.getElementById('testSendResultAlert');

        if (!recipient || !recipient.includes('@')) {
            this.showToast('Please enter a valid recipient email', 'warning');
            return;
        }

        const smtp = this.smtpServers[smtpIdx];
        if (!smtp) {
            this.showToast('Please select a valid SMTP server', 'warning');
            return;
        }

        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.className = 'p-2 rounded small bg-dark text-cyan border border-subtle';
            alertBox.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Transmitting live test message...';
        }

        try {
            const res = await fetch('/api/test-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient,
                    smtp,
                    subject,
                    htmlBody,
                    senderName: this.config.senderName || 'AI Mailer Pro'
                })
            });
            const data = await res.json();
            if (data.success) {
                alertBox.className = 'p-2 rounded small bg-success bg-opacity-25 text-success border border-success';
                alertBox.innerHTML = `<i class="fas fa-check-circle me-1"></i> Delivered! MessageID: ${data.messageId || 'OK'}`;
                this.showToast(`Test email successfully delivered to ${recipient}`, 'success');
                this.playChime('success');
            } else {
                alertBox.className = 'p-2 rounded small bg-danger bg-opacity-25 text-danger border border-danger';
                alertBox.innerHTML = `<i class="fas fa-times-circle me-1"></i> Delivery failed: ${data.error}`;
                this.showToast('Test delivery failed: ' + data.error, 'error');
                this.playChime('error');
            }
        } catch (e) {
            if (alertBox) {
                alertBox.className = 'p-2 rounded small bg-danger bg-opacity-25 text-danger border border-danger';
                alertBox.innerHTML = `<i class="fas fa-times-circle me-1"></i> ${e.message}`;
            }
        }
    }

    /* ==========================================================================
       Configuration & Settings
       ========================================================================== */

    async loadConfig() {
        try {
            const res = await fetch('/api/config');
            this.config = await res.json();

            // Populate system config tab
            if (this.config.smtpCooldownMs) document.getElementById('cfgSmtpCooldown').value = this.config.smtpCooldownMs;
            if (this.config.sendDelayMs) document.getElementById('cfgSendDelay').value = this.config.sendDelayMs;
            if (this.config.maxRetries) document.getElementById('cfgMaxRetries').value = this.config.maxRetries;
            if (this.config.senderName) document.getElementById('cfgSenderName').value = this.config.senderName;
            if (this.config.defaultLang) document.getElementById('cfgDefaultLang').value = this.config.defaultLang;
            if (this.config.logLevel) document.getElementById('cfgLogLevel').value = this.config.logLevel;

            // Populate BCC tab
            const bcc = this.config.bcc || {};
            document.getElementById('bccEnabledSwitch').checked = Boolean(bcc.enabled);
            document.getElementById('bccBulkCount').value = bcc.bulkCount || 10;
            document.getElementById('bccDelayMs').value = bcc.bccDelayMs || 5000;
            document.getElementById('bccMaskEmail').value = bcc.bccEmail || '';

            // Update SMTP Tester delivery mode indicators
            const bccOn = Boolean(bcc.enabled);
            const dModeBadge = document.getElementById('chkDeliveryModeBadge');
            const dModeSub = document.getElementById('chkDeliveryModeSub');
            if (dModeBadge) {
                dModeBadge.className = bccOn ? 'badge bg-purple' : 'badge bg-cyan text-dark fw-bold';
                dModeBadge.innerHTML = bccOn ? '<i class="fas fa-layer-group me-1"></i> BCC Mode' : '<i class="fas fa-paper-plane me-1"></i> Single Mode';
            }
            if (dModeSub) {
                dModeSub.innerText = bccOn ? (bcc.bccEmail ? `BCC Mask: ${bcc.bccEmail}` : 'BCC Mode Active') : 'Single Direct Send';
            }
        } catch (e) {
            console.error('Error loading config:', e);
        }
    }

    async saveSystemConfig() {
        const updated = {
            smtpCooldownMs: parseInt(document.getElementById('cfgSmtpCooldown').value, 10) || 2000,
            sendDelayMs: parseInt(document.getElementById('cfgSendDelay').value, 10) || 3000,
            maxRetries: parseInt(document.getElementById('cfgMaxRetries').value, 10) || 3,
            senderName: document.getElementById('cfgSenderName').value.trim(),
            defaultLang: document.getElementById('cfgDefaultLang').value,
            logLevel: document.getElementById('cfgLogLevel').value
        };

        await this.updateConfigSilent(updated);
        this.showToast('System configuration saved', 'success');
    }

    async saveBccSettings() {
        const bcc = {
            enabled: document.getElementById('bccEnabledSwitch').checked,
            bulkCount: parseInt(document.getElementById('bccBulkCount').value, 10) || 10,
            bccDelayMs: parseInt(document.getElementById('bccDelayMs').value, 10) || 5000,
            bccEmail: document.getElementById('bccMaskEmail').value.trim()
        };

        await this.updateConfigSilent({ bcc });
        this.showToast('BCC Stealth configuration saved', 'success');
    }

    async updateConfigSilent(partial) {
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partial)
            });
            const data = await res.json();
            if (data.success) {
                this.config = data.config;
            }
        } catch (e) {
            console.error('Failed to update config:', e);
        }
    }

    /* ==========================================================================
       Live Terminal / Log Streaming
       ========================================================================== */

    async loadLogs() {
        try {
            const res = await fetch('/api/logs');
            const files = await res.json();
            if (Array.isArray(files) && files.length > 0) {
                const latest = files[0];
                const lines = latest.content.split('\n').filter(Boolean);
                lines.forEach(line => {
                    this.appendLogEntry('info', line, false);
                });
                this.renderLogs();
            }
        } catch (e) {
            console.error('Error loading initial logs:', e);
        }
    }

    appendLogEntry(level, msg, triggerRender = true) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        let deducedLevel = level;
        const lower = msg.toLowerCase();
        if (lower.includes('error') || lower.includes('fail')) deducedLevel = 'error';
        else if (lower.includes('warn')) deducedLevel = 'warn';
        else if (lower.includes('smtp')) deducedLevel = 'smtp';

        this.logs.push({ time: timeStr, level: deducedLevel, msg });
        if (this.logs.length > 300) this.logs.shift();

        if (triggerRender) {
            this.renderLogs();
            this.renderMiniLogs();
        }
    }

    renderLogs() {
        const container = document.getElementById('fullTerminalLogs');
        if (!container) return;

        const filterLevel = document.getElementById('logLevelFilter')?.value || 'all';
        const searchQuery = (document.getElementById('logSearchInput')?.value || '').toLowerCase();

        const filtered = this.logs.filter(l => {
            if (filterLevel !== 'all' && l.level !== filterLevel) return false;
            if (searchQuery && !l.msg.toLowerCase().includes(searchQuery)) return false;
            return true;
        });

        container.innerHTML = filtered.map(l => `
            <div class="log-entry">
                <span class="log-time">${l.time}</span>
                <span class="log-badge ${l.level}">${l.level.toUpperCase()}</span>
                <span class="log-msg">${this.escapeHtml(l.msg)}</span>
            </div>
        `).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    renderMiniLogs() {
        const container = document.getElementById('dashboardMiniLogs');
        if (!container) return;
        const recent = this.logs.slice(-6);
        container.innerHTML = recent.map(l => `
            <div class="log-entry">
                <span class="log-time">${l.time}</span>
                <span class="log-badge ${l.level}">${l.level.toUpperCase()}</span>
                <span class="log-msg text-truncate">${this.escapeHtml(l.msg)}</span>
            </div>
        `).join('');
        container.scrollTop = container.scrollHeight;
    }

    /* ==========================================================================
       UI Helpers & Toasts
       ========================================================================== */

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-check-circle text-success',
            error: 'fa-times-circle text-danger',
            warning: 'fa-exclamation-triangle text-warning',
            info: 'fa-info-circle text-info'
        };

        const toast = document.createElement('div');
        toast.className = `app-toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${iconMap[type] || 'fa-bell'} fs-5"></i>
            <span class="small fw-semibold">${this.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ==========================================================================
       SMTP Inbox Tester & Live Verifier Methods
       ========================================================================== */

    updateCheckerLineCount() {
        const input = document.getElementById('checkerRawSmtpInput');
        if (!input) return;
        const raw = input.value.trim();
        const lines = raw ? raw.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#')) : [];
        const countBadge = document.getElementById('checkerInputLineCount');
        if (countBadge) countBadge.innerText = `${lines.length} lines detected`;
        const totalEl = document.getElementById('chkCountTotal');
        if (totalEl && !this.checkerRunning) totalEl.innerText = lines.length;
    }

    autoDetectImapSettings(email) {
        if (!email || !email.includes('@')) return;
        const parts = email.split('@');
        const domain = (parts[1] || '').toLowerCase().trim();
        const hostInput = document.getElementById('chkImapHost');
        const portInput = document.getElementById('chkImapPort');
        const userInput = document.getElementById('chkImapUser');

        if (userInput && (!userInput.value || userInput.value.includes('@'))) {
            userInput.value = email;
        }

        if (!hostInput || hostInput.dataset.manual) return;

        const imapMap = {
            'gmail.com': { host: 'imap.gmail.com', port: 993 },
            'googlemail.com': { host: 'imap.gmail.com', port: 993 },
            't-online.de': { host: 'secureimap.t-online.de', port: 993 },
            'outlook.com': { host: 'outlook.office365.com', port: 993 },
            'hotmail.com': { host: 'outlook.office365.com', port: 993 },
            'live.com': { host: 'outlook.office365.com', port: 993 },
            'office365.com': { host: 'outlook.office365.com', port: 993 },
            'gmx.net': { host: 'imap.gmx.net', port: 993 },
            'gmx.de': { host: 'imap.gmx.net', port: 993 },
            'web.de': { host: 'imap.web.de', port: 993 },
            'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
            'yahoo.de': { host: 'imap.mail.yahoo.com', port: 993 },
            'freenet.de': { host: 'mx.freenet.de', port: 993 },
            'mail.ru': { host: 'imap.mail.ru', port: 993 },
            'icloud.com': { host: 'imap.mail.me.com', port: 993 }
        };

        if (imapMap[domain]) {
            hostInput.value = imapMap[domain].host;
            if (portInput) portInput.value = imapMap[domain].port;
        } else if (domain) {
            hostInput.value = `imap.${domain}`;
            if (portInput) portInput.value = 993;
        }
    }

    async startSmtpInboxTest() {
        if (this.checkerRunning) return;

        const rawInput = document.getElementById('checkerRawSmtpInput')?.value || '';
        const lines = rawInput.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));

        if (lines.length === 0) {
            this.showToast('Please provide at least one SMTP credential line (host|port|user|pass)', 'warning');
            return;
        }

        const targetEmail = document.getElementById('chkTargetEmail')?.value?.trim();
        if (!targetEmail || !targetEmail.includes('@')) {
            this.showToast('Please enter your target test email address', 'warning');
            document.getElementById('chkTargetEmail')?.focus();
            return;
        }

        const targetPassword = document.getElementById('chkTargetPassword')?.value || '';
        const concurrency = parseInt(document.getElementById('chkConcurrency')?.value, 10) || 10;
        const timeout = parseInt(document.getElementById('chkTimeout')?.value, 10) || 8000;
        const templateLang = document.getElementById('templateLangSelect')?.value || this.config?.defaultLang || 'DE';

        // Reset state
        this.checkerRunning = true;
        this.checkerResults = [];
        this.workingSmtps = [];

        // UI Reset (safely null-guarded)
        const elTested = document.getElementById('chkCountTested'); if (elTested) elTested.innerText = '0';
        const elTotal = document.getElementById('chkCountTotal'); if (elTotal) elTotal.innerText = lines.length;
        const elInbox = document.getElementById('chkCountInbox'); if (elInbox) elInbox.innerText = '0';
        const elSpam = document.getElementById('chkCountSpam'); if (elSpam) elSpam.innerText = '0';
        const elFailed = document.getElementById('chkCountFailed'); if (elFailed) elFailed.innerText = '0';

        const fAll = document.getElementById('chkFilterAll'); if (fAll) fAll.innerText = '0';
        const fInbox = document.getElementById('chkFilterInbox'); if (fInbox) fInbox.innerText = '0';
        const fSpam = document.getElementById('chkFilterSpam'); if (fSpam) fSpam.innerText = '0';
        const fFailed = document.getElementById('chkFilterFailed'); if (fFailed) fFailed.innerText = '0';

        const pBar = document.getElementById('chkProgressBar'); if (pBar) pBar.style.width = '0%';
        const pPct = document.getElementById('chkProgressPct'); if (pPct) pPct.innerText = '0%';
        const pLabel = document.getElementById('chkProgressLabel');
        if (pLabel) {
            pLabel.innerHTML = `<i class="fas fa-circle-notch fa-spin me-1"></i> Running multi-threaded deliverability test (${concurrency} workers)...`;
        }

        const btnStart = document.getElementById('startCheckerBtn'); if (btnStart) btnStart.disabled = true;
        const btnStop = document.getElementById('stopCheckerBtn'); if (btnStop) btnStop.style.display = 'inline-block';
        const btnSave = document.getElementById('saveWorkingSmtpBtn'); if (btnSave) btnSave.disabled = true;
        const btnExport = document.getElementById('exportWorkingSmtpBtn'); if (btnExport) btnExport.disabled = true;

        const resultsContainer = document.getElementById('checkerResultsContainer');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <div class="spinner-border text-cyan mb-3" role="status"></div>
                    <div class="fw-bold text-white">Starting Multi-Threaded Engine (${concurrency} Threads)...</div>
                    <small class="text-muted">Dispatching authentic Template Studio letters with invisible probe tokens</small>
                </div>
            `;
        }

        try {
            const res = await fetch('/api/smtp-checker/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    smtpList: lines,
                    targetEmail,
                    targetPassword,
                    concurrency,
                    timeout,
                    templateLang
                })
            });

            const text = await res.text();
            let data = {};
            try {
                data = JSON.parse(text);
            } catch (_) {
                data = { error: `Server error (${res.status}): ${text.replace(/<[^>]+>/g, '').slice(0, 100).trim()}` };
            }

            if (!res.ok) {
                throw new Error(data.error || `Server returned ${res.status}`);
            }

            if (data.mode) {
                const bccOn = data.mode === 'bcc';
                const dModeBadge = document.getElementById('chkDeliveryModeBadge');
                const dModeSub = document.getElementById('chkDeliveryModeSub');
                if (dModeBadge) {
                    dModeBadge.className = bccOn ? 'badge bg-purple' : 'badge bg-cyan text-dark fw-bold';
                    dModeBadge.innerHTML = bccOn ? '<i class="fas fa-layer-group me-1"></i> BCC Mode' : '<i class="fas fa-paper-plane me-1"></i> Single Mode';
                }
                if (dModeSub) {
                    dModeSub.innerText = bccOn ? 'BCC Mode Active (Config)' : 'Single Direct Mode (Config)';
                }
            }

            const modeLabel = data.mode === 'bcc' ? 'BCC Mode' : 'Single Mode';
            this.playChime('click');
            this.showToast(`Verification started with ${concurrency} threads [${modeLabel}] for ${data.total} credentials`, 'info');
        } catch (err) {
            console.error('Error starting SMTP checker:', err);
            this.showToast(`Could not start verification: ${err.message}`, 'error');
            this.handleCheckerFinished({ inbox: 0, spam: 0, failed: 0, total: lines.length });
        }
    }

    async stopSmtpInboxTest() {
        try {
            await fetch('/api/smtp-checker/stop', { method: 'POST' });
            this.showToast('Stopping SMTP verification...', 'warning');
        } catch (err) {
            console.error('Error stopping SMTP checker:', err);
        }
    }

    handleCheckerProgress(data) {
        // In-place update if record with same probeToken or credentials already exists
        const existingIndex = this.checkerResults.findIndex(r => 
            (data.probeToken && r.probeToken === data.probeToken) || 
            (r.host === data.host && r.port === data.port && r.user === data.user && (r.status === 'verifying' || r.status === 'sent'))
        );

        if (existingIndex >= 0) {
            this.checkerResults[existingIndex] = { ...this.checkerResults[existingIndex], ...data };
        } else {
            this.checkerResults.push(data);
        }

        const key = `${data.host}|${data.port}|${data.user}|${data.pass}`;
        if (data.status === 'inbox' || data.status === 'sent') {
            if (!this.workingSmtps.includes(key)) {
                this.workingSmtps.push(key);
            }
        } else if (data.status === 'spam' || data.status === 'not_arrived' || data.status === 'failed') {
            this.workingSmtps = this.workingSmtps.filter(k => k !== key);
        }

        // Update counts
        const total = data.total || this.checkerResults.length;
        const tested = data.index || this.checkerResults.length;

        const inboxCount = this.checkerResults.filter(r => r.status === 'inbox').length;
        const relayCount = this.checkerResults.filter(r => r.status === 'sent').length;
        const effectiveInbox = inboxCount > 0 ? inboxCount : (inboxCount + relayCount);
        const spamCount = this.checkerResults.filter(r => r.status === 'spam').length;
        const failedCount = this.checkerResults.filter(r => r.status !== 'inbox' && r.status !== 'sent' && r.status !== 'spam' && r.status !== 'verifying').length;

        document.getElementById('chkCountTested').innerText = tested;
        document.getElementById('chkCountTotal').innerText = total;
        document.getElementById('chkCountInbox').innerText = inboxCount > 0 ? `${inboxCount} (Inbox)` : relayCount;
        document.getElementById('chkCountSpam').innerText = spamCount;
        document.getElementById('chkCountFailed').innerText = failedCount;

        document.getElementById('chkFilterAll').innerText = this.checkerResults.length;
        document.getElementById('chkFilterInbox').innerText = effectiveInbox;
        document.getElementById('chkFilterSpam').innerText = spamCount;
        document.getElementById('chkFilterFailed').innerText = failedCount;

        // Progress bar
        const pct = Math.min(100, Math.round((tested / total) * 100));
        document.getElementById('chkProgressBar').style.width = `${pct}%`;
        document.getElementById('chkProgressPct').innerText = `${pct}%`;

        // Enable save/export if we have verified nodes
        if (this.workingSmtps.length > 0) {
            document.getElementById('saveWorkingSmtpBtn').disabled = false;
            document.getElementById('exportWorkingSmtpBtn').disabled = false;
            const badge = document.getElementById('sidebarTesterBadge');
            if (badge) {
                badge.innerText = this.workingSmtps.length;
                badge.style.display = 'inline-block';
            }
        }

        this.renderCheckerResults();
    }

    handleCheckerFinished(data) {
        this.checkerRunning = false;

        document.getElementById('startCheckerBtn').disabled = false;
        document.getElementById('stopCheckerBtn').style.display = 'none';
        const spinner = document.getElementById('chkSpinner');
        if (spinner) spinner.style.display = 'none';

        const inbox = data.inbox || this.checkerResults.filter(r => r.status === 'inbox').length;
        const spam = data.spam || this.checkerResults.filter(r => r.status === 'spam').length;
        const failed = data.failed || this.checkerResults.filter(r => r.status !== 'inbox' && r.status !== 'sent' && r.status !== 'spam' && r.status !== 'verifying').length;
        const total = data.total || this.checkerResults.length;

        const label = document.getElementById('chkProgressLabel');
        if (label) {
            label.innerHTML = `<i class="fas fa-check-double text-emerald me-1"></i> Verification finished: <strong class="text-white">${inbox}</strong> INBOX verified, <strong class="text-amber">${spam}</strong> spam, <strong class="text-pink">${failed}</strong> failed (${total} total)`;
        }

        if (inbox > 0) {
            this.playChime('success');
            this.showToast(`Verification completed! ${inbox} SMTPs verified in INBOX.`, 'success');
        } else {
            this.playChime('finish');
            this.showToast('Verification completed.', 'info');
        }
    }

    renderCheckerResults() {
        const container = document.getElementById('checkerResultsContainer');
        if (!container) return;

        let list = this.checkerResults;
        if (this.checkerFilter === 'inbox') {
            list = list.filter(r => r.status === 'inbox' || r.status === 'sent');
        } else if (this.checkerFilter === 'spam') {
            list = list.filter(r => r.status === 'spam');
        } else if (this.checkerFilter === 'failed') {
            list = list.filter(r => r.status !== 'inbox' && r.status !== 'sent' && r.status !== 'spam');
        }

        if (list.length === 0) {
            if (this.checkerResults.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-shield-halved fa-3x mb-3 text-dim" style="opacity: 0.3;"></i>
                        <h6 class="text-white">Ready for Testing</h6>
                        <p class="small text-muted">Enter raw credentials on the left, choose a test recipient, and click <strong>Start Inbox Test</strong>.</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-filter fa-2x mb-2 text-dim"></i>
                        <div class="small">No results matching filter "<strong>${this.checkerFilter.toUpperCase()}</strong>"</div>
                    </div>
                `;
            }
            return;
        }

        container.innerHTML = list.map(item => {
            let statusBadge = '';
            let statusClass = `status-${item.status}`;

            if (item.status === 'inbox') {
                statusBadge = '<span class="badge badge-inbox-verified"><i class="fas fa-check-double me-1"></i> INBOX LANDED</span>';
            } else if (item.status === 'verifying') {
                statusBadge = '<span class="badge bg-info bg-opacity-25 text-info border border-info"><i class="fas fa-spinner fa-spin me-1"></i> VERIFYING INBOX...</span>';
            } else if (item.status === 'sent') {
                statusBadge = '<span class="badge badge-sent-ok"><i class="fas fa-paper-plane me-1"></i> RELAY ACCEPTED</span>';
            } else if (item.status === 'spam') {
                statusBadge = '<span class="badge badge-spam-warning"><i class="fas fa-triangle-exclamation me-1"></i> SPAM / JUNK</span>';
            } else if (item.status === 'not_arrived') {
                statusBadge = '<span class="badge badge-dropped-error"><i class="fas fa-ban me-1"></i> DROPPED / NOT IN BOX</span>';
            } else {
                statusBadge = '<span class="badge badge-fail-error"><i class="fas fa-circle-xmark me-1"></i> FAILED</span>';
            }

            const latencyHtml = item.latency ? `<span class="badge bg-dark border border-subtle text-cyan"><i class="fas fa-bolt me-1"></i> ${item.latency}ms</span>` : '';
            const probeHtml = item.probeToken ? `<span class="badge bg-dark border border-secondary text-cyan font-monospace" style="font-size:0.7rem;" title="Unique Cryptographic Probe Token: ${item.probeToken}"><i class="fas fa-fingerprint me-1"></i>${item.probeToken}</span>` : '';
            const modeHtml = item.mode ? `<span class="badge ${item.mode === 'bcc' ? 'bg-purple' : 'bg-info bg-opacity-25 text-info border border-info'} font-monospace" style="font-size:0.68rem;"><i class="fas fa-layer-group me-1"></i>${item.mode.toUpperCase()}</span>` : '';
            const credString = `${item.host}|${item.port}|${item.user}|${item.pass}`;

            return `
                <div class="checker-result-item ${statusClass}">
                    <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-1">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            ${statusBadge}
                            <span class="checker-node-cred fw-bold text-white">${this.escapeHtml(item.host)}:${item.port}</span>
                            ${latencyHtml}
                            ${modeHtml}
                            ${probeHtml}
                        </div>
                        <button class="btn btn-sm btn-link text-muted p-0" title="Copy credential line" onclick="navigator.clipboard.writeText('${this.escapeHtml(credString)}'); dashboard.showToast('Credential line copied', 'info');">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="checker-node-meta d-flex justify-content-between align-items-center">
                        <span class="text-truncate" style="max-width: 320px;"><i class="fas fa-user text-cyan me-1"></i> ${this.escapeHtml(item.user)}</span>
                        ${item.folder ? `<span class="badge bg-dark text-muted"><i class="fas fa-folder me-1"></i> ${this.escapeHtml(item.folder)}</span>` : ''}
                    </div>
                    ${item.subject ? `<div class="mt-1 small text-muted text-truncate"><i class="fas fa-heading text-cyan me-1"></i> ${this.escapeHtml(item.subject)}</div>` : ''}
                    ${item.error ? `<div class="mt-1 small text-pink text-truncate"><i class="fas fa-bug me-1"></i> ${this.escapeHtml(item.error)}</div>` : ''}
                </div>
            `;
        }).join('');

        // Auto-scroll to bottom if currently running
        if (this.checkerRunning) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async saveWorkingSmtpToHub() {
        const inboxHits = this.checkerResults.filter(r => r.status === 'inbox');
        const relayHits = this.checkerResults.filter(r => r.status === 'sent');
        const hasImapTesting = this.checkerResults.some(r => r.folder === 'INBOX' || r.status === 'inbox' || r.status === 'spam' || r.status === 'not_arrived' || r.status === 'verifying');

        let hitsToSave = inboxHits;
        if (inboxHits.length === 0 && !hasImapTesting) {
            hitsToSave = relayHits; // Allow relay hits only if IMAP mailbox credentials were not used
        }

        if (hitsToSave.length === 0) {
            if (hasImapTesting) {
                this.showToast('No verified INBOX SMTPs found. Only servers verified in INBOX can be added to Rotation Hub.', 'warning');
            } else {
                this.showToast('No working SMTPs available to save', 'warning');
            }
            return;
        }

        const btn = document.getElementById('saveWorkingSmtpBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';

        try {
            const res = await fetch('/api/smtp-checker/save-working', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: 'append',
                    hits: hitsToSave.map(h => `${h.host}|${h.port}|${h.user}|${h.pass}`),
                    onlyInbox: inboxHits.length > 0
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save to Hub');

            // Refresh SMTP Hub servers and dashboard counts
            await this.loadSmtp();
            await this.loadStatistics();

            this.playChime('success');
            this.showToast(`Successfully saved ${data.savedCount} verified INBOX SMTP node(s) to Rotation Hub (smtp.txt)!`, 'success');
        } catch (err) {
            console.error('Error saving working SMTPs:', err);
            this.showToast(`Error saving to Hub: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    exportWorkingSmtps() {
        const inboxHits = this.checkerResults.filter(r => r.status === 'inbox');
        const relayHits = this.checkerResults.filter(r => r.status === 'sent');
        const hasImapTesting = this.checkerResults.some(r => r.folder === 'INBOX' || r.status === 'inbox' || r.status === 'spam' || r.status === 'not_arrived');

        const toExport = inboxHits.length > 0 ? inboxHits : (hasImapTesting ? [] : relayHits);
        if (toExport.length === 0) {
            this.showToast(hasImapTesting ? 'No verified INBOX SMTPs to export' : 'No working SMTPs to export', 'warning');
            return;
        }

        const text = toExport.map(h => `${h.host}|${h.port}|${h.user}|${h.pass}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verified-inbox-smtps-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`Exported ${toExport.length} verified INBOX SMTPs`, 'success');
    }

    /* ==========================================================================
       Authorized Mailbox Activity Monitor & Real-Time IMAP Subscription Methods
       ========================================================================== */

    setupMonitorEventListeners() {
        // Paste list button
        const pasteBtn = document.getElementById('monitorPasteBtn');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const input = document.getElementById('monitorRawInput');
                    if (input && text) {
                        input.value = input.value ? `${input.value.trim()}\n${text.trim()}` : text.trim();
                        this.updateMonitorLineCount();
                        this.showToast('Pasted mailbox credentials from clipboard', 'info');
                    }
                } catch (e) {
                    this.showToast('Please paste manually into the textbox', 'warning');
                }
            });
        }

        // Upload data file button & file picker
        const uploadBtn = document.getElementById('monitorUploadBtn');
        const dropzoneUploadBtn = document.getElementById('monitorDropzoneUploadBtn');
        const fileInput = document.getElementById('monitorFileInput');

        const handleUploadClick = () => {
            this.playChime('click');
            if (fileInput) fileInput.click();
        };

        if (uploadBtn) uploadBtn.addEventListener('click', handleUploadClick);
        if (dropzoneUploadBtn) dropzoneUploadBtn.addEventListener('click', handleUploadClick);

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (re) => {
                    const content = re.target.result;
                    const input = document.getElementById('monitorRawInput');
                    if (input && content) {
                        input.value = input.value ? `${input.value.trim()}\n${content.trim()}` : content.trim();
                        this.updateMonitorLineCount();
                        this.playChime('success');
                        this.showToast(`Loaded ${file.name} successfully`, 'success');
                    }
                };
                reader.readAsText(file);
                fileInput.value = '';
            });
        }

        // Clear input button
        const clearBtn = document.getElementById('monitorClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const input = document.getElementById('monitorRawInput');
                if (input) {
                    input.value = '';
                    this.updateMonitorLineCount();
                    this.showToast('Cleared input credentials', 'info');
                }
            });
        }

        // Line counter updater
        const rawInput = document.getElementById('monitorRawInput');
        if (rawInput) {
            rawInput.addEventListener('input', () => this.updateMonitorLineCount());
        }

        // Dropzone handling
        const dropzone = document.getElementById('monitorDropzone');
        if (dropzone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('border-neon');
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('border-neon');
                });
            });
            dropzone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        const content = re.target.result;
                        const input = document.getElementById('monitorRawInput');
                        if (input) {
                            input.value = input.value ? `${input.value.trim()}\n${content.trim()}` : content.trim();
                            this.updateMonitorLineCount();
                            this.showToast(`Loaded ${file.name}`, 'info');
                        }
                    };
                    reader.readAsText(file);
                }
            });
        }

        // Keyword filter input
        const kwInput = document.getElementById('monitorKeywordInput');
        const addKwBtn = document.getElementById('monitorAddKeywordBtn');
        if (addKwBtn && kwInput) {
            const handleAdd = () => {
                const val = kwInput.value.trim();
                if (val) {
                    this.addMonitorKeyword(val);
                    kwInput.value = '';
                }
            };
            addKwBtn.addEventListener('click', handleAdd);
            kwInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                }
            });
        }

        // Keyword presets
        document.querySelectorAll('.monitor-preset-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const kw = chip.dataset.kw;
                if (kw) {
                    this.addMonitorKeyword(kw);
                }
            });
        });

        // Worker Thread presets & input
        document.querySelectorAll('.mon-thread-preset').forEach(pill => {
            pill.addEventListener('click', () => {
                const val = parseInt(pill.dataset.threads, 10);
                const input = document.getElementById('monitorConcurrency');
                if (input && val) {
                    input.value = val;
                    this.updateMonitorThreadsUI(val);
                }
            });
        });

        const concurInput = document.getElementById('monitorConcurrency');
        if (concurInput) {
            concurInput.addEventListener('input', () => {
                const val = parseInt(concurInput.value, 10) || 10;
                this.updateMonitorThreadsUI(val);
            });
        }

        // Start and Stop index buttons
        document.getElementById('startMonitorBtn')?.addEventListener('click', () => this.startMonitor());
        document.getElementById('stopMonitorBtn')?.addEventListener('click', () => this.stopMonitor());
        document.getElementById('monQuickAbortBtn')?.addEventListener('click', () => this.stopMonitor());

        // Result filter tabs
        ['all', 'matched', 'unmatched', 'failed'].forEach(f => {
            const btn = document.getElementById(`monFilter${f.charAt(0).toUpperCase() + f.slice(1)}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#section-mailbox-monitor [data-filter]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.monitorFilter = f;
                    this.renderMonitorResults();
                });
            }
        });

        // Delegated clicks on Monitor Results list (Inspect, Subscribe, Copy)
        const resultsList = document.getElementById('monitorResultsList');
        if (resultsList) {
            resultsList.addEventListener('click', (e) => {
                const inspectBtn = e.target.closest('.mon-inspect-btn');
                if (inspectBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const acc = inspectBtn.getAttribute('data-account');
                    this.openMailboxInspector(acc);
                    return;
                }
                const subBtn = e.target.closest('.mon-sub-btn');
                if (subBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const acc = subBtn.getAttribute('data-account');
                    this.startSubscription(acc);
                    return;
                }
                const copyBtn = e.target.closest('.mon-copy-btn');
                if (copyBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const acc = copyBtn.getAttribute('data-account');
                    this.copyCredential(acc);
                    return;
                }
            });
        }

        // Export toolbar
        document.getElementById('exportMatchedAccountsBtn')?.addEventListener('click', () => this.exportMatchedAccounts());

        // Live Subscription Hub modal controls
        document.getElementById('openSubscriptionModalBtn')?.addEventListener('click', () => {
            const connectBox = document.getElementById('subModalConnectBox');
            if (!this.activeSubscriptionAccount && connectBox) {
                connectBox.style.display = 'block';
            }
            const modalEl = document.getElementById('mailboxSubscriptionModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.show();
            }
        });
        document.getElementById('subModalStopBtn')?.addEventListener('click', () => this.stopSubscription());
        document.getElementById('subModalConnectBtn')?.addEventListener('click', () => {
            const email = document.getElementById('subModalEmailInput')?.value.trim();
            const pass = document.getElementById('subModalPassInput')?.value.trim();
            if (!email) {
                this.showToast('Please enter an email address', 'warning');
                return;
            }
            this.startSubscription(email, pass);
        });

        // Inspector modal controls
        document.getElementById('inspectorSubscribeBtn')?.addEventListener('click', () => {
            if (this.selectedInspectAccount) {
                this.startSubscription(this.selectedInspectAccount);
            }
        });
        document.getElementById('inspectorCopyCredBtn')?.addEventListener('click', () => {
            if (this.selectedInspectAccount) {
                this.copyCredential(this.selectedInspectAccount);
            }
        });

        // Global safeguard against lingering Bootstrap modal backdrops
        document.addEventListener('hidden.bs.modal', () => {
            if (!document.querySelector('.modal.show')) {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
            }
        });

        this.renderMonitorKeywords();
    }

    addMonitorKeyword(kw) {
        if (!kw) return;
        const clean = kw.trim();
        if (!this.monitorKeywords.some(k => k.toLowerCase() === clean.toLowerCase())) {
            this.monitorKeywords.push(clean);
            this.renderMonitorKeywords();
        }
    }

    removeMonitorKeyword(kw) {
        this.monitorKeywords = this.monitorKeywords.filter(k => k.toLowerCase() !== kw.toLowerCase());
        this.renderMonitorKeywords();
    }

    renderMonitorKeywords() {
        const container = document.getElementById('monitorKeywordTags');
        const badge = document.getElementById('monitorActiveKeywordCount');
        if (!container) return;

        if (this.monitorKeywords.length === 0) {
            container.innerHTML = '<span class="small text-muted fst-italic">No filters active (indexing all incoming messages).</span>';
            if (badge) badge.innerText = '0 Active';
            return;
        }

        if (badge) badge.innerText = `${this.monitorKeywords.length} Active`;

        container.innerHTML = this.monitorKeywords.map(kw => {
            const safe = this.escapeHtml(kw);
            return `<span class="monitor-kw-tag">
                <span>${safe}</span>
                <span class="remove-kw-btn" onclick="dashboard.removeMonitorKeyword('${safe.replace(/'/g, "\\'")}')" title="Remove filter">&times;</span>
            </span>`;
        }).join('');
    }

    updateMonitorLineCount() {
        const input = document.getElementById('monitorRawInput');
        const badge = document.getElementById('monitorInputLineCount');
        if (!input || !badge) return;
        const lines = input.value.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        badge.innerText = `${lines.length} ${lines.length === 1 ? 'mailbox' : 'mailboxes'}`;
    }

    updateMonitorThreadsUI(threads) {
        this.monitorConcurrency = threads;
        const badge = document.getElementById('monThreadsBadgeNum');
        if (badge) badge.innerText = threads;
        document.querySelectorAll('.mon-thread-preset').forEach(pill => {
            const t = parseInt(pill.dataset.threads, 10);
            if (t === threads) {
                pill.classList.add('border-cyan', 'text-cyan', 'active-thread-pill');
                pill.classList.remove('border-subtle');
            } else {
                pill.classList.remove('border-cyan', 'text-cyan', 'active-thread-pill');
                pill.classList.add('border-subtle');
            }
        });
    }

    async startMonitor() {
        const input = document.getElementById('monitorRawInput');
        if (!input || !input.value.trim()) {
            this.showToast('Please enter at least one authorized mailbox credential', 'warning');
            return;
        }

        const lines = input.value.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        if (lines.length === 0) {
            this.showToast('No valid mailbox lines detected', 'warning');
            return;
        }

        const threads = parseInt(document.getElementById('monitorConcurrency')?.value, 10) || 10;
        const timeout = parseInt(document.getElementById('monitorTimeout')?.value, 10) || 5000;
        const prefetchBody = document.getElementById('monitorPrefetchBody')?.checked ?? true;
        const scanDepth = document.getElementById('monitorScanDepth')?.value || '25';
        const includeSpam = document.getElementById('monitorIncludeSpam')?.checked ?? true;
        const folderScope = includeSpam ? ['INBOX', 'Spam'] : ['INBOX'];

        this.monitorRunning = true;
        this.monitorResults = [];
        this.monitorStartTime = Date.now();

        // Update UI
        document.getElementById('startMonitorBtn').disabled = true;
        const stopBtn = document.getElementById('stopMonitorBtn');
        if (stopBtn) stopBtn.disabled = false;
        const quickAbortBtn = document.getElementById('monQuickAbortBtn');
        if (quickAbortBtn) quickAbortBtn.style.display = 'inline-flex';
        const spinner = document.getElementById('monSpinner');
        if (spinner) spinner.style.display = 'inline-block';
        document.getElementById('exportMatchedAccountsBtn').disabled = true;

        document.getElementById('monCountTested').innerText = '0';
        document.getElementById('monCountTotal').innerText = lines.length;
        document.getElementById('monCountAuth').innerText = '0';
        document.getElementById('monCountMatchedAcc').innerText = '0';
        document.getElementById('monCountMatchedMsgs').innerText = '0';
        document.getElementById('monCountFailed').innerText = '0';
        const rateEl = document.getElementById('monCountRate');
        if (rateEl) rateEl.innerText = '0.0';

        const threadsBadge = document.getElementById('monThreadsBadgeNum');
        if (threadsBadge) threadsBadge.innerText = threads;

        document.getElementById('monProgressBar').style.width = '0%';
        document.getElementById('monProgressPct').innerText = '0%';
        document.getElementById('monProgressLabel').innerHTML = `<i class="fas fa-circle-notch fa-spin me-1" id="monSpinner"></i> Connecting to IMAP & launching ${threads} parallel worker threads...`;

        this.renderMonitorResults();
        this.playChime('start');
        this.showToast(`Starting indexing on ${lines.length} mailboxes with ${threads} parallel worker threads...`, 'info');

        try {
            const res = await fetch('/api/monitor/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountList: input.value,
                    keywords: this.monitorKeywords,
                    options: {
                        threads,
                        timeout,
                        prefetchBody,
                        scanDepth,
                        folderScope
                    }
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to start mailbox monitor');
            }
        } catch (err) {
            this.monitorRunning = false;
            document.getElementById('startMonitorBtn').disabled = false;
            const stopBtn = document.getElementById('stopMonitorBtn');
            if (stopBtn) stopBtn.disabled = true;
            const quickAbortBtn = document.getElementById('monQuickAbortBtn');
            if (quickAbortBtn) quickAbortBtn.style.display = 'none';
            if (spinner) spinner.style.display = 'none';
            this.showToast(`Monitor error: ${err.message}`, 'error');
        }
    }

    async stopMonitor() {
        const stopBtn = document.getElementById('stopMonitorBtn');
        if (stopBtn) stopBtn.disabled = true;
        const quickAbortBtn = document.getElementById('monQuickAbortBtn');
        if (quickAbortBtn) quickAbortBtn.style.display = 'none';
        const startBtn = document.getElementById('startMonitorBtn');
        if (startBtn) startBtn.disabled = false;
        const spinner = document.getElementById('monSpinner');
        if (spinner) spinner.style.display = 'none';

        const label = document.getElementById('monProgressLabel');
        if (label) {
            label.innerHTML = '<i class="fas fa-hand text-pink me-1"></i> <strong>Aborting action...</strong> Signaling active IMAP worker threads to stop.';
        }

        this.monitorRunning = false;
        this.playChime('finish');
        this.showToast('Aborting mailbox indexing action...', 'warning');

        try {
            const res = await fetch('/api/monitor/stop', { method: 'POST' });
            const data = await res.json();
            if (label) {
                label.innerHTML = '<i class="fas fa-circle-stop text-pink me-1"></i> <strong>Action Aborted:</strong> Indexing halted by operator.';
            }
            this.showToast('Mailbox activity action aborted successfully.', 'info');
        } catch (e) {
            this.showToast('Sent abort signal to server.', 'info');
        }
    }

    handleMonitorProgress(data) {
        const { tested, total, authenticated, matchedAccounts, matchedMessages, failed, phase, currentAccount, accountRecord, rate, threads, workerId } = data;

        if (tested !== undefined) document.getElementById('monCountTested').innerText = tested;
        if (total !== undefined) document.getElementById('monCountTotal').innerText = total;
        if (authenticated !== undefined) document.getElementById('monCountAuth').innerText = authenticated;
        if (matchedAccounts !== undefined) document.getElementById('monCountMatchedAcc').innerText = matchedAccounts;
        if (matchedMessages !== undefined) document.getElementById('monCountMatchedMsgs').innerText = matchedMessages;
        if (failed !== undefined) document.getElementById('monCountFailed').innerText = failed;

        // Telemetry Throughput Rate
        const rateEl = document.getElementById('monCountRate');
        if (rateEl) {
            if (rate !== undefined) {
                rateEl.innerText = rate.toFixed(1);
            } else if (tested && this.monitorStartTime) {
                const elapsedSec = Math.max(0.1, (Date.now() - this.monitorStartTime) / 1000);
                rateEl.innerText = (tested / elapsedSec).toFixed(1);
            }
        }

        if (threads !== undefined) {
            const badge = document.getElementById('monThreadsBadgeNum');
            if (badge) badge.innerText = threads;
        }

        if (tested && total) {
            const pct = Math.min(100, Math.round((tested / total) * 100));
            document.getElementById('monProgressBar').style.width = `${pct}%`;
            document.getElementById('monProgressPct').innerText = `${pct}%`;
        }

        if (phase === 'probing' && currentAccount) {
            const workerTag = workerId ? `<span class="badge bg-purple px-1 py-0 me-1" style="font-size: 0.65rem;">T#${workerId}</span> ` : '';
            document.getElementById('monProgressLabel').innerHTML = `<i class="fas fa-circle-notch fa-spin me-1"></i> ${workerTag}Indexing <strong class="text-white">${this.escapeHtml(currentAccount)}</strong> (${tested}/${total})...`;
        }

        if (phase === 'account_result' && accountRecord) {
            const idx = this.monitorResults.findIndex(r => r.account.toLowerCase() === accountRecord.account.toLowerCase());
            if (idx >= 0) {
                this.monitorResults[idx] = accountRecord;
            } else {
                this.monitorResults.push(accountRecord);
            }

            if (accountRecord.status === 'matched') {
                this.playChime('inbox');
            }

            // Update badge
            const badge = document.getElementById('sidebarMonitorBadge');
            if (badge) {
                const totalMatched = this.monitorResults.filter(r => r.status === 'matched').length;
                badge.innerText = totalMatched;
                badge.style.display = totalMatched > 0 ? 'inline-block' : 'none';
            }

            if (matchedAccounts > 0) {
                const exportBtn = document.getElementById('exportMatchedAccountsBtn');
                if (exportBtn) exportBtn.disabled = false;
            }

            this.renderMonitorResults();
        }
    }

    handleMonitorFinished(data) {
        this.monitorRunning = false;
        document.getElementById('startMonitorBtn').disabled = false;
        const stopBtn = document.getElementById('stopMonitorBtn');
        if (stopBtn) stopBtn.disabled = true;
        const quickAbortBtn = document.getElementById('monQuickAbortBtn');
        if (quickAbortBtn) quickAbortBtn.style.display = 'none';
        const spinner = document.getElementById('monSpinner');
        if (spinner) spinner.style.display = 'none';

        if (data.results && Array.isArray(data.results)) {
            this.monitorResults = data.results;
        }

        const rateEl = document.getElementById('monCountRate');
        if (rateEl && data.rate !== undefined) {
            rateEl.innerText = data.rate.toFixed(1);
        }

        const matchedCount = this.monitorResults.filter(r => r.status === 'matched').length;
        const totalMsgs = this.monitorResults.reduce((acc, r) => acc + (r.matchesCount || 0), 0);
        const exportBtn = document.getElementById('exportMatchedAccountsBtn');
        if (exportBtn) exportBtn.disabled = matchedCount === 0;

        const label = document.getElementById('monProgressLabel');
        if (label) {
            if (data.aborted) {
                label.innerHTML = '<i class="fas fa-stop-circle text-pink me-1"></i> Indexing aborted by operator.';
            } else {
                const elapsedSec = data.elapsedMs ? (data.elapsedMs / 1000).toFixed(1) : ((Date.now() - (this.monitorStartTime || Date.now())) / 1000).toFixed(1);
                const rateText = data.rate ? ` (${data.rate} box/s)` : '';
                label.innerHTML = `<i class="fas fa-check-double text-emerald me-1"></i> Indexing completed in <strong class="text-cyan">${elapsedSec}s</strong>${rateText}: <strong class="text-white">${matchedCount}</strong> matched accounts (<strong class="text-cyan">${totalMsgs}</strong> messages), <strong class="text-pink">${data.failed || 0}</strong> failed.`;
            }
        }

        if (matchedCount > 0) {
            this.playChime('success');
            this.showToast(`Indexing complete: ${matchedCount} matched mailboxes ready for review!`, 'success');
        } else {
            this.playChime('finish');
            this.showToast('Indexing complete. No keyword matches discovered in targeted mailboxes.', 'info');
        }

        this.renderMonitorResults();
    }

    renderMonitorResults() {
        const container = document.getElementById('monitorResultsContainer');
        if (!container) return;

        const matchedTotal = this.monitorResults.filter(r => r.status === 'matched').length;
        const unmatchedTotal = this.monitorResults.filter(r => r.status === 'no_match').length;
        const failedTotal = this.monitorResults.filter(r => r.status === 'auth_failed').length;

        document.getElementById('monFilterCountAll').innerText = this.monitorResults.length;
        document.getElementById('monFilterCountMatched').innerText = matchedTotal;
        document.getElementById('monFilterCountUnmatched').innerText = unmatchedTotal;
        document.getElementById('monFilterCountFailed').innerText = failedTotal;

        let list = this.monitorResults;
        if (this.monitorFilter === 'matched') {
            list = list.filter(r => r.status === 'matched');
        } else if (this.monitorFilter === 'unmatched') {
            list = list.filter(r => r.status === 'no_match');
        } else if (this.monitorFilter === 'failed') {
            list = list.filter(r => r.status === 'auth_failed');
        }

        if (list.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <div class="radar-idle-animation mb-3">
                        <i class="fas fa-satellite-dish fa-3x text-dim" style="opacity: 0.35;"></i>
                    </div>
                    <h6 class="text-white">No Mailbox Records in this View</h6>
                    <p class="small text-muted mb-0">Total indexed accounts: ${this.monitorResults.length}. Try switching filters or start an index run.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(item => {
            const isMatched = item.status === 'matched';
            const isFailed = item.status === 'auth_failed';
            const hostDisplay = item.host ? `${item.host}:${item.port || 993}` : 'Auto IMAP';

            // Provider branding icon
            let providerIcon = 'fas fa-server';
            const domain = (item.account.split('@')[1] || '').toLowerCase();
            if (domain.includes('t-online')) providerIcon = 'fas fa-shield-halved text-pink';
            else if (domain.includes('web.de') || domain.includes('gmx')) providerIcon = 'fas fa-bolt text-cyan';
            else if (domain.includes('gmail')) providerIcon = 'fab fa-google text-danger';
            else if (domain.includes('outlook') || domain.includes('office') || domain.includes('live') || domain.includes('hotmail')) providerIcon = 'fab fa-microsoft text-cyan';
            else if (domain.includes('yahoo')) providerIcon = 'fab fa-yahoo text-purple';
            else if (domain.includes('apple') || domain.includes('icloud')) providerIcon = 'fab fa-apple text-white';

            let statusBadge = '';
            if (isMatched) {
                statusBadge = `<span class="badge bg-emerald text-dark fw-bold"><i class="fas fa-bullseye me-1"></i> ${item.matchesCount || 0} MATCHES</span>`;
            } else if (isFailed) {
                statusBadge = `<span class="badge bg-pink text-white fw-bold"><i class="fas fa-times-circle me-1"></i> AUTH FAILED</span>`;
            } else {
                statusBadge = `<span class="badge bg-elevated text-secondary border border-subtle"><i class="fas fa-check me-1"></i> CLEAN (0 MATCH)</span>`;
            }

            const kwBadges = (item.matchedKeywords || []).map(kw =>
                `<span class="badge bg-purple" style="font-size:0.68rem;">${this.escapeHtml(kw)}</span>`
            ).join(' ');

            return `
                <div class="monitor-account-card ${isMatched ? 'matched' : (isFailed ? 'auth-failed' : 'no-match')}">
                    <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <i class="${providerIcon}"></i>
                            <strong class="text-white" style="font-size: 0.95rem;">${this.escapeHtml(item.account)}</strong>
                            <span class="small text-muted">(${hostDisplay})</span>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>

                    ${kwBadges ? `<div class="mb-2 d-flex flex-wrap gap-1 align-items-center"><span class="small text-muted me-1">Matched Keywords:</span> ${kwBadges}</div>` : ''}

                    ${isFailed ? `<div class="small text-pink mb-2"><i class="fas fa-circle-exclamation me-1"></i> ${this.escapeHtml(item.error || 'Authentication refused')}</div>` : ''}

                    <div class="d-flex justify-content-between align-items-center pt-2 border-top border-subtle flex-wrap gap-2">
                        <div class="small text-secondary">
                            ${isMatched ? `<i class="fas fa-envelope-open me-1 text-cyan"></i> ${item.matchesCount} targeted letter(s) indexed` : '<i class="fas fa-clock me-1"></i> Checked'}
                        </div>
                        <div class="d-flex gap-2">
                            ${isMatched ? `
                                <button class="btn-app btn-app-primary btn-app-sm mon-inspect-btn" data-account="${this.escapeHtml(item.account)}" onclick="dashboard.openMailboxInspector('${this.escapeHtml(item.account).replace(/'/g, "\\'")}')">
                                    <i class="fas fa-envelope-open-text"></i> Inspect (${item.matchesCount})
                                </button>
                            ` : ''}
                            <button class="btn-app btn-app-outline btn-app-sm mon-sub-btn" data-account="${this.escapeHtml(item.account)}" onclick="dashboard.startSubscription('${this.escapeHtml(item.account).replace(/'/g, "\\'")}')" title="Subscribe to live arrival events">
                                <i class="fas fa-tower-broadcast text-cyan"></i> Subscribe
                            </button>
                            <button class="btn-app btn-app-outline btn-app-sm mon-copy-btn" data-account="${this.escapeHtml(item.account)}" onclick="dashboard.copyCredential('${this.escapeHtml(item.account).replace(/'/g, "\\'")}')" title="Copy account email and credentials">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    openMailboxInspector(accountEmail) {
        if (!accountEmail) return;

        const cleanTarget = accountEmail.trim().toLowerCase();
        let record = this.monitorResults.find(r => {
            const acc = (r.account || '').trim().toLowerCase();
            return acc === cleanTarget || acc.includes(cleanTarget) || cleanTarget.includes(acc);
        });

        if (!record) {
            record = {
                account: accountEmail,
                matchedMessages: [],
                matchesCount: 0
            };
        }

        this.selectedInspectAccount = record.account || accountEmail;

        const badgeEl = document.getElementById('monitorInspectorAccountBadge');
        if (badgeEl) badgeEl.innerText = this.selectedInspectAccount;

        const countEl = document.getElementById('inspectorMatchedCount');
        const msgs = record.matchedMessages || [];
        if (countEl) countEl.innerText = msgs.length;

        const listContainer = document.getElementById('inspectorMessagesList');
        if (listContainer) {
            if (msgs.length === 0) {
                listContainer.innerHTML = `
                    <div class="p-4 text-center text-muted">
                        <i class="fas fa-inbox fa-2x mb-2 text-dim" style="opacity: 0.4;"></i>
                        <p class="small mb-0">No matching targeted messages indexed for this mailbox.</p>
                    </div>
                `;
                const subjEl = document.getElementById('inspectorActiveSubject');
                if (subjEl) subjEl.innerText = 'No messages available';
                const iframe = document.getElementById('inspectorLetterIframe');
                if (iframe) iframe.srcdoc = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#888;text-align:center;padding-top:40px;"><p>No messages available for this mailbox.</p></body></html>`;
            } else {
                listContainer.innerHTML = msgs.map((m, idx) => {
                    return `
                        <div class="inspector-msg-item ${idx === 0 ? 'active' : ''}" data-msg-idx="${idx}" onclick="dashboard.selectInspectorMessage(${idx})">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge ${(m.folder || '').toLowerCase().includes('spam') ? 'bg-amber text-dark' : 'bg-cyan text-dark'}" style="font-size: 0.65rem;">${this.escapeHtml(m.folder || 'INBOX')}</span>
                                <span class="small text-muted">${this.escapeHtml(m.date || '')}</span>
                            </div>
                            <div class="fw-bold text-white small text-truncate mb-1">${this.escapeHtml(m.subject || '(No Subject)')}</div>
                            <div class="small text-secondary text-truncate">
                                From: <span class="text-white">${this.escapeHtml(m.senderName || m.senderAddress || '')}</span> &lt;${this.escapeHtml(m.senderAddress || '')}&gt;
                            </div>
                            <div class="mt-1 d-flex gap-1 flex-wrap">
                                ${(m.matchedKeywords || []).map(k => `<span class="badge bg-purple" style="font-size:0.6rem;">${this.escapeHtml(k)}</span>`).join('')}
                                ${(m.links || []).length > 0 ? `<span class="badge bg-elevated border border-subtle text-cyan" style="font-size:0.6rem;"><i class="fas fa-link me-1"></i>${m.links.length} links</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                this.selectInspectorMessage(0);
            }
        }

        // Close subscription modal if currently open to prevent backdrop collision
        const subModalEl = document.getElementById('mailboxSubscriptionModal');
        if (subModalEl) {
            const subModal = bootstrap.Modal.getInstance(subModalEl);
            if (subModal) subModal.hide();
        }

        const modalEl = document.getElementById('mailboxMonitorModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    }

    selectInspectorMessage(idx) {
        const cleanTarget = (this.selectedInspectAccount || '').trim().toLowerCase();
        const record = this.monitorResults.find(r => {
            const acc = (r.account || '').trim().toLowerCase();
            return acc === cleanTarget || acc.includes(cleanTarget) || cleanTarget.includes(acc);
        });
        if (!record || !record.matchedMessages || !record.matchedMessages[idx]) return;

        // Highlight active item
        document.querySelectorAll('.inspector-msg-item').forEach((el, i) => {
            if (i === idx) el.classList.add('active');
            else el.classList.remove('active');
        });

        const msg = record.matchedMessages[idx];
        this.renderLetterBody(msg);
    }

    unpackClientMime(raw) {
        if (!raw) return { html: '', text: '' };
        
        function b64Decode(str) {
            try {
                const clean = str.replace(/\s+/g, '');
                const bin = atob(clean);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return new TextDecoder().decode(bytes);
            } catch(e) {
                return '';
            }
        }

        // 1. Boundary match
        const bMatch = raw.match(/^--([A-Za-z0-9_=\-\.]+)/m) || raw.match(/boundary=["']?([^"';\r\n]+)["']?/i);
        if (bMatch) {
            const boundary = bMatch[1].trim();
            const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const parts = raw.split(new RegExp('--' + escaped + '(?:--)?'));
            for (const part of parts) {
                if (!part.trim() || part.trim() === '--') continue;
                const splitIdx = part.search(/\r?\n\r?\n/);
                const header = splitIdx !== -1 ? part.substring(0, splitIdx) : '';
                const body = splitIdx !== -1 ? part.substring(splitIdx).trim() : part.trim();
                
                const isB64 = /base64/i.test(header) || (/^[A-Za-z0-9+/=\s]{30,}$/.test(body) && !body.includes('<'));
                const decoded = isB64 ? b64Decode(body) : body;
                if (decoded && (decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<table') || decoded.includes('<div') || decoded.includes('<body'))) {
                    return { html: decoded, text: '' };
                }
            }
        }

        // 2. Direct base64 with headers
        const splitIdx = raw.search(/\r?\n\r?\n/);
        if (splitIdx !== -1) {
            const header = raw.substring(0, splitIdx);
            const body = raw.substring(splitIdx).trim();
            if (/base64/i.test(header)) {
                const decoded = b64Decode(body);
                if (decoded && (decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<table') || decoded.includes('<body'))) {
                    return { html: decoded, text: '' };
                }
            }
        }

        // 3. Raw base64 string
        const stripped = raw.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/=]{40,}$/.test(stripped)) {
            const decoded = b64Decode(stripped);
            if (decoded && (decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<table') || decoded.includes('<body'))) {
                return { html: decoded, text: '' };
            }
        }

        return { html: '', text: raw };
    }

    extractLinksFromHtml(html) {
        if (!html) return [];
        const links = [];
        const seen = new Set();
        const aRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(https?:\/\/[^"'\s>]+)\1[^>]*>(.*?)<\/a>/gis;
        let m;
        while ((m = aRegex.exec(html)) !== null) {
            const url = m[2];
            if (seen.has(url)) continue;
            seen.add(url);
            let domain = 'external';
            try { domain = new URL(url).hostname; } catch(e) {}
            const text = m[3].replace(/<[^>]*>/g, '').trim();
            links.push({ url, domain, text: text || domain });
        }
        return links;
    }

    renderLetterBody(msg) {
        if (!msg) return;

        // Auto-unpack MIME or Base64 if htmlBody is missing but textBody contains it
        if (!msg.htmlBody && msg.textBody) {
            const clientUnpacked = this.unpackClientMime(msg.textBody);
            if (clientUnpacked.html) {
                msg.htmlBody = clientUnpacked.html;
                if (!msg.links || msg.links.length === 0) {
                    msg.links = this.extractLinksFromHtml(msg.htmlBody);
                }
            }
        }

        const subjEl = document.getElementById('inspectorActiveSubject');
        const folderEl = document.getElementById('inspectorActiveFolder');
        const senderEl = document.getElementById('inspectorActiveSender');
        const dateEl = document.getElementById('inspectorActiveDate');

        if (subjEl) subjEl.innerText = msg.subject || '(No Subject)';
        if (folderEl) folderEl.innerText = msg.folder || 'INBOX';
        if (senderEl) senderEl.innerText = `${msg.senderName || ''} <${msg.senderAddress || ''}>`;
        if (dateEl) dateEl.innerText = msg.date || '';

        // Extracted links
        const linksContainer = document.getElementById('inspectorLinksList');
        const linksCountBadge = document.getElementById('inspectorLinksCount');
        const links = msg.links || [];

        if (linksCountBadge) linksCountBadge.innerText = links.length;

        if (linksContainer) {
            if (links.length === 0) {
                linksContainer.innerHTML = '<span class="small text-muted">No external links detected in this message.</span>';
            } else {
                linksContainer.innerHTML = links.map(l => {
                    const safeUrl = this.escapeHtml(l.url || '');
                    const safeDomain = this.escapeHtml(l.domain || '');
                    const safeText = this.escapeHtml(l.text || l.domain || safeUrl);
                    return `
                        <div class="extracted-link-item">
                            <span class="badge bg-purple" style="font-size:0.65rem;">${safeDomain}</span>
                            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="extracted-link-btn" title="${safeUrl}">
                                <span>${safeText}</span>
                                <i class="fas fa-arrow-up-right-from-square small"></i>
                            </a>
                            <button class="btn btn-link btn-sm p-0 text-secondary ms-1 copy-link-btn" onclick="navigator.clipboard.writeText('${safeUrl.replace(/'/g, "\\'")}'); dashboard.showToast('Link copied to clipboard', 'info');" title="Copy URL">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }

        // Letter Body Iframe
        const iframe = document.getElementById('inspectorLetterIframe');
        if (iframe) {
            const hasError = msg.textBody && msg.textBody.includes('Body retrieval error');

            if (hasError && !msg._retrying) {
                msg._retrying = true;
                iframe.srcdoc = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { background: #07080b; color: #e5e7eb; font-family: system-ui, -apple-system, sans-serif; padding: 35px 20px; text-align: center; }
                            .loader-box { max-width: 480px; margin: 0 auto; background: #0f1117; border: 1.5px solid #00f0ff; border-radius: 8px; padding: 25px; box-shadow: 0 0 25px rgba(0, 240, 255, 0.15); }
                            .spinner { display: inline-block; width: 40px; height: 40px; border: 3px solid rgba(0, 240, 255, 0.2); border-top-color: #00f0ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 15px; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                            h3 { color: #fff; margin: 0 0 8px 0; font-size: 18px; }
                            p { color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0; }
                            .btn { background: #00f0ff; color: #07080b; font-weight: 700; border: none; padding: 9px 18px; border-radius: 4px; cursor: pointer; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
                        </style>
                    </head>
                    <body>
                        <div class="loader-box">
                            <div class="spinner"></div>
                            <h3>Unpacking Message Payload...</h3>
                            <p>Connecting to IMAP server to fetch and unpack the real HTML letter.</p>
                            <button class="btn" onclick="parent.dashboard.reloadInspectorMessageBody()">Fetch Letter Now</button>
                        </div>
                    </body>
                    </html>
                `;
                // Auto trigger reload from backend with clean parser
                setTimeout(() => this.reloadInspectorMessageBody(msg), 200);
                return;
            }

            if (msg.htmlBody) {
                iframe.srcdoc = this.formatHtmlLetterSample(msg);
            } else if (msg.textBody && !hasError) {
                iframe.srcdoc = this.generateSmartPlainLetterHtml(msg);
            } else if (hasError) {
                iframe.srcdoc = this.generateErrorRecoveryHtml(msg);
            } else if (msg._bodyLoaded) {
                iframe.srcdoc = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#888;text-align:center;padding-top:40px;background:#07080b;"><p>(No message body content)</p></body></html>`;
            } else {
                iframe.srcdoc = `
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family:sans-serif;color:#00f0ff;text-align:center;padding-top:50px;background:#07080b;">
                        <p style="font-size:14px;letter-spacing:1px;"><i class="fas fa-circle-notch fa-spin"></i> Loading message body from IMAP...</p>
                    </body>
                    </html>
                `;
                msg._bodyLoaded = true;
                fetch(`/api/monitor/message-body?account=${encodeURIComponent(this.selectedInspectAccount)}&folder=${encodeURIComponent(msg.folder || 'INBOX')}&uid=${encodeURIComponent(msg.uid)}&force=true`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.success && data.message) {
                            msg.htmlBody = data.message.htmlBody || '';
                            msg.textBody = data.message.textBody || '';
                            msg.links = data.message.links || msg.links || [];
                            delete msg._retrying;
                        }
                        this.renderLetterBody(msg);
                    })
                    .catch(err => {
                        console.warn('Could not fetch letter body:', err);
                        iframe.srcdoc = this.generateErrorRecoveryHtml(msg, err.message);
                    });
            }
        }
    }

    formatHtmlLetterSample(msg) {
        let html = msg.htmlBody || '';
        // Ensure base target is _blank so links open in new tab
        if (!html.includes('<base ')) {
            html = html.replace(/<head[^>]*>/i, '$&\n<base target="_blank">');
            if (!html.includes('<base target="_blank">')) {
                html = `<base target="_blank">\n${html}`;
            }
        }
        return html;
    }

    generateSmartPlainLetterHtml(msg) {
        const text = msg.textBody || '';
        const safeSubject = this.escapeHtml(msg.subject || '(No Subject)');
        const safeSender = this.escapeHtml(msg.senderName || msg.senderAddress || '');
        const safeSenderAddr = this.escapeHtml(msg.senderAddress || '');
        const safeDate = this.escapeHtml(msg.date || '');
        const links = msg.links || [];

        // Detect OTP or verification codes (6-8 digits or alphanumeric security codes)
        let otpCode = null;
        const otpMatch = text.match(/(?:code|otp|pin|passcode|token|verification|verify)[^\w\d]{1,12}([A-Za-z0-9]{4,8})\b/i) || text.match(/\b([0-9]{6})\b/);
        if (otpMatch) {
            otpCode = otpMatch[1];
        }

        // Format plain text paragraphs cleanly
        const paragraphs = text
            .split(/\r?\n\r?\n/)
            .map(p => `<p style="margin:0 0 14px 0;line-height:1.65;font-size:14px;color:#d1d5db;">${this.escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
            .join('');

        const linksHtml = links.length > 0 ? `
            <div style="margin-top:25px;padding-top:18px;border-top:1px solid #1f2937;">
                <div style="font-size:12px;font-weight:bold;color:#00f0ff;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
                    🔗 Action & Verification Links (${links.length}):
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    ${links.map(l => `
                        <a href="${this.escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#141720;border:1.5px solid #00f0ff;color:#fff;padding:8px 14px;border-radius:4px;font-size:13px;text-decoration:none;font-weight:600;">
                            <span>${this.escapeHtml(l.text || l.domain || l.url)}</span>
                            <span style="color:#00f0ff;">↗</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const otpBanner = otpCode ? `
            <div style="background:linear-gradient(135deg, rgba(0, 240, 255, 0.12) 0%, rgba(252, 238, 10, 0.08) 100%);border:2px solid #00f0ff;border-radius:6px;padding:18px 24px;margin:20px 0;text-align:center;box-shadow:0 0 20px rgba(0,240,255,0.2);">
                <div style="color:#00f0ff;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">
                    ⚡ Detected One-Time Verification Passcode (OTP)
                </div>
                <div style="font-size:34px;font-weight:900;color:#fcee0a;letter-spacing:8px;font-family:monospace;margin:6px 0;">
                    ${this.escapeHtml(otpCode)}
                </div>
                <div style="font-size:12px;color:#9ca3af;">
                    Extracted automatically from message body
                </div>
            </div>
        ` : '';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <base target="_blank">
                <style>
                    body { background:#07080b; color:#e5e7eb; font-family:system-ui, -apple-system, sans-serif; margin:0; padding:25px; box-sizing:border-box; }
                    .letter-wrapper { max-width:680px; margin:0 auto; background:#0f1117; border:1px solid #1f2937; border-radius:6px; padding:30px; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
                    .letter-header { border-bottom:1px solid #1f2937; padding-bottom:18px; margin-bottom:20px; }
                    .letter-subj { font-size:22px; font-weight:700; color:#fff; margin:0 0 10px 0; line-height:1.3; }
                    .meta-row { font-size:13px; color:#9ca3af; line-height:1.5; }
                    .meta-val { color:#fff; font-weight:600; }
                </style>
            </head>
            <body>
                <div class="letter-wrapper">
                    <div class="letter-header">
                        <div class="letter-subj">${safeSubject}</div>
                        <div class="meta-row">From: <span class="meta-val">${safeSender}</span> &lt;${safeSenderAddr}&gt;</div>
                        <div class="meta-row">Date: <span>${safeDate}</span></div>
                    </div>
                    ${otpBanner}
                    <div class="letter-content">
                        ${paragraphs}
                    </div>
                    ${linksHtml}
                </div>
            </body>
            </html>
        `;
    }

    generateErrorRecoveryHtml(msg, customErr = null) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { background: #07080b; color: #e5e7eb; font-family: system-ui, -apple-system, sans-serif; padding: 40px 20px; text-align: center; }
                    .card { max-width: 480px; margin: 0 auto; background: #0f1117; border: 1.5px solid #ff003c; border-radius: 8px; padding: 26px; box-shadow: 0 0 25px rgba(255, 0, 60, 0.2); }
                    h3 { color: #fff; margin: 0 0 10px 0; font-size: 18px; }
                    p { color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0; }
                    .btn-retry { background: #00f0ff; color: #07080b; font-weight: 800; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; text-transform: uppercase; font-size: 13px; letter-spacing: 1px; transition: all 0.2s ease; box-shadow: 0 0 15px rgba(0, 240, 255, 0.4); }
                    .btn-retry:hover { background: #fcee0a; box-shadow: 0 0 20px rgba(252, 238, 10, 0.6); }
                </style>
            </head>
            <body>
                <div class="card">
                    <div style="font-size: 32px; margin-bottom: 10px;">⚡</div>
                    <h3>Letter Retrieval Recovery</h3>
                    <p>The message body requires an on-demand fresh unpack from the IMAP server. Click below to load and view the full visual letter.</p>
                    <button class="btn-retry" onclick="parent.dashboard.reloadInspectorMessageBody()">
                        ↻ Fetch & View Letter Sample
                    </button>
                    ${customErr ? `<div style="margin-top: 15px; font-size: 11px; color: #6b7280;">(${this.escapeHtml(customErr)})</div>` : ''}
                </div>
            </body>
            </html>
        `;
    }

    reloadInspectorMessageBody(targetMsg = null) {
        let msg = targetMsg;
        if (!msg) {
            const cleanTarget = (this.selectedInspectAccount || '').trim().toLowerCase();
            const record = this.monitorResults.find(r => (r.account || '').trim().toLowerCase() === cleanTarget);
            const activeEl = document.querySelector('.inspector-msg-item.active');
            const idx = activeEl ? parseInt(activeEl.getAttribute('data-msg-idx'), 10) : 0;
            if (record && record.matchedMessages && record.matchedMessages[idx]) {
                msg = record.matchedMessages[idx];
            }
        }
        if (!msg) return;

        const iframe = document.getElementById('inspectorLetterIframe');
        if (iframe) {
            iframe.srcdoc = `
                <!DOCTYPE html>
                <html>
                <body style="font-family:sans-serif;color:#00f0ff;background:#07080b;text-align:center;padding-top:60px;">
                    <div style="font-size:28px;margin-bottom:10px;">⚡</div>
                    <h3 style="color:#fff;margin:0 0 8px 0;">Connecting to IMAP & Unpacking...</h3>
                    <p style="color:#9ca3af;font-size:13px;">Retrieving full letter HTML payload</p>
                </body>
                </html>
            `;
        }

        fetch(`/api/monitor/message-body?account=${encodeURIComponent(this.selectedInspectAccount)}&folder=${encodeURIComponent(msg.folder || 'INBOX')}&uid=${encodeURIComponent(msg.uid)}&force=true`)
            .then(r => r.json())
            .then(data => {
                if (data.success && data.message) {
                    msg.htmlBody = data.message.htmlBody || '';
                    msg.textBody = data.message.textBody || '';
                    msg.links = data.message.links || msg.links || [];
                    delete msg._retrying;
                    this.renderLetterBody(msg);
                    this.showToast('Letter retrieved & unpacked successfully', 'success');
                } else {
                    throw new Error(data.error || 'Failed to fetch letter');
                }
            })
            .catch(err => {
                console.warn('Reload error:', err);
                if (iframe) {
                    iframe.srcdoc = this.generateErrorRecoveryHtml(msg, err.message);
                }
            });
    }

    async startSubscription(accountEmail, password = '') {
        if (!accountEmail) return;

        accountEmail = accountEmail.trim();
        this.activeSubscriptionAccount = accountEmail;

        const label = document.getElementById('subModalAccountLabel');
        if (label) label.innerText = accountEmail;

        const connectBox = document.getElementById('subModalConnectBox');
        const emailInput = document.getElementById('subModalEmailInput');
        const passInput = document.getElementById('subModalPassInput');
        if (emailInput) emailInput.value = accountEmail;

        // Auto-extract password from monitorRawInput if not passed directly
        if (!password) {
            const rawText = document.getElementById('monitorRawInput')?.value || '';
            const lines = rawText.split('\n').map(l => l.trim());
            for (const line of lines) {
                if (line.toLowerCase().includes(accountEmail.toLowerCase())) {
                    if (line.includes('|')) {
                        const parts = line.split('|').map(p => p.trim());
                        if (parts.length >= 4) password = parts.slice(3).join('|');
                        else if (parts.length === 2) password = parts[1];
                    } else if (line.includes(':')) {
                        const colon = line.indexOf(':');
                        password = line.substring(colon + 1).trim();
                    }
                    if (password) break;
                }
            }
        }

        // Close inspector modal if open to prevent stacking backdrop glitch
        const inspectModalEl = document.getElementById('mailboxMonitorModal');
        if (inspectModalEl) {
            const inspectModal = bootstrap.Modal.getInstance(inspectModalEl);
            if (inspectModal) inspectModal.hide();
        }

        const modalEl = document.getElementById('mailboxSubscriptionModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }

        const statusBadge = document.getElementById('subModalStatusBadge');

        // If password is required and not present in input or store
        if (!password) {
            if (connectBox) connectBox.style.display = 'block';
            if (statusBadge) {
                statusBadge.className = 'badge bg-amber text-dark mt-1';
                statusBadge.innerHTML = '<i class="fas fa-key me-1"></i> Enter password below to start live stream';
            }
            if (passInput) passInput.focus();
            this.showToast('Please enter mailbox password to start live subscription', 'warning');
            return;
        }

        if (connectBox) connectBox.style.display = 'none';

        if (statusBadge) {
            statusBadge.className = 'badge bg-cyan text-dark mt-1';
            statusBadge.innerHTML = '<i class="fas fa-circle-notch fa-spin me-1"></i> Attaching Live IMAP Listener...';
        }

        const pulseSelect = document.getElementById('subModalPulseSelect');
        const pollInterval = parseInt(pulseSelect?.value, 10) || 2500;
        const pulseBadge = document.getElementById('subModalPulseBadge');
        if (pulseBadge) pulseBadge.innerHTML = `<i class="fas fa-bolt text-cyan me-1"></i> ${(pollInterval / 1000).toFixed(1)}s Turbo Pulse`;

        try {
            const res = await fetch('/api/monitor/subscription/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: accountEmail,
                    password: password,
                    keywords: this.monitorKeywords,
                    pollInterval
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to attach mailbox subscription');
            }

            if (statusBadge) {
                statusBadge.className = 'badge bg-emerald text-dark mt-1';
                statusBadge.innerHTML = '<i class="fas fa-satellite-dish me-1"></i> Live: Listening for arrivals';
            }
            this.playChime('start');
            this.showToast(`Subscribed to live events on ${accountEmail}`, 'success');
        } catch (err) {
            if (connectBox) connectBox.style.display = 'block';
            if (statusBadge) {
                statusBadge.className = 'badge bg-pink text-white mt-1';
                statusBadge.innerHTML = `<i class="fas fa-times-circle me-1"></i> ${this.escapeHtml(err.message)}`;
            }
            this.showToast(`Subscription error: ${err.message}`, 'error');
        }
    }

    async stopSubscription() {
        try {
            await fetch('/api/monitor/subscription/stop', { method: 'POST' });
            const statusBadge = document.getElementById('subModalStatusBadge');
            if (statusBadge) {
                statusBadge.className = 'badge bg-secondary mt-1';
                statusBadge.innerHTML = '<i class="fas fa-power-off me-1"></i> Subscription inactive';
            }
            this.showToast('Live subscription stopped', 'info');
        } catch (e) {
            this.showToast('Failed to stop subscription', 'error');
        }
    }

    handleSubscriptionEvent(eventData) {
        this.playChime('inbox');
        this.subscriptionEvents.unshift(eventData);

        const countBadge = document.getElementById('subModalEventsCount');
        if (countBadge) countBadge.innerText = `${this.subscriptionEvents.length} Events Received`;

        const emptyState = document.getElementById('subModalEmptyState');
        if (emptyState) emptyState.style.display = 'none';

        const feed = document.getElementById('subModalEventsFeed');
        if (feed) {
            const safeAccount = this.escapeHtml(eventData.account);
            const safeSubject = this.escapeHtml(eventData.subject);
            const safeSender = this.escapeHtml(eventData.senderName || eventData.senderAddress);
            const safeTime = this.escapeHtml(eventData.receivedAt || new Date().toLocaleTimeString());
            const kwHtml = (eventData.matchedKeywords || []).map(k => `<span class="badge bg-purple" style="font-size:0.65rem;">${this.escapeHtml(k)}</span>`).join(' ');

            const linksHtml = (eventData.links || []).slice(0, 3).map(l =>
                `<a href="${this.escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="badge bg-elevated border border-subtle text-cyan text-decoration-none">
                    <i class="fas fa-external-link-alt me-1"></i> ${this.escapeHtml(l.domain)}
                </a>`
            ).join(' ');

            const card = document.createElement('div');
            card.className = 'sub-event-card mb-2';
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                    <div>
                        <span class="badge bg-cyan text-dark" style="font-size: 0.65rem;">NEW ARRIVAL</span>
                        <strong class="text-white ms-1 small">${safeSender}</strong>
                        <span class="small text-muted">&lt;${this.escapeHtml(eventData.senderAddress)}&gt;</span>
                    </div>
                    <span class="small text-secondary"><i class="fas fa-clock me-1"></i> ${safeTime}</span>
                </div>
                <h6 class="text-white mb-1 fw-bold">${safeSubject}</h6>
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2 pt-1 border-top border-subtle">
                    <div class="d-flex gap-1 align-items-center flex-wrap">
                        ${kwHtml}
                        ${linksHtml}
                    </div>
                    <button class="btn-app btn-app-primary btn-app-sm" onclick="dashboard.openEventInInspector('${safeAccount.replace(/'/g, "\\'")}', '${this.escapeHtml(String(eventData.uid)).replace(/'/g, "\\'")}')">
                        <i class="fas fa-envelope-open-text"></i> Open Letter
                    </button>
                </div>
            `;
            feed.prepend(card);
        }

        this.showToast(`New email match in ${eventData.account}: ${eventData.subject}`, 'info');
    }

    handleSubscriptionStopped(data) {
        const statusBadge = document.getElementById('subModalStatusBadge');
        if (statusBadge) {
            statusBadge.className = 'badge bg-secondary mt-1';
            statusBadge.innerHTML = '<i class="fas fa-power-off me-1"></i> Subscription disconnected';
        }
    }

    openEventInInspector(accountEmail, uid) {
        let record = this.monitorResults.find(r => r.account.toLowerCase() === accountEmail.toLowerCase());
        const eventItem = this.subscriptionEvents.find(e => e.account.toLowerCase() === accountEmail.toLowerCase() && String(e.uid) === String(uid));

        if (!record && eventItem) {
            record = {
                account: accountEmail,
                status: 'matched',
                matchedMessages: [eventItem],
                matchesCount: 1,
                matchedKeywords: eventItem.matchedKeywords || []
            };
            this.monitorResults.push(record);
        } else if (record && eventItem) {
            if (!record.matchedMessages.some(m => String(m.uid) === String(uid))) {
                record.matchedMessages.unshift(eventItem);
                record.matchesCount = record.matchedMessages.length;
            }
        }

        this.openMailboxInspector(accountEmail);
    }

    exportMatchedAccounts() {
        const matched = this.monitorResults.filter(r => r.status === 'matched');
        if (matched.length === 0) {
            this.showToast('No matched accounts available to export', 'warning');
            return;
        }

        const lines = matched.map(r => {
            const hostInfo = r.host ? `${r.host}:${r.port || 993}` : 'IMAP';
            const kws = (r.matchedKeywords || []).join(', ');
            return `${r.account} | Server: ${hostInfo} | Matches: ${r.matchesCount || 0} | Keywords: [${kws}]`;
        });

        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `matched_mailboxes_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`Exported ${matched.length} matched mailboxes to TXT`, 'success');
    }

    copyCredential(accountEmail) {
        if (!accountEmail) return;
        const input = document.getElementById('monitorRawInput');
        let textToCopy = accountEmail;
        if (input && input.value) {
            const matchLine = input.value.split('\n').map(l => l.trim()).find(l => l.toLowerCase().includes(accountEmail.toLowerCase()));
            if (matchLine) {
                textToCopy = matchLine;
            }
        }

        navigator.clipboard.writeText(textToCopy)
            .then(() => this.showToast(`Copied credentials for ${accountEmail}`, 'info'))
            .catch(() => this.showToast(`Copied: ${textToCopy}`, 'info'));
    }

    /* ==========================================================================
       Combo SMTP Hunter & Matrix Validator
       ========================================================================== */

    setupHunterEventListeners() {
        const rawInput = document.getElementById('hunterRawInput');
        const pasteBtn = document.getElementById('hunterPasteBtn');
        const uploadBtn = document.getElementById('hunterUploadBtn');
        const fileInput = document.getElementById('hunterFileInput');
        const clearBtn = document.getElementById('hunterClearInputBtn');
        const startBtn = document.getElementById('startHunterBtn');
        const stopBtn = document.getElementById('stopHunterBtn');
        const testSendToggle = document.getElementById('hunterTestSendToggle');
        const testRecipientGroup = document.getElementById('hunterTestSendRecipientGroup');

        if (rawInput) {
            rawInput.addEventListener('input', () => this.updateHunterLineCount());
            rawInput.addEventListener('change', () => this.updateHunterLineCount());
        }

        if (pasteBtn) {
            pasteBtn.addEventListener('click', async () => {
                this.playChime('click');
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && rawInput) {
                        rawInput.value = text;
                        this.updateHunterLineCount();
                        this.showToast('Pasted combos from clipboard', 'info');
                    }
                } catch (e) {
                    this.showToast('Please paste directly into the textarea', 'warning');
                }
            });
        }

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                this.playChime('click');
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (rawInput) {
                        rawInput.value = ev.target.result;
                        this.updateHunterLineCount();
                        this.showToast(`Loaded ${file.name}`, 'success');
                    }
                };
                reader.readAsText(file);
                fileInput.value = '';
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.playChime('click');
                if (rawInput) {
                    rawInput.value = '';
                    this.updateHunterLineCount();
                    this.showToast('Combo input cleared', 'info');
                }
            });
        }

        if (testSendToggle && testRecipientGroup) {
            testSendToggle.addEventListener('change', (e) => {
                testRecipientGroup.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        const testRecipientInput = document.getElementById('hunterTestRecipient');
        if (testRecipientInput) {
            const updateTargetBadge = () => {
                const lines = testRecipientInput.value.split('\n').map(l => l.trim()).filter(l => l && l.includes('@'));
                const domains = new Set(lines.map(l => l.split('@')[1].split(':')[0].split('|')[0].toLowerCase().trim()));
                const badge = document.getElementById('hunterTargetDomainBadge');
                if (badge) badge.textContent = `${domains.size} domain${domains.size === 1 ? '' : 's'}`;
            };
            testRecipientInput.addEventListener('input', updateTargetBadge);
            testRecipientInput.addEventListener('change', updateTargetBadge);
        }

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startComboHunter());
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopComboHunter());
        }

        // Filter tabs
        document.querySelectorAll('#section-combo-hunter [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.playChime('click');
                document.querySelectorAll('#section-combo-hunter [data-filter]').forEach(b => b.classList.remove('active'));
                const targetBtn = e.currentTarget;
                targetBtn.classList.add('active');
                this.hunterFilter = targetBtn.getAttribute('data-filter') || 'all';
                this.renderHunterResults();
            });
        });

        // Export Actions
        const saveToHubBtn = document.getElementById('hunterSaveToHubBtn');
        if (saveToHubBtn) {
            saveToHubBtn.addEventListener('click', () => this.saveHunterHitsToHub());
        }

        const exportValidBtn = document.getElementById('hunterExportValidBtn');
        if (exportValidBtn) {
            exportValidBtn.addEventListener('click', () => this.exportHunterValidHits());
        }

        const exportCombosBtn = document.getElementById('hunterExportCombosBtn');
        if (exportCombosBtn) {
            exportCombosBtn.addEventListener('click', () => this.exportHunterCombos());
        }

        const copyValidBtn = document.getElementById('hunterCopyValidBtn');
        if (copyValidBtn) {
            copyValidBtn.addEventListener('click', () => this.copyHunterValidToClipboard());
        }

        // Drag and drop on dropzone
        const dropzone = document.getElementById('hunterDropzone');
        if (dropzone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('border-cyan');
                }, false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('border-cyan');
                }, false);
            });
            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (rawInput) {
                            rawInput.value = ev.target.result;
                            this.updateHunterLineCount();
                            this.showToast(`Dropped & loaded ${files[0].name}`, 'success');
                        }
                    };
                    reader.readAsText(files[0]);
                }
            });
        }
    }

    updateHunterLineCount() {
        const input = document.getElementById('hunterRawInput');
        const badge = document.getElementById('hunterInputLineCount');
        if (!input || !badge) return;

        const count = input.value
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#')).length;

        badge.textContent = `${count.toLocaleString()} combos`;
    }

    async startComboHunter() {
        if (this.hunterRunning) return;

        const rawInput = document.getElementById('hunterRawInput');
        if (!rawInput || !rawInput.value.trim()) {
            this.showToast('Please enter or paste combo credentials first', 'warning');
            return;
        }

        const concurrencyInput = document.getElementById('hunterConcurrency');
        const timeoutInput = document.getElementById('hunterTimeout');
        const shuffleToggle = document.getElementById('hunterShuffleToggle');
        const testSendToggle = document.getElementById('hunterTestSendToggle');
        const testRecipientInput = document.getElementById('hunterTestRecipient');
        const testStrategySelect = document.getElementById('hunterTestStrategy');

        const ports = [];
        if (document.getElementById('hunterPort587')?.checked) ports.push(587);
        if (document.getElementById('hunterPort465')?.checked) ports.push(465);
        if (document.getElementById('hunterPort25')?.checked) ports.push(25);

        if (ports.length === 0) {
            this.showToast('Select at least one port to probe (587, 465, or 25)', 'warning');
            return;
        }

        const concurrency = parseInt(concurrencyInput?.value) || 30;
        const timeout = parseInt(timeoutInput?.value) || 8000;
        const shuffle = !!shuffleToggle?.checked;
        const sendTest = !!testSendToggle?.checked;
        const testRecipientRaw = testRecipientInput?.value?.trim() || '';
        const testStrategy = testStrategySelect?.value || 'all';

        // Parse test target mailboxes
        const testTargets = [];
        if (sendTest) {
            if (!testRecipientRaw) {
                this.showToast('Please enter at least one test mailbox in the test box', 'warning');
                return;
            }
            const lines = testRecipientRaw.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                let email = '';
                let pass = '';
                if (line.includes('|')) {
                    const p = line.split('|');
                    email = p[0].trim();
                    pass = p.slice(1).join('|').trim();
                } else if (line.includes(':') && line.indexOf(':') > line.indexOf('@')) {
                    const idx = line.indexOf(':');
                    email = line.substring(0, idx).trim();
                    pass = line.substring(idx + 1).trim();
                } else {
                    email = line.trim();
                }
                if (email && email.includes('@')) {
                    const domain = email.split('@')[1].toLowerCase().trim();
                    testTargets.push({ email, pass, domain });
                }
            }

            if (testTargets.length === 0) {
                this.showToast('Please provide at least one valid test email address', 'warning');
                return;
            }
        }

        this.playChime('click');
        this.hunterRunning = true;
        this.hunterResults = [];

        // Update UI controls
        const startBtn = document.getElementById('startHunterBtn');
        const stopBtn = document.getElementById('stopHunterBtn');
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        // Reset HUD Telemetry
        document.getElementById('hunterCountChecked').textContent = '0';
        document.getElementById('hunterCountTotal').textContent = '...';
        document.getElementById('hunterCountValid').textContent = '0';
        if (document.getElementById('hunterCountInbox')) document.getElementById('hunterCountInbox').textContent = '0';
        if (document.getElementById('hunterCountSpam')) document.getElementById('hunterCountSpam').textContent = '0';
        document.getElementById('hunterCountSent').textContent = '0';
        document.getElementById('hunterCps').textContent = '0.0';
        document.getElementById('hunterElapsed').textContent = '0s';
        document.getElementById('hunterProgressBar').style.width = '0%';
        document.getElementById('hunterHitsBadge').textContent = '0 Hits';

        // Clear table and show empty/loading state
        this.renderHunterResults();

        try {
            const res = await fetch('/api/combo-hunter/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comboList: rawInput.value,
                    concurrency,
                    timeout,
                    ports,
                    shuffle,
                    sendTest,
                    testTargets,
                    testStrategy
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to start Combo Hunter');
            }

            document.getElementById('hunterCountTotal').textContent = data.total.toLocaleString();
            this.showToast(`Hunter initialized: ${data.total} combos with ${data.threads} threads`, 'info');
        } catch (err) {
            this.hunterRunning = false;
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            this.showToast(err.message, 'danger');
        }
    }

    async stopComboHunter() {
        this.playChime('click');
        try {
            await fetch('/api/combo-hunter/stop', { method: 'POST' });
            this.showToast('Dispatched abort signal to worker threads...', 'warning');
        } catch (e) {
            this.showToast('Error sending abort signal', 'danger');
        }
    }

    handleHunterProgress(stats) {
        if (!stats) return;

        const checkedEl = document.getElementById('hunterCountChecked');
        const totalEl = document.getElementById('hunterCountTotal');
        const validEl = document.getElementById('hunterCountValid');
        const inboxEl = document.getElementById('hunterCountInbox');
        const spamEl = document.getElementById('hunterCountSpam');
        const sentEl = document.getElementById('hunterCountSent');
        const cpsEl = document.getElementById('hunterCps');
        const elapsedEl = document.getElementById('hunterElapsed');
        const barEl = document.getElementById('hunterProgressBar');
        const hitsBadge = document.getElementById('hunterHitsBadge');
        const sidebarBadge = document.getElementById('sidebarHunterBadge');

        if (checkedEl) checkedEl.textContent = (stats.checked || 0).toLocaleString();
        if (totalEl) totalEl.textContent = (stats.total || 0).toLocaleString();
        if (validEl) validEl.textContent = (stats.valid || 0).toLocaleString();
        if (inboxEl) inboxEl.textContent = (stats.inbox || 0).toLocaleString();
        if (spamEl) spamEl.textContent = (stats.spam || 0).toLocaleString();
        if (sentEl) sentEl.textContent = (stats.sent || 0).toLocaleString();
        if (cpsEl) cpsEl.textContent = (stats.cps || 0).toFixed(1);
        if (elapsedEl) elapsedEl.textContent = stats.elapsed || '0s';

        if (barEl && stats.total > 0) {
            const pct = Math.min(Math.round(((stats.checked || 0) / stats.total) * 100), 100);
            barEl.style.width = `${pct}%`;
        }

        if (hitsBadge) {
            hitsBadge.textContent = `${(stats.valid || 0)} Hits`;
        }

        if (sidebarBadge) {
            if (stats.valid > 0) {
                sidebarBadge.style.display = 'inline-block';
                sidebarBadge.textContent = stats.valid.toString();
            }
        }

        // Update filter counts
        const allCount = document.getElementById('hunterFilterCountAll');
        const validCount = document.getElementById('hunterFilterCountValid');
        const inboxCount = document.getElementById('hunterFilterCountInbox');
        const spamCount = document.getElementById('hunterFilterCountSpam');
        const sentCount = document.getElementById('hunterFilterCountSent');

        if (allCount) allCount.textContent = (this.hunterResults.length).toString();
        if (validCount) validCount.textContent = (stats.valid || 0).toString();
        if (inboxCount) inboxCount.textContent = (this.hunterResults.filter(r => r.inbox).length).toString();
        if (spamCount) spamCount.textContent = (this.hunterResults.filter(r => r.spam).length).toString();
        if (sentCount) sentCount.textContent = (stats.sent || 0).toString();
    }

    updateHunterActionButtons() {
        const inboxHits = this.hunterResults.filter(r => r.inbox === true);
        const validHits = this.hunterResults.filter(r => r.status === 'valid');

        const saveToHubBtn = document.getElementById('hunterSaveToHubBtn');
        if (saveToHubBtn) {
            saveToHubBtn.disabled = inboxHits.length === 0;
            saveToHubBtn.innerHTML = inboxHits.length > 0
                ? `<i class="fas fa-cloud-arrow-up me-1"></i> Add to SMTP Hub (${inboxHits.length} Inbox)`
                : `<i class="fas fa-cloud-arrow-up me-1"></i> Add to SMTP Hub`;
            saveToHubBtn.title = inboxHits.length > 0
                ? `Append ${inboxHits.length} verified INBOX node(s) to smtp.txt`
                : 'Append verified INBOX nodes to smtp.txt (Run tests to verify inbox first)';
        }

        const exportValidBtn = document.getElementById('hunterExportValidBtn');
        if (exportValidBtn) exportValidBtn.disabled = validHits.length === 0;

        const exportCombosBtn = document.getElementById('hunterExportCombosBtn');
        if (exportCombosBtn) exportCombosBtn.disabled = validHits.length === 0;

        const copyValidBtn = document.getElementById('hunterCopyValidBtn');
        if (copyValidBtn) copyValidBtn.disabled = validHits.length === 0;
    }

    handleHunterHit(hit) {
        if (!hit) return;
        this.hunterResults.unshift(hit);
        this.playChime('success');

        this.updateHunterActionButtons();
        this.renderHunterResults();
    }

    handleHunterDeliveryUpdate(update) {
        if (!update) return;
        const hit = this.hunterResults.find(r => r.user === update.user && r.host === update.host && r.port === update.port);
        if (hit) {
            if (update.deliveries) hit.deliveries = update.deliveries;
            if (typeof update.inbox === 'boolean') hit.inbox = update.inbox;
            if (typeof update.spam === 'boolean') hit.spam = update.spam;
            if (update.inbox) this.playChime('success');
        }
        if (update.stats) {
            this.handleHunterProgress(update.stats);
        }
        this.updateHunterActionButtons();
        this.renderHunterResults();
    }

    handleHunterDone(data) {
        this.hunterRunning = false;
        const startBtn = document.getElementById('startHunterBtn');
        const stopBtn = document.getElementById('stopHunterBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        this.playChime('finish');
        const validHits = data?.stats?.valid || 0;
        const inboxHits = data?.stats?.inbox || 0;
        this.showToast(`Combo Hunter completed: ${validHits} valid SMTPs (${inboxHits} inbox landed)`, 'success');

        this.updateHunterActionButtons();
        this.renderHunterResults();
    }

    renderHunterResults() {
        const emptyState = document.getElementById('hunterEmptyState');
        const tableWrapper = document.getElementById('hunterTableWrapper');
        const tbody = document.getElementById('hunterResultsTableBody');
        if (!emptyState || !tableWrapper || !tbody) return;

        let filtered = this.hunterResults;
        if (this.hunterFilter === 'valid') {
            filtered = this.hunterResults.filter(r => r.status === 'valid');
        } else if (this.hunterFilter === 'inbox') {
            filtered = this.hunterResults.filter(r => r.inbox);
        } else if (this.hunterFilter === 'spam') {
            filtered = this.hunterResults.filter(r => r.spam);
        } else if (this.hunterFilter === 'sent') {
            filtered = this.hunterResults.filter(r => r.sent);
        }

        if (filtered.length === 0) {
            if (this.hunterResults.length === 0) {
                emptyState.style.display = 'block';
                tableWrapper.style.display = 'none';
            } else {
                emptyState.style.display = 'none';
                tableWrapper.style.display = 'block';
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted small">No items match the active filter.</td></tr>`;
            }
            return;
        }

        emptyState.style.display = 'none';
        tableWrapper.style.display = 'block';

        tbody.innerHTML = filtered.slice(0, 100).map((r, idx) => {
            const secBadge = r.secure
                ? '<span class="badge bg-purple" style="font-size: 0.65rem;">SSL</span>'
                : '<span class="badge bg-secondary" style="font-size: 0.65rem;">TLS</span>';

            let deliveryPills = '<span class="text-muted small">N/A</span>';
            if (Array.isArray(r.deliveries) && r.deliveries.length > 0) {
                deliveryPills = r.deliveries.map(d => {
                    let pillClass = 'bg-secondary text-light';
                    let icon = 'fa-paper-plane';
                    if (d.placement === 'inbox') {
                        pillClass = 'bg-emerald text-dark fw-bold';
                        icon = 'fa-inbox';
                    } else if (d.placement === 'spam') {
                        pillClass = 'bg-pink text-white';
                        icon = 'fa-triangle-exclamation';
                    } else if (d.placement === 'relay') {
                        if (d.folder && d.folder.includes('QUEUED')) {
                            pillClass = 'bg-info bg-opacity-25 text-info border border-info';
                            icon = 'fa-spinner fa-spin';
                        } else {
                            pillClass = 'bg-purple text-white';
                            icon = 'fa-check';
                        }
                    }
                    return `<span class="badge ${pillClass} me-1 mb-1" title="${d.target}: ${d.folder} (${d.latency || 0}ms)" style="font-size: 0.7rem;">
                        <i class="fas ${icon} me-1"></i>${d.domain}: ${d.folder}
                    </span>`;
                }).join('');
            } else if (r.sent) {
                deliveryPills = '<span class="badge bg-purple"><i class="fas fa-check-double me-1"></i> Delivered</span>';
            }

            const statusBadge = '<span class="badge bg-emerald"><i class="fas fa-circle-check me-1"></i> Valid</span>';

            return `
                <tr>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="fw-bold text-white text-truncate" style="max-width: 170px;" title="${r.user}">
                            ${r.user}
                        </div>
                        <div class="text-muted small font-monospace text-truncate" style="max-width: 170px;">
                            ${r.pass}
                        </div>
                    </td>
                    <td>
                        <span class="text-cyan fw-bold">${r.host}:${r.port}</span> ${secBadge}
                    </td>
                    <td>
                        <span class="badge bg-elevated text-light">${r.latency || 0} ms</span>
                    </td>
                    <td>
                        <div class="d-flex flex-wrap align-items-center" style="max-width: 250px;">
                            ${deliveryPills}
                        </div>
                    </td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button class="btn-app btn-app-outline btn-app-sm ${r.inbox ? 'text-emerald' : 'text-muted opacity-50'} py-1 px-2" 
                                    title="${r.inbox ? 'Save verified INBOX node to SMTP Hub' : 'Only SMTPs verified in INBOX can be added'}" 
                                    onclick="window.dashboard.addSingleHunterHitToHub(${idx})">
                                <i class="fas fa-plus"></i> Hub
                            </button>
                            <button class="btn-app btn-app-outline btn-app-sm py-1 px-2" title="Copy host|port|user|pass" onclick="window.dashboard.copyHunterSingleHit(${idx})">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async addSingleHunterHitToHub(index) {
        const hit = this.hunterResults[index];
        if (!hit) return;

        if (!hit.inbox) {
            this.showToast('Only SMTPs verified to land in INBOX can be added to SMTP Hub.', 'warning');
            return;
        }

        this.playChime('click');
        try {
            const res = await fetch('/api/combo-hunter/save-to-smtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hits: [hit], onlyInbox: true })
            });
            const data = await res.json();
            if (res.ok) {
                this.showToast(`Added ${hit.host}:${hit.port} to SMTP Hub!`, 'success');
                this.loadSmtp();
            } else {
                this.showToast(data.error || 'Failed to add node', 'danger');
            }
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    copyHunterSingleHit(index) {
        const hit = this.hunterResults[index];
        if (!hit) return;
        const line = `${hit.host}|${hit.port}|${hit.user}|${hit.pass}`;
        navigator.clipboard.writeText(line)
            .then(() => this.showToast(`Copied: ${hit.host}:${hit.port}`, 'info'))
            .catch(() => this.showToast(line, 'info'));
    }

    async saveHunterHitsToHub() {
        const inboxHits = this.hunterResults.filter(r => r.inbox === true);
        if (inboxHits.length === 0) {
            this.showToast('No verified INBOX hits found. Only SMTPs verified to land in INBOX are added to SMTP Hub.', 'warning');
            return;
        }

        this.playChime('click');
        try {
            const res = await fetch('/api/combo-hunter/save-to-smtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hits: inboxHits, onlyInbox: true })
            });
            const data = await res.json();
            if (res.ok) {
                const msg = data.updatedCount > 0
                    ? `Saved ${data.addedCount} new & updated ${data.updatedCount} INBOX-verified nodes to SMTP Hub!`
                    : `Saved ${data.addedCount} verified INBOX SMTP(s) to SMTP Hub!`;
                this.showToast(msg, 'success');
                this.loadSmtp();
            } else {
                this.showToast(data.error || 'Failed to save hits', 'danger');
            }
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    exportHunterValidHits() {
        const validHits = this.hunterResults.filter(r => r.status === 'valid');
        if (validHits.length === 0) {
            this.showToast('No valid hits to export', 'warning');
            return;
        }

        const lines = validHits.map(r => {
            let domainStr = '';
            if (Array.isArray(r.deliveries) && r.deliveries.length > 0) {
                const verified = r.deliveries
                    .filter(d => d.sent || d.placement === 'inbox' || d.placement === 'relay')
                    .map(d => d.domain ? d.domain.toLowerCase().trim() : '')
                    .filter(Boolean);
                if (verified.length > 0) {
                    domainStr = `|${[...new Set(verified)].join(',')}`;
                }
            }
            return `${r.host}|${r.port}|${r.user}|${r.pass}${domainStr}`;
        }).join('\n');

        const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `valid_smtps_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`Exported ${validHits.length} valid SMTPs to TXT`, 'success');
    }

    exportHunterCombos() {
        const validHits = this.hunterResults.filter(r => r.status === 'valid');
        if (validHits.length === 0) {
            this.showToast('No valid combos to export', 'warning');
            return;
        }

        const lines = validHits.map(r => `${r.user}:${r.pass}`).join('\n');
        const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `valid_combos_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`Exported ${validHits.length} valid combo pairs to TXT`, 'success');
    }

    copyHunterValidToClipboard() {
        const validHits = this.hunterResults.filter(r => r.status === 'valid');
        if (validHits.length === 0) {
            this.showToast('No valid hits to copy', 'warning');
            return;
        }

        const text = validHits.map(r => `${r.host}|${r.port}|${r.user}|${r.pass}`).join('\n');
        navigator.clipboard.writeText(text)
            .then(() => this.showToast(`Copied ${validHits.length} valid SMTPs to clipboard!`, 'success'))
            .catch(() => this.showToast('Failed to copy to clipboard', 'danger'));
    }
}

// Global initialization on DOM ready
let dashboard = null;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new AIMailerDashboard();
    window.dashboard = dashboard;
});