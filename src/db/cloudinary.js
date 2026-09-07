const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uber_app_uploads', // Cloudinary par is naam ka folder banega
        allowed_formats: ['jpg', 'png', 'jpeg'], // Sirf yehi formats chalenge
    },
});
const upload = multer({ storage: storage });
module.exports = upload;