const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

// Domain validator: Must strictly end with @mnnit.ac.in
const isValidMnnitEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  // Regex: characters before '@', followed by exact 'mnnit.ac.in'
  return /^[a-zA-Z0-9._%+-]+@mnnit\.ac\.in$/.test(normalized);
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'kamar_taj_refectory_super_secret_jwt_key_2026',
    { expiresIn: '7d' }
  );
};

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new student account (Public signup restricted to STUDENT role)
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password, mobileNumber, phone, mobile, regNo, roomNo } = req.body;
    const resolvedPhone = (mobileNumber || phone || mobile || '').toString().trim();

    if (!name || !email || !password || !resolvedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and mobile number are all required fields.'
      });
    }

    // Validate mobile number: 10 digits (optionally with +91)
    const cleanPhone = resolvedPhone.replace(/[\s\-]/g, '');
    const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Enforce MNNIT domain constraint
    if (!isValidMnnitEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Access restricted: Only official @mnnit.ac.in email addresses are permitted.'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this MNNIT email already exists. Please log in.'
      });
    }

    // Check if regNo is provided and already taken
    if (regNo) {
      const existingReg = await prisma.user.findUnique({
        where: { regNo: regNo.trim() }
      });
      if (existingReg) {
        return res.status(409).json({
          success: false,
          message: `Registration number ${regNo} is already associated with another account.`
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create student user + default 1-semester active membership
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // Default 6-month semester membership

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'STUDENT', // Strictly STUDENT for public registration
        regNo: regNo ? regNo.trim() : null,
        roomNo: roomNo ? roomNo.trim() : null,
        phone: cleanPhone,
        membership: {
          create: {
            startDate,
            endDate,
            isActive: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        regNo: true,
        roomNo: true,
        phone: true,
        membership: true,
        createdAt: true
      }
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Student registration successful. Welcome to The Kamar-Taj Refectory!',
      token,
      user: {
        ...newUser,
        mobileNumber: newUser.phone
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user (Student, Staff, Admin) and return JWT
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Enforce MNNIT domain verification
    if (!isValidMnnitEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain: Login is restricted to @mnnit.ac.in accounts.'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        membership: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. No user found with this email.'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: `Login successful. Welcome back, ${user.name}!`,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        regNo: user.regNo,
        roomNo: user.roomNo,
        membership: user.membership
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 */
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        regNo: true,
        roomNo: true,
        phone: true,
        membership: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      success: true,
      user
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  signup,
  login,
  getMe,
  isValidMnnitEmail
};
