// ================= CONFIGURATION =================
const API_URL = 'https://script.google.com/macros/s/AKfycbxWBPjrVujhHh_yHEBeK3SMVadu5x7AnKn1Lwar0KE95E4F-PtGwJvwoySJmo-SMvOF/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";
const ADSGRAM_BLOCK_ID = "23622"; 

let AdController;

function safeGet(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        if (!item || item === "undefined" || item === "null" || item === "NaN") return fallback;
        return JSON.parse(item);
    } catch (e) {
        return fallback;
    }
}

const app = {
    state: {
        points: parseInt(localStorage.getItem('av_points')) || 0,
        streak: parseInt(localStorage.getItem('av_streak')) || 1,
        lastVisit: localStorage.getItem('av_last_visit') || null,
        userXP: parseInt(localStorage.getItem('av_xp')) || 0,
        completed: safeGet('av_completed', []),
        lastAdTime: parseInt(localStorage.getItem('av_last_ad_time')) || 0,
        todaysCipher: null, 
        isCipherSolved: false,
        rawLearnData: []
    },

    tg: window.Telegram.WebApp,

    init: function() {
        console.log("App Initializing...");
        this.tg.ready();
        this.tg.expand();
        
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            const nameEl = document.getElementById('userName');
            if(nameEl) nameEl.innerText = `Agent ${user.first_name}`;
        }

        const startParam = this.tg.initDataUnsafe?.start_param; 
        if (startParam && startParam.startsWith("ref_")) {
            const referrerId = startParam.split("_")[1];
            const myId = user?.id;
            if (referrerId && myId && referrerId != myId) {
                if (!localStorage.getItem('referred_by')) {
                    localStorage.setItem('referred_by', referrerId);
                    this.processReferral(referrerId, myId);
                }
            }
        }

        if (window.Adsgram) {
            AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        }

        this.updateUI();
        this.checkStreak();
        this.fetchData();
        this.renderSalaryEngine();
    },

    // --- GAMIFICATION ---
    checkStreak: function() {
        const now = new Date();
        const todayStr = now.toDateString();
        const lastStr = this.state.lastVisit;
    
        if (lastStr !== todayStr) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            this.addPoints(10); 
            this.showFloatingReward(10, "Daily Login");
    
            if (lastStr === yesterday.toDateString()) {
                this.state.streak++;
                this.showStreakBanner(true);
            } else {
                this.state.streak = 1; 
            }
            
            this.state.lastVisit = todayStr;
            this.saveState();
            this.updateUI();
        }
    },

    addPoints: function(amount) {
        const start = this.state.points;
        this.state.points += amount;
        this.state.userXP += amount;
        this.saveState();
        this.animateCounter("pointsDisplay", start, this.state.points);
        this.updateUI();
    },

    saveState: function() {
        localStorage.setItem('av_points', this.state.points);
        localStorage.setItem('av_streak', this.state.streak);
        localStorage.setItem('av_last_visit', this.state.lastVisit);
        localStorage.setItem('av_xp', this.state.userXP);
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed));
        localStorage.setItem('av_last_ad_time', this.state.lastAdTime);
    },

    updateUI: function() {
        try {
            const ptsEl = document.getElementById('pointsDisplay');
            if(ptsEl) ptsEl.innerText = this.state.points;
            
            const xpEl = document.getElementById('xpDisplay');
            if(xpEl) xpEl.innerText = this.state.userXP;
            
            const streakEl = document.getElementById('streakCount');
            if(streakEl) streakEl.innerText = `${this.state.streak} Days`;
            
            const rankEl = document.getElementById('userRank');
            if (rankEl) {
                if (this.state.userXP > 500) rankEl.innerText = "Level 2 Sentinel";
                else rankEl.innerText = "Level 1 Scout";
            }

            const bar = document.getElementById('xpBar');
            if(bar) {
                const progress = Math.min((this.state.userXP / 5000) * 100, 100);
                bar.style.width = `${progress}%`;
            }
        } catch(e) {
            console.error("UI Update Error:", e);
        }
    },

    fetchData: async function() {
        try {
            const res = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
            const text = await res.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch(parseErr) {
                console.error("API did not return valid JSON. Response was:", text.substring(0, 200));
                this.showErrorState('jobsContainer', "Unable to load jobs. API error.");
                this.showErrorState('learnContainer', "Unable to load courses. API error.");
                this.showErrorState('newsContainer', "Unable to load news. API error.");
                return;
            }
    
            if (data.error) {
                console.error("API returned error:", data.error, data.details);
                this.showErrorState('jobsContainer', `Server error: ${data.error}`);
                this.showErrorState('learnContainer', `Server error: ${data.error}`);
                this.showErrorState('newsContainer', `Server error: ${data.error}`);
                return;
            }
    
            if (data.learn) {
                this.state.rawLearnData = data.learn;
                this.renderLearn(data.learn);
            }
    
            if (data.jobs) this.renderJobs(data.jobs);
            if (data.news) this.renderNews(data.news);
    
            if (data.cipher) {
                this.state.todaysCipher = data.cipher;
                const todayStr = new Date().toDateString();
                const lastSolved = localStorage.getItem('av_last_cipher_date');
                
                if (lastSolved === todayStr) {
                    this.state.isCipherSolved = true;
                    this.updateCipherUI(true);
                } else {
                    this.updateCipherUI(false);
                }
            }
        } catch (e) {
            console.error("Data Load Failed:", e);
            this.showErrorState('jobsContainer', "Unable to load jobs. Check connection.");
            this.showErrorState('learnContainer', "Unable to load courses. Check connection.");
            this.showErrorState('newsContainer', "Unable to load news. Check connection.");
        }
    },
    
    showErrorState: function(containerId, message) {
        const el = document.getElementById(containerId);
        if(el) el.innerHTML = `<div style="text-align:center; padding:20px; color:#e74c3c;">${message}</div>`;
    },

    // =============================================
    // JOBS — with Featured Listings support
    // Sheet must have columns: Title, Description, Link, Category, IsPremium, MinGems, Date, IsFeatured
    // =============================================
    renderJobs: function(jobs) {
        const container = document.getElementById('jobsContainer');
        if (!container) return;
    
        const now = new Date();

        // Filter: only show jobs from last 30 days. If no Date, show anyway (legacy rows).
        const activeJobs = jobs.filter(j => {
            if (!j.Date) return true;
            const jobDate = new Date(j.Date);
            if (isNaN(jobDate.getTime())) return true;
            const diffDays = (now - jobDate) / (1000 * 60 * 60 * 24);
            return diffDays <= 30;
        });
    
        if (activeJobs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No active jobs found today.</div>';
            return;
        }

        // Sort newest first
        activeJobs.sort((a, b) => {
            const dateA = new Date(a.Date);
            const dateB = new Date(b.Date);
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateB - dateA;
        });

        // Split featured vs regular
        const featuredJobs = activeJobs.filter(j => {
            const v = String(j.IsFeatured || '').trim().toLowerCase();
            return v === 'true' || v === 'yes' || v === '1';
        });
        const regularJobs = activeJobs.filter(j => {
            const v = String(j.IsFeatured || '').trim().toLowerCase();
            return v !== 'true' && v !== 'yes' && v !== '1';
        });

        let html = '';

        // --- FEATURED SECTION ---
        if (featuredJobs.length > 0) {
            html += `<div class="jobs-section-label">⭐ Featured Listings</div>`;
            html += featuredJobs.map(j => this.buildJobCard(j, true)).join('');
            if (regularJobs.length > 0) {
                html += `<div class="jobs-section-label" style="margin-top:8px;">Latest Opportunities</div>`;
            }
        }

        // --- REGULAR SECTION ---
        html += regularJobs.map(j => this.buildJobCard(j, false)).join('');

        container.innerHTML = html;
    },

    buildJobCard: function(j, isFeatured) {
        const minGems = parseInt(j.MinGems) || 0;
        const isLocked = this.state.points < minGems;
        const isNew = j.Date ? (new Date() - new Date(j.Date)) / (1000 * 3600 * 24) < 2 : false;
        const safeLink = (j.Link || '#').replace(/'/g, "\\'");

        if (isFeatured) {
            return `
                <div class="card job-card featured-card" 
                    onclick="${isLocked ? `app.showLockWarning(${minGems})` : `app.tg.openLink('${safeLink}')`}">
                    <div class="featured-top-bar"></div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:4px;">
                        <div>
                            <div style="display:flex; gap:5px; margin-bottom:5px; flex-wrap:wrap;">
                                <span class="badge-featured">⭐ FEATURED</span>
                                ${isNew ? '<span class="badge-new">NEW</span>' : ''}
                            </div>
                            <h4 style="margin:0;">${j.Title || 'Untitled'}</h4>
                            <span class="featured-sponsor">${j.Company || j.Category || 'Sponsored'}</span>
                        </div>
                        <span class="tag" style="flex-shrink:0;">${j.Category || 'Web3'}</span>
                    </div>
                    <p style="font-size:0.85rem; color:#ccc; margin-top:6px;">${j.Description || ''}</p>
                    ${isLocked 
                        ? `<div class="lock-overlay">🔒 Needs ${minGems} Gems</div>` 
                        : `<div class="apply-featured-btn">Apply Now — Priority Listing ➔</div>`
                    }
                </div>`;
        }

        return `
            <div class="card job-card ${isLocked ? 'locked-card' : ''}" 
                onclick="${isLocked ? `app.showLockWarning(${minGems})` : `app.tg.openLink('${safeLink}')`}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4>${isNew ? '<span class="badge-new">NEW</span>' : ''}${j.Title || 'Untitled'}</h4>
                    <span class="tag">${isLocked ? '🔒 Locked' : (j.Category || 'Web3')}</span>
                </div>
                <p style="font-size:0.85rem; color:#ccc; margin-top:5px;">${j.Description || ''}</p>
                ${isLocked 
                    ? `<div class="lock-overlay">🔒 Needs ${minGems} Gems</div>` 
                    : `<div class="unlock-hint">Tap to Apply ➔</div>`
                }
            </div>`;
    },

    filterJobs: function() {
        const input = document.getElementById('jobSearch').value.toLowerCase();
        const cards = document.querySelectorAll('.job-card');
        cards.forEach(card => {
            card.style.display = card.innerText.toLowerCase().includes(input) ? "block" : "none";
        });
        // Also hide section labels if no visible cards follow them
        document.querySelectorAll('.jobs-section-label').forEach(label => {
            label.style.display = input ? 'none' : 'block';
        });
    },

    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Access Denied!\n\nThis is an Elite Job. You need ${required} Gems to view the link.`);
    },
    
    renderLearn: function(items) {
        const container = document.getElementById('learnContainer');
        if(!container) return;
    
        const grouped = items.reduce((acc, item) => {
            const path = item.Path || 'General';
            if (!acc[path]) acc[path] = [];
            acc[path].push(item);
            return acc;
        }, {});
    
        let html = '';
        for (const [path, courses] of Object.entries(grouped)) {
            const courseId = path.replace(/\s+/g, '-').toLowerCase();
            const isCourseClaimed = this.state.completed.includes(courseId);
            
            html += `<div class="path-container"><div class="path-header">${path}</div>`;
            html += courses.map(c => {
                const itemId = c.Title.replace(/\s+/g, '-').toLowerCase();
                const isItemViewed = safeGet('viewed_items', []).includes(itemId);
                const url = c.Link.toLowerCase();
                let mediaType = (url.includes('youtube.com') || url.includes('youtu.be')) ? 'video' : 'doc';
                let videoId = mediaType === 'video' ? this.getYouTubeID(c.Link) : null;

                return `
                    <div class="card doc-card">
                        <h4>${c.Title}</h4>
                        <div id="player-${itemId}" class="video-responsive" style="display:none"></div>
                        <div class="card-footer">
                            <button class="complete-btn ${isItemViewed ? 'finished' : ''}" 
                                    id="btn-${itemId}" 
                                    onclick="app.startStudyTimer('${itemId}', '${videoId || c.Link}', '${mediaType}', '${courseId}')">
                                ${isItemViewed ? "✅ Viewed" : "Start Learning"}
                            </button>
                        </div>
                    </div>`;
            }).join('');
    
            const allItemsInCourse = courses.map(c => c.Title.replace(/\s+/g, '-').toLowerCase());
            const viewedItems = safeGet('viewed_items', []);
            const canClaim = allItemsInCourse.every(id => viewedItems.includes(id)) && !isCourseClaimed;
    
            html += `
                <div class="course-claim-section" style="margin-top:15px; text-align:center;">
                    <button id="claim-${courseId}" 
                            class="claim-master-btn ${isCourseClaimed ? 'finished' : (canClaim ? 'ready' : 'locked')}"
                            ${!canClaim || isCourseClaimed ? 'disabled' : ''}
                            onclick="app.claimCourseXP('${courseId}', 100)">
                        ${isCourseClaimed ? "✅ Course XP Claimed" : (canClaim ? "🎁 Claim 100 XP" : "🔒 Complete all items to unlock XP")}
                    </button>
                </div>
            </div><hr>`;
        }
        container.innerHTML = html;
    },

    getYouTubeID: function(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    startStudyTimer: function(itemId, source, type, courseId) {
        const btn = document.getElementById(`btn-${itemId}`);
        if (!btn || btn.disabled) return;
        const viewed = safeGet('viewed_items', []);
        if (viewed.includes(itemId)) { this.openMedia(itemId, source, type); return; }
        this.openMedia(itemId, source, type);
        let timeLeft = 60; 
        btn.disabled = true;
        const countdown = setInterval(() => {
            timeLeft--;
            btn.innerText = `Reading... (${timeLeft}s)`;
            if (timeLeft <= 0) {
                clearInterval(countdown);
                this.markItemAsViewed(itemId, courseId, btn);
            }
        }, 1000);
    },

    openMedia: function(itemId, source, type) {
        if (type === 'video') {
            const playerDiv = document.getElementById(`player-${itemId}`);
            playerDiv.style.display = 'block';
            playerDiv.innerHTML = `<iframe src="https://www.youtube.com/embed/${source}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
        } else {
            this.tg.openLink(source);
        }
    },

    markItemAsViewed: function(itemId, courseId, btn) {
        let viewed = safeGet('viewed_items', []);
        if (!viewed.includes(itemId)) {
            viewed.push(itemId);
            localStorage.setItem('viewed_items', JSON.stringify(viewed));
        }
        btn.innerText = "✅ Viewed";
        btn.classList.add('finished');
        btn.disabled = false;
        this.checkCourseUnlock(courseId);
    },

    checkCourseUnlock: function(courseId) {
        const viewed = safeGet('viewed_items', []);
        const courseItems = this.state.rawLearnData
            .filter(item => (item.Path || 'General').replace(/\s+/g, '-').toLowerCase() === courseId)
            .map(item => item.Title.replace(/\s+/g, '-').toLowerCase());
        const allFinished = courseItems.every(id => viewed.includes(id));
        if (allFinished) {
            const claimBtn = document.getElementById(`claim-${courseId}`);
            if (claimBtn && !this.state.completed.includes(courseId)) {
                claimBtn.disabled = false;
                claimBtn.innerText = "🎁 Claim 100 XP";
                claimBtn.classList.remove('locked');
                claimBtn.classList.add('ready');
            }
        }
    },

    claimCourseXP: function(courseId, amount) {
        if (this.state.completed.includes(courseId)) return;
        this.state.completed.push(courseId);
        this.addPoints(amount);
        this.saveState();
        const btn = document.getElementById(`claim-${courseId}`);
        btn.innerText = "✅ Course XP Claimed";
        btn.disabled = true;
        btn.classList.remove('ready');
        btn.classList.add('finished');
        if (this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('success');
    },

    openCipher: function() {
        if (!this.state.todaysCipher) {
            this.tg.showAlert("No cipher mission available today. Check back later!");
            return;
        }
        if (this.state.isCipherSolved) {
            this.tg.showAlert("✅ You already cracked today's code!");
            return;
        }
        document.getElementById('cipherQuestion').innerText = this.state.todaysCipher.question;
        document.getElementById('cipherInput').value = ""; 
        document.getElementById('cipherModal').style.display = 'flex';
    },
        
    submitCipher: function() {
        if (!this.state.todaysCipher) return;
    
        const userInput = document.getElementById('cipherInput').value.trim().toLowerCase();
        const serverAnswer = String(this.state.todaysCipher.answer).trim().toLowerCase(); 
        
        if (userInput === serverAnswer) {
            const reward = 50; 
            this.addPoints(reward);
            this.tg.showAlert(`🔥 HACK SUCCESSFUL! +${reward} Gems.`);
            this.state.isCipherSolved = true;
            localStorage.setItem('av_last_cipher_date', new Date().toDateString());
            this.updateCipherUI(true);
            document.getElementById('cipherModal').style.display = 'none';
            if(this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('success');
        } else {
            this.tg.showAlert("❌ Incorrect Code.");
            if(this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('error');
        }
    },

    updateCipherUI: function(isSolved) {
        const btn = document.getElementById('cipherBtn');
        if (!btn) return;
        if (isSolved) {
            btn.innerText = "✅ SOLVED";
            btn.style.background = "#2ecc71";
            btn.disabled = true;
        } else {
            btn.innerText = "SOLVE";
            btn.style.background = "";
            btn.disabled = false;
        }
    },

    renderNews: function(news) {
        const container = document.getElementById('newsContainer');
        if(!container) return;
        container.innerHTML = news.map(n => `
            <div class="card" onclick="app.tg.openLink('${n.Link || '#'}')">
                <h4>${n.Headline}</h4>
                <p>${new Date(n.Date).toLocaleDateString()} • ${n.Source}</p>
            </div>`).join('');
    },

    renderSalaryEngine: function() {
        const container = document.getElementById('salaryContainer');
        if(!container) return;
        const data = [
            { role: "ZK-Proof Engineer", pay: "$220k", demand: 98 },
            { role: "AI Agent Architect", pay: "$195k", demand: 92 },
            { role: "Protocol Security", pay: "$210k", demand: 88 },
            { role: "Rust/Solana Dev", pay: "$185k", demand: 95 },
            { role: "Web3 Product Lead", pay: "$160k", demand: 82 }
        ];
        container.innerHTML = data.map(item => `
            <div class="salary-row">
                <div class="salary-meta"><span>${item.role}</span><span style="color:#2ecc71; font-weight:bold;">${item.pay}</span></div>
                <div class="demand-bar-bg"><div class="demand-bar-fill" style="width:${item.demand}%"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:4px; color:#888;">
                    <span>Demand Index</span><span>${item.demand}%</span>
                </div>
            </div>`).join('');
    },
    
    completeJoinTask: function(btn) {
        if (localStorage.getItem('task_join_channel') === 'done') {
            this.tg.showAlert("Reward already claimed!");
            return;
        }
        const isVerifying = btn.getAttribute('data-state') === 'verifying';
        if (!isVerifying) {
            this.tg.openTelegramLink("https://t.me/VettedWeb3jobs");
            btn.setAttribute('data-state', 'verifying');
            btn.innerText = "Check Status";
            btn.style.background = "#f39c12"; 
            this.tg.showAlert("Join the channel, then come back and tap 'Check Status'!");
        } else {
            const userId = this.tg.initDataUnsafe?.user?.id;
            if (!userId) return;
            btn.disabled = true;
            btn.innerText = "Verifying...";
            fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: "verify_membership", userId: userId, platform: "telegram" })
            })
            .then(res => res.json())
            .then(data => {
                if (data.isMember === true) {
                    this.addPoints(100);
                    localStorage.setItem('task_join_channel', 'done');
                    btn.innerText = "Completed ✅";
                    btn.style.background = "#2ecc71";
                } else {
                    this.tg.showAlert("❌ Not a member yet!");
                    btn.disabled = false;
                    btn.innerText = "Check Status";
                }
            }).catch(() => {
                btn.disabled = false;
                btn.innerText = "Check Status";
            });
        }
    },

    processReferral: function(referrerId, newUserId) {
        if (localStorage.getItem('ref_bonus_claimed')) return;
        this.addPoints(50); 
        this.tg.showPopup({
            title: '🎉 Invite Verified!',
            message: 'You were invited by a fellow Agent. +50 Gems have been added to your vault.',
            buttons: [{type: 'ok'}]
        });
        fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: "new_referral",
                referrer_id: referrerId,
                new_user_id: newUserId,
                new_user_name: this.tg.initDataUnsafe?.user?.first_name || "Unknown"
            })
        }).catch(console.error);
    },

    watchAd: function() {
        if (AdController) {
            AdController.show().then((result) => {
                if (result.done) {
                    this.addPoints(10);
                    this.tg.showAlert("Success! +10 Gems.");
                }
            }).catch(() => {
                this.tg.showAlert("Ad cancelled or not available.");
            });
        }
    },

    changeTab: function(tabId, btn) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(tabId);
        if(target) target.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
    },

    navTo: function(tabId) {
        const btn = document.querySelector(`.nav-item[data-target="${tabId}"]`);
        if(btn) this.changeTab(tabId, btn);
    },

    shareApp: function() {
        const userId = this.tg.initDataUnsafe?.user?.id;
        if (!userId) return;
        const inviteLink = `https://t.me/web3jobhubbot/AlphaVault?startapp=ref_${userId}`;
        const msg = `🚀 I'm earning Gems finding Web3 jobs! Join the Alpha Vault and get +50 Gems instantly.`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(msg)}`;
        this.tg.openTelegramLink(url);
    },

    animateCounter: function(id, start, end) {
        const obj = document.getElementById(id);
        if(obj) obj.innerText = end; 
    },

    showFloatingReward: function(amount, text) {
        const el = document.createElement('div');
        el.className = 'floating-reward';
        el.innerHTML = `+${amount} ${text}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    },

    showStreakBanner: function(show) {
        const banner = document.getElementById('streakBanner');
        if(banner) banner.style.display = show ? 'flex' : 'none';
    }
};

window.onload = () => app.init();