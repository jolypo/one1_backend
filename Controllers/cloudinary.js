import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const getSignedPDFUrl = (publicId) => {
  return cloudinary.url(publicId, {
    resource_type: "raw",        // PDF أو ملفات أخرى
    type: "authenticated",       // الرابط محمي
    expires_at: Math.floor(Date.now() / 1000) + 60 * 5 // صالح 5 دقائق
  });
};

