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
// 🔴 تعطيل التشفير مؤقتًا للاختبار فقط
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

const User = mongoose.model("User", userSchema);

module.exports = User;
