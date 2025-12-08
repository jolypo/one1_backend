const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");
const cloudinary = require("./cloudinary"); // إعداد Cloudinary

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");

// ✅ رفع صورة توقيع على Cloudinary
const uploadSignature = async (base64Data, folder = "signatures") => {
  if (!base64Data) return null;
  const result = await cloudinary.uploader.upload(base64Data, { folder });
  return result.secure_url;
};

// ✅ إنشاء PDF كـ Buffer ثم رفعه على Cloudinary
const generateDeliveryPDF = async (receipt) => {
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

      const receiverSignature = receipt.receiver.signature
        ? { image: receipt.receiver.signature, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

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
              { text: "®", alignment: "left", fontSize: 40, width: "auto" }
            ]
          },
          { text: "\nسند تسليم\n", alignment: "center", bold: true, fontSize: 18, color: "#eb5525" },
          {
            table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body: itemsTable },
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
                  { text: receipt.receiver.name, alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 }
                ]
              }
            ],
            columnGap: 20
          }
        ]
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', async () => {
        const buffer = Buffer.concat(chunks);

        try {
          const uploadResult = await cloudinary.uploader.upload_stream(
            { resource_type: "raw", folder: "delivery" },
            (error, result) => {
              if (error) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          ).end(buffer);
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

// ✅ إضافة سند تسليم مع رفع PDF و التواقيع على Cloudinary
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
      const pdfUpload = await generateDeliveryPDF(receipt);
      res.status(201).json({
        message: "تم إضافة السند وإرجاع المواد للمخزن بنجاح",
        receiptId: receipt._id,
        pdfUrl: pdfUpload.url
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

// باقي الدوال تبقى كما هي

module.exports = {
  post_add_delivery,
  get_all_delivery,
  get_delivery_by_id,
  download_delivery_pdf,
  searchDeliveredItemsDelivery,
  getPersonItems,
  get_all_receipts_with_details
};
