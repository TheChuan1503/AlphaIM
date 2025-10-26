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
                        if (message.message.length > 1024) {
                            message.message = message.message.substring(0, 1024);
                        }
                        if (session.type === 'chat') {
                            this.sendMsgToChat(db, session.name, auth.uid, message.message);
                        }
                    }
                });
            });
        });
    },
    sendMsgToChat(db, sessionName, fromUid, msgObj) {
        sessionName = sessionName.toLowerCase().trim();
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                userUtil.getUserByAuth(db.userData, client.auth, (userData) => {
                    if (userData && (userData.joinedSessions.includes(`chat:${sessionName}`) || sessionName === 'public')) {
                        client.send(JSON.stringify({
                            type: 'new_message',
                            session: `chat:${sessionName}`,
                            from: fromUid,
                            timestamp: new Date().getTime(),
                            message: msgObj
                        }));
                    }
                });
            }
        });
    }
}