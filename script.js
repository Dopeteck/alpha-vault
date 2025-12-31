// --- CONFIGURATION ---
const API_URL = 'https://script.google.com/macros/s/AKfycbzx950-pJC89Yt-P_S85JuWjbxLXgb1-fRcZC9JcHe9xNsyH7tgm-idZpX44xqIc1Wo/exec'; 
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/yajll3jij3l64ttshmxn3ul3p1tkivw2";

const app = {
    state: {
        points: parseInt(localStorage.getItem('av_points')) || 0,
        streak: parseInt(localStorage.getItem('av_streak')) || 0,
        lastVisit: localStorage.getItem('av_last_visit') || null,
        userXP: parseInt(localStorage.getItem('av_xp')) || 0,
        completed: JSON.parse(localStorage.getItem('av_completed')) || [],
        claimedPaths: JSON.parse(localStorage.getItem('av_claimedPaths')) || [],
        lastAdTime: parseInt(localStorage.getItem('av_last_ad_time')) || 0,
        adCount: parseInt(localStorage.getItem('av_ad_count')) || 0,
        lastAdReset: parseInt(localStorage.getItem('av_ad_reset')) || Date.now()
    },

    tg: window.Telegram.WebApp,

    init: function() {
        this.tg.ready();
        this.tg.expand();
        
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            document.getElementById('userName').innerText = `Agent ${user.first_name}`;
        }

        this.updateUI();
        this.checkStreak();
        this.fetchData();
        this.renderSalaryEngine();

        if (window.Adsgram) {
            this.adController = window.Adsgram.init({ blockId: "20199" });
        }
    },

    saveState: function() {
        localStorage.setItem('av_points', this.state.points);
        localStorage.setItem('av_streak', this.state.streak);
        localStorage.setItem('av_last_visit', this.state.lastVisit);
        localStorage.setItem('av_xp', this.state.userXP);
        localStorage.setItem('av_completed', JSON.stringify(this.state.completed));
        localStorage.setItem('av_claimedPaths', JSON.stringify(this.state.claimedPaths));
        localStorage.setItem('av_last_ad_time', this.state.lastAdTime);
        localStorage.setItem('av_ad_count', this.state.adCount);
        localStorage.setItem('av_ad_reset', this.state.lastAdReset);
    },

    updateUI: function() {
        let rank = "Level 1 Recruit";
        if (this.state.userXP > 500) rank = "Level 2 Sentinel";
        if (this.state.userXP > 1000) rank = "Level 3 Elite";
        if (this.state.userXP >= 1500) rank = "Vault Guardian";
        if (this.state.userXP >= 5000) rank = "Legendary Whale";
        
        const rankEl = document.getElementById('userRank');
        if(rankEl) rankEl.innerText = rank;

        document.getElementById('pointsDisplay').innerText = this.state.points;
        document.getElementById('xpDisplay').innerText = this.state.userXP;
        
        const progress = Math.min((this.state.userXP / 5000) * 100, 100);
        const xpBar = document.getElementById('xpBar');
        if(xpBar) xpBar.style.width = `${progress}%`;
        
        const streakEl = document.getElementById('streakCount');
        if(streakEl) streakEl.innerText = `${this.state.streak} Days`;
    },

    renderUI: function() { this.updateUI(); },

    fetchData: async function() {
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (data.jobs) this.renderJobs(data.jobs);
            if (data.learn) this.renderLearn(data.learn);
            if (data.news) this.renderNews(data.news);
        } catch (e) {
            console.error("Fetch failed", e);
            document.getElementById('jobsContainer').innerHTML = "<p>Data currently unavailable.</p>";
        }
    },

    // --- JOB FEATURE (With MinGems Lock) ---
    renderJobs: function(jobs) {
        const html = jobs.map(j => {
            const requiredGems = parseInt(j.MinGems) || 0;
            const isLocked = this.state.points < requiredGems;
            return `
                <div class="card ${isLocked ? 'locked-card' : ''}" 
                    onclick="${isLocked ? `app.showLockWarning(${requiredGems})` : `app.tg.openLink('${j.Link || '#'}')`}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4>${j.Title}</h4>
                        <span class="tag">${isLocked ? '🔒 Locked' : (j.Type || 'Job')}</span>
                    </div>
                    <p>${j.Company} • ${j.Salary}</p>
                    ${isLocked ? `<div class="lock-overlay">Need ${requiredGems} Gems</div>` : `<div class="unlock-hint">🔓 Access Granted</div>`}
                </div>`;
        }).join('');
        document.getElementById('jobsContainer').innerHTML = html;
    },

    showLockWarning: function(required) {
        this.tg.showAlert(`🚫 Elite Access Only!\n\nYou need ${required} Gems to view this link.\n\nWatch ads or complete tasks to earn more!`);
    },

    // --- LEARN FEATURE (With YouTube & 30s Timer) ---
    renderLearn: function(items) {
        if (!items) return;
        this.lastItems = items;
        const grouped = items.reduce((acc, item) => {
            const path = (item.Path || 'General Resources').trim();
            if (!acc[path]) acc[path] = [];
            acc[path].push(item);
            return acc;
        }, {});

        let html = '';
        for (const [path, courses] of Object.entries(grouped)) {
            const pathId = path.replace(/\s+/g, '-').toLowerCase();
            const completedInPath = courses.filter(c => this.state.completed.includes((c.Title || "").replace(/\s+/g, '-').toLowerCase())).length;
            const isPathMastered = completedInPath === courses.length;
            const isPathClaimed = this.state.claimedPaths.includes(pathId);

            html += `<div class="path-container">
                        <div class="path-header"><span>${path}</span><span class="path-stats">${completedInPath}/${courses.length}</span></div>`;
            
            html += courses.map(c => {
                const title = c.Title || "Untitled";
                const link = c.Link || "";
                const courseId = title.replace(/\s+/g, '-').toLowerCase();
                const isDone = this.state.completed.includes(courseId);
                const isYouTube = link.includes('youtube.com') || link.includes('youtu.be');
                const statusHtml = isDone ? `<div class="lesson-done-tag">✅ Finished</div>` : `<div id="status-${courseId}" class="unlock-hint">📖 30s Study</div>`;

                if (isYouTube) {
                    const videoId = link.split('v=')[1]?.split('&')[0] || link.split('/').pop();
                    return `<div class="card video-card" onclick="app.openMaterial('${link}', '${courseId}')">
                                <h4>${title}</h4>
                                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
                                ${statusHtml}
                            </div>`;
                }
                return `<div class="card doc-card" onclick="app.openMaterial('${link}', '${courseId}')"><h4>${title}</h4>${statusHtml}</div>`;
            }).join('');

            if (isPathMastered && !isPathClaimed) {
                html += `<button class="path-claim-btn" onclick="app.claimPathXP('${pathId}', 100)">Claim Mastery (+100 XP)</button>`;
            }
            html += `</div>`;
        }
        document.getElementById('learnContainer').innerHTML = html;
    },

    openMaterial: function(link, courseId) {
        this.tg.openLink(link);
        if (this.state.completed.includes(courseId)) return;
        const status = document.getElementById(`status-${courseId}`);
        let timeLeft = 30;
        const timer = setInterval(() => {
            timeLeft--;
            if (status) status.innerText = `⏳ Studying... (${timeLeft}s)`;
            if (timeLeft <= 0) {
                clearInterval(timer);
                if (!this.state.completed.includes(courseId)) {
                    this.state.completed.push(courseId);
                    this.state.userXP += 20;
                    this.saveState();
                    this.renderLearn(this.lastItems);
                    this.updateUI();
                }
            }
        }, 1000);
    },

    // --- TELEGRAM JOIN FEATURE (Make.com) ---
    completeJoinTask: function(btn) {
        const userId = this.tg.initDataUnsafe?.user?.id;
        if (!userId) return;
        if (btn.getAttribute('data-state') !== 'verifying') {
            this.tg.openTelegramLink("https://t.me/VettedWeb3jobs");
            btn.setAttribute('data-state', 'verifying');
            btn.innerText = "Verify Join";
        } else {
            btn.innerText = "Checking...";
            fetch(`${MAKE_WEBHOOK_URL}?userId=${userId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.isMember) {
                        this.addPoints(100);
                        btn.innerText = "Completed ✅";
                        btn.disabled = true;
                    } else {
                        this.tg.showAlert("Not found in channel yet!");
                        btn.innerText = "Verify Join";
                    }
                });
        }
    },

    // --- ADS & REWARDS ---
    watchAd: function() {
        const now = Date.now();
        if (now - this.state.lastAdTime < 60000) {
            this.tg.showAlert("Ads charging. Wait a moment.");
            return;
        }
        if (this.adController) {
            this.adController.show().then(result => {
                if (result?.done) {
                    this.state.lastAdTime = Date.now();
                    this.addPoints(10);
                }
            });
        }
    },

    addPoints: function(amount) {
        this.state.points += amount;
        this.state.userXP += amount;
        this.saveState();
        this.updateUI();
    },

    renderNews: function(news) {
        document.getElementById('newsContainer').innerHTML = news.map(n => `
            <div class="card" onclick="app.tg.openLink('${n.Link}')">
                <h4>${n.Headline}</h4>
                <p>${n.Source}</p>
            </div>`).join('');
    },

    renderSalaryEngine: function() {
        const roles = [
            { role: "Smart Contract Eng", salary: "$180k+", demand: 95 },
            { role: "ZK Researcher", salary: "$200k+", demand: 98 }
        ];
        document.getElementById('salaryContainer').innerHTML = roles.map(r => `
            <div class="salary-row">
                <span>${r.role} <b>${r.salary}</b></span>
                <div class="demand-bar-bg"><div class="demand-bar-fill" style="width:${r.demand}%"></div></div>
            </div>`).join('');
    },

    checkStreak: function() {
        const today = new Date().toDateString();
        if (this.state.lastVisit !== today) {
            this.state.streak = (this.state.lastVisit === new Date(Date.now() - 86400000).toDateString()) ? this.state.streak + 1 : 1;
            this.state.lastVisit = today;
            this.addPoints(10);
            this.saveState();
        }
    },

    changeTab: function(tabId, btn) {
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        if(this.tg.HapticFeedback) this.tg.HapticFeedback.impactOccurred('light');
    },

    claimPathXP: function(pathId, amount) {
        if (this.state.claimedPaths.includes(pathId)) return;
        this.state.claimedPaths.push(pathId);
        this.state.userXP += amount;
        this.saveState();
        this.updateUI();
        this.tg.showAlert(`🎉 Mastery Bonus! +${amount} XP`);
    }
};

window.onload = () => app.init();

