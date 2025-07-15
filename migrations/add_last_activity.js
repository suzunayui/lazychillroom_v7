const { testConnection, query } = require('../config/database');

async function addLastActivityColumn() {
  try {
    console.log('🔄 データベース接続をテスト中...');
    
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ データベースに接続できませんでした');
      process.exit(1);
    }

    console.log('🔄 last_activity カラムを追加中...');
    
    // Check if column already exists
    const checkColumn = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'lazychillroom' 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'last_activity'
    `;
    
    const existingColumn = await query(checkColumn);
    
    if (existingColumn.length > 0) {
      console.log('✅ last_activity カラムは既に存在します');
    } else {
      // Add the column
      const addColumnQuery = `
        ALTER TABLE users 
        ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
        AFTER is_active
      `;
      
      await query(addColumnQuery);
      console.log('✅ last_activity カラムを追加しました');
      
      // Add index
      const addIndexQuery = `
        ALTER TABLE users 
        ADD INDEX idx_last_activity (last_activity)
      `;
      
      await query(addIndexQuery);
      console.log('✅ last_activity インデックスを追加しました');
      
      // Update existing users with current timestamp
      const updateQuery = `
        UPDATE users 
        SET last_activity = CURRENT_TIMESTAMP 
        WHERE last_activity IS NULL
      `;
      
      await query(updateQuery);
      console.log('✅ 既存ユーザーの last_activity を更新しました');
    }

    console.log('🚀 マイグレーションが完了しました！');
    
    // Close database connection pool
    const { pool } = require('../config/database');
    await pool.end();
    console.log('✅ データベース接続を閉じました');
    
  } catch (error) {
    console.error('❌ マイグレーションに失敗しました:', error);
    const { pool } = require('../config/database');
    await pool.end();
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addLastActivityColumn();
}

module.exports = { addLastActivityColumn };
