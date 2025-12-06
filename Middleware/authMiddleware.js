const jwt = require("jsonwebtoken");

// 🔐 Middleware للتحقق من التوثيق
const authMiddleware = (req, res, next) => {
  try {
    // الحصول على Token من الـ Headers
    const token = req.headers.authorization?.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح - يرجى تسجيل الدخول" 
      });
    }

    // التحقق من Token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || "your-secret-key-change-this"
    );

    // إضافة بيانات المستخدم إلى الـ request
    req.user = decoded;
    next();

  } catch (err) {
    console.error("❌ خطأ في التحقق:", err);
    return res.status(401).json({ 
      success: false, 
      message: "Token غير صالح أو منتهي الصلاحية" 
    });
  }
};

// 🔐 Middleware للتحقق من الصلاحية (Admin فقط)
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: "غير مصرح - صلاحيات المسؤول فقط" 
    });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };