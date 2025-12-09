const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const receiptSchema = new Schema({
  type: { 
    type: String, 
    enum: ['استلام', 'تسليم'], 
    required: true 
  },
  receiver: {
    name: { type: String, required: true },
    rank: { type: String, required: true },
    number: { type: String, required: true },
    signature: { type: String },
  },
  giver: {},
  
  // ✅ تعديل بسيط بدون حذف — إضافة قيمة افتراضية
  managerSignature: { 
    type: String, 
    required: true,
    default: "https://res.cloudinary.com/de0pulmmw/image/upload/v1765173955/s_rylte8.png"
  },

  items: [
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

  pdfUrl: { type: String },
  pdfPublicId: { type: String },
  verified: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
}, { timestamps: true });

const Receipt = mongoose.model("Receipt", receiptSchema);
module.exports = Receipt;
