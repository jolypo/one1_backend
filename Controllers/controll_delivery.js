const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const moment = require("moment");
const PdfPrinter = require("pdfmake");

const Receipt = require("../models/receipt"); 
const Storge = require("../models/stroge");

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
      const cleanBase64 = (data) => {
        if (!data) return null;
        return data.replace(/^data:image\/\w+;base64,/, "");
      };

      // توقيع المسلم (من Canvas)
      const receiverSignature = receipt.receiver.signature
        ? { image: `data:image/png;base64,${cleanBase64(receipt.receiver.signature)}`, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      // توقيع المدير (من ملف s.png)
      const managerSignPath = path.join(__dirname, "../s.png");
      const managerSignature = fs.existsSync(managerSignPath)
        ? { image: managerSignPath, width: 100, height: 50, alignment: "center" }
        : { text: "", alignment: "center" };

      const docDefinition = {
        pageSize: "A4",
        defaultStyle: { 
          font: "Cairo", 
          alignment: "right"
        },
        pageMargins: [40, 30, 40, 30],

        content: [
          // ✅ الصف العلوي - عكس الأعمدة
          {
            columns: [
              { text: `تاريخ ${moment(receipt.date).format("YYYY/MM/DD")}`, alignment: "right", width: "*" },
              { text: "®", alignment: "left", fontSize: 40, width: "auto" }
            ]
          },

          { 
            text: "\nسند تسليم\n", 
            alignment: "center", 
            bold: true, 
            fontSize: 18, 
            color: "#eb5525" 
          },

          // ✅ الجدول
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

          { 
            text:" المذكورة أعلاه المواد كافة استلمت بأنني أدناه الموقع أنا أقر", 
            alignment: "center", 
            margin: [0, 0, 0, 40] 
          },

          // ✅ التواقيع - المسلم على اليمين، المستلم على اليسار
          {
            columns: [
              // العمود الأيسر - المستلم (المدير)
              {
                width: "50%",
                stack: [
                  { text: "المستلم", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                { text: "رتبة", alignment: "center", bold: true, margin: [0, 0, 0, 5] },
                  managerSignature,
                  { text: "خالد", alignment: "center", margin: [0, 5, 0, 0], fontSize: 12 }
                ]
              },
              // العمود الأيمن - المسلم (الشخص)
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
// ✅ إضافة سند تسليم
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

    const managerFilePath = path.join(__dirname, "../s.png");
    let managerSignature = "";
    if (fs.existsSync(managerFilePath)) {
      managerSignature = "data:image/png;base64," + fs.readFileSync(managerFilePath).toString("base64");
    }

    const receipt = new Receipt({
      type: "تسليم",
      receiver: { 
        name: receiver.name,
        rank: receiver.rank,
        number: receiver.number,
        signature: receiverSignature 
      },
      managerSignature,
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
      console.error("❌ خطأ في إنشاء PDF:", pdfErr);
      res.status(201).json({ 
        message: "تم إضافة السند وإرجاع المواد لكن فشل إنشاء PDF", 
        receiptId: receipt._id,
        error: pdfErr.message
      });
    }

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ خطأ في إضافة السند:", err);
    res.status(500).json({ 
      message: "حدث خطأ أثناء إضافة السند", 
      error: err.message 
    });
  }
};

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

const download_delivery_pdf = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, "../delivery", filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: "الملف غير موجود" });
    res.download(filepath);
  } catch (err) {
    res.status(500).json({ message: "حدث خطأ" });
  }
};

const searchDeliveredItemsDelivery = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name || name.trim().length < 2) {
      return res.status(200).json([]);
    }

    const deliveries = await Receipt.find({
      "receiver.name": { $regex: name.trim(), $options: "i" },
      type: "استلام"
    })
    .select("receiver _id type date")
    .sort({ createdAt: -1 })
    .limit(50);

    const map = new Map();
    for (const d of deliveries) {
      const r = d.receiver || {};
      const key = `${r.name}_${r.rank}_${r.number}`;
      if (!map.has(key)) {
        map.set(key, { receiver: r, _id: d._id, type: d.type, date: d.date });
      }
    }

    const result = Array.from(map.values()).slice(0, 10);
    res.status(200).json(result);
  } catch (err) {
    console.error("❌ خطأ في البحث:", err);
    res.status(500).json({ message: "خطأ في البحث", error: err.message });
  }
};

const getPersonItems = async (req, res) => {
  try {
    const { name, rank, number } = req.query;
    if (!name || !rank || !number) {
      return res.status(400).json({ message: "بيانات الشخص غير مكتملة" });
    }

    const receipts = await Receipt.find({
      "receiver.name": name.trim(),
      "receiver.rank": rank.trim(),
      "receiver.number": number.trim(),
      type: "استلام"
    }).select("items date").sort({ createdAt: -1 });

    const deliveries = await Receipt.find({
      "receiver.name": name.trim(),
      "receiver.rank": rank.trim(),
      "receiver.number": number.trim(),
      type: "تسليم"
    }).select("items date").sort({ createdAt: -1 });

    const receivedMap = new Map();
    receipts.forEach(r => r.items.forEach(i => {
      const key = `${i.itemName}_${i.itemNumber}`;
      const current = receivedMap.get(key) || { 
        itemName: i.itemName, 
        itemType: i.itemType, 
        itemNumber: i.itemNumber, 
        quantity: 0, 
        date: r.date 
      };
      current.quantity += i.quantity;
      receivedMap.set(key, current);
    }));

    const deliveredMap = new Map();
    deliveries.forEach(d => d.items.forEach(i => {
      const key = `${i.itemName}_${i.itemNumber}`;
      deliveredMap.set(key, (deliveredMap.get(key) || 0) + i.quantity);
    }));

    const itemsInCustody = [];
    receivedMap.forEach((item, key) => {
      const deliveredQty = deliveredMap.get(key) || 0;
      const remaining = item.quantity - deliveredQty;
      if (remaining > 0) {
        itemsInCustody.push({
          itemName: item.itemName,
          itemType: item.itemType,
          itemNumber: item.itemNumber,
          quantity: remaining,
          date: item.date
        });
      }
    });

    console.log(`✅ المواد المتاحة للتسليم لـ ${name}:`, itemsInCustody);
    res.status(200).json(itemsInCustody);
  } catch (err) {
    console.error("❌ خطأ:", err);
    res.status(500).json({ message: "خطأ في البحث", error: err.message });
  }
};

// ✅ دالة للحصول على اسم الملف الفعلي
const getActualFileName = (militaryNumber, type) => {
  const directory = type === "استلام" 
    ? path.join(__dirname, "../receipts")
    : path.join(__dirname, "../delivery");
  
  const prefix = type === "استلام" ? "receipt" : "delivery";
  
  if (!fs.existsSync(directory)) return `${prefix}_${militaryNumber}.pdf`;
  
  const files = fs.readdirSync(directory)
    .filter(f => f.startsWith(`${prefix}_${militaryNumber}`))
    .sort((a, b) => {
      const getNum = (str) => {
        const match = str.match(/_(\d+)\.pdf$/);
        return match ? parseInt(match[1]) : 0;
      };
      return getNum(b) - getNum(a);
    });
  
  return files.length > 0 ? files[0] : `${prefix}_${militaryNumber}.pdf`;
};

const get_all_receipts_with_details = async (req, res) => {
  try {
    const { search, limit = 10, page = 1 } = req.query;

    let query = {};
    if (search && search.trim()) {
      query = {
        $or: [
          { "receiver.name": { $regex: search, $options: "i" } },
          { "receiver.number": { $regex: search, $options: "i" } }
        ]
      };
    }

    const allReceipts = await Receipt.find(query).sort({ createdAt: -1 });
    const peopleMap = new Map();

    for (const receipt of allReceipts) {
      const key = `${receipt.receiver.name}_${receipt.receiver.rank}_${receipt.receiver.number}`;
      
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          name: receipt.receiver.name,
          rank: receipt.receiver.rank,
          number: receipt.receiver.number,
          receivedItems: [],
          deliveredItems: [],
          receiptReceipts: [],
          deliveryReceipts: []
        });
      }

      const personData = peopleMap.get(key);

      if (receipt.type === "استلام") {
        receipt.items.forEach(item => {
          personData.receivedItems.push({
            name: item.itemName,
            type: item.itemType,
            number: item.itemNumber,
            quantity: item.quantity
          });
        });
        
        const fileName = getActualFileName(receipt.receiver.number, "استلام");
        personData.receiptReceipts.push({
          id: receipt._id,
          date: receipt.date,
          fileName: fileName
        });
      } else if (receipt.type === "تسليم") {
        receipt.items.forEach(item => {
          personData.deliveredItems.push({
            name: item.itemName,
            type: item.itemType,
            number: item.itemNumber,
            quantity: item.quantity
          });
        });
        
        const fileName = getActualFileName(receipt.receiver.number, "تسليم");
        personData.deliveryReceipts.push({
          id: receipt._id,
          date: receipt.date,
          fileName: fileName
        });
      }
    }

    const finalData = [];
    
    peopleMap.forEach((personData) => {
      const itemsInCustody = [];
      
      personData.receivedItems.forEach(receivedItem => {
        let remainingQty = receivedItem.quantity;
        
        personData.deliveredItems.forEach(deliveredItem => {
          if (
            deliveredItem.name === receivedItem.name &&
            deliveredItem.number === receivedItem.number
          ) {
            remainingQty -= deliveredItem.quantity;
          }
        });

        if (remainingQty > 0) {
          itemsInCustody.push({
            ...receivedItem,
            quantity: remainingQty
          });
        }
      });

      finalData.push({
        name: personData.name,
        rank: personData.rank,
        number: personData.number,
        receivedItems: personData.receivedItems,
        deliveredItems: personData.deliveredItems,
        itemsInCustody: itemsInCustody,
        receiptReceipts: personData.receiptReceipts,
        deliveryReceipts: personData.deliveryReceipts,
        hasItemsInCustody: itemsInCustody.length > 0
      });
    });

    const total = finalData.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedData = finalData.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      data: paginatedData,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (err) {
    console.error("❌ خطأ:", err);
    res.status(500).json({ message: "حدث خطأ", error: err.message });
  }
};

module.exports = { 
  post_add_delivery, 
  get_all_delivery, 
  get_delivery_by_id,
  download_delivery_pdf,
  searchDeliveredItemsDelivery,
  getPersonItems,
  get_all_receipts_with_details,
};