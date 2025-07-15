// API設定とクライアント
class ApiClient {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = localStorage.getItem('authToken');
        this.socket = null;
    }

    // Socket.io接続を初期化
    initSocket() {
        if (!this.token) return null;

        this.socket = io({
            auth: {
                token: this.token
            }
        });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket.emit('join_guilds');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        return this.socket;
    }

    // HTTPリクエストのヘルパー
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}/api${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            // ステータスが正常でない場合も、レスポンスデータを返す
            // エラーメッセージはdataに含まれている
            if (!response.ok) {
                // データにエラー情報があればそれを使用、なければデフォルトメッセージ
                const errorMessage = data.message || `HTTP error! status: ${response.status}`;
                // エラーオブジェクトにレスポンスデータを含める
                const error = new Error(errorMessage);
                error.response = data;
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // GET request
    async get(endpoint, options = {}) {
        return this.request(endpoint, { method: 'GET', ...options });
    }

    // POST request
    async post(endpoint, body, options = {}) {
        return this.request(endpoint, { method: 'POST', body, ...options });
    }

    // PUT request
    async put(endpoint, body, options = {}) {
        return this.request(endpoint, { method: 'PUT', body, ...options });
    }

    // DELETE request
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { method: 'DELETE', ...options });
    }

    // ファイルアップロード
    async uploadFile(endpoint, file, additionalData = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        Object.keys(additionalData).forEach(key => {
            formData.append(key, additionalData[key]);
        });

        const config = {
            method: 'POST',
            headers: {},
            body: formData
        };

        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${this.baseURL}/api${endpoint}`, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('File upload error:', error);
            throw error;
        }
    }

    // 認証関連メソッド
    setToken(token) {
        this.token = token;
        localStorage.setItem('authToken', token);
        console.log('Token set:', token ? 'あり' : 'なし');
    }

    removeToken() {
        this.token = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        console.log('Token removed');
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // トークンを再読み込み
    reloadToken() {
        this.token = localStorage.getItem('authToken');
        console.log('Token reloaded:', this.token ? 'あり' : 'なし');
        return this.token;
    }

    // 認証API
    async login(email, password) {
        const response = await this.post('/auth/login', { email, password });
        if (response.success && response.token) {
            this.setToken(response.token);
        }
        return response;
    }

    async register(username, email, password) {
        const response = await this.post('/auth/register', { username, email, password });
        if (response.success && response.token) {
            this.setToken(response.token);
        }
        return response;
    }

    async verifyToken() {
        return this.get('/auth/verify');
    }

    // メッセージAPI
    async getMessages(channelId, limit = 50, before = null) {
        const params = new URLSearchParams({ channel_id: channelId, limit });
        if (before) params.append('before', before);
        return this.get(`/messages?${params}`);
    }

    async sendMessage(channelId, content, replyTo = null) {
        return this.post('/messages', { channel_id: channelId, content, reply_to: replyTo });
    }

    async deleteMessage(messageId) {
        return this.delete(`/messages/${messageId}`);
    }

    // ギルドAPI
    async getGuilds() {
        return this.get('/guilds');
    }

    async getGuild(guildId) {
        return this.get(`/guilds/${guildId}`);
    }

    async createGuild(name, description = '', isPublic = false) {
        return this.post('/guilds', { name, description, is_public: isPublic });
    }

    async joinGuild(inviteCode) {
        return this.post(`/guilds/join/${inviteCode}`);
    }

    async leaveGuild(guildId) {
        return this.delete(`/guilds/${guildId}/leave`);
    }

    // チャンネルAPI
    async getChannels(guildId) {
        return this.get(`/channels/guild/${guildId}`);
    }

    async createChannel(guildId, name, type = 'text', position = null) {
        return this.post('/channels', { guild_id: guildId, name, type, position });
    }

    async updateChannel(channelId, updates) {
        return this.put(`/channels/${channelId}`, updates);
    }

    async deleteChannel(channelId) {
        return this.delete(`/channels/${channelId}`);
    }

    // ユーザーAPI
    async getUserProfile() {
        return this.get('/users/profile');
    }

    async updateProfile(username) {
        return this.put('/users/profile', { username });
    }

    async uploadAvatar(file) {
        return this.uploadFile('/users/avatar', file);
    }

    async searchUsers(query, limit = 10) {
        const params = new URLSearchParams({ q: query, limit });
        return this.get(`/users/search?${params}`);
    }

    // ファイルAPI
    async uploadFileToChannel(file, channelId) {
        return this.uploadFile('/files/upload', file, { channel_id: channelId });
    }

    async getChannelFiles(channelId, limit = 20, offset = 0) {
        const params = new URLSearchParams({ limit, offset });
        return this.get(`/files/channel/${channelId}?${params}`);
    }

    async deleteFile(fileId) {
        return this.delete(`/files/${fileId}`);
    }
}

// グローバルAPIクライアントインスタンス
window.apiClient = new ApiClient();
