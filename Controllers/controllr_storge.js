const Storge = require("../models/stroge"); // إذا الاسم stroge.js

const post_new_item = async(req,res) => {
  try {
    const newItem =await Storge.create(req.body)
    res.status(201).json(newItem)
  } catch (error) {
    console.error("❌ خطأ أثناء الإضافة:", error);
    res.status(500).json({message:"فشل اضافة مواد"})
  }
}

const get_item_all =async(req,res) => {
  try {
    const item = await Storge.find()
    res.status(200).json(item)
  } catch (error) {
        res.status(500).json({message:"فشل الجذب"})
  }
}


// البحث التلقائي (Autocomplete)
const search_item = async(req,res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i"); // بحث غير حساس لحالة الحروف
    const results = await Storge.find({
      $or: [
        { itemName: regex },
        { itemType: regex },
        { itemNumber: regex }
      ]
    }).limit(10); // الحد الأقصى للنتائج

    res.json(results); // ⬅️ ترجع مصفوفة مباشرة
  } catch (error) {
    console.error("❌ خطأ أثناء البحث:", error);
    res.status(500).json({ message: "فشل البحث عن المواد" });
  }
}


// ===== دالة بحث عامة للمخزن =====
const searchItemPublic = async (req, res) => {
  try {
    const { q } = req.query; // الباراميتر المرسل من الواجهة
    if (!q || q.trim() === "") return res.json([]);

    const regex = new RegExp(q.trim(), "i"); // بحث غير حساس لحالة الحروف
    const results = await Storge.find({
      $or: [
        { itemName: regex },
        { itemType: regex },
        { itemNumber: regex },
      ],
    }).limit(20); // يمكن تعديل الحد حسب الحاجة

    res.json(results); // ترجع مصفوفة مباشرة
  } catch (error) {
    console.error("❌ خطأ أثناء البحث العام:", error);
    res.status(500).json({ message: "فشل البحث عن المواد" });
  }
};

module.exports = { 
  post_new_item,
  get_item_all,
  search_item,
  searchItemPublic
};