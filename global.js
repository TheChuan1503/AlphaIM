const G = {
    MAX_MESSAGE_COUNT_PER_SESSION: 72,
    MAX_NICK_NAME_LENGTH: 32,

    cleanIp(ip) {
        if (ip.startsWith('::ffff:')) {
            return ip.substring(7);
        }
        if (ip === '::1') {
            return '127.0.0.1';
        }
        return ip;
    }
}
module.exports = G