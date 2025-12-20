// 确保CryptoJS可用
if (typeof CryptoJS === 'undefined') {
    throw new Error('CryptoJS library is required but not loaded. Please include crypto.js before this script.');
}

class aesUtil {
    static genKey() {
        const keyBytes = new Uint8Array(32);
        crypto.getRandomValues(keyBytes);
        return aesUtil.keyBytesToHex(keyBytes);
    }
    static encrypt(text, key) {
        const iv = CryptoJS.lib.WordArray.random(16);
        const cipher = CryptoJS.AES.encrypt(text, CryptoJS.enc.Hex.parse(key), {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return cipher.toString() + '.' + iv.toString();
    }
    static decrypt(ciphertextWithIv, key) {
        const [ciphertext, iv] = ciphertextWithIv.split('.');
        const decipher = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Hex.parse(key), {
            iv: CryptoJS.enc.Hex.parse(iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return decipher.toString(CryptoJS.enc.Utf8);
    }

    static keyBytesToHex(keyBytes) {
        let hexString = '';
        for (let i = 0; i < keyBytes.length; i++) {
            const hex = keyBytes[i].toString(16).padStart(2, '0');
            hexString += hex;
        }
        return hexString;
    }
}

if (typeof window !== 'undefined') {
    window.aesUtil = aesUtil;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = aesUtil;
}