// --- CONFIGURATION ---
// REPLACE THIS WITH YOUR NEW "ANYONE" ACCESS DEPLOYMENT URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzGgcIXcOHW5goq1kxc1atqLqG9Bzn7PudTjg1iyv-7hBVexwEb_b-GnsxZhnEDTO0u/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";
const ADSGRAM_BLOCK_ID = "20456"; 

// Global variable for Adsgram (defined here so all functions can use it)
let AdController;

// --- SAFETY HELPER: Prevents JSON crashes ---
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
        lastAdTime: parseInt(localStorage.getItem('av_last_ad_time')) || 0
    },

    tg: window.Telegram.WebApp,

    init: function() {
        console.log("App Initializing...");
        this.tg.ready();
        this.tg.expand();
        
        // 1. Personalization
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            const nameEl = document.getElementById('userName');
            if(nameEl) nameEl.innerText = `Agent ${user.first_name}`;
        }

        // 2. Initialize Adsgram (Production Mode)
        // We initialize this inside init() to ensure the external script is fully loaded first
        if (window.Adsgram) {
            AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        } else {
            console.error("Adsgram script not loaded! Check your HTML <head>.");
        }

        // 3. FORCE UI UPDATE IMMEDIATELY (Fixes the "0 balance" bug)
        this.updateUI();

        // 4. Logic & Data
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
            
            // --- FIX: ADD POINTS FOR EVERY NEW DAY VISIT ---
            this.addPoints(10); 
            this.showFloatingReward(10, "Daily Login");
            // -----------------------------------------------
    
            if (lastStr === yesterday.toDateString()) {
                this.state.streak++;
                this.showStreakBanner(true);
            } else {
                this.state.streak = 1; // Reset streak but they still got the 10 pts above
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
        // Wrapped in try/catch so one missing ID doesn't crash the whole app
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

    // --- DATA ENGINE (PRODUCTION: NO MOCK) ---
    fetchData: async function() {
        try {
            const res = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
            
            if (!res.ok) throw new Error("Server Error");
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received HTML instead of JSON.");
            }
    
            const data = await res.json();
            
            // --- THE CHANGE IS HERE ---
            if (data.learn) {
                this.state.rawLearnData = data.learn; // Store the list so we can check progress later
                this.renderLearn(data.learn);
            }
            // --------------------------
    
            if (data.jobs) this.renderJobs(data.jobs);
            if (data.news) this.renderNews(data.news);
    
        } catch (e) {
            console.error("Data Load Failed:", e);
            this.showErrorState('jobsContainer', "Unable to load jobs.");
            this.showErrorState('learnContainer', "Unable to load courses.");
            this.showErrorState('newsContainer', "Unable to load news.");
        }
    },

    showErrorState: function(containerId, message) {
        const el = document.getElementById(containerId);
        if(el) el.innerHTML = `<div style="text-align:center; padding:20px; color:#e74c3c;">${message}</div>`;
    },

    renderJobs: function(jobs) {
        const container = document.getElementById('jobsContainer');
        if (!container) return;
        
        if (jobs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">No active jobs found.</div>';
            return;
        }

        const html = jobs.map(j => {
            // Mapping to your actual Google Sheet headers
            const title = j.Title || "Untitled Position";
            const category = j.Category || "Web3";
            const description = j.Description || "No description available";
            const link = j.Link || "#";
            const minGems = parseInt(j.MinGems) || 0;

            const isLocked = this.state.points < minGems;

            return `
                <div class="card ${isLocked ? 'locked-card' : ''}" 
                    onclick="${isLocked ? `app.showLockWarning(${minGems})` : `app.tg.openLink('${link}')`}">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4>${title}</h4>
                        <span class="tag">${isLocked ? '🔒 Locked' : category}</span>
                    </div>
                    <p style="font-size: 0.85rem; color: #ccc;">${description}</p>
                    ${isLocked ? 
                        `<div class="lock-overlay">Need ${minGems} Gems to Unlock</div>` : 
                        `<div class="unlock-hint">🔓 Access Granted</div>`
                    }
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Access Denied!\n\nThis is an Elite Job. You need ${required} Gems to view the link.`);
    },
    
   renderLearn: function(items) {
        const container = document.getElementById('learnContainer');
        if(!container) return;
    
        // Group items by Path (This is our "Course")
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
            
            html += `<div class="path-container">
                        <div class="path-header">${path}</div>`;
            
            html += courses.map(c => {
                const itemId = c.Title.replace(/\s+/g, '-').toLowerCase();
                const isItemViewed = safeGet('viewed_items', []).includes(itemId);
                const url = c.Link.toLowerCase();
                
                let mediaType = 'doc'; 
                let videoId = null;
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    mediaType = 'video';
                    videoId = this.getYouTubeID(c.Link);
                }
    
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
    
            // ADD THE MASTER CLAIM BUTTON AT THE BOTTOM OF THE PATH
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
    
    startStudyTimer: function(itemId, source, type, courseId) {
        const btn = document.getElementById(`btn-${itemId}`);
        if (!btn || btn.disabled) return;
    
        // 1. If already viewed, just open it (Skip timer)
        const viewed = safeGet('viewed_items', []);
        if (viewed.includes(itemId)) {
            this.openMedia(itemId, source, type);
            return;
        }
    
        // 2. Open Media & Start 30s Timer
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
    
    // New Helper to keep logic clean
    openMedia: function(itemId, source, type) {
        if (type === 'video') {
            const playerDiv = document.getElementById(`player-${itemId}`);
            playerDiv.style.display = 'block';
            playerDiv.innerHTML = `<iframe src="https://www.youtube.com/embed/${source}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
        } else {
            this.tg.openLink(source);
        }
    },

    // Add this helper to extract the ID from any YouTube URL
    getYouTubeID: function(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },


markItemAsViewed: function(itemId, courseId, btn) {
        // 1. Save individual item progress
        let viewed = safeGet('viewed_items', []);
        if (!viewed.includes(itemId)) {
            viewed.push(itemId);
            localStorage.setItem('viewed_items', JSON.stringify(viewed));
        }
    
        // 2. Update Item Button
        btn.innerText = "✅ Viewed";
        btn.classList.add('finished');
        btn.disabled = false; // Allow re-watching
    
        // 3. Check if the Master Claim Button should unlock
        this.checkCourseUnlock(courseId);
    },

checkCourseUnlock: function(courseId) {
        // Re-run the logic to see if all items in this course (Path) are viewed
        const viewed = safeGet('viewed_items', []);
        // Get items belonging to this course from our raw data
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
        this.addPoints(amount); // This updates XP and points automatically
        this.saveState();
        
        const btn = document.getElementById(`claim-${courseId}`);
        btn.innerText = "✅ Course XP Claimed";
        btn.disabled = true;
        btn.classList.remove('ready');
        btn.classList.add('finished');
    
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.notificationOccurred('success');
        }
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
    
        const data = [
            { role: "ZK-Proof Engineer", pay: "$220k", demand: 98 },
            { role: "AI Agent Architect", pay: "$195k", demand: 92 },
            { role: "Protocol Security", pay: "$210k", demand: 88 },
            { role: "Rust/Solana Dev", pay: "$185k", demand: 95 },
            { role: "Web3 Product Lead", pay: "$160k", demand: 82 }
        ];
    
        container.innerHTML = data.map(item => `
            <div class="salary-row">
                <div class="salary-meta">
                    <span>${item.role}</span>
                    <span style="color:#2ecc71; font-weight:bold;">${item.pay}</span>
                </div>
                <div class="demand-bar-bg">
                    <div class="demand-bar-fill" style="width:${item.demand}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:4px; color:#888;">
                    <span>Demand Index</span>
                    <span>${item.demand}%</span>
                </div>
            </div>
        `).join('');
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
            
            if (!userId) {
                // FALLBACK FOR TESTING IF NOT IN TG
                this.tg.showAlert("Cannot verify User ID. (Testing Mode?)");
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
                    this.tg.showAlert("❌ Not a member yet!");
                    btn.disabled = false;
                    btn.innerText = "Check Status";
                }
            })
            .catch(err => {
                this.tg.showAlert("Connection Error. Try again.");
                btn.disabled = false;
                btn.innerText = "Check Status";
            });
        }
    },

    // --- ADSGRAM INTEGRATION (PRODUCTION) ---
    watchAd: function() {
        // Use the global AdController defined at the top
        if (AdController) {
            AdController.show().then((result) => {
                if (result.done) {
                    this.addPoints(10);
                    this.tg.showAlert("Success! +10 Gems.");
                }
            }).catch((err) => {
                console.log("Ad Error:", err);
                this.tg.showAlert("Ad cancelled or not available.");
            });
        } else {
            this.tg.showAlert("Ads are initializing... please wait.");
            // Retry init if it failed earlier
            if (window.Adsgram) {
                AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
            }
        }
    },

    // --- NAVIGATION ---
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
        const url = "https://t.me/share/url?url=" + encodeURIComponent("https://t.me/VettedWeb3jobs");
        this.tg.openTelegramLink(url);
    },

    animateCounter: function(id, start, end) {
        const obj = document.getElementById(id);
        if(!obj) return;
        obj.innerText = end; 
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

window.onload = () => app.init();
