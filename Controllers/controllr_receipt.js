require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const PdfPrinter = require("pdfmake");
const https = require("https");

const Receipt = require("../models/receipt");
const Storge = require("../models/stroge");
const cloudinary = require("./cloudinary");

/* ================== أدوات مساعدة ================== */
const fetchImageBuffer = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });

const uploadPDFtoCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "receipts",
        upload_preset: "public_receipts",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });

/* ================== إنشاء PDF ================== */
const generateReceiptPDF = async (receipt) => {
  const fonts = {
    Cairo: {
      normal: path.join(__dirname, "../fonts/Cairo-Regular.ttf"),
      bold: path.join(__dirname, "../fonts/Cairo-Bold.ttf"),
    },
  };

  const printer = new PdfPrinter(fonts);

  const body = [
    ["#", "اسم المادة", "نوع المادة", "رقم المادة", "الكمية"].map((t) => ({
      text: t,
      bold: true,
      alignment: "center",
    })),
  ];

  receipt.items.forEach((i, idx) => {
    body.push([
      { text: idx + 1, alignment: "center" },
      { text: i.itemName, alignment: "center" },
      { text: i.itemType, alignment: "center" },
      { text: i.itemNumber, alignment: "center" },
      { text: i.quantity, alignment: "center" },
    ]);
  });

  let receiverSig = { text: "لا يوجد توقيع", alignment: "center" };
  if (receipt.receiver.signature?.startsWith("http")) {
    receiverSig = { image: await fetchImageBuffer(receipt.receiver.signature), width: 100 };
  } else if (receipt.receiver.signature?.startsWith("data:image")) {
    receiverSig = { image: receipt.receiver.signature, width: 100 };
  }

  let managerSig = { text: "لا يوجد توقيع", alignment: "center" };
  if (receipt.managerSignature?.startsWith("http")) {
    managerSig = { image: await fetchImageBuffer(receipt.managerSignature), width: 100 };
  } else if (receipt.managerSignature?.startsWith("data:image")) {
    managerSig = { image: receipt.managerSignature, width: 100 };
  }

  const doc = {
    pageSize: "A4",
    defaultStyle: { font: "Cairo", alignment: "right" },
    content: [
      { text: `التاريخ: ${new Date(receipt.createdAt).toLocaleDateString("ar-SA")}` },
      { text: "\nسند استلام\n", alignment: "center", bold: true, fontSize: 18 },
      { table: { headerRows: 1, widths: ["auto", "*", "*", "*", "auto"], body } },
      { text: "\nأقر باستلام جميع المواد الموضحة أعلاه", alignment: "center" },
      {
        columns: [
          { stack: [{ text: "المسلم", alignment: "center", bold: true }, managerSig] },
          { stack: [{ text: "المستلم", alignment: "center", bold: true }, receiverSig] },
        ],
        margin: [0, 30],
      },
    ],
  };

  return new Promise((resolve, reject) => {
    const pdf = printer.createPdfKitDocument(doc);
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", async () => {
      try {
        resolve(await uploadPDFtoCloudinary(Buffer.concat(chunks)));
      } catch (e) {
        reject(e);
      }
    });
    pdf.end();
  });
};

/* ================== إضافة سند ================== */
const post_add_receipt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiver, items, receiverSignature, managerSignature } = req.body;

    if (!receiver || !receiverSignature || !Array.isArray(items) || !items.length) {
      throw new Error("البيانات ناقصة");
    }

    const details = [];

    for (const i of items) {
      const item = await Storge.findById(i.item).session(session);
      if (!item) throw new Error("مادة غير موجودة");
      if (item.qin < i.quantity) throw new Error("الكمية غير كافية");

      item.qin -= i.quantity;
      await item.save({ session });

      details.push({
        item: item._id,
        itemName: item.itemName,
        itemType: item.itemType,
        itemNumber: item.itemNumber,
        quantity: i.quantity,
      });
    }

    const receipt = new Receipt({
      type: "استلام",
      receiver: { ...receiver, signature: receiverSignature },
      managerSignature: managerSignature || process.env.MANAGER_SIGNATURE_URL,
      items: details,
    });

    await receipt.save({ session });

    await session.commitTransaction();
    session.endSession();

    const pdf = await generateReceiptPDF(receipt);
    receipt.pdfUrl = pdf.url;
    receipt.pdfPublicId = pdf.public_id;
    await receipt.save();

    res.status(201).json({ message: "تم بنجاح", pdfUrl: receipt.pdfUrl });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: e.message });
  }
};

/* ================== جلب ================== */
const get_all_receipts = async (_, res) =>
  res.json(await Receipt.find({ type: "استلام" }).sort({ createdAt: -1 }));

const get_receipt_by_id = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: "ID غير صحيح" });

  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) return res.status(404).json({ message: "غير موجود" });

  res.json(receipt);
};

module.exports = { post_add_receipt, get_all_receipts, get_receipt_by_id };
