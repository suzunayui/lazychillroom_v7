const { testConnection, query } = require('../config/database');

async function updateDefaultChannels() {
  try {
    console.log('🔄 データベース接続をテスト中...');
    
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ データベースに接続できませんでした');
      process.exit(1);
    }

    console.log('🔄 デフォルトサーバーのチャンネルを更新中...');
    
    // Delete existing channels for guild 1 (except if they have messages)
    const existingChannels = await query('SELECT id, name FROM channels WHERE guild_id = 1');
    console.log('📋 既存のチャンネル:', existingChannels);
    
    // Update existing channels to new names and add missing ones
    const newChannels = [
      { name: '一般', position: 0 },
      { name: '雑談', position: 1 },
      { name: '技術', position: 2 },
      { name: '画像', position: 3 }
    ];
    
    // First, clear existing channels for guild 1
    await query('DELETE FROM channels WHERE guild_id = 1');
    console.log('🗑️ 既存のチャンネルを削除しました');
    
    // Insert new channels
    for (const channel of newChannels) {
      await query(
        'INSERT INTO channels (guild_id, name, type, position) VALUES (?, ?, ?, ?)',
        [1, channel.name, 'text', channel.position]
      );
      console.log(`✅ チャンネル「${channel.name}」を作成しました (位置: ${channel.position})`);
    }

    console.log('🚀 チャンネル更新が完了しました！');
    
    // Verify the update
    const updatedChannels = await query('SELECT id, name, position FROM channels WHERE guild_id = 1 ORDER BY position');
    console.log('📊 更新後のチャンネル一覧:');
    updatedChannels.forEach(ch => {
      console.log(`  - ${ch.name} (ID: ${ch.id}, 位置: ${ch.position})`);
    });
    
    // Close database connection pool
    const { pool } = require('../config/database');
    await pool.end();
    console.log('✅ データベース接続を閉じました');
    
  } catch (error) {
    console.error('❌ チャンネル更新に失敗しました:', error);
    const { pool } = require('../config/database');
    await pool.end();
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  updateDefaultChannels();
}

module.exports = { updateDefaultChannels };
