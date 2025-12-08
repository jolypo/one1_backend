const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");
const cloudinary = require("./cloudinary"); // رابط Cloudinary جاهز

const Receipt = require("../models/receipt");
const Storge = require("../models/stroge");

// ✅ دالة رفع PDF إلى Cloudinary
const uploadPDFtoCloudinary = async (buffer, folder = "delivery") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
};

// ✅ دالة إنشاء PDF كامل مع التواقيع
const generateDeliveryPDF = async (receipt) => {
  return new Promise((resolve, reject) => {
    try {
      const fonts = {
        Cairo: {
          normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
          bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf"),
        },
      };

      const printer = new PdfPrinter(fonts);

      // جدول المواد
      const itemsTable = [
        [
          { text: "الكمية", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "المادة رقم", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "المادة", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "النوع", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "عدد", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
        ],
      ];

      receipt.items.forEach((item, index) => {
        itemsTable.push([
          { text: item.quantity.toString(), alignment: "center" },
          { text: item.itemNumber || "", alignment: "center" },
          { text: item.itemName || "", alignment: "center" },
          { text: item.itemType || "", alignment: "center" },
          { text: (index + 1).toString(), alignment: "center" },
        ]);
      });

      // توقيع المستلم من Base64
      const cleanBase64 = (data) => data.replace(/^data:image\/\w+;base64,/, "");
      const receiverSignature = receipt.receiver.signature
        ? { image: `data:image/png;base64,${cleanBase64(receipt.receiver.signature)}`, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      // توقيع المدير ثابت من رابط Cloudinary
      const managerSignature = receipt.managerSignature
        ? { image: receipt.managerSignature, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const docDefinition = {
        pageSize: "A4",
        defaultStyle: { font: "Cairo", alignment: "right" },
        pageMargins: [40, 30, 40, 30],
        content: [
          {
            columns: [
              { text: `تاريخ ${moment(receipt.date).format("YYYY/MM/DD")}`, alignment: "right", width: "*" },
              { text: "®", alignment: "left", fontSize: 40, width: "auto" },
            ],
          },
          { text: "\nسند تسليم\n", alignment: "center", bold: true, fontSize: 18, color: "#eb5525" },
          {
            table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body: itemsTable },
            layout: {
              fillColor: (rowIndex) => (rowIndex === 0 ? "#eb5525" : rowIndex % 2 === 0 ? "#f9f9f9" : null),
              hLineColor: () => "#e0e0e0",
              vLineColor: () => "#e0e0e0",
            },
            margin: [0, 10, 0, 20],
          },
          { text: "المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", alignment: "center", margin: [0, 0, 0, 40] },
          {
            columns: [
              {
                width: "50%",
                stack: [
                  { text: "المستلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  { text: "رتبة", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  managerSignature,
                  { text: "خالد", alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 },
                ],
              },
              {
                width: "50%",
                stack: [
                  { text: "المسلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  { text: receipt.receiver.rank, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 },
                  receiverSignature,
                  { text: receipt.receiver.name, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 },
                ],
              },
            ],
            columnGap: 20,
          },
        ],
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        try {
          const uploaded = await uploadPDFtoCloudinary(buffer, "delivery");
          resolve(uploaded);
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

// ✅ إضافة سند تسليم
const post_add_delivery = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiver, items } = req.body;

    if (!receiver || !items || !receiver.signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "البيانات المطلوبة ناقصة" });
    }

    const itemsDetails = [];

    for (const item of items) {
      if (!item.materialName || !item.quantity || item.quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `بيانات المادة غير صحيحة: ${item.materialName || "غير معروف"}` });
      }

      const existingItem = await Storge.findOne({ itemNumber: item.materialNumber }).session(session);
      if (existingItem) {
        existingItem.qin += Number(item.quantity);
        await existingItem.save({ session });
      } else {
        const newItem = new Storge({
          itemName: item.materialName,
          itemType: item.type || "",
          itemNumber: item.materialNumber || "",
          qin: Number(item.quantity),
        });
        await newItem.save({ session });
      }

      itemsDetails.push({
        itemName: item.materialName,
        itemType: item.type || "",
        itemNumber: item.materialNumber || "",
        quantity: Number(item.quantity),
      });
    }

    // رابط توقيع المدير ثابت على Cloudinary
    const managerSignatureURL = "رابط_توقيع_المدير_على_Cloudinary";

    const receipt = new Receipt({
      type: "تسليم",
      receiver: { ...receiver },
      managerSignature: managerSignatureURL,
      items: itemsDetails,
    });

    await receipt.save({ session });
    await session.commitTransaction();
    session.endSession();

    try {
      const pdfUpload = await generateDeliveryPDF(receipt);
      res.status(201).json({
        message: "تم إضافة السند ورفع PDF بنجاح",
        receiptId: receipt._id,
        pdfUrl: pdfUpload.url,
      });
    } catch (pdfErr) {
      res.status(201).json({
        message: "تم إضافة السند لكن فشل رفع PDF",
        receiptId: receipt._id,
        error: pdfErr.message,
      });
    }
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "حدث خطأ أثناء إضافة السند", error: err.message });
  }
};

// باقي الدوال للعرض والبحث
const get_all_delivery = async (req, res) => {
  try {
    const receipts = await Receipt.find({ type: "تسليم" }).sort({ createdAt: -1 });
    res.status(200).json(receipts);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

const get_delivery_by_id = async (req, res) => {
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
  post_add_delivery,
  get_all_delivery,
  get_delivery_by_id,
  generateDeliveryPDF, // يمكن استخدامه إذا أردت إعادة توليد PDF
};
