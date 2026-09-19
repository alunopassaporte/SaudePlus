const app = require('./app');
const { startReminderJob } = require('./jobs/reminders');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Saúde+ API rodando em http://localhost:${PORT}`);
  startReminderJob();
});
