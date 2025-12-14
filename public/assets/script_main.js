
var curSession = null;
const messageHistory = {};
const userCache = {};
const sessionInputCache = {}; // 为每个session缓存输入框内容
const loadingHistory = {}; // 跟踪哪些会话正在加载历史记录
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
            // 如果历史记录不存在，先清空聊天区域并请求历史记录
            $(".chat-area-content").empty();
            // 只有在没有正在加载的情况下才请求历史记录
            if (!loadingHistory[sessionKey]) {
                loadingHistory[sessionKey] = true;
                // 显示加载指示器
                $(".chat-area-content").html('<div class="loading-history">加载历史消息...</div>');
                // 请求该会话的历史记录
                sender._send({
                    type: 'get_chat_history',
                    session: sessionKey.toLowerCase()
                });

                // 设置超时机制，5秒后如果还没收到历史记录，清除加载状态
                setTimeout(() => {
                    if (loadingHistory[sessionKey]) {
                        delete loadingHistory[sessionKey];
                        $(".chat-area-content").empty();
                        console.warn(`加载历史记录超时: ${sessionKey}`);
                    }
                }, 5000);
            }
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

            if (typeof message === 'string') {
                messageCard.find(".message-content").text(message);
            } else if (message.type === 'text') {
                messageCard.find(".message-content").text(message.data);
            } else if (message.type === 'image') {
                messageCard.find(".message-content").html(`<img src="${message.data}" alt="Image" style="max-width: 200px;">`);
            }
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
                const sessionKey = message.session;

                if (curSession && `${curSession.type}:${curSession.name}` === sessionKey) {
                    chatArea.addMessage(message.from, message.message, message.timestamp);
                }

                const msgObj = {}
                if (typeof message.message === 'string') {
                    msgObj.message = message.message;
                    msgObj.type = 'text';
                } else if (message.message.type === 'image') {
                    msgObj.message = message.message;
                    msgObj.type = 'image';
                }

                if (msgObj.type === 'image') {
                    sessionList.add(sessionKey, '[IMAGE]', message.timestamp);
                } else if (msgObj.type === 'text') {
                    sessionList.add(sessionKey, message.message, message.timestamp);
                }

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
                const sessionKey = message.session;
                if (!sessionKey || !sessionKey.startsWith('chat:')) return;

                delete loadingHistory[sessionKey];

                const history = message.history || [];

                if (history.length > 0) {
                    const lastMessage = history[history.length - 1];
                    userInfo.get(lastMessage.uid, (user) => {
                        var lastMessageText = lastMessage.msg;
                        const lastTimestamp = lastMessage.time;

                        if (typeof lastMessageText === 'string') {
                            lastMessageText = lastMessageText;
                        } else if (lastMessageText.type == 'text'){
                            lastMessageText = lastMessageText.data;
                        } else if (lastMessageText.type === 'image') {
                            lastMessageText = '[IMAGE]';
                        }

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

                                if (typeof entry.msg === 'string') {
                                    messageCard.find(".message-content").text(entry.msg);
                                } else if (entry.msg.type === 'text') {
                                    messageCard.find(".message-content").text(entry.msg.data);
                                } else if (entry.msg.type === 'image') {
                                    messageCard.find(".message-content").html(`<img src="${entry.msg.data}" alt="Image" style="max-width: 200px;">`);
                                }
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

                            if (typeof entry.msg === 'string') {
                                messageCard.find(".message-content").text(entry.msg);
                            } else if (entry.msg.type === 'text') {
                                messageCard.find(".message-content").text(entry.msg.data);
                            } else if (entry.msg.type === 'image') {
                                messageCard.find(".message-content").html(`<img src="${entry.msg.data}" alt="Image" style="max-width: 200px;">`);
                            }
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

function sendImage(base64) {
    if (!base64) {
        return;
    }
    sender.send(curSession, {
        type: 'image',
        data: 'data:image/jpeg;base64,' + base64,
    });
} 

/**
 * 图片压缩
 * @param {string} base64 - 图片base64字符串（不带data:image/...;base64,前缀）
 * @param {number} maxWidth - 最大宽度（像素）
 * @param {number} maxHeight - 最大高度（像素）
 * @param {number} maxSizeKB - 最大文件大小（KB）
 * @param {number} quality - 图片质量 0-1，默认0.8
 * @param {string} mimeType - 输出图片格式，默认'image/jpeg'
 * @returns {Promise<string>} 处理后的base64字符串（不带data头）
 */
function compressImageBase64(base64, maxWidth, maxHeight, maxSizeKB, quality = 0.8, mimeType = 'image/jpeg') {
    return new Promise((resolve, reject) => {
        // 添加data头用于Image对象加载
        const dataUrl = `data:${mimeType};base64,${base64}`;

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = function () {
            // 计算压缩后的尺寸
            let width = img.width;
            let height = img.height;

            // 如果图片尺寸超过最大限制，等比例缩放
            if (width > maxWidth || height > maxHeight) {
                const scale = Math.min(maxWidth / width, maxHeight / height);
                width = Math.floor(width * scale);
                height = Math.floor(height * scale);
            }

            // 创建Canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');

            // 设置绘制质量
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 绘制图片
            ctx.drawImage(img, 0, 0, width, height);

            // 压缩函数
            const compress = (currentQuality) => {
                return new Promise((resolveCanvas) => {
                    // 转换为base64
                    const compressedBase64 = canvas.toDataURL(mimeType, currentQuality);

                    // 移除data头
                    const pureBase64 = compressedBase64.split(',')[1];

                    // 计算文件大小
                    const fileSizeKB = (pureBase64.length * 0.75) / 1024;

                    resolveCanvas({
                        base64: pureBase64,
                        sizeKB: fileSizeKB,
                        quality: currentQuality,
                        width,
                        height
                    });
                });
            };

            // 递归压缩直到满足大小要求
            const recursiveCompress = async (currentQuality) => {
                const result = await compress(currentQuality);

                // 如果已经达到最小质量或满足大小要求
                if (result.sizeKB <= maxSizeKB || currentQuality <= 0.1) {
                    return result;
                }

                // 如果文件过大，降低质量继续压缩
                if (result.sizeKB > maxSizeKB) {
                    const newQuality = Math.max(0.1, currentQuality - 0.1);
                    return recursiveCompress(newQuality);
                }

                return result;
            };

            // 开始压缩
            recursiveCompress(quality)
                .then((result) => {
                    console.log(`压缩完成: ${result.width}x${result.height}, 质量: ${result.quality}, 大小: ${result.sizeKB.toFixed(2)}KB`);
                    resolve(result.base64);
                })
                .catch(reject);
        };

        img.onerror = function (error) {
            reject(new Error('图片加载失败: ' + error.message));
        };

        img.src = dataUrl;
    });
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

    $('.btn-insert-image').click(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.click();
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onloadend = () => {
                    const base64String = reader.result.split(',')[1];
                    compressImageBase64(base64String, 1024, 1024, 64, 0.9).then(compressedBase64 => {
                        if (this.confirm("Are you sure you want to send this image?")) {
                            sendImage(compressedBase64);
                        }
                    });
                    // sendCurrentMessage(`![${file.name}](${base64String})`);
                }
            }
        }
    });

    wsUtil.init();
    sessionList.add("chat:public", "");
}
