const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  driverId: {
    type: String,
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  withdrawalMethod: {
    type: String,
    enum: ['upi', 'bank'],
    required: true
  },

  // UPI details
  upiId: {
    type: String
  },

  // Bank details
  accountHolderName: {
    type: String
  },

  accountNumber: {
    type: String
  },

  ifscCode: {
    type: String
  },

  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
    default: 'PENDING'
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);