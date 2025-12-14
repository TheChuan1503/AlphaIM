
var curSession = null;
const messageHistory = {};
const userCache = {};
const sessionInputCache = {}; // 为每个session缓存输入框内容
const template = {
    sessionCard: $(".template-session-card .session-card").clone(),
    messageCard: $(".template-message-card .message-card").clone(),
}
var profile = {}
const sessionList = {
    selectedSession: null,
    add: function (name, lastMessage, lastTimestamp = 0) {
        const sessionName = {
            type: name.split(":")[0],
            name: name.split(":")[1],
        }
        const existedSessionCard = $(".session-card").filter(function () {
            return $(this).find(".session-name").text() === sessionName.name;
        });

        if (existedSessionCard.length > 0) {
            existedSessionCard.attr("data-timestamp", lastTimestamp);
            existedSessionCard.attr("data-session-name", name);
            existedSessionCard.find(".session-last-message").text(lastMessage);
        } else {
            const sessionCard = template.sessionCard.clone();
            sessionCard.find(".avatar").attr("src", `./api/get_avatar?name=${sessionName.name}:${sessionName.type}`);
            sessionCard.find(".session-name").text(sessionName.name);
            sessionCard.find(".session-last-message").text(lastMessage);
            sessionCard.attr("data-timestamp", lastTimestamp);
            sessionCard.attr("data-session-name", name);
            $(".session-list").prepend(sessionCard); // 改为插入到最前面
            sessionCard.click(function () {
                sessionList.selectSession(sessionCard, () => {
                    if (isMobile) {
                        slideOutDrawer();
                    }
                });
            });
        }

        this.sortByTimestamp();
    },

    sortByTimestamp: function () {
        const container = $(".session-list");
        const cards = container.find(".session-card").get();

        cards.sort(function (a, b) {
            const timeA = parseInt($(a).attr("data-timestamp")) || 0;
            const timeB = parseInt($(b).attr("data-timestamp")) || 0;
            return timeB - timeA;
        });

        $.each(cards, function (index, card) {
            container.append(card);
        });
    },
    selectSession: function (sessionCard, callback = () => { }) {
        if (this.selectedSession && this.selectedSession.attr("data-session-name") === sessionCard.attr("data-session-name")) {
            return;
        }

        if (this.selectedSession && curSession) {
            const sessionKey = `${curSession.type}:${curSession.name}`;
            messageHistory[sessionKey] = $(".chat-area-content").html();
        }

        if (this.selectedSession) {
            this.selectedSession.removeClass("selected");
        }
        this.selectedSession = sessionCard;
        this.selectedSession.addClass("selected");
        const sessionName = this.selectedSession.attr("data-session-name");
        chatArea.setSession(sessionName);
        callback();
    }
}

const userInfo = {
    get: function (uid, callback) {
        if (userCache[uid]) {
            callback(userCache[uid]);
            return;
        }

        $.get('/api/user_public_info?uid=' + uid, (data) => {
            if (data.user) {
                userCache[uid] = data.user;
                callback(data.user);
            }
        }).fail(() => {
            callback({ username: 'Unknown', nickname: 'Unknown User' });
        });
    }
};

const chatArea = {
    setSession: function (sessionName) {
        if (!sessionName) return;

        curSession = {
            type: sessionName.split(":")[0],
            name: sessionName.split(":")[1],
        }
        $(".chat-area-header .session-name").text(curSession.name);

        const sessionKey = `${curSession.type}:${curSession.name}`;
        if (messageHistory[sessionKey]) {
            $(".chat-area-content").html(messageHistory[sessionKey]);
        } else {
            $(".chat-area-content").empty();
        }

        // 恢复该session的输入框内容
        const inputKey = `input_${sessionKey}`;
        $(".chat-input").val(sessionInputCache[inputKey] || "");

        // 切换到会话时滚动到底部
        setTimeout(() => {
            $(".chat-area-content").scrollTop($(".chat-area-content")[0].scrollHeight);
        }, 100);

        $(".mask").hide();
    },
    addMessage: function (uid, message, timestamp = 0) {
        userInfo.get(uid, (user) => {
            const messageCard = template.messageCard.clone();
            messageCard.find(".avatar").attr("src", `./api/get_avatar?name=user:${user.username}`);
            messageCard.find(".username-text").text(user.nickname || user.username);

            // 格式化时间戳
            const formattedTime = formatTime(timestamp);
            messageCard.find(".message-time").text(formattedTime);

            messageCard.find(".message-content").text(message);
            messageCard.attr("data-timestamp", timestamp);

            // 获取所有现有消息
            const existingMessages = [];
            $(".chat-area-content .message-card").each(function () {
                existingMessages.push({
                    element: $(this).clone(),
                    timestamp: parseInt($(this).attr('data-timestamp')) || 0
                });
            });

            // 添加新消息
            existingMessages.push({
                element: messageCard,
                timestamp: timestamp
            });

            // 按时间戳排序
            existingMessages.sort((a, b) => a.timestamp - b.timestamp);

            // 清空聊天区域并重新添加排序后的消息
            $(".chat-area-content").empty();
            existingMessages.forEach(msg => {
                $(".chat-area-content").append(msg.element);
            });

            $(".chat-area-content").scrollTop($(".chat-area-content")[0].scrollHeight);
        });
    }
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

function formatTime(stamp) {
    const date = new Date(stamp);
    const formattedTime = date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0') + ':' +
        String(date.getSeconds()).padStart(2, '0');
    return formattedTime;
}

const wsUtil = {
    init: function () {
        this.ws = new WebSocket(`ws://${window.location.hostname}:3001`);
        this.ws.onopen = () => {
            console.log("Connected to WebSocket server");
            sender.isConnected = true;
            sender.processMessageQueue();
        };
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "new_message") {
                console.log(message);
                const sessionKey = message.session;

                if (curSession && `${curSession.type}:${curSession.name}` === sessionKey) {
                    chatArea.addMessage(message.from, message.message, message.timestamp);
                }

                sessionList.add(sessionKey, message.message, message.timestamp);

                if (!messageHistory[sessionKey]) {
                    messageHistory[sessionKey] = '';
                }
                new Promise((resolve) => {
                    userInfo.get(message.from, (user) => {
                        const messageCard = template.messageCard.clone();
                        messageCard.find(".avatar").attr("src", `./api/get_avatar?name=${user.username}`);
                        messageCard.find(".username-text").text(user.nickname || user.username);

                        const formattedTime = formatTime(message.timestamp);
                        messageCard.find(".message-time").text(formattedTime);

                        messageCard.find(".message-content").text(message.message);
                        messageCard.attr("data-timestamp", message.timestamp);
                        resolve({
                            html: messageCard[0].outerHTML,
                            timestamp: message.timestamp
                        });
                    });
                }).then(({ html, timestamp }) => {
                    let existingMessages = [];
                    if (messageHistory[sessionKey]) {
                        const tempDiv = $('<div>').html(messageHistory[sessionKey]);
                        tempDiv.find('.message-card').each(function () {
                            existingMessages.push({
                                html: $(this)[0].outerHTML,
                                timestamp: parseInt($(this).attr('data-timestamp')) || 0
                            });
                        });
                    }

                    existingMessages.push({ html, timestamp });
                    existingMessages.sort((a, b) => a.timestamp - b.timestamp);
                    messageHistory[sessionKey] = existingMessages.map(m => m.html).join('');

                    if (curSession && `${curSession.type}:${curSession.name}` === sessionKey) {
                        $(".chat-area-content").scrollTop($(".chat-area-content")[0].scrollHeight);
                    }
                });
            } else if (message.type === 'chat_history') {
                console.log(message);
                const sessionKey = message.session;
                if (!sessionKey || !sessionKey.startsWith('chat:')) return;

                const history = message.history || [];

                if (history.length > 0) {
                    const lastMessage = history[history.length - 1];
                    userInfo.get(lastMessage.uid, (user) => {
                        const lastMessageText = lastMessage.msg;
                        const lastTimestamp = lastMessage.time;

                        sessionList.add(sessionKey, lastMessageText, lastTimestamp);
                    });
                }

                if (curSession && `${curSession.type}:${curSession.name}` === sessionKey) {
                    $(".chat-area-content").empty();
                    const sortedHistory = [...history].sort((a, b) => a.time - b.time);

                    const messagePromises = sortedHistory.map(entry => {
                        return new Promise((resolve) => {
                            userInfo.get(entry.uid, (user) => {
                                const messageCard = template.messageCard.clone();
                                messageCard.find(".avatar").attr("src", `./api/get_avatar?name=user:${user.username}`);
                                messageCard.find(".username-text").text(user.nickname || user.username);

                                // 格式化时间戳（毫秒级别）
                                const formattedTime = formatTime(entry.time);
                                messageCard.find(".message-time").text(formattedTime);

                                messageCard.find(".message-content").text(entry.msg);
                                messageCard.attr("data-timestamp", entry.time);
                                resolve(messageCard[0].outerHTML);
                            });
                        });
                    });

                    Promise.all(messagePromises).then(messageHtmls => {
                        $(".chat-area-content").append(messageHtmls.join(''));
                        $(".chat-area-content").scrollTop($(".chat-area-content")[0].scrollHeight);
                    });
                }

                // 缓存历史记录到messageHistory，用于后续快速切换
                if (history.length === 0) {
                    messageHistory[sessionKey] = '';
                    return;
                }

                // 按时间戳升序排序，确保缓存的消息按时间顺序
                const sortedHistory = [...history].sort((a, b) => a.time - b.time);

                // 使用Promise.all确保所有消息按正确顺序缓存
                const messagePromises = sortedHistory.map(entry => {
                    return new Promise((resolve) => {
                        userInfo.get(entry.uid, (user) => {
                            const messageCard = template.messageCard.clone();
                            messageCard.find(".avatar").attr("src", `./api/get_avatar?name=user:${user.username}`);
                            messageCard.find(".username-text").text(user.nickname || user.username);

                            // 格式化时间戳（毫秒级别）
                            const formattedTime = formatTime(entry.time);
                            messageCard.find(".message-time").text(formattedTime);

                            messageCard.find(".message-content").text(entry.msg);
                            messageCard.attr("data-timestamp", entry.time);
                            resolve({
                                html: messageCard[0].outerHTML,
                                timestamp: entry.time
                            });
                        });
                    });
                });

                Promise.all(messagePromises).then(messageData => {
                    // 按时间戳排序并构建HTML
                    messageData.sort((a, b) => a.timestamp - b.timestamp);
                    messageHistory[sessionKey] = messageData.map(m => m.html).join('');
                });
            }
        };
        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            // 标记WebSocket未连接
            sender.isConnected = false;
        };
        this.ws.onclose = () => {
            console.log("Disconnected from WebSocket server");
            // 标记WebSocket未连接
            sender.isConnected = false;
        };
    }
}

const sender = {
    messageQueue: [], // 消息队列，用于缓存未发送的消息
    isConnected: false, // WebSocket连接状态

    send(session, message) {
        if (typeof session === 'string') {
            session = {
                type: session.split(':')[0],
                name: session.split(':')[1],
            }
        }
        const messageData = {
            type: 'send_message',
            session: `${session.type}:${session.name}`,
            message: message
        };

        // 如果WebSocket已连接，直接发送
        if (this.isConnected) {
            this._sendImmediate(messageData);
        } else {
            // 如果未连接，添加到队列
            console.log("WebSocket not connected, queuing message:", messageData);
            this.messageQueue.push(messageData);
        }
    },

    _send(data) {
        // 如果WebSocket已连接，直接发送
        if (this.isConnected) {
            this._sendImmediate(data);
        } else {
            // 如果未连接，添加到队列
            console.log("WebSocket not connected, queuing message:", data);
            this.messageQueue.push(data);
        }
    },

    _sendImmediate(data) {
        if (!wsUtil.ws || wsUtil.ws.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not connected, message queued.");
            this.messageQueue.push(data);
            return;
        }
        try {
            wsUtil.ws.send(JSON.stringify(data));
        } catch (error) {
            console.error("Failed to send message:", error);
            // 如果发送失败，重新加入队列
            this.messageQueue.push(data);
        }
    },

    // 处理堆积的消息队列
    processMessageQueue() {
        if (this.messageQueue.length === 0) {
            return;
        }

        console.log(`Processing ${this.messageQueue.length} queued messages...`);
        const queue = [...this.messageQueue]; // 复制队列
        this.messageQueue = []; // 清空队列

        queue.forEach(message => {
            this._sendImmediate(message);
        });
    }
}

function requestJoinSession(session) {
    sender._send({
        type: 'join_session',
        session: `${session.type}:${session.name}`.toLowerCase(),
    });
}


// 发送当前消息的函数
function sendCurrentMessage() {
    const message = $('.chat-input').val() ? $('.chat-input').val() : $('.chat-input').text();
    if (message.trim() === '' || !curSession) {
        return;
    }
    sender.send(curSession, message);
    $('.chat-input').val('');

    // 清空当前session的缓存
    if (curSession) {
        const sessionKey = `${curSession.type}:${curSession.name}`;
        const inputKey = `input_${sessionKey}`;
        sessionInputCache[inputKey] = '';
    }
}

window.onload = function () {
    $.getJSON('/api/user', (data) => {
        if (data.success) {
            profile = data.user;

            $(".my-avatar").attr("src", `/api/get_avatar?name=user:${data.user.username}`);
            const joinedSessions = data.user.joined_sessions || [];
            if (!joinedSessions.includes('chat:public')) {
                joinedSessions.push('chat:public');
            }
            joinedSessions.forEach(session => {
                if (session.startsWith('chat:')) {
                    sessionList.add(session, "");
                    // 获取每个会话的历史记录
                    sender._send({
                        type: 'get_chat_history',
                        session: session.toLowerCase()
                    });
                }
            });
        }
    }).fail(() => {
    });

    $('.btn-logout').click(() => {
        $.post('/api/logout', {}, (data) => {
            if (data.success) {
                window.location.href = '/login';
            }
        }).fail(() => {
        });
    })

    $('.btn-about').click(() => {
        this.alert("Powered by AlphaIM\n" +
            "https://github.com/TheChuan1503/AlphaIM");
    })

    $('.btn-send').click(() => {
        sendCurrentMessage();
    });

    $('.chat-input').on('input', function () {
        if (curSession) {
            const sessionKey = `${curSession.type}:${curSession.name}`;
            const inputKey = `input_${sessionKey}`;
            sessionInputCache[inputKey] = $(this).val();
        }
    });

    $('.btn-join-chat').click(() => {
        let sessionName = prompt("Enter the chat session name:").trim().toLowerCase();
        if (sessionName.includes(':')) {
            alert("Session name cannot contain colon (:)");
            return;
        }
        if (sessionName.length > 32) {
            alert("Session name cannot be longer than 32 characters");
            return;
        }
        if (sessionName) {
            const fullSessionName = `chat:${sessionName}`;

            const existingSession = $(`.session-card[data-session-name="${fullSessionName}"]`);
            if (existingSession.length > 0) {
                sessionList.selectSession(existingSession);
                return;
            }
            sessionList.add(fullSessionName, "", Date.now());
            requestJoinSession({
                type: 'chat',
                name: sessionName,
            });
            sender._send({
                type: 'get_chat_history',
                session: fullSessionName.toLowerCase()
            });
            setTimeout(() => {
                const newSession = $(`.session-card[data-session-name="${fullSessionName}"]`);
                if (newSession.length > 0) {
                    sessionList.selectSession(newSession);
                }
            }, 500);
        }
    });

    $('.btn-edit-display-name').click(() => {
        let newName = prompt("Enter your new display name:", profile.nickname).trim();
        if (newName.length > 32) {
            alert("Display name cannot be longer than 32 characters");
            return;
        }
        if (newName) {
            sender._send({
                type: 'update_display_name',
                display_name: newName,
            });
            // profile.display_name = newName;
            this.location.reload();
        }
    })

    wsUtil.init();
    sessionList.add("chat:public", "");
}
