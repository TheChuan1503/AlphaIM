const WebSocket = require('ws');
const authUtil = require('./authUtil');
const userUtil = require('./userUtil');

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
                console.log(`User ${auth.username} connected via WebSocket`);
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
                        if (!message.message || message.message.trim() === '') {
                            return;
                        }
                        if (message.message.length > 1024) {
                            message.message = message.message.substring(0, 1024);
                        }
                        if (session.type === 'chat') {
                            const timestamp = new Date().getTime();
                            this.saveChatHistory(db.chatHistory, `chat:${session.name.toLowerCase().trim()}`, auth.uid, timestamp, message.message, () => {
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
                        // 权限校验：必须加入该会话或为public
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
                                } catch (e) {}
                            });
                        });
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
    saveChatHistory(db, session, uid, time, msg, callback = () => {}) {
        db.findOne({ session }, (err, doc) => {
            if (doc) {
                db.update({ session }, { $push: { history: { uid, time, msg } } }, {}, (err2) => {
                    callback();
                });
            } else {
                db.insert({ session, history: [{ uid, time, msg }] }, (err2) => {
                    callback();
                });
            }
        });
    },
    getChatHistory(db, session, callback = () => {}) {
        db.findOne({ session }, (err, doc) => {
            if (doc && Array.isArray(doc.history)) {
                callback(doc.history);
            } else {
                callback([]);
            }
        });
    }
}