// 認証管理クラス
class AuthManager {
    constructor() {
        this.apiClient = window.apiClient;
        this.currentUser = null;
        this.isAuthenticated = false;
        
        console.log('AuthManager初期化');
    }

    // ログイン
    async login(userId, password) {
        try {
            const response = await this.apiClient.request('/auth/login', {
                method: 'POST',
                body: {
                    userId: userId,
                    password: password
                }
            });

            if (response.success) {
                this.currentUser = response.user;
                this.isAuthenticated = true;
                
                // トークンを保存
                this.apiClient.setToken(response.token);
                localStorage.setItem('currentUser', JSON.stringify(response.user));
                
                return { success: true, user: response.user };
            } else {
                return { success: false, error: response.message };
            }
        } catch (error) {
            console.error('ログインエラー:', error);
            
            // APIからのエラーレスポンスがある場合、そのメッセージを使用
            if (error.response && error.response.message) {
                return { success: false, error: error.response.message };
            }
            
            return { success: false, error: 'ネットワークエラーが発生しました' };
        }
    }

    // 新規登録
    async register(userId, password, nickname) {
        try {
            const response = await this.apiClient.request('/auth/register', {
                method: 'POST',
                body: {
                    userId: userId,
                    password: password,
                    nickname: nickname
                }
            });

            if (response.success) {
                this.currentUser = response.user;
                this.isAuthenticated = true;
                
                // トークンを保存
                this.apiClient.setToken(response.token);
                localStorage.setItem('currentUser', JSON.stringify(response.user));
                
                return { success: true, user: response.user };
            } else {
                return { success: false, error: response.message };
            }
        } catch (error) {
            console.error('登録エラー:', error);
            
            // APIからのエラーレスポンスがある場合、そのメッセージを使用
            if (error.response && error.response.message) {
                return { success: false, error: error.response.message };
            }
            
            // エラーメッセージから特定のエラーを判定
            if (error.message && error.message.includes('このユーザーIDは既に使用されています')) {
                return { success: false, error: 'このユーザーIDは既に使用されています' };
            }
            
            return { success: false, error: 'ネットワークエラーが発生しました' };
        }
    }

    // ログアウト
    logout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.apiClient.removeToken();
        localStorage.removeItem('currentUser');
        
        // ページを再読み込みして初期状態に戻す
        window.location.reload();
    }

    // 認証状態チェック
    async checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        const currentUser = localStorage.getItem('currentUser');

        if (token && currentUser) {
            try {
                // トークンの有効性を確認
                const response = await this.apiClient.request('/auth/me', {
                    method: 'GET'
                });

                if (response.success) {
                    this.currentUser = response.user;
                    this.isAuthenticated = true;
                    return true;
                } else {
                    // 無効なトークンをクリア
                    this.logout();
                    return false;
                }
            } catch (error) {
                console.error('認証状態確認エラー:', error);
                this.logout();
                return false;
            }
        }

        return false;
    }

    // 現在のユーザー取得
    getCurrentUser() {
        return this.currentUser;
    }

    // 認証状態取得
    isLoggedIn() {
        return this.isAuthenticated;
    }
}

// 認証UI管理クラス
class AuthUI {
    constructor() {
        this.authManager = new AuthManager();
        this.currentMode = 'login'; // 'login' or 'register'
        
        console.log('AuthUI初期化');
    }

    // 認証画面を表示
    showAuthScreen() {
        const app = document.getElementById('app');
        const html = this.getAuthHTML();
        console.log('Generated HTML length:', html.length);
        console.log('Generated HTML preview:', html.substring(0, 200) + '...');
        app.innerHTML = html;
        this.bindEvents();
        
        console.log('認証画面を表示');
        console.log('App element content after update:', app.innerHTML.length);
    }

    // 認証画面のHTML
    getAuthHTML() {
        return `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <h1 style="color: #333; margin-bottom: 10px;">LazyChillRoom</h1>
                        <p style="color: #666; font-size: 16px; margin: 0;">だらだらまったりチャットアプリ</p>
                    </div>
                    
                    <div class="auth-tabs">
                        <button class="auth-tab ${this.currentMode === 'login' ? 'active' : ''}" data-mode="login">
                            ログイン
                        </button>
                        <button class="auth-tab ${this.currentMode === 'register' ? 'active' : ''}" data-mode="register">
                            新規登録
                        </button>
                    </div>
                    
                    <form id="authForm" class="auth-form" style="display: block; margin-top: 20px;">
                        ${this.currentMode === 'register' ? `
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="userId" style="display: block; margin-bottom: 5px;">ユーザーID（半角英数字・アンダーバー・ハイフン、3文字以上）</label>
                                <input type="text" id="userId" name="userId" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;" placeholder="shadow_knight">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="password" style="display: block; margin-bottom: 5px;">パスワード</label>
                                <input type="password" id="password" name="password" required autocomplete="new-password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="confirmPassword" style="display: block; margin-bottom: 5px;">パスワード確認</label>
                                <input type="password" id="confirmPassword" name="confirmPassword" required autocomplete="new-password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="nickname" style="display: block; margin-bottom: 5px;">ニックネーム（日本語入力可）</label>
                                <input type="text" id="nickname" name="nickname" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;" placeholder="夜空の騎士">
                            </div>
                        ` : `
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="loginId" style="display: block; margin-bottom: 5px;">ユーザーID</label>
                                <input type="text" id="loginId" name="loginId" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label for="password" style="display: block; margin-bottom: 5px;">パスワード</label>
                                <input type="password" id="password" name="password" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                            </div>
                        `}
                        
                        <button type="submit" class="auth-submit" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 5px; cursor: pointer;">
                            ${this.currentMode === 'login' ? 'ログイン' : '新規登録'}
                        </button>
                    </form>
                    
                    <div id="authError" class="auth-error" style="display: none;"></div>
                </div>
            </div>
        `;
    }

    // イベントバインド
    bindEvents() {
        // タブ切り替え
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentMode = e.target.dataset.mode;
                this.showAuthScreen();
            });
        });

        // フォーム送信
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleFormSubmit();
        });
    }

    // フォーム送信処理
    async handleFormSubmit() {
        const form = document.getElementById('authForm');
        const formData = new FormData(form);
        
        let loginId, userId, password, confirmPassword, nickname;
        
        if (this.currentMode === 'register') {
            userId = formData.get('userId');
            password = formData.get('password');
            confirmPassword = formData.get('confirmPassword');
            nickname = formData.get('nickname');
            
            // ユーザーIDのバリデーション
            if (!userId || userId.length < 3) {
                this.showError('ユーザーIDは3文字以上で入力してください');
                return;
            }
            
            if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
                this.showError('ユーザーIDは半角英数字・アンダーバー・ハイフンのみで入力してください');
                return;
            }
            
            // パスワード確認
            if (password !== confirmPassword) {
                this.showError('パスワードが一致しません');
                return;
            }
            
            if (password.length < 6) {
                this.showError('パスワードは6文字以上で入力してください');
                return;
            }
            
            // ニックネームのバリデーション
            if (!nickname || nickname.trim().length === 0) {
                this.showError('ニックネームを入力してください');
                return;
            }
        } else {
            loginId = formData.get('loginId');
            password = formData.get('password');
            
            if (!loginId || !password) {
                this.showError('ユーザーIDとパスワードを入力してください');
                return;
            }
        }

        this.showLoading(true);
        this.hideError();

        let result;
        if (this.currentMode === 'login') {
            result = await this.authManager.login(loginId, password);
        } else {
            result = await this.authManager.register(userId, password, nickname);
        }

        this.showLoading(false);

        if (result.success) {
            console.log('認証成功:', result.user);
            // チャット画面へ遷移
            if (window.appLoader) {
                await window.appLoader.showChatView();
            }
        } else {
            this.showError(result.error);
        }
    }

    // エラー表示
    showError(message) {
        const errorElement = document.getElementById('authError');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    // エラー非表示
    hideError() {
        const errorElement = document.getElementById('authError');
        errorElement.style.display = 'none';
    }

    // ローディング表示
    showLoading(show) {
        const submitButton = document.querySelector('.auth-submit');
        if (show) {
            submitButton.disabled = true;
            submitButton.textContent = '処理中...';
        } else {
            submitButton.disabled = false;
            submitButton.textContent = this.currentMode === 'login' ? 'ログイン' : '新規登録';
        }
    }
}

// グローバルインスタンス
window.AuthManager = AuthManager;
window.AuthUI = AuthUI;
