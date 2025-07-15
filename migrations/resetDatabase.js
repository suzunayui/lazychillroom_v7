// データベースリセット用マイグレーション
const { query } = require('../config/database');

async function resetDatabase() {
    try {
        console.log('🗑️ データベースをリセットしています...');
        
        // 外部キー制約を一時的に無効にする
        await query('SET FOREIGN_KEY_CHECKS = 0');
        
        // 全テーブルのデータを削除
        const tables = [
            'message_reactions',
            'message_pins', 
            'messages',
            'channels',
            'guild_members',
            'guilds',
            'users'
        ];
        
        for (const table of tables) {
            try {
                await query(`DELETE FROM ${table}`);
                await query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
                console.log(`✅ ${table} テーブルをクリアしました`);
            } catch (error) {
                console.log(`⚠️ ${table} テーブルのクリアをスキップ: ${error.message}`);
            }
        }
        
        // 外部キー制約を再有効化
        await query('SET FOREIGN_KEY_CHECKS = 1');
        
        console.log('✅ データベースリセットが完了しました');
        console.log('🎉 次に登録するユーザーが最初の管理者になります');
        
    } catch (error) {
        console.error('❌ データベースリセットエラー:', error);
        throw error;
    }
}

if (require.main === module) {
    resetDatabase()
        .then(() => {
            console.log('🔄 データベースリセット完了');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ リセット失敗:', error);
            process.exit(1);
        });
}

module.exports = resetDatabase;
