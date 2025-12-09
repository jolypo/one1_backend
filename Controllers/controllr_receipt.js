const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");
const cloudinary = require("./cloudinary");

// ================== دالة تنظيف Base64 ==================
const cleanBase64 = (data) => {
  if (!data) return null;
  return data.replace(/^data:image\/\w+;base64,/, "");
};

// ================== إنشاء PDF ورفع على Cloudinary ==================
const generateReceiptPDF = async (receipt) => {
  return new Promise((resolve, reject) => {
    try {
      const fonts = {
        Cairo: {
          normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
          bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf")
        }
      };
      const printer = new PdfPrinter(fonts);

      // جدول المواد
      const itemsTable = [
        [
          { text: "الكمية", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "المادة رقم", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "المادة", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "النوع", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "عدد", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" }
        ]
      ];

      receipt.items.forEach((item, index) => {
        itemsTable.push([
          { text: item.quantity.toString(), alignment: "center" },
          { text: item.itemNumber || "", alignment: "center" },
          { text: item.itemName || "", alignment: "center" },
          { text: item.itemType || "", alignment: "center" },
          { text: (index + 1).toString(), alignment: "center" }
        ]);
      });

      // التوقيعات داخل المستند فقط
      const receiverSignature = receipt.receiver.signature
        ? { image: `data:image/png;base64,${cleanBase64(receipt.receiver.signature)}`, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const managerSignature = receipt.managerSignature
        ? { image: `data:image/png;base64,${cleanBase64(receipt.managerSignature)}`, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const docDefinition = {
        pageSize: "A4",
        defaultStyle: { font: "Cairo", alignment: "right" },
        pageMargins: [40, 30, 40, 30],
        content: [
          {
            columns: [
              { text: `تاريخ ${moment(receipt.date).format("YYYY/MM/DD")}`, alignment: "right", width: "*" },
              { text: "®", alignment: "left", fontSize: 40, width: "auto" }
            ]
          },
          { text: "\nسند استلام\n", alignment: "center", bold: true, fontSize: 18, color: "#255aeb" },
          {
            table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body: itemsTable },
            layout: {
              fillColor: (rowIndex) => rowIndex === 0 ? "#255aeb" : rowIndex % 2 === 0 ? "#f9f9f9" : null,
              hLineColor: () => "#e0e0e0",
              vLineColor: () => "#e0e0e0"
            },
            margin: [0, 10, 0, 20]
          },
          { text: "المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", alignment: "center", margin: [0, 0, 0, 40] },
          {
            columns: [
              {
                width: "50%",
                stack: [
                  { text: "المسلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  managerSignature,
                  { text: "خالد", alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 }
                ]
              },
              {
                width: "50%",
                stack: [
                  { text: "المستلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  receiverSignature,
                  { text: receipt.receiver.name, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 }
                ]
              }
            ],
            columnGap: 20
          }
        ]
      };

      // إنشاء PDF في الذاكرة
      const chunks = [];
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);

          // رفع PDF إلى Cloudinary
          const upload = cloudinary.uploader.upload_stream(
            { resource_type: "raw", folder: "receipts/pdf" },
            (error, result) => {
              if (error) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );
          upload.end(pdfBuffer);
        } catch (err) {
          reject(err);
        }
      });

      pdfDoc.end();

    } catch (err) {
      reject(err);
    }
  });
};

// ================== إضافة سند ==================
const post_add_receipt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { receiver, items, receiverSignature, managerSignature } = req.body;
    
    if (!receiver || !items || !receiverSignature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "البيانات المطلوبة ناقصة" });
    }

    const itemsDetails = [];
    const itemsToDelete = [];

    for (const itemData of items) {
      const item = await Storge.findById(itemData.item).session(session);
      if (!item) throw new Error(`المادة غير موجودة: ${itemData.item}`);
      if (item.qin < itemData.quantity) throw new Error(`الكمية غير كافية للمادة: ${item.itemName}`);

      item.qin -= itemData.quantity;
      if (item.qin === 0) itemsToDelete.push(item._id);
      else await item.save({ session });

      itemsDetails.push({
        item: item._id,
        itemName: item.itemName,
        itemNumber: item.itemNumber,
        itemType: item.itemType,
        quantity: itemData.quantity
      });
    }

    if (itemsToDelete.length) {
      await Storge.deleteMany({ _id: { $in: itemsToDelete } }).session(session);
    }

    // ✅ أهم تعديل — ضمان وجود توقيع المدير دائماً
    const finalManagerSignature =
      managerSignature && managerSignature.trim() !== ""
        ? managerSignature
        : "https://res.cloudinary.com/de0pulmmw/image/upload/v1765173955/s_rylte8.png";

    // ✅ إنشاء السند بدون PDF أولاً
    const receipt = new Receipt({
      type: "استلام",
      receiver: { ...receiver, signature: receiverSignature },
      managerSignature: finalManagerSignature,   // ← التعديل هنا فقط
      items: itemsDetails
    });

    await receipt.save({ session });
    
    // إنشاء PDF ورفعه
    try {
      const pdfResult = await generateReceiptPDF(receipt);
      
      receipt.pdfUrl = pdfResult.url;
      receipt.pdfPublicId = pdfResult.public_id;
      await receipt.save({ session });
      
      console.log("✅ تم حفظ رابط PDF:", pdfResult.url);
      
    } catch (pdfErr) {
      console.error("❌ خطأ في إنشاء PDF:", pdfErr);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "تم إضافة السند بنجاح",
      receiptId: receipt._id,
      pdfUrl: receipt.pdfUrl,
      itemsDeleted: itemsToDelete.length
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ خطأ أثناء إضافة السند:", err);
    res.status(500).json({ 
      message: "حدث خطأ أثناء إضافة السند", 
      error: err.message 
    });
  }
};

const get_all_receipts = async (req, res) => {
  try {
    const receipts = await Receipt.find({}).sort({ createdAt: -1 });
    res.status(200).json(receipts);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

const get_receipt_by_id = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "رقم السند غير صحيح" });
    const receipt = await Receipt.findById(id);
    if (!receipt) return res.status(404).json({ message: "السند غير موجود" });
    res.status(200).json(receipt);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

module.exports = { 
  post_add_receipt, 
  get_all_receipts, 
  get_receipt_by_id
};
