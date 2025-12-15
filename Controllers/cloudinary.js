import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// دالة لإرجاع رابط PDF محمي (Signed URL)
export const getSignedPDFUrl = (publicId) => {
  return cloudinary.url(publicId, {
    resource_type: "raw",        // لأن الملفات PDF تُرفع كـ raw
    type: "authenticated",       // الرابط محمي
    expires_at: Math.floor(Date.now() / 1000) + 60 * 5 // صالح 5 دقائق
  });
};

// دالة رفع PDF إلى Cloudinary (اختياري)
export const uploadPDF = async (filePath, folder = "receipts") => {
  return cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    folder
  });
};
