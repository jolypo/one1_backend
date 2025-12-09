const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");

const cloudinary = require("./cloudinary");
const Receipt = require("../models/receipt");
const Storge = require("../models/stroge");

// رفع PDF إلى Cloudinary
const uploadPDFtoCloudinary = async (buffer, folder = "delivery") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder, format: "pdf" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
};

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

      const itemsTable = [
        [
          { text: "الكمية", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
          { text: "المادة رقم", bold: true, alignment: "center", fillColor: "#eb5525", color: "white" },
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

      const cleanBase64 = (data) => data.replace(/^data:image\/\w+;base64,/, "");

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
          { text: "المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", alignment: "center", margin: [0, 0, 0, 40] },
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

      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        try {
          const uploaded = await uploadPDFtoCloudinary(buffer, "delivery");
          console.log(`✅ PDF مرفوع على Cloudinary: ${uploaded.url}`);
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
        return res.status(400).json({ 
          message: `البيانات غير صحيحة للمادة رقم ${i + 1}` 
        });
      }

      const existingItem = await Storge.findOne({ 
        itemNumber: itemData.materialNumber 
      }).session(session);

      if (existingItem) {
        existingItem.qin += Number(itemData.quantity);
        await existingItem.save({ session });
        console.log(`✅ تم إضافة ${itemData.quantity} إلى المادة: ${existingItem.itemName}`);
      } else {
        const newItem = new Storge({
          itemName: itemData.materialName,
          itemType: itemData.type || "",
          itemNumber: itemData.materialNumber || "",
          qin: Number(itemData.quantity)
        });
        await newItem.save({ session });
        console.log(`✅ تم إنشاء مادة جديدة: ${newItem.itemName}`);
      }

      itemsDetails.push({
        itemName: itemData.materialName,
        itemType: itemData.type || "",
        itemNumber: itemData.materialNumber || "",
        quantity: Number(itemData.quantity)
      });
    }

    // ✅ استخدام التوقيع الثابت إذا managerSign غير موجود أو فارغ
    const finalManagerSignature =
      managerSign && managerSign.trim() !== ""
        ? managerSign
        : "https://res.cloudinary.com/de0pulmmw/image/upload/v1765173955/s_rylte8.png";

    const receipt = new Receipt({
      type: "تسليم",
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

    try {
      const pdfResult = await generateDeliveryPDF(receipt);
      receipt.pdfUrl = pdfResult.url;
      receipt.pdfPublicId = pdfResult.public_id;
      await receipt.save({ session });
      console.log("✅ تم حفظ رابط PDF في قاعدة البيانات:", pdfResult.url);
    } catch (pdfErr) {
      console.error("❌ خطأ في إنشاء PDF:", pdfErr);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "تم إضافة السند وإرجاع المواد للمخزن بنجاح",
      receiptId: receipt._id,
      pdfUrl: receipt.pdfUrl
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ خطأ في إضافة السند:", err);
    res.status(500).json({ message: "حدث خطأ أثناء إضافة السند", error: err.message });
  }
};

module.exports = {
  post_add_delivery,
  get_all_delivery,
  get_delivery_by_id,
  searchDeliveredItemsDelivery,
  getPersonItems,
  get_all_receipts_with_details
};
