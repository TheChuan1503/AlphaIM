const Datastore = require('nedb');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const svgCaptcha = require('svg-captcha');
const authUtil = require('./utils/authUtil');
const { createCanvas } = require('canvas');
require('dotenv').config();
const WebSocket = require('ws');
const userUtil = require('./utils/userUtil');
const wsUtil = require('./utils/wsUtil');
const aesUtil = require('./utils/aesUtil');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// 数据库初始化
const db = {
    users: new Datastore({ filename: './db/users.db', autoload: true }),
    userData: new Datastore({ filename: './db/user_data.db', autoload: true }),
    chatHistory: new Datastore({ filename: './db/chat_history.db', autoload: true })
};

// 会话数据
const captchaSessions = {};
const httpPublicDirs = ['assets', 'libs'];
const encryptedSessions = {};

// 中间件
app.use(bodyParser.json());
app.use(cookieParser());
app.use((req, res, next) => {
    if (!(httpPublicDirs.some((dir) => req.path.startsWith(`/${dir}`)))) {
        return next();
    }
    if (req.path === '/assets/script_main.js' || req.path === '/assets/script_login.js') {
        return next();
    }
    express.static(path.join(__dirname, 'public'))(req, res, next);
});
app.use((req, res, next) => {
    if (req.path.endsWith('.db')) {
        console.log("WARNING " + req.ip + " tried to access database file " + req.path);
        return
    }
    next();
});

const REPLACE_MAP = {
    AlphaIM: {
        WS_PORT: WS_PORT || 3001,
        MAX_IMAGE_SIZE: process.env.MAX_IMAGE_SIZE || 72,
        MAX_IMAGE_QUALITY: process.env.MAX_IMAGE_QUALITY || 0.9,
        MAX_IMAGE_WIDTH: process.env.MAX_IMAGE_WIDTH || 2048,
        MAX_IMAGE_HEIGHT: process.env.MAX_IMAGE_HEIGHT || 2048,
        MAX_USER_NAME_LENGTH: process.env.MAX_USER_NAME_LENGTH || 16,
        MIN_USER_NAME_LENGTH: process.env.MIN_USER_NAME_LENGTH || 4,
        MAX_PASSWORD_LENGTH: process.env.MAX_PASSWORD_LENGTH || 64,
        MIN_PASSWORD_LENGTH: process.env.MIN_PASSWORD_LENGTH || 6,
    }
};

app.get('/assets/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!filename.endsWith('.js')) {
        return res.status(400).send('Invalid file type');
    }

    const scriptPath = path.join(__dirname, 'public', 'assets', filename);

    fs.readFile(scriptPath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading ${filename}:`, err);
            return res.status(404).send('File not found');
        }

        let modifiedScript = data;
        for (const [key, value] of Object.entries(REPLACE_MAP.AlphaIM)) {
            modifiedScript = modifiedScript.replace(new RegExp(`\\{\\s*AlphaIM\\s*:\\s*${key}\\s*\\}`, 'g'), value);
        }

        res.setHeader('Content-Type', 'application/javascript');
        res.send(modifiedScript);
    });
});

const authMiddleware = (req, res, next) => {
    const token = req.cookies[authUtil.COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ success: false, message: '未授权，请先登录' });
    }

    authUtil.getAuthFromToken(db.users, token, (success, user, error) => {
        if (success && user) {
            req.user = user;
            userUtil.getUserByAuth(db.userData, user, (userData) => {
                req.userData = userData;
                next();
            });
        } else {
            res.status(401).json({ success: false, message: error || '无效的token，请重新登录' });
        }
    });
};

app.get('/', (req, res) => {
    const token = req.cookies[authUtil.COOKIE_NAME];

    if (!token) {
        return res.redirect('/login');
    }

    authUtil.getAuthFromToken(db.users, token, (success, user, error) => {
        if (success && user) {
            const userAgent = req.headers['user-agent'] || '';
            const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);

            const htmlFile = isMobile ? 'main_mobile.html' : 'main_desktop.html';
            res.sendFile(path.join(__dirname, 'public', htmlFile));
        } else {
            res.redirect('/login');
        }
    });
});

app.get('/login', (req, res) => {
    const token = req.cookies[authUtil.COOKIE_NAME];

    if (token) {
        authUtil.getAuthFromToken(db.users, token, (success, user, error) => {
            if (success && user) {
                return res.redirect('/');
            } else {
                res.sendFile(path.join(__dirname, 'public', 'login.html'));
            }
        });
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/register', (req, res) => {
    const token = req.cookies[authUtil.COOKIE_NAME];

    if (token) {
        authUtil.getAuthFromToken(db.users, token, (success, user, error) => {
            if (success && user) {
                return res.redirect('/');
            } else {
                const userAgent = req.headers['user-agent'] || '';
                const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);

                const htmlFile = isMobile ? 'register_mobile.html' : 'register_desktop.html';
                res.sendFile(path.join(__dirname, 'public', htmlFile));
            }
        });
    } else {
        const userAgent = req.headers['user-agent'] || '';
        const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);

        const htmlFile = isMobile ? 'register_mobile.html' : 'register_desktop.html';
        res.sendFile(path.join(__dirname, 'public', htmlFile));
    }
});

app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 4, // 验证码长度
        ignoreChars: '0o1il', // 排除容易混淆的字符
        noise: 2, // 干扰线条数量
        color: true, // 验证码颜色
        background: '#f0f0f0' // 背景色
    });

    // 生成唯一会话ID
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);

    // 存储验证码文本和创建时间
    captchaSessions[sessionId] = {
        text: captcha.text.toLowerCase(),
        createdAt: Date.now()
    };

    // 设置验证码会话ID的cookie
    res.cookie('captchaSessionId', sessionId, {
        maxAge: 10 * 60 * 1000, // 10分钟过期
        httpOnly: true
    });

    // 清理过期的验证码会话
    cleanupCaptchaSessions();

    res.type('svg');
    res.status(200).send(captcha.data);
});

function cleanupCaptchaSessions() {
    const now = Date.now();
    const expirationTime = 10 * 60 * 1000; // 10分钟

    Object.keys(captchaSessions).forEach(sessionId => {
        if (now - captchaSessions[sessionId].createdAt > expirationTime) {
            delete captchaSessions[sessionId];
        }
    });
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    authUtil.loginUser(db.users, username, password, (success, user, error, token) => {
        if (success && user) {
            // 设置cookie，15天过期
            res.cookie(authUtil.COOKIE_NAME, token, {
                maxAge: authUtil.TOKEN_EXPIRES * 1000, // 转换为毫秒
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // 生产环境使用secure
                sameSite: 'strict'
            });

            res.json({ success: true, message: 'Login successful' });
        } else {
            res.status(200).json({ success: false, message: error || 'Login failed' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, captcha } = req.body;
    const sessionId = req.cookies.captchaSessionId;

    if (!username || !password) {
        return res.status(200).json({ success: false, message: 'Invalid username or password' });
    }

    if (!captcha || !sessionId || !captchaSessions[sessionId]) {
        return res.status(200).json({ success: false, message: 'Invalid captcha' });
    }

    if (captcha.toLowerCase() !== captchaSessions[sessionId].text) {
        return res.status(200).json({ success: false, message: 'Invalid captcha' });
    }

    delete captchaSessions[sessionId];
    res.clearCookie('captchaSessionId');

    authUtil.registerUser(db.users, db.userData, username, password, req, (success, user, error) => {
        if (success && user) {
            res.json({ success: true, message: 'Registration successful' });
        } else {
            res.status(200).json({ success: false, message: error || 'Registration failed' });
        }
    });
});

app.get('/api/user', authMiddleware, (req, res) => {
    userUtil.getUserByAuth(db.users, req.user, (user) => {
        if (user) {
            res.json({
                success: true,
                user: {
                    uid: req.user.uid,
                    username: req.user.username,
                    nickname: req.userData.nickname,
                    joined_sessions: req.userData.joinedSessions,
                }
            });
        } else {
            res.status(200).json({ success: false, message: 'User not found' });
        }
    });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie(authUtil.COOKIE_NAME);
    res.json({ success: true, message: 'Logout' });
});

app.get('/api/get_avatar', (req, res) => {
    const name = req.query.name || 'U';
    const size = 128;

    const generateAvatar = (displayName, colorSeed) => {
        const hash = colorSeed.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
        const hue = Math.abs(hash) % 360;
        const saturation = 70 + Math.abs(hash % 30);
        const lightness = 50 + Math.abs(hash % 30);

        const firstLetter = displayName.charAt(0).toUpperCase();

        const isLight = (lightness > 60) || (lightness > 50 && saturation < 30);
        const textColor = isLight ? '#000000' : '#FFFFFF';

        const svg = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                <rect width="${size}" height="${size}" fill="hsl(${hue}, ${saturation}%, ${lightness}%)"/>
                <text x="50%" y="55%" 
                      font-family="Arial" 
                      font-size="${size * 0.5}" 
                      font-weight="bold" 
                      fill="${textColor}"
                      text-anchor="middle" 
                      dominant-baseline="middle">
                    ${firstLetter}
                </text>
            </svg>
        `;

        res.set('Content-Type', 'image/svg+xml');
        res.send(svg);
    };

    if (name.includes(':')) {
        const [type, value] = name.split(':');
        if (type === 'user' || type === 'chat') {
            userUtil.getUserByUsername(db.users, db.userData, value, (user) => {
                if (user) {
                    generateAvatar(user.nickname, `${user.nickname}/${user.auth.username}`);
                } else {
                    generateAvatar(value, value);
                }
            });
        } else {
            generateAvatar(name, name);
        }
    } else {
        userUtil.getUserByUsername(db.users, db.userData, name, (user) => {
            if (user) {
                generateAvatar(user.nickname, `${user.nickname}/${user.auth.username}`);
            } else {
                generateAvatar(name, name);
            }
        });
    }
});

app.get('/api/user_public_info', (req, res) => {
    const uid = parseInt(req.query.uid);
    if (!uid) {
        return res.status(400).json({ success: false, message: 'User not found' });
    }
    userUtil.getUserByUid(db.users, db.userData, uid, (user) => {
        if (user) {
            res.json({
                success: true,
                user: {
                    uid: user.auth.uid,
                    username: user.auth.username,
                    nickname: user.nickname,
                }
            });
        } else {
            res.status(400).json({ success: false, message: 'User not found' });
        }
    });
});

app.get('/api/new_encrypted_session', (req, res) => {
    const aesKey = aesUtil.genKey();
    const sid = randomUUID();
    encryptedSessions[sid] = aesKey;
    res.json({ success: true, aes_key: aesKey, sid });
});

app.listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT}`);
});

wsUtil.start(WS_PORT, db, encryptedSessions);
console.log(`WebSocket Server running on port ${WS_PORT}`);