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
    getAdminFinancialLedger,

    // 🟢 Withdrawal Management
    getWithdrawalRequests,
    approveWithdrawal,
    rejectWithdrawal

} = require('../controllers/admincontroller');

// 🟢 Standardized Admin Driver Management Routes
// 🟢 Withdrawal Management Routes
router.get('/withdrawals', getWithdrawalRequests);
router.post('/withdrawal/approve', approveWithdrawal);
router.post('/withdrawal/reject', rejectWithdrawal);
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