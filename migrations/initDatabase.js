const fs = require('fs').promises;
const path = require('path');
const { testConnection, query } = require('../config/database');

async function runMigrations() {
  try {
    console.log('🔄 データベース接続をテスト中...');
    
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ データベースに接続できませんでした');
      process.exit(1);
    }

    console.log('🔄 マイグレーションを実行中...');
    
    // Drop existing tables if they exist (in reverse order due to foreign keys)
    const dropTables = [
      'DROP TABLE IF EXISTS messages',
      'DROP TABLE IF EXISTS channel_members', 
      'DROP TABLE IF EXISTS channels',
      'DROP TABLE IF EXISTS guild_members',
      'DROP TABLE IF EXISTS guilds',
      'DROP TABLE IF EXISTS users'
    ];
    
    console.log('🗑️ 既存のテーブルを削除中...');
    for (const dropCommand of dropTables) {
      try {
        await query(dropCommand);
        console.log(`✅削除完了: ${dropCommand}`);
      } catch (error) {
        console.log(`⚠️ スキップ: ${dropCommand} (テーブルが存在しません)`);
      }
    }
    
    // Read and execute init.sql
    const sqlPath = path.join(__dirname, '../init.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');
    
    // Split SQL commands by semicolon and execute each one
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    for (const command of commands) {
      try {
        await query(command);
        console.log(`✅実行完了: ${command.substring(0, 50)}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️ スキップ: ${command.substring(0, 50)}... (既に存在)`);
        } else {
          console.error(`❌ エラー: ${command.substring(0, 50)}...`);
          console.error(error.message);
        }
      }
    }

    console.log('✅ マイグレーションが完了しました');
    
    // Test if we can query the database
    const users = await query('SELECT COUNT(*) as count FROM users');
    console.log(`📊 ユーザー数: ${users[0].count}`);
    
    const guilds = await query('SELECT COUNT(*) as count FROM guilds');
    console.log(`📊 ギルド数: ${guilds[0].count}`);
    
    console.log('🚀 データベースの準備が完了しました！');
    
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

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
