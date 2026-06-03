import 'dotenv/config';
import app from './app.js';

const PORT = parseInt(process.env.PORT || '8000', 10);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] RecruiterOS backend listening on port ${PORT}`);
});
