// models/Receipt.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const receiptSchema = new Schema({
  type: { 
    type: String, 
    enum: ['استلام', 'تسليم'], 
    required: true 
  },
  receiver: { // بيانات المستلم يدوياً
    name: { type: String, required: true },
    rank: { type: String, required: true },
    number: { type: String, required: true },
    signature: { type: String }, // توقيع المستلم من Canvas
  },
  giver: {}, // المسلم بدون بيانات
  managerSignature: { type: String, required: true }, // توقيع المدير من ملف ثابت
  items: [ // المواد المستلمة/المسلمة
    {
      item: { 
        type: Schema.Types.ObjectId, 
        ref: 'Storge', 
        required: false  // ✅ ✅ ✅ غيّر من true إلى false
      },
      itemName: { type: String, required: true },
      itemNumber: { type: String, required: true },
      itemType: { type: String, required: true },
      quantity: { type: Number, required: true },
    }
    
  ],
  verified: { type: Boolean, default: false }, // مربع تحقق
  date: { type: Date, default: Date.now },
}, { timestamps: true });

const Receipt = mongoose.model("Receipt", receiptSchema);
module.exports = Receipt;