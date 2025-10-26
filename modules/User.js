module.exports = class User {
    constructor(auth, nickname, joinedSessions = []) {
        this.auth = auth;
        this.nickname = nickname;
        this.joinedSessions = joinedSessions;
    }
}