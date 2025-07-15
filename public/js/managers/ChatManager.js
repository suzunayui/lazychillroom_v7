// チャット機能管理クラス
class ChatManager {
    constructor(currentUser) {
        this.apiBase = 'api';
        this.currentChannel = null;
        this.currentGuild = null;
        this.channels = [];
        this.guilds = [];
        this.dmChannels = [];
        
        this.currentUser = JSON.parse(localStorage.getItem('currentUser'));
        this.messageManager = new MessageManager();
        
        console.log('Current User:', this.currentUser);
        
        // ユーザー情報の検証と修正
        if (!this.currentUser) {
            console.error('ユーザー情報が見つかりません。ログイン画面に戻ります。');
            window.location.reload();
            return;
        }
        
        // usernameが存在しない場合の対応
        if (!this.currentUser.username) {
            console.warn('ユーザー名が見つかりません。再認証を試みます...');
            this.refreshUserInfo();
            return;
        }
        
        this.isDMMode = false; // DMモードかどうかを管理
        this.currentGuild = null;
        this.currentChannel = null;
        // init()はChatUIから呼び出される
    }

    async refreshUserInfo() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                console.error('認証トークンが見つかりません');
                window.location.reload();
                return;
            }

            const response = await apiClient.request('/auth/me', {
                method: 'GET'
            });

            if (response.success && response.user) {
                this.currentUser = response.user;
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                console.log('ユーザー情報が更新されました:', this.currentUser);
                // ユーザー情報更新後の初期化は、必要に応じてChatUIから呼び出される
            } else {
                console.error('ユーザー情報の取得に失敗しました');
                window.location.reload();
            }
        } catch (error) {
            console.error('ユーザー情報の更新エラー:', error);
            window.location.reload();
        }
    }

    async loadChannels(guildId = null) {
        try {
            if (guildId) {
                const endpoint = `/api/channels/guild/${guildId}`;
                console.log('🔍 チャンネル読み込み中...', endpoint);
                
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('📡 レスポンス状態:', response.status, response.statusText);
                
                const responseText = await response.text();
                console.log('📄 レスポンステキスト:', responseText.substring(0, 200) + '...');
                
                if (!response.ok) {
                    console.error('❌ HTTPエラー:', response.status, response.statusText);
                    return [];
                }
                
                const data = JSON.parse(responseText);
                
                if (data.success) {
                    this.channels = data.channels;
                    console.log('✅ チャンネル読み込み成功:', data.channels);
                    return data.channels;
                } else {
                    console.error('チャンネル読み込みエラー:', data.message);
                    return [];
                }
            } else {
                // DM機能は後で実装
                console.log('DM機能は未実装です');
                this.dmChannels = [];
                return [];
            }
        } catch (error) {
            console.error('チャンネル読み込みエラー:', error);
            return [];
        }
    }

    async loadGuilds() {
        try {
            console.log('loadGuilds メソッド開始');
            
            const response = await apiClient.request('/guilds', {
                method: 'GET'
            });

            console.log('サーバーリストAPIレスポンス:', response);
            
            if (response.success && response.guilds) {
                this.guilds = response.guilds;
                console.log('this.guilds に設定:', this.guilds);
                return this.guilds;
            } else {
                console.warn('サーバーリストの取得に失敗、ダミーデータを使用');
                // フォールバックとしてダミーデータを使用
                const dummyGuilds = [
                    {
                        id: 1,
                        name: 'LazyChillRoom',
                        description: 'メインサーバー',
                        icon_url: null
                    }
                ];
                
                this.guilds = dummyGuilds;
                return this.guilds;
            }
            
        } catch (error) {
            console.error('サーバーリスト取得エラー:', error);
            
            // エラー時はダミーデータを使用
            const dummyGuilds = [
                {
                    id: 1,
                    name: 'LazyChillRoom',
                    description: 'メインサーバー',
                    icon_url: null
                }
            ];
            
            console.log('ダミーギルドデータ:', dummyGuilds);
            
            this.guilds = dummyGuilds;
            console.log('this.guilds に設定:', this.guilds);
            
            return this.guilds;
        }
    }

    async loadGuildDetails(guildId) {
        try {
            console.log('🔍 loadGuildDetails called for guild:', guildId);
            
            const response = await fetch(`${this.apiBase}/guilds/${guildId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            console.log('🔍 loadGuildDetails response:', data);
            
            if (data.success) {
                console.log('🔍 Guild members count:', data.guild.members?.length || 0);
                console.log('🔍 Guild members data:', data.guild.members);
                return data.guild;
            } else {
                console.error('ギルド詳細読み込みエラー:', data.message);
                return null;
            }
        } catch (error) {
            console.error('ギルド詳細読み込みエラー:', error);
            return null;
        }
    }

    // MessageManagerのメソッドをプロキシ
    async loadMessages(channelId, limit = 50, before = null) {
        return await this.messageManager.loadMessages(channelId, limit, before);
    }

    async sendMessage(channelId, content, type = 'text') {
        return await this.messageManager.sendMessage(channelId, content, type);
    }

    async uploadFile(file, channelId, content = '') {
        return await this.messageManager.uploadFile(file, channelId, content);
    }

    renderMessage(message) {
        return this.messageManager.renderMessage(message, this.currentChannel);
    }

    addMessage(message) {
        this.messageManager.addMessage(message, this.currentChannel);
    }

    clearMessages() {
        this.messageManager.clearMessages();
    }

    renderMessages(messages) {
        this.messageManager.renderMessages(messages, this.currentChannel);
    }

    scrollToBottom() {
        this.messageManager.scrollToBottom();
    }

    // マイサーバー取得
    async getMyServer() {
        try {
            const response = await fetch(`${this.apiBase}/guilds/my-server`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('マイサーバーが見つかりません - まだ作成されていない可能性があります');
                    return null;
                }
                console.error('マイサーバー取得HTTPエラー:', response.status, response.statusText);
                return null;
            }

            const data = await response.json();
            
            if (data.success) {
                console.log('マイサーバー取得成功:', data.server);
                return data.server;
            } else {
                console.error('マイサーバー取得エラー:', data.message);
                return null;
            }
        } catch (error) {
            console.error('マイサーバー取得エラー:', error);
            return null;
        }
    }

    // マイサーバー作成
    async createMyServer() {
        try {
            const response = await fetch(`${this.apiBase}/guilds/my-server`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            
            if (data.success) {
                return data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('マイサーバー作成エラー:', error);
            throw error;
        }
    }

    // アップローダー用ファイルアップロード
    async uploadUploaderFile(file, channelId, content = '') {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('channel_id', channelId);
            formData.append('content', content);

            const response = await fetch(`${this.apiBase}/files/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                return { success: true, message: data.message, uploadInfo: data.upload_info };
            } else {
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error('アップローダーファイルアップロードエラー:', error);
            return { success: false, error: 'ファイルアップロードに失敗しました' };
        }
    }

    // 初期化メソッド
    async init() {
        try {
            // 初期データを読み込み
            await this.loadGuilds();
            await this.loadChannels();
            
            // デフォルトのギルドとチャンネルを設定
            if (this.guilds.length > 0) {
                this.currentGuild = this.guilds[0];
                if (this.channels.length > 0) {
                    this.currentChannel = this.channels[0];
                    await this.loadMessages(this.currentChannel.id);
                }
            }
            
            console.log('ChatManager初期化完了');
        } catch (error) {
            console.error('ChatManager初期化エラー:', error);
        }
    }
}

// グローバルスコープに登録
window.ChatManager = ChatManager;
