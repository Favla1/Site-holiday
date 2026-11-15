import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Define upload folder by fieldname
        let uploadDir = 'avatars';
        if (file.fieldname === 'banner') {
            uploadDir = 'banners';
        } else if (file.fieldname === 'avatar') {
            uploadDir = 'avatars';
        }

        const uploadPath = path.join(__dirname, `../../uploads/${uploadDir}`);
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname || '')}`);
    }
});

const IMAGE_RULES = {
    avatar: {
        mimes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        exts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
        errorMessage: 'Avatar aceita apenas PNG, JPG, WEBP ou GIF.'
    },
    banner: {
        mimes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        exts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
        errorMessage: 'Banner aceita apenas PNG, JPG, WEBP ou GIF.'
    }
};

function getImageRule(fieldname) {
    if (fieldname === 'avatar') return IMAGE_RULES.avatar;
    return IMAGE_RULES.banner;
}

const fileFilter = (req, file, cb) => {
    const rule = getImageRule(file.fieldname);
    const extname = String(path.extname(file.originalname || '')).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();
    const isAllowed = rule.exts.has(extname) && rule.mimes.has(mimetype);

    if (isAllowed) {
        return cb(null, true);
    }

    cb(new Error(rule.errorMessage));
};

export const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

export default upload;
