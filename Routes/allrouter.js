const express = require("express");
const router = express.Router();

const { post_new_user, get_new_user, put_user_pass } = require("../Controllers/controllr_admin");
const { post_new_item, get_item_all, search_item ,searchItemPublic} = require("../Controllers/controllr_storge");
const { 
  post_add_delivery, 
  get_all_delivery, 
  get_delivery_by_id,
  download_delivery_pdf,
  searchDeliveredItemsDelivery,
  getPersonItems,
  get_all_receipts_with_details,
} = require("../Controllers/controll_delivery");

const { 
  post_add_receipt, 
  get_all_receipts, 
  get_receipt_by_id,
  download_receipt_pdf 
} = require("../Controllers/controllr_receipt");

const { login } = require("../Controllers/controllr_auth");
const { authMiddleware, adminMiddleware } = require("../Middleware/authMiddleware");

// ============================================
// ✅ Routes عامة (بدون حماية)
// ============================================
router.post("/auth/login", login);

// ============================================
// ✅ Routes للـ Admin فقط
// ============================================
router.get("/dshbord", authMiddleware, adminMiddleware, get_new_user);
router.post("/newItem", authMiddleware, adminMiddleware, post_new_item);
router.post("/newUser", authMiddleware, adminMiddleware, post_new_user);
router.put("/updateUser/:id", authMiddleware, adminMiddleware, put_user_pass);

// ============================================
// ✅ Home Routes (Admin + User)
// ============================================
router.get("/home/all-receipts", authMiddleware, get_all_receipts_with_details); // ✅ متاح للجميع

// ============================================
// ✅ Storage Routes
// ============================================
router.get("/storge", authMiddleware, get_item_all);
router.get("/storge/search", authMiddleware, search_item);

// ============================================
// ✅ Delivery Routes (Admin فقط)
// ============================================
router.post("/delivery/add", authMiddleware, adminMiddleware, post_add_delivery);
router.get("/delivery/all", authMiddleware, adminMiddleware, get_all_delivery);
router.get("/delivery/search", authMiddleware, adminMiddleware, searchDeliveredItemsDelivery);
router.get("/delivery/person-items", authMiddleware, adminMiddleware, getPersonItems);
router.get("/delivery/download/:filename", authMiddleware, download_delivery_pdf);
router.get("/delivery/:id", authMiddleware, adminMiddleware, get_delivery_by_id);
// Route جديدة للبحث العام (Admin + User)
router.get("/storge/search-public", authMiddleware,adminMiddleware, searchItemPublic);

// ============================================
// ✅ Receipt Routes (Admin فقط)
// ============================================
router.post("/receipts/add", authMiddleware, adminMiddleware, post_add_receipt);
router.get("/receipts/all", authMiddleware, adminMiddleware, get_all_receipts);
router.get("/receipts/download/:filename", authMiddleware, download_receipt_pdf);
router.get("/receipts/:id", authMiddleware, adminMiddleware, get_receipt_by_id);

module.exports = router;