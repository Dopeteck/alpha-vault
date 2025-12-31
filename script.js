// --- CONFIGURATION ---
// REPLACE THIS WITH YOUR NEW "ANYONE" ACCESS DEPLOYMENT URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzGgcIXcOHW5goq1kxc1atqLqG9Bzn7PudTjg1iyv-7hBVexwEb_b-GnsxZhnEDTO0u/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";
const ADSGRAM_BLOCK_ID = "20304"; 

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

        // If it's a new day
        if (lastStr !== todayStr) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // If visited yesterday, increment streak
            if (lastStr === yesterday.toDateString()) {
                this.state.streak++;
                this.showStreakBanner(true);
                this.addPoints(10);
                this.showFloatingReward(10, "Daily Bonus");
            } else if (lastStr) {
                // If missed a day (and not first visit), reset to 1
                this.state.streak = 1; 
            }
            
            this.state.lastVisit = todayStr;
            this.saveState();
            this.updateUI(); // Update UI immediately after calculation
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
            // redirect: 'follow' is crucial for Google Scripts
            const res = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
            
            if (!res.ok) throw new Error("Server Error");
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received HTML instead of JSON. Check Script Deployment Permissions.");
            }

            const data = await res.json();
            
            // Only render if data exists
            if (data.jobs) this.renderJobs(data.jobs);
            if (data.learn) this.renderLearn(data.learn);
            if (data.news) this.renderNews(data.news);

        } catch (e) {
            console.error("Data Load Failed:", e);
            this.showErrorState('jobsContainer', "Unable to load jobs. Check connection.");
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
        html += `<div class="path-container"><div class="path-header">${path}</div>`;
        
        html += courses.map(c => {
            const courseId = c.Title.replace(/\s+/g, '-').toLowerCase();
            const isFinished = this.state.completed.includes(courseId);
            const url = c.Link.toLowerCase();
            
            // DETECT MEDIA TYPE
            let mediaType = 'doc'; 
            let videoId = null;

            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                mediaType = 'video';
                videoId = this.getYouTubeID(c.Link);
            } else if (url.endsWith('.pdf')) {
                mediaType = 'pdf';
            }

            // GENERATE THE TOP CONTENT (Player or Preview)
            let mediaHtml = '';
            if (mediaType === 'video') {
                const thumbUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                mediaHtml = `
                    <span class="media-badge badge-video">Video Class</span>
                    <div id="thumb-${courseId}" class="video-thumbnail" style="background-image: url('${thumbUrl}');" onclick="app.startStudyTimer('${courseId}', '${videoId}', 'video')">
                        <div class="play-icon">▶</div>
                    </div>
                    <div id="player-${courseId}" class="video-responsive"></div>
                `;
            } else {
                const icon = mediaType === 'pdf' ? '📄' : '📝';
                const label = mediaType === 'pdf' ? 'PDF Document' : 'Knowledge Base';
                const badgeClass = mediaType === 'pdf' ? 'badge-pdf' : 'badge-doc';
                mediaHtml = `
                    <span class="media-badge ${badgeClass}">${label}</span>
                    <div class="doc-preview" onclick="app.startStudyTimer('${courseId}', '${c.Link}', 'doc')">
                        <div class="doc-icon">${icon}</div>
                        <small>Tap to Read</small>
                    </div>
                `;
            }

            const actionBtn = isFinished 
                ? `<button class="complete-btn finished" disabled>✅ Completed</button>`
                : `<button class="complete-btn" id="btn-${courseId}" onclick="app.startStudyTimer('${courseId}', '${videoId || c.Link}', '${mediaType}')">Start Learning (+100 XP)</button>`;

            return `
                <div class="card doc-card">
                    <h4>${c.Title}</h4>
                    ${mediaHtml}
                    <div class="card-footer">${actionBtn}</div>
                </div>`;
        }).join('');
        html += `</div>`;
    }
    container.innerHTML = html;
},

startStudyTimer: function(courseId, source, type) {
        const btn = document.getElementById(`btn-${courseId}`);
        if(!btn || btn.disabled) return;
    
        // 1. OPEN MEDIA
        if (type === 'video') {
            const thumb = document.getElementById(`thumb-${courseId}`);
            const playerDiv = document.getElementById(`player-${courseId}`);
            thumb.style.display = 'none';
            playerDiv.style.display = 'block';
            playerDiv.innerHTML = `<iframe src="https://www.youtube.com/embed/${source}?autoplay=1&playsinline=1" frameborder="0" allowfullscreen></iframe>`;
        } else {
            // For PDFs and Docs, open in Telegram's built-in browser
            this.tg.openLink(source);
        }
    
        // 2. START THE 30s TIMER
        let timeLeft = 30; 
        btn.disabled = true;
        btn.style.opacity = "0.6";
        
        const countdown = setInterval(() => {
            timeLeft--;
            btn.innerText = `Learning... (${timeLeft}s)`;
            
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

   startStudyTimer: function(courseId, source, type) {
        const btn = document.getElementById(`btn-${courseId}`);
        if (!btn || btn.disabled) return;
    
        // 1. HANDLE MEDIA DISPLAY
        if (type === 'video') {
            const thumb = document.getElementById(`thumb-${courseId}`);
            const playerDiv = document.getElementById(`player-${courseId}`);
            
            // Hide thumbnail and show the YouTube Iframe
            if (thumb && playerDiv) {
                thumb.style.display = 'none';
                playerDiv.style.display = 'block';
                playerDiv.innerHTML = `
                    <iframe 
                        src="https://www.youtube.com/embed/${source}?autoplay=1&playsinline=1" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                `;
            }
        } else {
            // For PDF or DOC, open the link in Telegram's browser
            // 'source' in this case is the full URL
            this.tg.openLink(source);
        }
    
        // 2. THE 30-SECOND TIMER LOGIC
        let timeLeft = 100; 
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.classList.add('timer-running'); // Useful for CSS styling
        
        const countdown = setInterval(() => {
            timeLeft--;
            btn.innerText = `Learning... (${timeLeft}s)`;
            
            if (timeLeft <= 0) {
                clearInterval(countdown);
                btn.innerText = "Claim +100 XP";
                btn.style.opacity = "1";
                btn.disabled = false;
                btn.style.background = "#2ecc71"; // Turn green when ready
                btn.style.color = "white";
                
                // Re-bind the click to the completion function
                btn.onclick = () => this.completeCourse(courseId, btn);
                
                // Send a small haptic vibration to the user (Telegram feature)
                if (this.tg.HapticFeedback) {
                    this.tg.HapticFeedback.notificationOccurred('success');
                }
            }
        }, 1000);
    },

    // --- HELPERS ---
    getYouTubeID: function(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    completeCourse: function(courseId, btn) {
        if (this.state.completed.includes(courseId)) return;
        this.state.completed.push(courseId);
        this.addPoints(100);
        btn.innerText = "✅ Completed";
        btn.classList.add('finished');
        btn.disabled = true;
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
        container.innerHTML = `
            <div class="salary-row"><div class="salary-meta"><span>Smart Contract Eng</span><span style="color:#2ecc71">$180k</span></div><div class="demand-bar-bg"><div class="demand-bar-fill" style="width:95%"></div></div></div>
            <div class="salary-row"><div class="salary-meta"><span>Rust Dev</span><span style="color:#2ecc71">$200k</span></div><div class="demand-bar-bg"><div class="demand-bar-fill" style="width:90%"></div></div></div>
        `;
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
                    this.addPoints(50);
                    this.tg.showAlert("Success! +50 Gems.");
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
