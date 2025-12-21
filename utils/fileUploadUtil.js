const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = {
    uploadImage(base64, callback) {
        try {
            const imgBuffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const sha256 = crypto.createHash('sha256').update(imgBuffer).digest('hex');
            const fileName = `${sha256}_${imgBuffer.length}.jpg`;
            const dir = path.join(__dirname, '../db/uploads/images');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const filePath = path.join(dir, fileName);
            if (fs.existsSync(filePath)) {
                callback(true, fileName);
                return;
            }
            fs.writeFile(filePath, imgBuffer, (err) => {
                if (err) {
                    console.error('Error writing image file:', err);
                    callback(false, null);
                    return;
                }
                callback(true, fileName);
            });
        } catch (error) {
            console.error('Error uploading image:', error);
            callback(false, null);
        }
    }
}