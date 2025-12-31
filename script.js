// --- CONFIGURATION ---
// IMPORTANT: Replace this with your Google Web App URL (for loading Jobs/News data)
const API_URL = 'https://script.google.com/macros/s/AKfycbzGgcIXcOHW5goq1kxc1atqLqG9Bzn7PudTjg1iyv-7hBVexwEb_b-GnsxZhnEDTO0u/exec'; 

// IMPORTANT: Your Make.com Webhook URL (for Channel Verification)
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";

const AdController = window.Adsgram.init({ blockId: "20199" });

const app = {
    state: {
        points: parseInt(localStorage.getItem('av_points')) || 0,
        streak: parseInt(localStorage.getItem('av_streak')) || 0,
        lastVisit: localStorage.getItem('av_last_visit') || null,
        userXP: parseInt(localStorage.getItem('av_xp')) || 0,
        // FIX: Added missing state variables
        completed: JSON.parse(localStorage.getItem('av_completed')) || [],
        lastAdTime: parseInt(localStorage.getItem('av_last_ad_time')) || 0
    },

    tg: window.Telegram.WebApp,

    init: function() {
        this.tg.ready();
        this.tg.expand();
        
        // 1. Personalization
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            document.getElementById('userName').innerText = `Agent ${user.first_name}`;
        }

        // 2. Load Data
        this.updateUI();
        this.checkStreak();
        this.fetchData();
        this.renderSalaryEngine();

        // 3. Setup Ad Controller (Mock if SDK fails)
        this.adController = window.Adsgram?.init({ blockId: "20199" });
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
                this.state.streak = 1; // Broken streak
            } else {
                this.state.streak = 1; // First visit
            }
            
            // Award Daily Login Bonus
            this.addPoints(10);
            this.showFloatingReward(10, "Daily Bonus");
            
            this.state.lastVisit = todayStr;
            this.saveState();
        } else {
            // Already visited today
            this.showStreakBanner(false);
        }
    },

    addPoints: function(amount) {
        const start = this.state.points;
        this.state.points += amount;
        this.state.userXP += amount; // XP mimics points for now
        this.saveState();
        this.animateCounter("pointsDisplay", start, this.state.points);
        this.updateUI();
    },

    saveState: function() {
        localStorage.setItem('av_points', this.state.points);
        localStorage.setItem('av_streak', this.state.streak);
        localStorage.setItem('av_last_visit', this.state.lastVisit);
        localStorage.setItem('av_xp', this.state.userXP);
        // FIX: Saving the new variables
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed));
        localStorage.setItem('av_last_ad_time', this.state.lastAdTime);
    },

    updateUI: function() {
        if (this.state.userXP > 500) document.getElementById('userRank').innerText = "Level 2 Sentinel";
        if (this.state.userXP > 1000) document.getElementById('userRank').innerText = "Level 3 Elite";
        if (this.state.userXP >= 1500) document.getElementById('userRank').innerText = "Vault Guardian";
        if (this.state.userXP >= 5000) document.getElementById('userRank').innerText = "Legendary Whale";
        
        document.getElementById('pointsDisplay').innerText = this.state.points;
        document.getElementById('xpDisplay').innerText = this.state.userXP;
        
        // Simple Level Logic: Cap at 5000 for demo
        const progress = Math.min((this.state.userXP / 5000) * 100, 100);
        document.getElementById('xpBar').style.width = `${progress}%`;
        document.getElementById('streakCount').innerText = `${this.state.streak} Days`;
    },

    // --- DATA ENGINE ---
    fetchData: async function() {
        if(API_URL.includes("YOUR_GOOGLE")) {
            console.warn("API URL not set.");
            return;
        }

        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            
            this.renderJobs(data.jobs);
            this.renderLearn(data.learn);
            this.renderNews(data.news);
        } catch (e) {
            console.error("Fetch failed", e);
        }
    },

    renderJobs: function(jobs) {
        const html = jobs.map(j => {
            // 1. Get the requirement (default to 0 if empty/missing)
            const requiredGems = parseInt(j.MinGems) || 0;
            
            // 2. Check if the user is allowed to click
            const isLocked = this.state.points < requiredGems;

            // 3. Create the card
            return `
                <div class="card ${isLocked ? 'locked-card' : ''}" 
                    onclick="${isLocked ? `app.showLockWarning(${requiredGems})` : `app.tg.openLink('${j.Link || '#'}')`}">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4>${j.Title}</h4>
                        <span class="tag">${isLocked ? '🔒 Locked' : j.Type}</span>
                    </div>
                    
                    <p>${j.Company} • ${j.Salary}</p>
                    
                    ${isLocked ? 
                        `<div class="lock-overlay">Need ${requiredGems} Gems to Unlock</div>` : 
                        `<div class="unlock-hint">🔓 Access Granted</div>`
                    }
                </div>
            `;
        }).join('');

        document.getElementById('jobsContainer').innerHTML = html;
    },

    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Access Denied!\n\nThis is an Elite Job. You need ${required} Gems to view the link.\n\nEarn more by watching ads or completing tasks!`);
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.notificationOccurred('error');
        }
    },

    // --- UNIVERSITY / LEARN LOGIC (WITH TIMER) ---
    renderLearn: function(items) {
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
                // Create a unique ID from the title (slugify)
                const courseId = c.Title.replace(/\s+/g, '-').toLowerCase();
                const isFinished = this.state.completed.includes(courseId);
                const isYouTube = c.Link.includes('youtube.com') || c.Link.includes('youtu.be');
                
                // FEATURE: Timer Button Logic
                const actionBtn = isFinished 
                    ? `<button class="complete-btn finished" disabled>✅ Completed</button>`
                    : `<button class="complete-btn" id="btn-${courseId}" onclick="app.startStudyTimer('${courseId}', '${c.Link}')">Start Study (+100 XP)</button>`;

                if (isYouTube) {
                    const videoId = c.Link.split('v=')[1]?.split('&')[0] || c.Link.split('/').pop();
                    return `
                        <div class="card video-card">
                            <h4>${c.Title}</h4>
                            <div class="video-wrapper">
                                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
                            </div>
                            <div class="card-footer">
                                ${actionBtn}
                            </div>
                        </div>`;
                } else {
                    return `
                        <div class="card doc-card">
                            <h4>${c.Title}</h4>
                            <div class="card-footer">
                                ${actionBtn}
                            </div>
                        </div>`;
                }
            }).join('');
            
            html += `</div>`;
        }
        document.getElementById('learnContainer').innerHTML = html;
    },

    // FEATURE: 30-Second Study Timer
    startStudyTimer: function(courseId, link) {
        const btn = document.getElementById(`btn-${courseId}`);
        let timeLeft = 30; // 30 second requirement

        // 1. Open the link for the user
        this.tg.openLink(link);

        // 2. Disable button and start countdown
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
                btn.style.background = "#2ecc71"; // Change to success green
                // Change the click to the completion function
                btn.onclick = () => this.completeCourse(courseId, btn);
            }
        }, 1000);
    },

    completeCourse: function(courseId, btn) {
        if (this.state.completed.includes(courseId)) return;

        // 1. Local Logic
        this.state.completed.push(courseId);
        this.addPoints(100);
        this.saveState();

        // 2. Webhook Trigger (Optional data sync)
        const userId = this.tg.initDataUnsafe?.user?.id;
        if (userId) {
            // We reuse the Google Script for general data or Make if you prefer
            // For now, we just log it or you can fire a pixel
            console.log("Course completed synced");
        }

        // 3. UI Feedback
        btn.innerText = "✅ Completed";
        btn.classList.add('finished');
        btn.disabled = true;
        if(this.tg.HapticFeedback) this.tg.HapticFeedback.notificationOccurred('success');
    },

    renderNews: function(news) {
        const html = news.map(n => `
            <div class="card" onclick="app.tg.openLink('${n.Link || '#'}')">
                <h4>${n.Headline}</h4>
                <p>${new Date(n.Date).toLocaleDateString()} • ${n.Source}</p>
            </div>
        `).join('');
        document.getElementById('newsContainer').innerHTML = html;
    },

    renderSalaryEngine: function() {
        const roles = [
            { role: "Smart Contract Eng", salary: "$180k - $300k", demand: 95 },
            { role: "Rust Developer", salary: "$160k - $250k", demand: 90 },
            { role: "ZK Researcher", salary: "$200k - $400k", demand: 98 },
            { role: "DeFi Product Mgr", salary: "$140k - $220k", demand: 85 }
        ];

        const html = roles.map(r => `
            <div class="salary-row">
                <div class="salary-meta">
                    <span style="font-weight:600">${r.role}</span>
                    <span style="color:var(--success)">${r.salary}</span>
                </div>
                <div class="demand-bar-bg">
                    <div class="demand-bar-fill" style="width:${r.demand}%"></div>
                </div>
            </div>
        `).join('');
        document.getElementById('salaryContainer').innerHTML = html;
    },

    // --- TASK VERIFICATION (MAKE.COM INTEGRATION) ---
    completeJoinTask: function(btn) {
        if (localStorage.getItem('task_join_channel') === 'done') {
            this.tg.showAlert("You've already claimed this reward!");
            return;
        }

        // Identify if this is the first click (Join) or second click (Verify)
        const isVerifying = btn.getAttribute('data-state') === 'verifying';

        if (!isVerifying) {
            // --- STEP 1: SEND TO CHANNEL ---
            this.tg.openTelegramLink("https://t.me/VettedWeb3jobs");
            
            btn.setAttribute('data-state', 'verifying');
            btn.innerText = "Check Status";
            btn.style.background = "#f39c12"; // Warning orange
            this.tg.showAlert("Join the channel, then come back and tap 'Check Status'!");
        } else {
            // --- STEP 2: VERIFY VIA MAKE.COM ---
            const userId = this.tg.initDataUnsafe?.user?.id;
            
            // Safety check for user ID (in case testing outside Telegram)
            if (!userId) {
                this.tg.showAlert("Could not identify user. Are you using the Telegram App?");
                return;
            }

            btn.disabled = true;
            btn.innerText = "Verifying...";

            // Send POST request to Make.com Webhook
            fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: "verify_membership",
                    userId: userId,
                    platform: "telegram"
                })
            })
            .then(res => res.json())
            .then(data => {
                // Make.com should return { "isMember": true } or false
                if (data.isMember === true) {
                    // SUCCESS
                    this.addPoints(100);
                    localStorage.setItem('task_join_channel', 'done');
                    btn.innerText = "Completed ✅";
                    btn.style.background = "#2ecc71";
                    this.tg.showAlert("Success! 100 Gems added.");
                } else {
                    // FAILED
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

    // --- UI INTERACTIONS ---
    changeTab: function(tabId, btn) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');

        // Haptic Feedback
        if(this.tg.HapticFeedback) this.tg.HapticFeedback.impactOccurred('light');
    },

    navTo: function(tabId) {
        const btn = document.querySelector(`.nav-item[data-target="${tabId}"]`);
        if(btn) this.changeTab(tabId, btn);
    },

    // FEATURE: Watch Ad with 60s Cooldown
    watchAd: function() {
        const now = Date.now();
        // Check 60s cooldown (60000ms)
        if (now - this.state.lastAdTime < 60000) {
            const remaining = Math.ceil((60000 - (now - this.state.lastAdTime)) / 1000);
            this.tg.showAlert(`⏳ Please wait ${remaining} seconds before watching another ad.`);
            return;
        }

        if (this.adController) {
            this.adController.show().then((result) => {
                // result.done is true if they watched the whole video
                if (result.done) {
                    this.state.lastAdTime = Date.now(); // Update time
                    this.addPoints(50);
                    this.showFloatingReward(10, "Ad Bonus");
                    this.tg.showAlert("Success! +10 Gems added.");
                } else {
                    // This happens if they close the ad early
                    this.tg.showAlert("You must watch the full ad to earn gems.");
                }
            }).catch((err) => {
                console.log("Ad error or no fill:", err);
                this.tg.showAlert("No ads available right now. Try again later!");
            });
        } else {
            // Fallback for local testing (No Adsgram object)
            // Still enforce cooldown for testing
            this.state.lastAdTime = Date.now();
            this.addPoints(10);
            this.showFloatingReward(10, "Test Reward");
        }
    },

    shareApp: function() {
        const url = "https://t.me/share/url?url=" + encodeURIComponent("https://t.me/YourBot");
        this.tg.openTelegramLink(url);
    },

    // --- ANIMATION UTILS ---
    animateCounter: function(id, start, end) {
        const obj = document.getElementById(id);
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
        document.getElementById('streakBanner').style.display = show ? 'flex' : 'none';
    }
};

// Start App
window.onload = () => app.init();
