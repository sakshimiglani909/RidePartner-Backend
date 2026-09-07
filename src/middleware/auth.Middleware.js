const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver'); // 🚗 Driver model import kiya

const protect = async (req, res, next) => {
    let token;

    // 1. Check karo Headers me Bearer token hai ya nahi
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } 
    // 2. Flexible Fix: Agar directly token bhej diya bina 'Bearer' ke
    else if (req.headers.authorization) {
        token = req.headers.authorization;
    }

    if (token) {
        token = token.replace(/"/g, '').trim();
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Galti: Aap logged in nahi hain! Token missing hai." });
    }

    try {
        // Token verify karo
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");

        // 🧠 Smart Check: Role ke hisaab se sahi collection se data nikalna
        if (decoded.role === 'driver') {
            // Agar driver hai, toh Driver collection se fetch karo (driverId use karke)
            req.user = await Driver.findById(decoded.driverId).select('-password');
        } else {
            // Agar normal user/passenger hai, toh User collection se fetch karo
            req.user = await User.findById(decoded.userId).select('-password');
        }

        if (!req.user) {
            return res.status(401).json({ success: false, message: "Galti: Is token ka account database me nahi mila!" });
        }

        // Request me role aur type save kar dete hain taaki aage use ho sake
        req.userRole = decoded.role;

        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Galti: Token sahi nahi hai, Authorization failed!", error: error.message });
    }
};

module.exports = { protect };