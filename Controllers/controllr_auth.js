const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 🔐 تسجيل الدخول
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // التحقق من البيانات
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "يرجى إدخال البريد الإلكتروني وكلمة المرور" 
      });
    }

    // البحث عن المستخدم
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" 
      });
    }

    // التحقق من كلمة المرور
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" 
      });
    }

    // إنشاء Token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET || "your-secret-key-change-this",
      { expiresIn: "7d" } // صالح لمدة 7 أيام
    );

    // ✅ تسجيل دخول ناجح
    res.status(200).json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("❌ خطأ في تسجيل الدخول:", err);
    res.status(500).json({ 
      success: false, 
      message: "حدث خطأ في الخادم" 
    });
  }
};


    

module.exports = { login };