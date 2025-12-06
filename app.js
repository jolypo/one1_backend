require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const allrouter = require("./Routes/allrouter");

// ✅ CORS - السماح للفرونت بالتواصل
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// ✅ قراءة JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ✅ خدمة ملفات PDF
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));
app.use('/delivery', express.static(path.join(__dirname, 'delivery')));

// ✅ Routes
app.use("/routes", allrouter);

// ✅ الصفحة الرئيسية
app.get("/", (req, res) => {
  res.json({ 
    message: "✅ السيرفر يعمل بنجاح",
    version: "1.0.0",
    baseUrl: BASE_URL,
    endpoints: {
      "تسجيل الدخول": "POST /routes/auth/login",
      "جلب جميع المواد": "GET /routes/storge",
      "البحث عن مواد": "GET /routes/storge/search?query=xxx",
      "إضافة مادة": "POST /routes/newItem",
      "إضافة سند استلام": "POST /routes/receipts/add",
      "إضافة سند تسليم": "POST /routes/delivery/add",
      "تحميل PDF استلام": "GET /receipts/<filename>.pdf",
      "تحميل PDF تسليم": "GET /delivery/<filename>.pdf",
      "جلب المستخدمين": "GET /routes/dshbord",
      "إضافة مستخدم": "POST /routes/newUser"
    }
  });
});

// ✅ الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI + "&directConnection=true")
  .then(() => {
    console.log("✅ MongoDB connected");
    console.log("📊 Database:", mongoose.connection.name);

    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 Backend Server Started Successfully!");
      console.log("=".repeat(60));
      console.log(`\n🌐 Server URL: ${BASE_URL}`);
      console.log(`🎨 Frontend URL: ${FRONTEND_URL}`);
      console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? "✅ Configured" : "⚠️  NOT SET!"}`);
      console.log("\n📋 Available Endpoints:");
      console.log(`   POST ${BASE_URL}/routes/auth/login`);
      console.log(`   GET  ${BASE_URL}/routes/storge`);
      console.log(`   POST ${BASE_URL}/routes/newItem`);
      console.log(`   POST ${BASE_URL}/routes/receipts/add`);
      console.log(`   POST ${BASE_URL}/routes/delivery/add`);
      console.log(`   GET  ${BASE_URL}/routes/dshbord`);
      console.log(`   POST ${BASE_URL}/routes/newUser`);
      console.log("\n💾 Static Files:");
      console.log(`   📁 Receipts: ${BASE_URL}/receipts/<filename>.pdf`);
      console.log(`   📁 Delivery: ${BASE_URL}/delivery/<filename>.pdf`);
      console.log("\n" + "=".repeat(60) + "\n");
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ✅ معالجة أخطاء Mongoose
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB Error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB Disconnected');
});

// ✅ معالجة إيقاف التطبيق
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('\n👋 تم إيقاف الاتصال بقاعدة البيانات');
  process.exit(0);
});

module.exports = app;