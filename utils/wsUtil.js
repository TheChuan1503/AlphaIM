const WebSocket = require('ws');
const authUtil = require('./authUtil');
const userUtil = require('./userUtil');
const G = require('../global');

module.exports = {
    /**
     * @type {WebSocket.Server} wss - WebSocket服务器实例
     */
    wss: null,
    parseCookies(cookieHeader) {
        return cookieHeader?.split(';').reduce((cookies, cookie) => {
            const [name, value] = cookie.trim().split('=');
            cookies[name] = value;
            return cookies;
        }, {}) || {};
    },
    estimateFileSizeFromBase64(base64) {
        // 移除可能存在的换行符和空格
        const cleanBase64 = base64.replace(/[\r\n\s]/g, '');
        const length = cleanBase64.length;

        // 计算 padding
        const padding = (cleanBase64.endsWith('==') ? 2 : (cleanBase64.endsWith('=') ? 1 : 0));

        // 计算公式: 原始字节数 = (base64长度 * 3/4) - padding
        return Math.floor(length * 0.75) - padding;
    },
    start(WS_PORT, db) {
        /**
         * @type {WebSocket.Server}
         */
        this.wss = new WebSocket.Server({ port: WS_PORT });
        this.wss.on('connection', (ws, req) => {
            const token = this.parseCookies(req.headers.cookie || '')['alphaim_token'];
            if (!token) {
                ws.close();
                return;
            }
            authUtil.getAuthFromToken(db.users, token, (success, auth, error) => {
                if (!success || !auth) {
                    ws.close();
                    return;
                }
                console.log(`User ${auth.username}(UID: ${auth.uid}, ${G.cleanIp(req.socket.remoteAddress)}): ${req.headers['user-agent']}`);
                ws.token = token;
                ws.auth = auth;
                ws.on('message', (message) => {
                    if (Buffer.isBuffer(message)) {
                        message = message.toString();
                    }
                    if (typeof message === 'string') {
                        message = JSON.parse(message);
                    }
                    if (message.type === 'send_message') {
                        const session = {
                            type: message.session.split(':')[0],
                            name: message.session.split(':')[1]
                        }
                        var msg = message.message || '';
                        if (!msg) {
                            return;
                        }
                        if (typeof msg === 'string') {
                            msg = {
                                type: 'text',
                                data: msg,
                            }
                        }
                        if (msg.type == 'text') {
                            if (message.message.trim() === '') {
                                return;
                            }
                            if (message.message.length > 1024) {
                                message.message = message.message.substring(0, 1024);
                            }
                        } else if (msg.type == 'image') {
                            const fileSize = this.estimateFileSizeFromBase64(msg.data);
                            console.log(`${auth.username} try sending image ${fileSize} bytes`);
                            if (fileSize > 64 * 1024) {
                                return;
                            }
                        }
                        if (session.type === 'chat') {
                            const timestamp = new Date().getTime();
                            this.saveChatHistory(
                                db.chatHistory,
                                `chat:${session.name.toLowerCase().trim()}`,
                                auth.uid, timestamp,
                                message.message,
                                G.cleanIp(req.socket.remoteAddress),
                                () => {
                                    this.sendMsgToChat(db, session.name, auth.uid, message.message, timestamp);
                                });
                        }
                    } else if (message.type === 'join_session') {
                        message.session = message.session.replace(/\n/g, ' ');
                        if (message.session.split(':').length !== 2) {
                            return;
                        }
                        if (message.session.split(':')[1].length > 32) {
                            return;
                        }
                        userUtil.joinSession(db, auth.uid, message.session);
                    } else if (message.type === 'get_chat_history') {
                        const session = message.session?.toLowerCase?.() || '';
                        if (!session || !session.startsWith('chat:') || session.split(':').length !== 2) {
                            return;
                        }
                        userUtil.getUserByAuth(db.userData, ws.auth, (userData) => {
                            if (!userData) return;
                            const sessionName = session.split(':')[1];
                            const allowed = userData.joinedSessions.includes(session) || sessionName === 'public';
                            if (!allowed) return;
                            this.getChatHistory(db.chatHistory, session, (history) => {
                                try {
                                    ws.send(JSON.stringify({
                                        type: 'chat_history',
                                        session,
                                        history: history || []
                                    }));
                                } catch (e) { }
                            });
                        });
                    } else if (message.type === 'update_display_name') {
                        if (!message.display_name || message.display_name.trim() === '') {
                            return;
                        }
                        if (message.display_name.length > G.MAX_NICK_NAME_LENGTH) {
                            return;
                        }
                        userUtil.updateDisplayName(db, auth.uid, message.display_name, (success) => { });
                    }
                });
            });
        });
    },
    sendMsgToChat(db, sessionName, fromUid, msgObj, timestamp = new Date().getTime()) {
        sessionName = sessionName.toLowerCase().trim();
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                userUtil.getUserByAuth(db.userData, client.auth, (userData) => {
                    if (userData && (userData.joinedSessions.includes(`chat:${sessionName}`) || sessionName === 'public')) {
                        client.send(JSON.stringify({
                            type: 'new_message',
                            session: `chat:${sessionName}`,
                            from: fromUid,
                            timestamp: timestamp,
                            message: msgObj
                        }));
                    }
                });
            }
        });
    },
    saveChatHistory(db, session, uid, time, msg, ip, callback = () => { }) {
        db.findOne({ session }, (err, doc) => {
            if (doc) {
                db.update({ session }, { $push: { history: { uid, time, msg } } }, {}, (err2) => {
                    db.findOne({ session }, (err3, updatedDoc) => {
                        if (updatedDoc && updatedDoc.history && (updatedDoc.history.length > G.MAX_MESSAGE_COUNT_PER_SESSION && G.MAX_MESSAGE_COUNT_PER_SESSION > 0)) {
                            const truncatedHistory = updatedDoc.history.slice(-G.MAX_MESSAGE_COUNT_PER_SESSION);
                            db.update({ session }, { $set: { history: truncatedHistory } }, {}, (err4) => {
                                callback();
                            });
                        } else {
                            callback();
                        }
                    });
                });
            } else {
                db.insert({ session, history: [{ uid, time, msg, ip }] }, (err2) => {
                    callback();
                });
            }
        });
    },
    getChatHistory(db, session, callback = () => { }) {
        db.findOne({ session }, (err, doc) => {
            if (doc && Array.isArray(doc.history)) {
                callback(doc.history);
            } else {
                callback([]);
            }
        });
    }
}