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
  giver: {}, // بيانات المسلم (يمكن تركها فارغة)
  managerSignature: { 
    type: String, 
    required: false, 
    default: "https://res.cloudinary.com/de0pulmmw/image/upload/v1765173955/s_rylte8.png" 
  }, // الرابط الثابت
  items: [ // المواد المستلمة/المسلمة
    {
      item: { 
        type: Schema.Types.ObjectId, 
        ref: 'Storge', 
        required: false
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
