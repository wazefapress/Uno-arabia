const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);

// تفعيل CORS لطلبات Express (الـ fetch)
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(express.json());

// إعدادات Socket.io مع تفعيل الـ CORS
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const db = new sqlite3.Database('./uno_game.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        avatar_id INTEGER DEFAULT 1,
        active_theme TEXT DEFAULT 'theme-blue',
        uno_coins INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT 0,
        verification_code TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        user_id INTEGER,
        item_type TEXT,
        item_value TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'your-email@gmail.com', pass: 'your-app-password' }
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        db.run(`INSERT INTO users (username, email, password, verification_code, is_verified) VALUES (?, ?, ?, ?, 0)`, 
        [username, email, hashedPassword, code], async function(err) {
            if (err) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم مسبقاً.' });
            try {
                await transporter.sendMail({
                    from: 'UNO Game <your-email@gmail.com>', to: email,
                    subject: 'كود التفعيل', text: `كود التفعيل الخاص بك هو: ${code}`
                });
            } catch (e) { console.log("Email send error:", e); }
            res.json({ success: true, message: 'تم التسجيل وإرسال كود التفعيل.' });
        });
    } catch (e) { res.status(500).json({ error: 'خطأ في الخادم.' }); }
});

app.post('/verify-email', (req, res) => {
    const { email, code } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
        if (user.verification_code === code) {
            db.run(`UPDATE users SET is_verified = 1, verification_code = NULL WHERE email = ?`, [email], () => {
                res.json({ success: true, message: 'تم تفعيل الحساب بنجاح!' });
            });
        } else { res.status(400).json({ error: 'كود التفعيل غير صحيح.' }); }
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (!user || !user.is_verified || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب غير مفعل.' });
        }
        res.json({ success: true, message: 'تم الدخول', username: user.username, coins: user.uno_coins, avatar: user.avatar_id, theme: user.active_theme });
    });
});

app.post('/buy-item', (req, res) => {
    const { buyer_username, target_username, item_type, item_value, cost } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [buyer_username], (err, buyer) => {
        if (!buyer || buyer.uno_coins < cost) return res.status(400).json({ error: 'رصيد العملات غير كافٍ.' });

        db.run(`UPDATE users SET uno_coins = uno_coins - ? WHERE username = ?`, [cost, buyer_username]);
        const recipient = target_username || buyer_username;
        db.get(`SELECT id FROM users WHERE username = ?`, [recipient], (err, targetUser) => {
            if (!targetUser) return res.status(404).json({ error: 'المستلم غير موجود.' });
            db.run(`INSERT INTO inventory (user_id, item_type, item_value) VALUES (?, ?, ?)`, [targetUser.id, item_type, item_value]);
            res.json({ success: true, message: 'تمت العملية بنجاح!' });
        });
    });
});

app.get('/leaderboard', (req, res) => {
    db.all(`SELECT username, uno_coins, avatar_id FROM users ORDER BY uno_coins DESC LIMIT 10`, [], (err, rows) => {
        res.json({ success: true, leaders: rows || [] });
    });
});

app.get('/profile/:username', (req, res) => {
    const username = req.params.username;
    db.get(`SELECT username, email, uno_coins, avatar_id, active_theme FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
        db.all(`SELECT item_type, item_value FROM inventory WHERE user_id = (SELECT id FROM users WHERE username = ?)`, [username], (err, rows) => {
            res.json({ success: true, user, inventory: rows || [] });
        });
    });
});

app.post('/update-active-item', (req, res) => {
    const { username, type, value } = req.body;
    const col = type === 'avatar' ? 'avatar_id' : 'active_theme';
    db.run(`UPDATE users SET ${col} = ? WHERE username = ?`, [value, username], () => {
        res.json({ success: true, message: 'تم التحديث بنجاح!' });
    });
});

const rooms = {};
function generateRoomCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

function createDeck() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    let deck = [];
    colors.forEach(color => {
        deck.push({ color, value: '0' });
        for (let i = 1; i <= 9; i++) {
            deck.push({ color, value: i.toString() });
            deck.push({ color, value: i.toString() });
        }
        ['skip', 'reverse', 'draw2'].forEach(special => {
            deck.push({ color, value: special });
            deck.push({ color, value: special });
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: 'wild' });
        deck.push({ color: 'wild', value: 'draw4' });
    }
    return deck.sort(() => Math.random() - 0.5);
}

function sendGameState(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.players.forEach(playerId => {
        if (!playerId.startsWith('AI_BOT')) {
            io.to(playerId).emit('gameStateUpdate', {
                myHand: room.hands[playerId],
                opponentCardCount: room.hands['AI_BOT_1'].length,
                discardTop: room.discardPile[room.discardPile.length - 1],
                currentColor: room.currentColor,
                isMyTurn: room.turnIndex === room.players.indexOf(playerId)
            });
        }
    });
}

function handleRoundWin(roomCode, winnerId) {
    const room = rooms[roomCode];
    let pointsWon = 50;
    room.players.forEach(pid => {
        if (pid !== winnerId && room.hands[pid]) {
            room.hands[pid].forEach(card => {
                pointsWon += parseInt(card.value) || 20;
            });
        }
    });

    if (!winnerId.startsWith('AI_BOT')) {
        const username = room.playerNames[winnerId];
        db.run(`UPDATE users SET uno_coins = uno_coins + ? WHERE username = ?`, [pointsWon, username], () => {
            db.get(`SELECT uno_coins FROM users WHERE username = ?`, [username], (err, row) => {
                if (row) {
                    io.to(winnerId).emit('updateCoinBalance', { newCoins: row.uno_coins, earned: pointsWon });
                }
            });
        });
    }

    io.to(roomCode).emit('roundOver', {
        winnerId,
        winnerName: room.playerNames[winnerId],
        pointsWon
    });
    delete rooms[roomCode];
}

io.on('connection', (socket) => {
    socket.on('createAIRoom', (data) => {
        const username = data.username || 'لاعب';
        const roomCode = generateRoomCode();
        const players = [socket.id, 'AI_BOT_1'];
        const playerNames = { [socket.id]: username, 'AI_BOT_1': 'الكمبيوتر 🤖' };
        const deck = createDeck();
        const hands = {
            [socket.id]: deck.splice(0, 7),
            'AI_BOT_1': deck.splice(0, 7)
        };
        let discardPile = [deck.pop()];
        while (discardPile[0].color === 'wild') {
            deck.push(discardPile.pop());
            discardPile.push(deck.pop());
        }

        rooms[roomCode] = {
            code: roomCode,
            players,
            playerNames,
            deck,
            discardPile,
            hands,
            currentColor: discardPile[0].color,
            turnIndex: 0
        };

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        sendGameState(roomCode);
    });

    socket.on('playCard', (data) => {
        const { roomCode, cardIndex, chosenColor } = data;
        const room = rooms[roomCode];
        if (!room || room.players[room.turnIndex] !== socket.id) return;

        const hand = room.hands[socket.id];
        const card = hand[cardIndex];
        const topCard = room.discardPile[room.discardPile.length - 1];

        const isValid = card.color === 'wild' || card.color === room.currentColor || card.value === topCard.value;
        if (!isValid) return;

        hand.splice(cardIndex, 1);
        room.discardPile.push(card);

        if (card.color === 'wild') {
            room.currentColor = chosenColor || 'red';
        } else {
            room.currentColor = card.color;
        }

        if (hand.length === 0) {
            handleRoundWin(roomCode, socket.id);
            return;
        }

        room.turnIndex = 1;
        sendGameState(roomCode);

        setTimeout(() => {
            if (!rooms[roomCode]) return;
            const aiHand = rooms[roomCode].hands['AI_BOT_1'];
            let played = false;
            for (let i = 0; i < aiHand.length; i++) {
                const c = aiHand[i];
                const currentTop = rooms[roomCode].discardPile[rooms[roomCode].discardPile.length - 1];
                if (c.color === 'wild' || c.color === rooms[roomCode].currentColor || c.value === currentTop.value) {
                    aiHand.splice(i, 1);
                    rooms[roomCode].discardPile.push(c);
                    if (c.color === 'wild') {
                        const colors = ['red', 'blue', 'green', 'yellow'];
                        rooms[roomCode].currentColor = colors[Math.floor(Math.random() * colors.length)];
                    } else {
                        rooms[roomCode].currentColor = c.color;
                    }
                    played = true;
                    break;
                }
            }

            if (!played) {
                if (rooms[roomCode].deck.length === 0) rooms[roomCode].deck = createDeck();
                aiHand.push(rooms[roomCode].deck.pop());
            }

            if (aiHand.length === 0) {
                handleRoundWin(roomCode, 'AI_BOT_1');
                return;
            }

            rooms[roomCode].turnIndex = 0;
            sendGameState(roomCode);
        }, 1500);
    });

    socket.on('drawCard', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (!room || room.players[room.turnIndex] !== socket.id) return;

        if (room.deck.length === 0) room.deck = createDeck();
        room.hands[socket.id].push(room.deck.pop());
        sendGameState(roomCode);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`الخادم يعمل على المنفذ ${PORT}`); });
