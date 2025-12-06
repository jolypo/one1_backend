const User = require("../models/User") 
const bcrypt = require("bcrypt");
//get

const get_new_user= async(req,res) => {
  try {
    const users=await User.find()
    res.status(200).json(users);
  } catch (error) {
     res.status(500).json({ message: "حدث خطأ أثناء جلب المستخدمين", error: error.message });
  }
}

const put_user_pass = async(req,res) => {
  try {
    const {id}=req.params;
    const {password}=req.body;
    if (!password) {
      return res.status(400).json({ message: "كلمة المرور مطلوبة" });
    }
        const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await User.findByIdAndUpdate(
      id,
{ password: hashedPassword },
      { new: true })
        if (!updatedUser) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }
     res.json(updatedUser);
  } catch (error) {
     console.error("❌ خطأ أثناء تحديث كلمة المرور:", error);
    res.status(500).json({ message: "خطأ في السيرفر" });
  
  }
}


//post

const post_new_user= async(req,res) => {
   try {
  const newUser = await User.create(req.body);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ أثناء إنشاء المستخدم" });
  }
}

module.exports = { post_new_user,
  get_new_user,
put_user_pass,
 };