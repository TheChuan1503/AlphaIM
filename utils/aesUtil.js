const crypto = require('crypto');

class aesUtil {
    static genKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    static encrypt(text, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return encrypted + '.' + iv.toString('hex');
    }
    static decrypt(ciphertextWithIv, key) {
        const [ciphertextBase64, ivHex] = ciphertextWithIv.split('.');
        const decipher = crypto.createDecipheriv('aes-256-cbc',
            Buffer.from(key, 'hex'),
            Buffer.from(ivHex, 'hex')
        );
        let decrypted = decipher.update(ciphertextBase64, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

module.exports = aesUtil;