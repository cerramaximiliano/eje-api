/**
 * Modelo de Usuario simplificado para EJE API
 * Solo incluye los campos necesarios para verificación de admin
 * Referencia la misma colección "Usuarios" usada por pjn-api
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  email: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'USER_ROLE',
    enum: ['USER_ROLE', 'ADMIN_ROLE', 'SUPERADMIN_ROLE']
  }
}, {
  collection: 'usuarios',
  timestamps: true,
  strict: false // Permite campos adicionales que existen en la colección
});

module.exports = mongoose.model('User', UserSchema);
