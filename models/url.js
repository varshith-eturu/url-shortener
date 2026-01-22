const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
    originalUrl: {
        type: String,
        required: true
    },
    shortUrl: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires : 60 * 60 * 24 // 1 day
    }
});

const Url = mongoose.model('Url', urlSchema);
module.exports = Url;