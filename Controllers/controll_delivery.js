const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");
const cloudinary = require("../config/cloudinary"); // إعداد Cloudinary كما ذكرت سابقاً

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");

// ✅ دالة رفع صورة على Cloudinary
const uploadSignature = async (base64Data, folder = "signatures") => {
  if (!base64Data) return null;
  const result = await cloudinary.uploader.upload(base64Data, { folder });
  return result.secure_url;
};

// ✅ دالة للحصول على اسم ملف فريد مع عداد (مشتركة)
const getUniqueFilename = (militaryNumber, type = "delivery") => {
  const receiptsDir = path.join(__dirname, "../receipts");
  const deliveryDir = path.join(__dirname, "../delivery");
  
  const allFiles = [];
  
  if (fs.existsSync(receiptsDir)) {
    allFiles.push(...fs.readdirSync(receiptsDir).filter(f => f.startsWith(`receipt_${militaryNumber}`)));
  }
  if (fs.existsSync(deliveryDir)) {
    allFiles.push(...fs.readdirSync(deliveryDir).filter(f => f.startsWith(`delivery_${militaryNumber}`)));
  }
  
  if (!fs.existsSync(deliveryDir)) fs.mkdirSync(deliveryDir, { recursive: true });
  
  const baseFilename = `${type}_${militaryNumber}.pdf`;
  const baseFilepath = path.join(deliveryDir, baseFilename);
  
  if (!fs.existsSync(baseFilepath)) {
    return { filename: baseFilename, filepath: baseFilepath };
  }
  
  let maxCounter = 1;
  const pattern = new RegExp(`^(receipt|delivery)_${militaryNumber}(?:_(\\d+))?\\.pdf$`);
  
  allFiles.forEach(file => {
    const match = file.match(pattern);
    if (match) {
      const counter = match[2] ? parseInt(match[2]) : 1;
      if (counter > maxCounter) maxCounter = counter;
    }
  });
  
  const nextCounter = maxCounter + 1;
  const filename = `${type}_${militaryNumber}_${nextCounter}.pdf`;
  const filepath = path.join(deliveryDir, filename);
  
  return { filename, filepath };
};

// ✅ دالة إنشاء PDF للتسليم مع RTL صحيح 100%
const generateDeliveryPDF = async (receipt) => {
  return new Promise((resolve, reject) => {
    try {
      const deliveryDir = path.join(__dirname, "../delivery");
      if (!fs.existsSync(deliveryDir)) fs.mkdirSync(deliveryDir, { recursive: true });

      const { filename, filepath } = getUniqueFilename(receipt.receiver.number, "delivery");

      const fonts = {
        Cairo: {
          normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
          bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf")
        }
      };

      const printer = new PdfPrinter(fonts);

      // ✅ جدول المواد - عكس الترتيب للـ RTL
      const itemsTable = [
        [
          { text: "الكمية", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: " المادة رقم ", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "المادة", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "النوع", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "عدد", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" }
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

      // ✅ التواقيع
      const receiverSignature = receipt.receiver.signature
        ? { image: receipt.receiver.signature, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const managerSignature = receipt.managerSignature
        ? { image: receipt.managerSignature, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const docDefinition = {
        pageSize: "A4",
        defaultStyle: { 
          font: "Cairo", 
          alignment: "right"
        },
        pageMargins: [40, 30, 40, 30],

        content: [
          {
            columns: [
              { text: `تاريخ ${moment(receipt.date).format("YYYY/MM/DD")}`, alignment: "right", width: "*" },
              { text: "®", alignment: "left", fontSize: 40, width: "auto" }
            ]
          },

          { text: "\nسند تسليم\n", alignment: "center", bold: true, fontSize: 18, color: "#eb5525" },

          {
            table: {
              headerRows: 1,
              widths: ["auto", "*", "*", "*", "auto"],
              body: itemsTable
            },
            layout: {
              fillColor: (rowIndex) => rowIndex === 0 ? "#eb5525" : rowIndex % 2 === 0 ? "#f9f9f9" : null,
              hLineColor: () => "#e0e0e0",
              vLineColor: () => "#e0e0e0"
            },
            margin: [0, 10, 0, 20]
          },

          { text:" المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", alignment: "center", margin: [0, 0, 0, 40] },

          {
            columns: [
              {
                width: "50%",
                stack: [
                  { text: "المستلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  { text: "رتبة", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  managerSignature,
                  { text: "خالد", alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 }
                ]
              },
              {
                width: "50%",
                stack: [
                  { text: "المسلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  { text: receipt.receiver.rank, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 },
                  receiverSignature,
                  { text: receipt.receiver.name, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 },
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

      stream.on("finish", () => {
        console.log(`✅ Delivery PDF created: ${filename}`);
        resolve({ success: true, filepath, filename });
      });
      stream.on("error", (err) => reject(err));

    } catch (err) {
      reject(err);
    }
  });
};

// ✅ إضافة سند تسليم مع Cloudinary
const post_add_delivery = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiver, items, receiverSignature, managerSign } = req.body;

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
      if (!itemData.materialName || !itemData.quantity || itemData.quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `البيانات غير صحيحة للمادة رقم ${i + 1}` });
      }

      const existingItem = await Storge.findOne({ itemNumber: itemData.materialNumber }).session(session);
      if (existingItem) {
        existingItem.qin += Number(itemData.quantity);
        await existingItem.save({ session });
      } else {
        const newItem = new Storge({
          itemName: itemData.materialName,
          itemType: itemData.type || "",
          itemNumber: itemData.materialNumber || "",
          qin: Number(itemData.quantity)
        });
        await newItem.save({ session });
      }

      itemsDetails.push({
        itemName: itemData.materialName,
        itemType: itemData.type || "",
        itemNumber: itemData.materialNumber || "",
        quantity: Number(itemData.quantity)
      });
    }

    // رفع التواقيع على Cloudinary
    const receiverSignatureUrl = await uploadSignature(receiverSignature);
    const managerSignatureUrl = managerSign ? await uploadSignature(managerSign) : null;

    const receipt = new Receipt({
      type: "تسليم",
      receiver: { ...receiver, signature: receiverSignatureUrl },
      managerSignature: managerSignatureUrl,
      items: itemsDetails
    });

    await receipt.save({ session });
    await session.commitTransaction();
    session.endSession();

    try {
      const pdfResult = await generateDeliveryPDF(receipt);
      res.status(201).json({ 
        message: "تم إضافة السند وإرجاع المواد للمخزن بنجاح", 
        receiptId: receipt._id,
        pdfUrl: `/delivery/${pdfResult.filename}`,
        pdfFileName: pdfResult.filename
      });
    } catch (pdfErr) {
      res.status(201).json({ 
        message: "تم إضافة السند وإرجاع المواد لكن فشل إنشاء PDF", 
        receiptId: receipt._id,
        error: pdfErr.message
      });
    }

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "حدث خطأ أثناء إضافة السند", error: err.message });
  }
};

// باقي الدوال (get_all_delivery, get_delivery_by_id, download_delivery_pdf, searchDeliveredItemsDelivery, getPersonItems, get_all_receipts_with_details) تبقى كما هي

module.exports = { 
  post_add_delivery, 
  get_all_delivery, 
  get_delivery_by_id,
  download_delivery_pdf,
  searchDeliveredItemsDelivery,
  getPersonItems,
  get_all_receipts_with_details,
};
