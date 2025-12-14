const Auth = require('../modules/Auth');
const User = require('../modules/User');
if (!authUtil) var authUtil = require('./authUtil');

module.exports = {
    getUserByAuth(db, auth, callback = () => { }) {
        db.findOne({ uid: auth.uid }, (err, userDoc) => {
            if (userDoc) {
                callback(new User(
                    auth,
                    userDoc.nickname,
                    userDoc.joinedSessions || []
                ));
            } else {
                callback(null);
            }
        });
    },
    getUserByUid(dbUsers, dbUserData, uid, callback = () => { }) {
        const _ = (db, uid, callback = () => { }) => {
            db.findOne({ uid }, (err, userDoc) => {
                if (userDoc) {
                    callback(new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time));
                } else {
                    callback(null);
                }
            });
        }
        dbUserData.findOne({ uid }, (err, userDoc) => {
            if (userDoc) {
                _(dbUsers, uid, (auth) => {
                    // console.log(userDoc, auth);
                    if (auth) {
                        callback(new User(
                            auth,
                            userDoc.nickname,
                            userDoc.joinedSessions || []
                        ));
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        });
    },
    getUserByUsername(dbUsers, dbUserData, username, callback = () => { }) {
        const _ = (db, username, callback = () => { }) => {
            db.findOne({ username }, (err, userDoc) => {
                if (userDoc) {
                    callback(new Auth(userDoc.uid, userDoc.username, userDoc.password, userDoc.join_time));
                } else {
                    callback(null);
                }
            });
        }
        _(dbUsers, username, (auth) => {
            if (auth) {
                dbUserData.findOne({ uid: auth.uid }, (err, userDoc) => {
                    if (userDoc) {
                        callback(new User(
                            auth,
                            userDoc.nickname,
                            userDoc.joinedSessions || []
                        ));
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        });
    },
    registerUser(db, auth, nickname, callback = () => { }) {
        db.insert({
            uid: auth.uid,
            nickname: nickname,
            joinedSessions: []
        }, (err, newDoc) => {
            if (err) {
                callback(null);
            } else {
                callback(new User(
                    auth,
                    nickname,
                    []
                ));
            }
        });
    },
    joinSession(db, uid, session) {
        db.userData.update({ uid }, {
            $addToSet: { joinedSessions: session.toLowerCase() }
        });
    },
    updateDisplayName(db, uid, displayName, callback = () => { }) {
        db.userData.update({ uid }, {
            $set: { nickname: displayName }
        }, (err, newDoc) => {
            if (err) {
                callback(false);
            } else {
                callback(true);
            }
        });
    },
}