// Global centralized error handler
const errorHandler = (err, req, res, next) => {
  console.error('[Error Details]:', err);

  // Prisma unique constraint error (e.g. duplicate email or unique index violation)
  if (err.code === 'P2002') {
    const target = err.meta?.target ? ` (${err.meta.target})` : '';
    return res.status(409).json({
      success: false,
      message: `A record with this field already exists${target}.`
    });
  }

  // Prisma record not found error
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Requested record was not found in the database.'
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};

module.exports = errorHandler;
