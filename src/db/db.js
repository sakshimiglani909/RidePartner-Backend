require("dotenv").config();
const mongoose = require("mongoose");

async function connectDB() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("connected to DB");
}

module.exports = connectDB;