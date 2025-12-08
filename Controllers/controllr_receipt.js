const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");
const cloudinary = require("./cloudinary");

// ✅ دالة للحصول على اسم ملف فريد مع عداد
const getUniqueFilename = (directory, militaryNumber, prefix = "receipt") => {
  const baseFilename = `${prefix}_${militaryNumber}.pdf`;
  const baseFilepath = path.join(directory, baseFilename);
  
  if (!fs.existsSync(baseFilepath)) {
    return { filename: baseFilename, filepath: baseFilepath };
  }
  
  let counter = 2;
  while (true) {
    const filename = `${prefix}_${militaryNumber}_${counter}.pdf`;
    const filepath = path.join(directory, filename);
    
    if (!fs.existsSync(filepath)) {
      return { filename, filepath };
    }
    counter++;
  }
};

// ✅ دالة إنشاء PDF مع دعم كامل للعربية
const generateReceiptPDF = async (receipt) => {
  return new Promise(async (resolve, reject) => {
    try {
      const receiptsDir = path.join(__dirname, "../receipts");
      if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

      const { filename, filepath } = getUniqueFilename(receiptsDir, receipt.receiver.number, "receipt");

      const fonts = {
        Cairo: {
          normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
          bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf")
        }
      };

      const printer = new PdfPrinter(fonts);

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

      // التواقيع
   // التواقيع
const cleanBase64 = (data) => {
  if (!data) return null;
  return data.replace(/^data:image\/\w+;base64,/, "");
};

const receiverSignature = receipt.receiver.signature
  ? { image: `data:image/png;base64,${cleanBase64(receipt.receiver.signature)}`, width: 100, height: 50, alignment: "center" }
  : { text: "", alignment: "center" };

const managerSignature = receipt.managerSignature
  ? { image: receipt.managerSignature, width: 100, height: 50, alignment: "center" }
  : { text: "", alignment: "center" };

      let managerSignature = { text: "", alignment: "center" };
      if (receipt.managerSignature) {
        const tempPath = path.join(__dirname, "../temp_manager.png");
        const res = await fetch(receipt.managerSignature);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(tempPath, buffer);
        managerSignature = { image: tempPath, width: 100, height: 50, alignment: "center" };
      }

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
          { text: " المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", alignment: "center", margin: [0, 0, 0, 40] },
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

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filepath);
      pdfDoc.pipe(stream);
      pdfDoc.end();

      stream.on("finish", () => resolve({ success: true, filepath, filename }));
      stream.on("error", (err) => reject(err));

    } catch (err) {
      reject(err);
    }
  });
};

// ✅ إضافة سند جديد مع Cloudinary
const post_add_receipt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiver, items, receiverSignature } = req.body;

    if (!receiver || !items || !receiverSignature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "البيانات المطلوبة ناقصة" });
    }

    // رفع توقيع المستلم إلى Cloudinary
    let receiverSignatureUrl = "";
    if (receiverSignature) {
      const uploadResponse = await cloudinary.uploader.upload(
        `data:image/png;base64,${receiverSignature}`,
        { folder: "receipts/signatures" }
      );
      receiverSignatureUrl = uploadResponse.secure_url;
    }

    // رفع توقيع المدير
    let managerSignatureUrl = "";
    const managerFilePath = path.join(__dirname, "../s.png");
    if (fs.existsSync(managerFilePath)) {
      const uploadManager = await cloudinary.uploader.upload(managerFilePath, {
        folder: "receipts/manager"
      });
      managerSignatureUrl = uploadManager.secure_url;
    }

    const itemsDetails = [];
    const itemsToDelete = [];

    for (let i = 0; i < items.length; i++) {
      const itemData = items[i];
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
          message: `الكمية في المخزون غير كافية للمادة: ${item.itemName}` 
        });
      }

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

    if (itemsToDelete.length > 0) {
      await Storge.deleteMany({ _id: { $in: itemsToDelete } }).session(session);
    }

    const receipt = new Receipt({
      type: "استلام",
      receiver: { ...receiver, signature: receiverSignatureUrl },
      managerSignature: managerSignatureUrl,
      items: itemsDetails
    });

    await receipt.save({ session });
    await session.commitTransaction();
    session.endSession();

    const pdfResult = await generateReceiptPDF(receipt);

    res.status(201).json({ 
      message: "تم إضافة السند بنجاح", 
      receiptId: receipt._id,
      pdfUrl: `/receipts/${pdfResult.filename}`,
      pdfFileName: pdfResult.filename,
      itemsDeleted: itemsToDelete.length
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ خطأ أثناء إضافة السند:", err);
    res.status(500).json({ message: "حدث خطأ أثناء إضافة السند", error: err.message });
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

const download_receipt_pdf = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, "../receipts", filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: "الملف غير موجود" });
    res.download(filepath);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ" });
  }
};

module.exports = { 
  post_add_receipt, 
  get_all_receipts, 
  get_receipt_by_id,
  download_receipt_pdf 
};
