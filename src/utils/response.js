/**
 * Standardized success response helper
 */
export const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ data });
};

/**
 * No content response (204)
 */
export const noContent = (res) => {
  return res.status(204).send();
};
