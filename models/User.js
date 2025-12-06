const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");

const userSchema = new Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
});

// 🔐 قبل ما نحفظ أي مستخدم، يتم تشفير كلمة المرور
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // لو كلمة المرور ما تغيرت ما نعيد التشفير
  try {
    const salt = await bcrypt.genSalt(10); // رقم 10 قوة التشفير
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
