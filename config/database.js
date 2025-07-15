const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'lazychillroom_user',
  password: process.env.DB_PASSWORD || 'lazychillroom_password',
  database: process.env.DB_NAME || 'lazychillroom',
  charset: 'utf8mb4',
  connectionLimit: 10,
  idleTimeout: 600000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(config);

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Get connection from pool
async function getConnection() {
  try {
    return await pool.getConnection();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Execute query with automatic connection management
async function query(sql, params = []) {
  const connection = await getConnection();
  try {
    console.log('🔍 Executing SQL:', sql);
    console.log('🔍 With parameters:', params);
    console.log('🔍 Parameter types:', params.map(p => typeof p));
    const [results] = await connection.execute(sql, params);
    console.log('✅ Query executed successfully, rows:', results.length);
    return results;
  } catch (error) {
    console.error('❌ Query execution failed:');
    console.error('SQL:', sql);
    console.error('Parameters:', params);
    console.error('Error:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Execute transaction
async function transaction(callback) {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testConnection,
  getConnection,
  query,
  transaction
};
