// --- CONFIGURATION ---
// IMPORTANT: Replace this with your Google Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzx950-pJC89Yt-P_S85JuWjbxLXgb1-fRcZC9JcHe9xNsyH7tgm-idZpX44xqIc1Wo/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";

const AdController = window.Adsgram.init({ blockId: "20199" });

const app = {
    state: {
        points: parseInt(localStorage.getItem('av_points')) || 0,
        streak: parseInt(localStorage.getItem('av_streak')) || 0,
        lastVisit: localStorage.getItem('av_last_visit') || null,
        userXP: parseInt(localStorage.getItem('av_xp')) || 0
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
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed));
        completed: JSON.parse(localStorage.getItem('av_completed')) || []
        lastAdTime: 0
    },

    updateUI: function() {
        if (this.state.userXP > 500) {
            document.getElementById('userRank').innerText = "Level 2 Sentinel";
        }
        if (this.state.userXP > 1000) {
            document.getElementById('userRank').innerText = "Level 3 Elite";
        }
        if (this.state.userXP >= 1500) document.getElementById('userRank').innerText = "Vault Guardian";
        if (this.state.userXP >= 5000) document.getElementById('userRank').innerText = "Legendary Whale";
        document.getElementById('pointsDisplay').innerText = this.state.points;
        document.getElementById('xpDisplay').innerText = this.state.userXP;
        // Simple Level Logic: Cap at 1000 for demo
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

    // Add this helper function inside your app object as well
    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Access Denied!\n\nThis is an Elite Job. You need ${required} Gems to view the link.\n\nEarn more by watching ads or completing tasks!`);
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.notificationOccurred('error');
        }
    },

    // UNIVERSITY GROUPING LOGIC
   renderLearn: function(items) {
        if (!items || !Array.isArray(items)) {
            document.getElementById('learnContainer').innerHTML = '<p>No materials found.</p>';
            return;
        }
    
        const grouped = items.reduce((acc, item) => {
            const path = item.Path || item.path || 'General Resources';
            if (!acc[path]) acc[path] = [];
            acc[path].push(item);
            return acc;
        }, {});
    
        let html = '';
        for (const [path, courses] of Object.entries(grouped)) {
            html += `<div class="path-container">
                        <div class="path-header">${path}</div>`;
            
            html += courses.map(c => {
                const title = c.Title || c.title || "Untitled Material";
                const link = c.Link || c.link || "";
                const courseId = title.replace(/\s+/g, '-').toLowerCase();
                const isFinished = (this.state.completed || []).includes(courseId);
                
                // --- MATERIAL DETECTION LOGIC ---
                const isYouTube = link.includes('youtube.com') || link.includes('youtu.be');
                const isPDF = link.toLowerCase().endsWith('.pdf');
                const isDoc = link.includes('docs.google.com') || link.includes('drive.google.com');
    
                const actionBtn = isFinished 
                    ? `<button class="complete-btn finished" disabled>✅ Completed</button>`
                    : `<button class="complete-btn" onclick="event.stopPropagation(); app.completeCourse('${courseId}', this)">Claim +100 XP</button>`;
    
                // 1. RENDER YOUTUBE VIDEO
                if (isYouTube && link !== "") {
                    const videoId = link.split('v=')[1]?.split('&')[0] || link.split('/').pop();
                    return `
                        <div class="card video-card">
                            <div class="badge">VIDEO</div>
                            <h4>${title}</h4>
                            <div class="video-wrapper">
                                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
                            </div>
                            <div class="card-footer">${actionBtn}</div>
                        </div>`;
                } 
                
                // 2. RENDER PDF OR DOC CARD
                else {
                    let icon = isPDF ? '📄' : isDoc ? '📝' : '🔗';
                    let typeLabel = isPDF ? 'PDF DOCUMENT' : isDoc ? 'COURSE DOC' : 'LINK';
                    
                    return `
                        <div class="card doc-card" onclick="app.tg.openLink('${link}')">
                            <div class="badge">${typeLabel}</div>
                            <div class="doc-info">
                                <span class="doc-icon">${icon}</span>
                                <h4>${title}</h4>
                            </div>
                            <p class="tap-hint">Tap to open material</p>
                            <div class="card-footer">${actionBtn}</div>
                        </div>`;
                }
            }).join('');
            
            html += `</div>`;
        }
        document.getElementById('learnContainer').innerHTML = html;
    },
 
   completeCourse: function(courseId, btn) {
        if (this.state.completed.includes(courseId)) return;

        // 1. Existing Local Logic
        this.state.completed.push(courseId);
        this.addPoints(100);
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed));

        // 2. Production Webhook Trigger
        const userId = this.tg.initDataUnsafe?.user?.id;
        if (userId && API_URL !== 'YOUR_URL') {
            fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    userId: userId,
                    courseId: courseId
                })
            }).catch(err => console.log("Webhook failed, but points saved locally."));
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


   completeJoinTask: function(btn) {
        // 1. Check if already done
        if (localStorage.getItem('task_join_channel') === 'done') {
            this.tg.showAlert("You've already claimed this reward!");
            return;
        }
    
        const userId = this.tg.initDataUnsafe?.user?.id;
        if (!userId) {
            this.tg.showAlert("Error: User ID not found. Please restart the app.");
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
            // --- STEP 2: ACTUAL SECURE CHECK VIA MAKE.COM ---
            
            // REPLACE THE URL BELOW WITH YOUR ACTUAL MAKE WEBHOOK URL
            const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";
    
            btn.disabled = true;
            btn.innerText = "Verifying...";
    
            // We send just the userId to Make.com
            fetch(`${MAKE_WEBHOOK_URL}?userId=${userId}`)
                .then(res => res.json())
                .then(data => {
                    // Make.com returns {"isMember": true} or {"isMember": false}
                    if (data.isMember === true) {
                        // SUCCESS
                        this.addPoints(100);
                        localStorage.setItem('task_join_channel', 'done');
                        btn.innerText = "Completed ✅";
                        btn.style.background = "#2ecc71"; // Success green
                        btn.disabled = true;
                        this.tg.showAlert("Success! 100 Gems added.");
                    } else {
                        // FAILED
                        this.tg.showAlert("❌ You haven't joined yet! Please join and try again.");
                        btn.disabled = false;
                        btn.innerText = "Check Status";
                    }
                })
                .catch(err => {
                    console.error("Make.com Error:", err);
                    this.tg.showAlert("Verification server is busy. Try again in a minute!");
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

   watchAd: function() {
        const now = Date.now();
        const cooldownPeriod = 900000; // 15mins  in milliseconds
        const maxAds = 10;
    
        // Check if we need to reset the counter (if more than 1 hour has passed)
        if (now - this.state.lastAdReset > cooldownPeriod) {
            this.state.adCount = 0;
            this.state.lastAdReset = now;
            this.saveState();
        }
    
        // Check if they hit the limit
        if (this.state.adCount >= maxAds) {
            const minutesLeft = Math.ceil((cooldownPeriod - (now - this.state.lastAdReset)) / 60000);
            this.tg.showAlert(`You've hit the limit! Next energy in ${minutesLeft} minutes.`);
            return;
        }
    
        if (this.adController) {
            let rewardDelivered = false;
    
            this.adController.show().then((result) => {
                if (result && result.done) {
                    rewardDelivered = true;
                    
                    // --- SUCCESS LOGIC ---
                    this.state.adCount++; // Increase the count
                    this.addPoints(10);
                    this.saveState();
                    this.renderUI();
                    
                    this.tg.showAlert(`Success! (${this.state.adCount}/${maxAds} ads watched)`);
                }
            }).catch((err) => {
                if (!rewardDelivered) {
                    this.tg.showAlert("No ads available right now.");
                }
            });
        }
    },
    
    shareApp: function() {
        const url = "https://t.me/share/url?url=" + encodeURIComponent("https://t.me/web3jobhubbot/AlphaVault");
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
