const { neon } = require('@neondatabase/serverless');

function getSQL() {
  return neon(process.env.DATABASE_URL);
}

module.exports = { getSQL };
