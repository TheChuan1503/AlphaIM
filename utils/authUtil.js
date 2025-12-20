const Datastore = require('nedb');
const Auth = require('../modules/Auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const G = require('../global');
if (!userUtil) var userUtil = require('./userUtil');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'alpha_im_jwt_secret';
const COOKIE_NAME = process.env.COOKIE_NAME || 'alphaim_token';
const TOKEN_EXPIRES = 60 * 60 * 24 * 15; // 15天

const authUtil = {
    JWT_SECRET,
    COOKIE_NAME,
    TOKEN_EXPIRES,
    /**
     * @param {Datastore} db 数据库实例
     * @param {number|string} uid UID或username
     * @param {function} callback 回调函数
     */
    isUserExists: (db, uid, callback = () => { }) => {
        if (typeof uid === 'number') {
            db.findOne({ uid }, (err, user) => {
                if (user) {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } else if (typeof uid === 'string') {
            authUtil.getUserByUsername(db, uid, (user) => {
                if (user) {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } else {
            callback(false);
        }
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {number|string} uid UID或username
     * @param {function} callback 回调函数
     */
    getUserByUid(db, uid, callback = () => { }) {
        db.findOne({ uid }, (err, userDoc) => {
            if (userDoc) {
                callback(new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time));
            } else {
                callback(null);
            }
        });
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {function} callback 回调函数
     */
    getAllUsers: (db, callback = () => { }) => {
        const users = [];
        db.find({}).exec((err, userDocs) => {
            userDocs.forEach(userDoc => {
                users.push(new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time));
            });
            callback(users);
        });
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {string} username 用户名
     * @param {function} callback 回调函数
     */
    getUserByUsername: (db, username, callback = () => { }) => {
        db.findOne({ username }, (err, userDoc) => {
            if (userDoc) {
                callback(new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time));
            } else {
                callback(null);
            }
        });
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {string} username 用户名
     * @param {string} password 密码
     * @param {function} callback 回调函数
     */
    registerUser: (db, dataDb, username, password, req, callback = () => { }) => {
        username = username.trim();
        if (username.length < 4 || username.length > 16) {
            callback(false, null, 'Username must be between 4 and 16 characters');
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            callback(false, null, 'Username can only contain letters, numbers, and underscores');
            return;
        }
        const realUsername = username.toLowerCase();
        authUtil.isUserExists(db, realUsername, (exists) => {
            if (exists) {
                callback(false, null, 'User already exists');
            } else {
                authUtil.getLatestUser(db, (latestUser) => {
                    const uid = latestUser ? latestUser.uid + 1 : 10001;
                    db.insert({
                        uid, username: realUsername,
                        password: bcrypt.hashSync(password, 10),
                        join_time: new Date().getTime(),
                        join_ip: G.cleanIp(req.socket.remoteAddress),
                        unique_id: crypto.randomUUID()
                    }, (err, newUserDoc) => {
                        if (err) {
                            callback(false, null, 'Database error');
                        } else {
                            const auth = new Auth(newUserDoc.uid, newUserDoc.username, newUserDoc.password, newUserDoc.join_time);
                            userUtil.registerUser(dataDb, auth, username, (user) => {
                                if (user) {
                                    callback(true, auth, null);
                                } else {
                                    callback(false, null, 'Database error');
                                }
                            });
                        }
                    });
                });
            }
        });
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {function} callback 回调函数
     */
    getLatestUser: (db, callback = () => { }) => {
        db.find({}).sort({ uid: -1 }).limit(1).exec((err, userDocs) => {
            if (userDocs.length > 0) {
                callback(new Auth(userDocs[0].uid, userDocs[0].username, userDocs[0].password, userDocs[0].join_time));
            } else {
                callback(null);
            }
        });
    },
    /**
     * @param {Datastore} db 数据库实例
     * @param {string} username 用户名
     * @param {string} password 密码
     * @param {function} callback 回调函数
     */
    loginUser: (db, username, password, callback = () => { }) => {
        authUtil.getUserByUsername(db, username.toLowerCase().trim(), (user) => {
            if (user) {
                if (bcrypt.compareSync(password, user.password)) {
                    // 生成JWT token
                    const token = user.generateToken(authUtil.JWT_SECRET, authUtil.TOKEN_EXPIRES);
                    callback(true, user, null, token);
                } else {
                    callback(false, null, 'Incorrect password or username', null);
                }
            } else {
                callback(false, null, 'Incorrect password or username', null);
            }
        });
    },

    /**
     * 验证JWT token
     * @param {string} token JWT token
     * @returns {object|null} 解码后的payload或null（验证失败）
     */
    verifyToken: (token) => {
        return Auth.verifyToken(token, authUtil.JWT_SECRET);
    },

    /**
     * 从token获取用户信息
     * @param {Datastore} db 数据库实例
     * @param {string} token JWT token
     * @param {function} callback 回调函数
     */
    getAuthFromToken: (db, token, callback = () => { }) => {
        const decoded = authUtil.verifyToken(token);
        if (decoded && decoded.uid) {
            db.findOne({ uid: decoded.uid }, (err, userDoc) => {
                if (userDoc) {
                    callback(true, new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time), null);
                } else {
                    callback(false, null, 'User not found');
                }
            });
        } else {
            callback(false, null, 'Invalid token');
        }
    }
}

module.exports = authUtil;