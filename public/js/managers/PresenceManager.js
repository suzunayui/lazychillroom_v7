// ユーザープレゼンス（オンライン状態）管理クラス
class PresenceManager {
    constructor() {
        this.apiBase = 'api/presence';
        this.currentStatus = 'online';
        this.heartbeatInterval = null;
        this.onlineUsers = new Map(); // guildId -> users array
        this.statusChangeCallbacks = [];
    }

    // 初期化
    init() {
        this.startHeartbeat();
        this.bindEvents();
        this.loadCurrentStatus();
        
        // ページ非表示時にawayに変更
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.updateStatus('away', false); // サーバーに送信しない
            } else {
                this.updateStatus('online');
            }
        });

        // ウィンドウ閉じる前にofflineに変更
        window.addEventListener('beforeunload', () => {
            this.updateStatus('offline', false);
        });
    }

    // ハートビート開始（30秒間隔）
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                await fetch(`${this.apiBase}/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }, 30000);
    }

    // ハートビート停止
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // イベント設定
    bindEvents() {
        // ステータス変更ボタンがあれば設定
        const statusButtons = document.querySelectorAll('.status-button');
        statusButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const status = e.target.dataset.status;
                if (status) {
                    this.updateStatus(status);
                }
            });
        });
    }

    // 現在のステータス読み込み
    async loadCurrentStatus() {
        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            if (currentUser.status) {
                this.currentStatus = currentUser.status;
                this.updateStatusUI(this.currentStatus);
            }
        } catch (error) {
            console.error('Current status load error:', error);
        }
    }

    // ステータス更新
    async updateStatus(status, sendToServer = true) {
        try {
            this.currentStatus = status;
            
            if (sendToServer) {
                const response = await fetch(`${this.apiBase}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({ status })
                });

                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.message);
                }
            }

            // ローカルストレージ更新
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            currentUser.status = status;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            // UI更新
            this.updateStatusUI(status);

            // コールバック実行
            this.statusChangeCallbacks.forEach(callback => {
                try {
                    callback(status);
                } catch (error) {
                    console.error('Status change callback error:', error);
                }
            });

            console.log('✅ Status updated:', status);

        } catch (error) {
            console.error('❌ Status update error:', error);
        }
    }

    // ステータスUI更新
    updateStatusUI(status) {
        // ユーザー情報エリアのステータス更新
        const statusElement = document.querySelector('.user-status');
        if (statusElement) {
            statusElement.textContent = this.getStatusLabel(status);
            statusElement.className = `user-status status-${status}`;
        }

        // ステータスインジケーター更新
        const statusIndicators = document.querySelectorAll('.status-indicator');
        statusIndicators.forEach(indicator => {
            indicator.className = `status-indicator status-${status}`;
        });

        // ステータス選択ボタンの状態更新
        const statusButtons = document.querySelectorAll('.status-button');
        statusButtons.forEach(button => {
            if (button.dataset.status === status) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    // オンラインユーザー取得
    async getOnlineUsers(guildId) {
        try {
            const response = await fetch(`${this.apiBase}/online/${guildId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.onlineUsers.set(guildId, data.online_users);
                return data.online_users;
            } else {
                console.error('❌ Online users fetch error:', data.message);
                return [];
            }
        } catch (error) {
            console.error('❌ Online users fetch error:', error);
            return [];
        }
    }

    // ユーザープレゼンス情報取得
    async getUserPresence(userId) {
        try {
            const response = await fetch(`${this.apiBase}/presence/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            if (data.success) {
                return data.user;
            } else {
                console.error('❌ User presence fetch error:', data.message);
                return null;
            }
        } catch (error) {
            console.error('❌ User presence fetch error:', error);
            return null;
        }
    }

    // メンバーリスト更新
    updateMembersList(guildId) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) return;

        const users = this.onlineUsers.get(guildId) || [];
        
        const onlineUsersHTML = users
            .filter(user => user.status !== 'offline')
            .map(user => `
                <div class="member-item" data-user-id="${user.id}">
                    <div class="member-avatar">
                        ${user.avatar_url ? 
                            `<img src="${user.avatar_url}" alt="${user.username}">` :
                            `<span>${user.username.charAt(0).toUpperCase()}</span>`
                        }
                        <div class="status-indicator status-${user.status}"></div>
                    </div>
                    <div class="member-info">
                        <div class="member-name">${user.username}</div>
                        <div class="member-status">${this.getStatusLabel(user.status)}</div>
                    </div>
                </div>
            `).join('');

        membersList.innerHTML = `
            <div class="members-section">
                <div class="members-header">オンライン — ${users.filter(u => u.status !== 'offline').length}</div>
                ${onlineUsersHTML}
            </div>
        `;
    }

    // ステータス変更時のコールバック登録
    onStatusChange(callback) {
        this.statusChangeCallbacks.push(callback);
    }

    // ステータスラベル取得
    getStatusLabel(status) {
        const statusMap = {
            'online': '🟢 オンライン',
            'away': '🟡 退席中',
            'busy': '🔴 取り込み中',
            'invisible': '⚫ オフライン',
            'offline': '⚫ オフライン'
        };
        return statusMap[status] || '⚫ 不明';
    }

    // ステータス色取得
    getStatusColor(status) {
        const colorMap = {
            'online': '#43b581',
            'away': '#faa61a',
            'busy': '#f04747',
            'invisible': '#747f8d',
            'offline': '#747f8d'
        };
        return colorMap[status] || '#747f8d';
    }

    // クリーンアップ
    cleanup() {
        this.stopHeartbeat();
        this.updateStatus('offline', true);
    }
}

// グローバルスコープに登録
window.PresenceManager = PresenceManager;
