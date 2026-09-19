const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const remindersRoutes = require('./routes/reminders.routes');
const diseasesRoutes = require('./routes/diseases.routes');
const adminRoutes = require('./routes/admin.routes');
const adminUsersRoutes = require('./routes/admin.users.routes');
const examsRoutes = require('./routes/exams.routes');
const unitsRoutes = require('./routes/units.routes');
const staffRoutes = require('./routes/staff.routes');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/me/appointments', appointmentsRoutes);
app.use('/me/exams', examsRoutes);
app.use('/me/reminders', remindersRoutes);
app.use('/diseases', diseasesRoutes);
app.use('/health-units', unitsRoutes);
app.use('/staff', staffRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
