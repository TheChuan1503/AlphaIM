const jwt = require('jsonwebtoken');

class Auth {
    /**
     * @param {number} uid UID
     * @param {string} username 用户名
     * @param {string} password 密码Hash
     * @param {number} joinTime 加入时间戳
     */
    constructor(uid, username, password, joinTime = 0) {
        this.uid = uid;
        this.username = username;
        this.password = password;
        this.joinTime = joinTime;
    }

    /**
     * 生成JWT token
     * @param {string} secretKey JWT密钥
     * @param {number} expiresIn 过期时间（秒）
     * @returns {string} JWT token
     */
    generateToken(secretKey, expiresIn = 60 * 60 * 24 * 15) { // 默认15天
        return jwt.sign(
            { 
                uid: this.uid, 
                username: this.username 
            },
            secretKey,
            { expiresIn }
        );
    }

    /**
     * 验证JWT token
     * @param {string} token JWT token
     * @param {string} secretKey JWT密钥
     * @returns {object|null} 解码后的payload或null（验证失败）
     */
    static verifyToken(token, secretKey) {
        try {
            return jwt.verify(token, secretKey);
        } catch (error) {
            return null;
        }
    }
}

module.exports = Auth;