require('dotenv').config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");
const https = require("https");

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");
const cloudinary = require("./cloudinary");

// ================== تنظيف Base64 ==================
const cleanBase64 = (data) => {
  if (!data) return null;
  return data.replace(/^data:image\/\w+;base64,/, "");
};

// ================== جلب صورة من رابط ==================
const fetchImageBuffer = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", (err) => reject(err));
  });
};

// ================== رفع PDF إلى Cloudinary ==================
const uploadPDFtoCloudinary = async (buffer, folder = "receipts") => {
  console.log("📤 رفع PDF إلى Cloudinary...");
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",       // لأن الملفات PDF
        folder,
        upload_preset: "public_receipts",  // <-- Unsigned Preset
      },
      (error, result) => {
        if (error) {
          console.error("❌ خطأ في رفع PDF:", error);
          return reject(error);
        }
        console.log("✅ تم رفع PDF:", result.secure_url);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );

    uploadStream.end(buffer);
  });
};


// ================== إنشاء PDF ==================
const generateReceiptPDF = async (receipt) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("📝 إنشاء PDF للسند...");
      const fonts = {
        Cairo: {
          normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
          bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf"),
        },
      };
      const printer = new PdfPrinter(fonts);

      const itemsTable = [
        [
          { text: "#", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "اسم المادة", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "نوع المادة", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "رقم المادة", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" },
          { text: "الكمية", bold: true, alignment: "center", fillColor: "#255aeb", color: "white" }
        ]
      ];

      receipt.items.forEach((item, index) => {
        itemsTable.push([
          { text: (index + 1).toString(), alignment: "center" },
          { text: item.itemName || "", alignment: "center" },
          { text: item.itemType || "", alignment: "center" },
          { text: item.itemNumber || "", alignment: "center" },
          { text: item.quantity.toString(), alignment: "center" }
        ]);
      });

      // ======= التواقيع =======
      let receiverSignature = { text: "لا يوجد توقيع", alignment: "center", color: "gray" };
      if (receipt.receiver.signature) {
        if (receipt.receiver.signature.startsWith("data:image")) {
          receiverSignature = { image: receipt.receiver.signature, width: 100, height: 50, alignment: "center" };
        } else if (receipt.receiver.signature.startsWith("http")) {
          try {
            const buffer = await fetchImageBuffer(receipt.receiver.signature);
            if (buffer) receiverSignature = { image: buffer, width: 100, height: 50, alignment: "center" };
          } catch (err) {
            console.error("❌ خطأ في جلب توقيع المستلم من URL:", err);
          }
        }
      }

      let managerSignature = { text: "لا يوجد توقيع", alignment: "center", color: "gray" };
      if (receipt.managerSignature) {
        if (receipt.managerSignature.startsWith("data:image")) {
          managerSignature = { image: receipt.managerSignature, width: 100, height: 50, alignment: "center" };
        } else if (receipt.managerSignature.startsWith("http")) {
          try {
            const buffer = await fetchImageBuffer(receipt.managerSignature);
            if (buffer) managerSignature = { image: buffer, width: 100, height: 50, alignment: "center" };
          } catch (err) {
            console.error("❌ خطأ في جلب توقيع المدير من URL:", err);
          }
        }
      }

      const docDefinition = {
        pageSize: "A4",
        defaultStyle: { font: "Cairo", alignment: "right" },
        pageMargins: [40, 30, 40, 30],
        content: [
          { text: `التاريخ: ${new Date(receipt.date).toLocaleDateString("ar-SA")}`, alignment: "right" },
          { text: "\nسند استلام\n", alignment: "center", bold: true, fontSize: 18, color: "#255aeb" },
          {
            table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body: itemsTable },
            layout: { fillColor: (rowIndex) => rowIndex === 0 ? "#255aeb" : rowIndex % 2 === 0 ? "#f9f9f9" : null }
          },
          { text: "أقر أنا الموقع أدناه بأنني استلمت كافة المواد المذكورة أعلاه", alignment: "center", margin: [0, 0, 0, 40] },
          {
            columns: [
              { width: "50%", stack: [{ text: "المسلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] }, managerSignature, { text: "خالد", alignment: "center", margin: [0,5,0,0], fontSize: 12 }] },
              { width: "50%", stack: [{ text: "المستلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] }, receiverSignature, { text: receipt.receiver.name, alignment: "center", margin: [0,5,0,0], fontSize: 12 }] }
            ],
            columnGap: 20
          }
        ]
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];

      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          console.log("📦 طول الـ PDF:", pdfBuffer.length);
          const uploaded = await uploadPDFtoCloudinary(pdfBuffer, "receipts");
          resolve(uploaded);
        } catch (err) {
          console.error("❌ خطأ في رفع PDF بعد الإنشاء:", err);
          reject(err);
        }
      });

      pdfDoc.end();
    } catch (err) {
      console.error("❌ خطأ عام أثناء إنشاء PDF:", err);
      reject(err);
    }
  });
};

// ================== إضافة سند استلام ==================
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

    if (!receiver.name || !receiver.rank || !receiver.number) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "بيانات المستلم غير مكتملة" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "يجب إضافة مادة واحدة على الأقل" });
    }

    const itemsDetails = [];

    for (let i = 0; i < items.length; i++) {
      const itemData = items[i];

      if (!itemData.item || !itemData.quantity || itemData.quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `البيانات غير صحيحة للمادة رقم ${i + 1}` 
        });
      }

      const item = await Storge.findById(itemData.item).session(session);

      if (!item) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `المادة غير موجودة` });
      }

      if (item.qin < itemData.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `الكمية في المخزون غير كافية للمادة: ${item.itemName}. المتوفر: ${item.qin}, المطلوب: ${itemData.quantity}` 
        });
      }

      item.qin -= itemData.quantity;
      await item.save({ session });

      itemsDetails.push({
        item: item._id,
        itemName: item.itemName,
        itemNumber: item.itemNumber,
        itemType: item.itemType,
        quantity: itemData.quantity
      });
    }

    const finalManagerSignature =
      managerSignature && managerSignature.trim() !== ""
        ? managerSignature
        : process.env.MANAGER_SIGNATURE_URL || "https://res.cloudinary.com/de0pulmmw/image/upload/v1765173955/s_rylte8.png";

    const receipt = new Receipt({
      type: "استلام",
      receiver: { 
        name: receiver.name,
        rank: receiver.rank,
        number: receiver.number,
        signature: receiverSignature 
      },
      managerSignature: finalManagerSignature,
      items: itemsDetails
    });

    await receipt.save({ session });

    // إنشاء PDF ورفعه
    try {
      const pdfResult = await generateReceiptPDF(receipt);
      receipt.pdfUrl = pdfResult.url;       // الرابط المباشر من Cloudinary
      receipt.pdfPublicId = pdfResult.public_id;
      await receipt.save({ session });
      console.log("✅ تم رفع PDF بنجاح:", pdfResult.url);
    } catch (pdfErr) {
      console.error("❌ خطأ في إنشاء PDF:", pdfErr);
    }

    await session.commitTransaction();
    session.endSession();

    // إرسال الرابط المباشر للـ frontend
    res.status(201).json({
      message: "تم إضافة السند بنجاح",
      receiptId: receipt._id,
      pdfUrl: receipt.pdfUrl
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

// ================== جلب جميع السندات ==================
const get_all_receipts = async (req, res) => {
  try {
    const receipts = await Receipt.find({ type: "استلام" }).sort({ createdAt: -1 });
    res.status(200).json(receipts);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب جميع السندات:", err);
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

// ================== جلب سند حسب الـ ID ==================
const get_receipt_by_id = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "رقم السند غير صحيح" });
    }

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ message: "السند غير موجود" });
    }

    res.status(200).json(receipt);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب السند:", err);
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

module.exports = { 
  post_add_receipt, 
  get_all_receipts, 
  get_receipt_by_id
};
