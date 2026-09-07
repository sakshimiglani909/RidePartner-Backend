const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admincontroller');
const { 
    sendAdminWhatsApp, 
    getWhatsAppReport, 
    approveDriver, 
    rejectDriver, 
    submitDriverApplication, 
    suspendDriver, 
    unblockDriver, 
    getAdminFinancialLedger // 👈 Yeh function import karna zaroori hai!
} = require('../controllers/admincontroller');

// 🟢 Standardized Admin Driver Management Routes
router.post('/approve', adminController.approveDriver);
router.post('/reject', adminController.rejectDriver);
router.post('/submit-application', adminController.submitDriverApplication);
router.post('/suspend', adminController.suspendDriver);
router.post('/unblock', adminController.unblockDriver);
router.get('/financial-ledger', getAdminFinancialLedger);

// 🟢 Twilio WhatsApp Notification & Reporting Routes
router.post('/send-whatsapp', adminController.sendAdminWhatsApp);
router.get('/whatsapp-reports', adminController.getWhatsAppReport);

module.exports = router;