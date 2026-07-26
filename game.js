const BACKEND_URL = 'https://uno-arabia.onrender.com';
const socket = io(BACKEND_URL);
let currentGiftData = null;
let pendingEmailForVerification = '';
let currentRoomCode = null;
let selectedCardForWild = null;

window.addEventListener('DOMContentLoaded', () => {
    checkLocalSession();
    generateAvatarsForStore();
});

function checkLocalSession() {
    const username = localStorage.getItem('uno_username');
    const coins = localStorage.getItem('uno_coins') || '0';
    const avatar = localStorage.getItem('uno_avatar') || '1';
    const theme = localStorage.getItem('uno_theme') || 'theme-blue';

    if (username) {
        document.getElementById('hud-username').innerText = username;
        document.getElementById('live-uno-coins').innerText = coins;
        document.getElementById('store-username').innerText = username;
        document.getElementById('uno-coins-balance').innerText = coins;
        document.getElementById('profile-coins').innerText = coins;
        document.getElementById('current-user-avatar').style.backgroundImage = `url('avatars/${avatar}.png')`;
        document.body.className = theme;
    }
}

function startSinglePlayerGame() {
    if (!socket.connected) {
        alert("الاتصال بالخادم غير متوفر حالياً.");
        return;
    }
    
    const username = localStorage.getItem('uno_username') || 'لاعب';
    socket.emit('createAIRoom', { username: username, totalPlayers: 2 });
}

socket.on('roomCreated', (roomCode) => {
    currentRoomCode = roomCode;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('room-code-display').innerText = `الغرفة: ${roomCode}`;
});

socket.on('gameStateUpdate', (state) => {
    // خرائط الألوان لتنسيق أوراق اللعب بشكل أنيق
    const colorMapBg = { 
        red: '#e74c3c', 
        blue: '#3498db', 
        green: '#2ecc71', 
        yellow: '#f1c40f',
        wild: '#2c3e50'
    };
    const colorMapText = { 
        yellow: '#333', 
        red: '#fff', 
        blue: '#fff', 
        green: '#fff',
        wild: '#fff'
    };

    // أوراق الخصم (لاعب AI)
    const opponentHandDiv = document.getElementById('opponent-hand');
    opponentHandDiv.innerHTML = '';
    for (let i = 0; i < state.opponentCardCount; i++) {
        const cardBack = document.createElement('div');
        cardBack.style.cssText = "width: 40px; height: 60px; background: #c0392b; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.65rem; font-weight: bold; border: 1px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3);";
        cardBack.innerText = 'UNO';
        opponentHandDiv.appendChild(cardBack);
    }
    document.getElementById('opponent-cards-count').innerText = `أوراق لاعب AI: ${state.opponentCardCount}`;

    // كومة الإلقاء (الورقة الحالية على الطاولة)
    const discardPile = document.getElementById('discard-pile');
    const topCard = state.discardTop;
    const discardBg = colorMapBg[topCard.color] || '#fff';
    const discardText = colorMapText[topCard.color] || '#333';
    
    discardPile.style.cssText = `width: 65px; height: 95px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; padding: 6px; font-weight: bold; background: ${discardBg}; color: ${discardText}; border: 2px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3);`;
    discardPile.innerHTML = `<div style="font-size:0.8rem;">${topCard.value}</div><div style="text-align:center; font-size:1.2rem;">🃏</div><div style="font-size:0.8rem; text-align:left;">${topCard.value}</div>`;

    // مؤشر اللون الحالي للبطاقات البرية
    const colorIndicator = document.getElementById('current-color-indicator');
    colorIndicator.style.background = colorMapBg[state.currentColor] || '#fff';

    // أوراق يد اللاعب الحالي
    const myHandDiv = document.getElementById('my-hand-container');
    myHandDiv.innerHTML = '';
    state.myHand.forEach((card, index) => {
        const bgCol = colorMapBg[card.color] || '#fff';
        const txtCol = colorMapText[card.color] || '#333';
        
        const cardEl = document.createElement('div');
        cardEl.style.cssText = `width: 55px; height: 80px; border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; padding: 5px; font-weight: bold; cursor: pointer; background: ${bgCol}; color: ${txtCol}; border: 2px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); flex-shrink: 0; transition: transform 0.2s;`;
        cardEl.innerHTML = `<div style="font-size:0.8rem;">${card.value}</div><div style="text-align:center; font-size:1.1rem;">🃏</div><div style="font-size:0.8rem; text-align:left;">${card.value}</div>`;
        
        // تأثير تكبير الورقة عند تمرير الماوس أو الضغط عليها
        cardEl.onmouseover = () => cardEl.style.transform = 'translateY(-8px)';
        cardEl.onmouseout = () => cardEl.style.transform = 'translateY(0)';
        
        cardEl.onclick = () => playCard(index, card);
        myHandDiv.appendChild(cardEl);
    });

    // مؤشر الدور
    const turnIndicator = document.getElementById('turn-indicator');
    if (state.isMyTurn) {
        turnIndicator.innerText = "دورك الآن! اختر ورقة للعب أو اسحب من الكومة.";
        turnIndicator.style.color = "#2ecc71";
    } else {
        turnIndicator.innerText = "دور لاعب AI يفكر...";
        turnIndicator.style.color = "#f1c40f";
    }
});

function playCard(index, card) {
    if (card.color === 'wild') {
        selectedCardForWild = index;
        document.getElementById('color-picker-modal').style.display = 'flex';
        return;
    }
    socket.emit('playCard', { roomCode: currentRoomCode, cardIndex: index });
}

function selectWildColor(color) {
    document.getElementById('color-picker-modal').style.display = 'none';
    if (selectedCardForWild !== null) {
        socket.emit('playCard', { roomCode: currentRoomCode, cardIndex: selectedCardForWild, chosenColor: color });
        selectedCardForWild = null;
    }
}

function drawCard() {
    socket.emit('drawCard', { roomCode: currentRoomCode });
}

function leaveGame() {
    location.reload();
}

function switchStoreTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.store-section').forEach(s => s.classList.remove('active'));
    if(tab === 'avatars') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('avatars-section').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('themes-section').classList.add('active');
    }
}

function generateAvatarsForStore() {
    const grid = document.getElementById('avatars-grid');
    if (!grid) return;
    let html = '';
    for (let i = 1; i <= 20; i++) {
        let price = 100 + (Math.floor(i / 5) * 100);
        html += `
            <div class="item-card">
                <img src="avatars/${i}.png" class="avatar-store-img" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
                <p style="margin:2px 0; font-size:0.8rem; font-weight:bold;">شخصية ${i}</p>
                <p style="margin:2px 0; font-size:0.8rem; color:#f39c12; font-weight:bold;">🪙 ${price}</p>
                <button class="btn-small btn-buy" onclick="buyItem('avatar', ${i}, ${price})">شراء</button>
                <button class="btn-small btn-gift" onclick="openGiftModal('avatar', ${i}, ${price})" style="margin-top:3px;">إهداء 🎁</button>
            </div>
        `;
    }
    grid.innerHTML = html;
}

function buyItem(type, value, cost) {
    const username = localStorage.getItem('uno_username');
    if (!username) { alert("يرجى تسجيل الدخول أولاً."); openLoginModal(); return; }

    fetch(`${BACKEND_URL}/buy-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_username: username, item_type: type, item_value: value, cost: cost })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) { alert(data.message); location.reload(); }
        else { alert(data.error || "فشل الشراء."); }
    })
    .catch(err => {
        console.error("Buy Error:", err);
        alert("تعذر الاتصال بالخادم.");
    });
}

function openGiftModal(type, value, cost) {
    currentGiftData = { type, value, cost };
    document.getElementById('gift-modal').style.display = 'flex';
}
function closeGiftModal() {
    currentGiftData = null;
    document.getElementById('gift-target-username').value = '';
    document.getElementById('gift-modal').style.display = 'none';
}
function confirmGift() {
    const targetUser = document.getElementById('gift-target-username').value.trim();
    const sender = localStorage.getItem('uno_username');
    if (!targetUser || !sender) { alert("أدخل اسم الصديق بشكل صحيح."); return; }

    fetch(`${BACKEND_URL}/buy-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_username: sender, target_username: targetUser, item_type: currentGiftData.type, item_value: currentGiftData.value, cost: currentGiftData.cost })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) { alert("تم إرسال الهدية بنجاح! 🎁"); closeGiftModal(); }
        else { alert(data.error || "فشل إرسال الهدية."); }
    })
    .catch(err => {
        console.error("Gift Error:", err);
        alert("تعذر الاتصال بالخادم.");
    });
}

function openLoginModal() { document.getElementById('login-modal').style.display = 'flex'; }
function switchToRegister() { document.getElementById('login-modal').style.display = 'none'; document.getElementById('register-modal').style.display = 'flex'; }

function submitRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    if (!username || !email || !password) { alert("املأ جميع الحقول."); return; }

    fetch(`${BACKEND_URL}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            document.getElementById('register-modal').style.display = 'none';
            openLoginModal();
        } else { alert(data.error || "فشل التسجيل."); }
    })
    .catch(err => {
        console.error("Register Error:", err);
        alert("تعذر الاتصال بالخادم.");
    });
}

function submitLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    fetch(`${BACKEND_URL}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('uno_username', data.username);
            localStorage.setItem('uno_coins', data.coins);
            localStorage.setItem('uno_avatar', data.avatar);
            localStorage.setItem('uno_theme', data.theme);
            location.reload();
        } else { alert(data.error || "فشل تسجيل الدخول."); }
    })
    .catch(err => {
        console.error("Login Error:", err);
        alert("تعذر الاتصال بالخادم.");
    });
}

function openLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'flex';
    fetch(`${BACKEND_URL}/leaderboard`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            let html = '';
            data.leaders.forEach((u, idx) => {
                html += `
                    <div class="leaderboard-item" style="display:flex; align-items:center; gap:10px; padding:8px; background:#f9f9f9; border-radius:6px; margin-bottom:5px;">
                        <span style="font-weight:bold; width:25px;">#${idx+1}</span>
                        <img src="avatars/${u.avatar_id || 1}.png" class="leaderboard-avatar" style="width:35px; height:35px; border-radius:50%;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
                        <span style="font-weight:bold; flex:1; text-align:right;">${u.username}</span>
                        <span style="color:#f39c12; font-weight:bold;">🪙 ${u.uno_coins}</span>
                    </div>
                `;
            });
            document.getElementById('leaderboard-list').innerHTML = html;
        }
    })
    .catch(err => console.error("Leaderboard Error:", err));
}

function openProfileModal() {
    const username = localStorage.getItem('uno_username');
    if (!username) { alert("سجل الدخول أولاً."); openLoginModal(); return; }
    document.getElementById('profile-modal').style.display = 'flex';

    fetch(`${BACKEND_URL}/profile/${username}`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('profile-username').innerText = data.user.username;
            document.getElementById('profile-email').innerText = data.user.email;
            document.getElementById('profile-coins').innerText = data.user.uno_coins;
            document.getElementById('profile-avatar-container').style.backgroundImage = `url('avatars/${data.user.avatar_id}.png')`;

            let html = '';
            data.inventory.forEach(item => {
                let active = (item.item_type === 'avatar' && parseInt(item.item_value) === data.user.avatar_id) || (item.item_type === 'theme' && item.item_value === data.user.active_theme);
                html += `
                    <div class="inventory-card ${active ? 'active-item' : ''}" onclick="setActiveItem('${item.item_type}', '${item.item_value}')" style="cursor:pointer; padding:5px; border:2px solid ${active ? '#2ecc71' : '#ccc'}; border-radius:6px;">
                        <div class="inventory-thumb" style="height:40px; ${item.item_type === 'avatar' ? `background-image: url('avatars/${item.item_value}.png'); background-size:cover;` : 'background:#3498db;'}"></div>
                        <span style="font-size:0.7rem; font-weight:bold; color:#333;">${item.item_type === 'avatar' ? 'شخصية ' + item.item_value : 'ثيم طاولة'}</span>
                    </div>
                `;
            });
            document.getElementById('profile-inventory-list').innerHTML = html;
        }
    })
    .catch(err => console.error("Profile Error:", err));
}

function setActiveItem(type, value) {
    const username = localStorage.getItem('uno_username');
    fetch(`${BACKEND_URL}/update-active-item`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, type, value })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            if (type === 'theme') { localStorage.setItem('uno_theme', value); document.body.className = value; }
            openProfileModal();
        }
    })
    .catch(err => console.error("Update Item Error:", err));
}

socket.on('updateCoinBalance', (data) => {
    localStorage.setItem('uno_coins', data.newCoins);
    document.getElementById('live-uno-coins').innerText = data.newCoins;
    showFloatingReward(`+${data.earned} 🪙 تم اضافتها لرصيدك!`);
});

socket.on('roundOver', (data) => {
    alert(`انتهت الجولة! الفائز هو: ${data.winnerName} وقد ربح ${data.pointsWon} عملة.`);
    location.reload();
});

function showFloatingReward(text) {
    const div = document.createElement('div');
    div.innerText = text;
    div.style.cssText = "position: fixed; top: 20%; left: 50%; transform: translateX(-50%); background: #2ecc71; color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold; z-index: 3000; box-shadow: 0 4px 10px rgba(0,0,0,0.3);";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}