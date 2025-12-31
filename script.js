// --- CONFIGURATION ---
const API_URL = 'https://script.google.com/macros/s/AKfycbzGgcIXcOHW5goq1kxc1atqLqG9Bzn7PudTjg1iyv-7hBVexwEb_b-GnsxZhnEDTO0u/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";
const ADSGRAM_BLOCK_ID = " 20304"; 

// --- SAFETY HELPER: Prevents JSON crashes ---
function safeGet(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        if (!item || item === "undefined") return fallback;
        return JSON.parse(item);
    } catch (e) {
        console.warn(`Resetting corrupted key: ${key}`);
        return fallback;
    }
}

const app = {
    // We store the ad controller here, initially null
    adController: null, 

    state: {
        points: parseInt(localStorage.getItem('av_points')) || 0,
        streak: parseInt(localStorage.getItem('av_streak')) || 0,
        lastVisit: localStorage.getItem('av_last_visit') || null,
        userXP: parseInt(localStorage.getItem('av_xp')) || 0,
        completed: safeGet('av_completed', []),
        lastAdTime: parseInt(localStorage.getItem('av_last_ad_time')) || 0
    },

    tg: window.Telegram.WebApp,

    init: function() {
        this.tg.ready();
        this.tg.expand();
        
        // 1. Personalization
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            const nameEl = document.getElementById('userName');
            if(nameEl) nameEl.innerText = `Agent ${user.first_name}`;
        }

        // 2. Initialize Adsgram Correctly Here
        if (window.Adsgram) {
            this.adController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        } else {
            console.warn("Adsgram script not loaded yet or blocked.");
        }

        // 3. Load Data & UI
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
            
            if (lastStr === yesterday.toDateString()) {
                this.state.streak++;
                this.showStreakBanner(true);
            } else if (lastStr) {
                this.state.streak = 1; 
            } else {
                this.state.streak = 1; 
            }
            
            this.addPoints(10);
            this.showFloatingReward(10, "Daily Bonus");
            
            this.state.lastVisit = todayStr;
            this.saveState();
        } else {
            this.showStreakBanner(false);
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
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed || []));
        localStorage.setItem('av_last_ad_time', this.state.lastAdTime);
    },

    updateUI: function() {
        const rankEl = document.getElementById('userRank');
        if (rankEl) {
            if (this.state.userXP > 500) rankEl.innerText = "Level 2 Sentinel";
            if (this.state.userXP > 1000) rankEl.innerText = "Level 3 Elite";
            if (this.state.userXP >= 1500) rankEl.innerText = "Vault Guardian";
            if (this.state.userXP >= 5000) rankEl.innerText = "Legendary Whale";
        }
        
        const ptsEl = document.getElementById('pointsDisplay');
        if(ptsEl) ptsEl.innerText = this.state.points;
        
        const xpEl = document.getElementById('xpDisplay');
        if(xpEl) xpEl.innerText = this.state.userXP;
        
        const streakEl = document.getElementById('streakCount');
        if(streakEl) streakEl.innerText = `${this.state.streak} Days`;
        
        const bar = document.getElementById('xpBar');
        if(bar) {
            const progress = Math.min((this.state.userXP / 5000) * 100, 100);
            bar.style.width = `${progress}%`;
        }
    },

    // --- DATA ENGINE ---
    fetchData: async function() {
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            
            if(data.jobs) this.renderJobs(data.jobs);
            if(data.learn) this.renderLearn(data.learn);
            if(data.news) this.renderNews(data.news);
        } catch (e) {
            console.error("Fetch failed", e);
        }
    },

    renderJobs: function(jobs) {
        const container = document.getElementById('jobsContainer');
        if (!container) return;

        const html = jobs.map(j => {
            const requiredGems = parseInt(j.MinGems) || 0;
            const isLocked = this.state.points < requiredGems;

            return `
                <div class="card ${isLocked ? 'locked-card' : ''}" 
                    onclick="${isLocked ? `app.showLockWarning(${requiredGems})` : `app.tg.openLink('${j.Link || '#'}')`}">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4>${j.Title}</h4>
                        <span class="tag">${isLocked ? '🔒 Locked' : j.Type}</span>
                    </div>
                    <p>${j.Company} • ${j.Salary}</p>
                    ${isLocked ? `<div class="lock-overlay">Need ${requiredGems} Gems to Unlock</div>` : `<div class="unlock-hint">🔓 Access Granted</div>`}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Access Denied!\n\nThis is an Elite Job. You need ${required} Gems to view the link.`);
        if (this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('error');
    },

    // --- UNIVERSITY / LEARN LOGIC ---
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
            html += `<div class="path-container"><div class="path-header">${path}</div>`;
            
            html += courses.map(c => {
                const courseId = c.Title.replace(/\s+/g, '-').toLowerCase();
                const isFinished = this.state.completed.includes(courseId);
                const isYouTube = c.Link.includes('youtube.com') || c.Link.includes('youtu.be');
                
                const actionBtn = isFinished 
                    ? `<button class="complete-btn finished" disabled>✅ Completed</button>`
                    : `<button class="complete-btn" id="btn-${courseId}" onclick="app.startStudyTimer('${courseId}', '${c.Link}')">Start Study (+100 XP)</button>`;

                if (isYouTube) {
                    const videoId = c.Link.split('v=')[1]?.split('&')[0] || c.Link.split('/').pop();
                    return `<div class="card video-card"><h4>${c.Title}</h4><div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div><div class="card-footer">${actionBtn}</div></div>`;
                } else {
                    return `<div class="card doc-card"><h4>${c.Title}</h4><div class="card-footer">${actionBtn}</div></div>`;
                }
            }).join('');
            html += `</div>`;
        }
        container.innerHTML = html;
    },

    startStudyTimer: function(courseId, link) {
        const btn = document.getElementById(`btn-${courseId}`);
        if(!btn) return;
        
        let timeLeft = 30; 
        this.tg.openLink(link);
        btn.disabled = true;
        btn.style.opacity = "0.6";
        
        const countdown = setInterval(() => {
            timeLeft--;
            btn.innerText = `Studying... (${timeLeft}s)`;
            if (timeLeft <= 0) {
                clearInterval(countdown);
                btn.innerText = "Claim +100 XP";
                btn.style.opacity = "1";
                btn.disabled = false;
                btn.style.background = "#2ecc71";
                btn.onclick = () => this.completeCourse(courseId, btn);
            }
        }, 1000);
    },

    completeCourse: function(courseId, btn) {
        if (this.state.completed.includes(courseId)) return;
        this.state.completed.push(courseId);
        this.addPoints(100);
        this.saveState();
        btn.innerText = "✅ Completed";
        btn.classList.add('finished');
        btn.disabled = true;
        if(this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('success');
    },

    renderNews: function(news) {
        const container = document.getElementById('newsContainer');
        if(!container) return;
        const html = news.map(n => `
            <div class="card" onclick="app.tg.openLink('${n.Link || '#'}')">
                <h4>${n.Headline}</h4>
                <p>${new Date(n.Date).toLocaleDateString()} • ${n.Source}</p>
            </div>
        `).join('');
        container.innerHTML = html;
    },

    renderSalaryEngine: function() {
        const container = document.getElementById('salaryContainer');
        if(!container) return;
        const roles = [
            { role: "Smart Contract Eng", salary: "$180k - $300k", demand: 95 },
            { role: "Rust Developer", salary: "$160k - $250k", demand: 90 },
            { role: "ZK Researcher", salary: "$200k - $400k", demand: 98 },
            { role: "DeFi Product Mgr", salary: "$140k - $220k", demand: 85 }
        ];
        const html = roles.map(r => `
            <div class="salary-row">
                <div class="salary-meta"><span style="font-weight:600">${r.role}</span><span style="color:var(--success)">${r.salary}</span></div>
                <div class="demand-bar-bg"><div class="demand-bar-fill" style="width:${r.demand}%"></div></div>
            </div>
        `).join('');
        container.innerHTML = html;
    },

    completeJoinTask: function(btn) {
        if (localStorage.getItem('task_join_channel') === 'done') {
            this.tg.showAlert("You've already claimed this reward!");
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
            
            if (!userId) {
                this.tg.showAlert("Could not identify user. Are you using the Telegram App?");
                return;
            }

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
                    this.tg.showAlert("Success! 100 Gems added.");
                } else {
                    this.tg.showAlert("❌ You haven't joined yet! Please join and try again.");
                    btn.disabled = false;
                    btn.innerText = "Check Status";
                }
            })
            .catch(err => {
                console.error("Verification Error:", err);
                this.tg.showAlert("Verification server error. Please try again later.");
                btn.disabled = false;
                btn.innerText = "Check Status";
            });
        }
    },

    // --- ADSGRAM INTEGRATION (CORRECTED) ---
    watchAd: function() {
        const now = Date.now();
        // Check 60s cooldown
        if (now - this.state.lastAdTime < 60000) {
            const remaining = Math.ceil((60000 - (now - this.state.lastAdTime)) / 1000);
            this.tg.showAlert(`⏳ Please wait ${remaining} seconds before watching another ad.`);
            return;
        }

        // Check if the controller was successfully initialized in init()
        if (this.adController) {
            this.adController.show().then((result) => {
                if (result.done) {
                    this.state.lastAdTime = Date.now();
                    this.addPoints(50);
                    this.showFloatingReward(50, "Ad Bonus");
                    this.tg.showAlert("Success! +50 Gems added.");
                } else {
                    this.tg.showAlert("You must watch the full ad to earn gems.");
                }
            }).catch((err) => {
                console.log("Ad skipped or error:", err);
                this.tg.showAlert("Ad was cancelled or not available.");
            });
        } else {
            // Fallback for testing/desktop where Adsgram script might not load
            console.log("Adsgram not loaded, running mock ad.");
            this.state.lastAdTime = Date.now();
            this.addPoints(50);
            this.showFloatingReward(50, "Test Reward");
            this.tg.showAlert("Mock Ad Success! (Real ads only appear on Mobile)");
        }
    },

    // --- UI INTERACTIONS ---
    changeTab: function(tabId, btn) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(tabId);
        if(target) target.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');

        if(this.tg.HapticFeedback) this.tg.HapticFeedback.impactOccurred('light');
    },

    navTo: function(tabId) {
        const btn = document.querySelector(`.nav-item[data-target="${tabId}"]`);
        if(btn) this.changeTab(tabId, btn);
    },

    shareApp: function() {
        const url = "https://t.me/share/url?url=" + encodeURIComponent("https://t.me/YourBot");
        this.tg.openTelegramLink(url);
    },

    animateCounter: function(id, start, end) {
        const obj = document.getElementById(id);
        if(!obj) return;
        const range = end - start;
        const duration = 1000;
        let startTime = null;

        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            obj.innerHTML = Math.floor(progress * range + start);
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    },

    showFloatingReward: function(amount, text) {
        const el = document.createElement('div');
        el.className = 'floating-reward';
        el.style.left = '50%';
        el.style.top = '50%';
        el.innerHTML = `+${amount} ${text}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    },

    showStreakBanner: function(show) {
        const banner = document.getElementById('streakBanner');
        if(banner) banner.style.display = show ? 'flex' : 'none';
    }
};

// Start App
window.onload = () => app.init();
