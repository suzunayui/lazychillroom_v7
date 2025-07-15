// アプリケーションメインエントリーポイント
class AppLoader {
    constructor() {
        this.loadedScripts = new Set();
        this.loadingPromises = new Map();
        this.app = null;
    }

    // CSSファイルを動的に読み込む
    async loadCSS(href) {
        return new Promise((resolve, reject) => {
            // 既に読み込まれているかチェック
            const existingLink = document.querySelector(`link[href="${href}"]`);
            if (existingLink) {
                resolve();
                return;
            }

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
            document.head.appendChild(link);
        });
    }

    // JavaScriptファイルを動的に読み込む
    async loadScript(src) {
        if (this.loadedScripts.has(src)) {
            console.log(`📋 Already loaded: ${src}`);
            return Promise.resolve();
        }

        if (this.loadingPromises.has(src)) {
            console.log(`⏳ Already loading: ${src}`);
            return this.loadingPromises.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            
            script.onload = () => {
                this.loadedScripts.add(src);
                console.log(`✓ Successfully loaded: ${src}`);
                resolve();
            };
            
            script.onerror = (error) => {
                console.error(`✗ Failed to load script: ${src}`);
                console.error(`Error event:`, error);
                console.error(`Script element:`, script);
                console.error(`Script src:`, script.src);
                
                // HTTPステータスをチェック（可能であれば）
                fetch(src, { method: 'HEAD' })
                    .then(response => {
                        console.error(`HTTP status for ${src}:`, response.status);
                        if (!response.ok) {
                            console.error(`HTTP error: ${response.status} ${response.statusText}`);
                        }
                    })
                    .catch(fetchError => {
                        console.error(`Fetch error for ${src}:`, fetchError);
                    })
                    .finally(() => {
                        reject(new Error(`Failed to load script: ${src} - Check console for details`));
                    });
            };
            
            console.log(`📥 Starting to load: ${src}`);
            document.head.appendChild(script);
        });

        this.loadingPromises.set(src, promise);
        return promise;
    }

    // 複数のスクリプトを順次読み込む
    async loadScripts(scripts) {
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i];
            try {
                this.updateLoadingProgress(i + 1, scripts.length, `${script}を読み込み中...`);
                console.log(`📥 Loading script: ${script}`);
                
                // タイムアウト付きでスクリプトを読み込み
                await Promise.race([
                    this.loadScript(script),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`Timeout loading ${script}`)), 10000)
                    )
                ]);
                
                console.log(`✓ Loaded: ${script}`);
            } catch (error) {
                console.error(`✗ Failed to load: ${script}`, error);
                
                // auth.jsの読み込み失敗の場合は特別処理
                if (script.includes('auth.js')) {
                    console.error('認証モジュールの読み込みに失敗しました。代替処理を実行します。');
                    // 代替として最小限の認証管理を提供
                    this.createFallbackAuth();
                    continue;
                }
                
                throw error;
            }
        }
        console.log('✓ すべてのJavaScriptファイルの読み込みが完了しました');
    }

    // アプリケーションの初期化
    async init() {
        try {
            // ローディング表示
            this.showLoading();

            // メインCSSファイルを読み込み（すべてのスタイルが含まれる）
            const cssFiles = [
                'css/main.css',       // 統合されたメインCSSファイル
                'css/modals.css',     // モーダル用CSS
                'css/auth.css',       // 認証画面用CSS
                'css/auth-layout.css' // 認証レイアウト用CSS
            ];

            console.log('CSS読み込み開始...');
            for (const css of cssFiles) {
                try {
                    await this.loadCSS(css);
                    console.log(`✓ CSS Loaded: ${css}`);
                } catch (error) {
                    console.error(`✗ Failed to load CSS: ${css}`, error);
                    // CSSの読み込み失敗は致命的でないので続行
                    console.warn(`CSS読み込み失敗のため、フォールバック処理を実行します`);
                }
            }

            console.log('CSS読み込み完了、JavaScript読み込み開始...');

            // 必要なスクリプトを順序良く読み込み
            const scripts = [
                'js/SocketManager.js',             // Socket.io管理
                'js/utils/TimeUtils.js',           // ユーティリティ（最初）
                'js/utils/NotificationManager.js', // 通知システム
                'js/ui/UIComponents.js',           // UI部品
                'js/managers/MessageManager.js',   // メッセージ管理
                'js/managers/ChatManager.js',      // チャット管理
                'js/managers/ChannelManager.js',   // チャンネル管理
                'js/managers/TypingManager.js',    // タイピング管理
                'js/managers/DMManager.js',        // DM管理
                'js/managers/ReactionManager.js',  // リアクション管理
                'js/managers/PresenceManager.js',  // プレゼンス管理
                'js/realtime.js',                  // リアルタイム通信機能
                // UI専門ハンドラー
                'js/ui/StateManager.js',           // 状態管理
                'js/ui/SettingsHandler.js',        // 設定ハンドラー
                'js/ui/FileUploadHandler.js',      // ファイルアップロード
                'js/ui/ServerManager.js',          // サーバー管理
                'js/ui/UIUtils.js',                // UI共通機能
                'js/ui/EventHandler.js',           // イベント処理
                'js/ui/ChatUI.js',                 // チャット画面UI（メイン）
                'js/auth.js',                      // 認証機能
                'js/api.js',                       // API通信
                'js/settings.js'                   // 設定機能（最後）
            ];

            await this.loadScripts(scripts);

            // クラスの存在を確認
            this.validateRequiredClasses();

            // ログイン状態をチェックして適切な画面を表示
            await this.checkAuthAndInitialize();

        } catch (error) {
            console.error('アプリケーションの初期化に失敗しました:', error);
            this.showError('アプリケーションの読み込みに失敗しました。ページを再読み込みしてください。');
        } finally {
            // 初期化が成功・失敗に関わらず、ローディングを非表示
            // ただし、少し遅延させて認証画面の表示を完了させる
            setTimeout(() => {
                this.hideLoading();
            }, 100);
        }
    }

    // 必要なクラスの存在を確認
    validateRequiredClasses() {
        const requiredClasses = [
            'TimeUtils',
            'NotificationManager',
            'MessageManager', 
            'ChatManager',
            'ChannelManager',
            'TypingManager',
            'DMManager',
            'ReactionManager',
            'UIComponents',
            'StateManager',
            'SettingsHandler',
            'FileUploadHandler',
            'ServerManager',
            'UIUtils',
            'EventHandler',
            'ChatUI',
            'AuthManager',
            'AuthUI'
        ];

        // リアルタイム通信関連のグローバルオブジェクト
        const requiredGlobals = [
            'socketManager',
            'realtimeManager'
        ];

        console.log('=== クラス検証開始 ===');
        console.log('利用可能なクラス:', Object.keys(window).filter(key => typeof window[key] === 'function'));

        const missingClasses = [];
        const existingClasses = [];

        requiredClasses.forEach(className => {
            if (typeof window[className] === 'undefined') {
                missingClasses.push(className);
                console.error(`❌ クラスが見つかりません: ${className}`);
            } else {
                existingClasses.push(className);
                console.log(`✅ クラス確認: ${className}`);
            }
        });

        const missingGlobals = [];
        const existingGlobals = [];

        requiredGlobals.forEach(globalName => {
            if (typeof window[globalName] === 'undefined') {
                missingGlobals.push(globalName);
                console.error(`❌ グローバル変数が見つかりません: ${globalName}`);
            } else {
                existingGlobals.push(globalName);
                console.log(`✅ グローバル変数確認: ${globalName}`);
            }
        });

        const allMissing = [...missingClasses, ...missingGlobals];

        if (allMissing.length > 0) {
            console.warn(`一部のクラス/グローバル変数が見つかりません: ${allMissing.join(', ')}`);
            console.log('これらは後で初期化される可能性があります');
        }

        console.log('✓ 基本的なクラスとグローバル変数の確認が完了しました');
    }

    // ログイン状態をチェックして適切な画面を初期化
    async checkAuthAndInitialize() {
        const authToken = localStorage.getItem('authToken');
        const currentUser = localStorage.getItem('currentUser');

        console.log('認証状態確認開始...');
        console.log('authToken exists:', !!authToken);
        console.log('currentUser exists:', !!currentUser);

        if (authToken && currentUser) {
            console.log('保存されたログイン情報を発見...');
            
            try {
                // トークンの有効性を確認
                const result = await this.validateAuthToken(authToken);
                
                if (result.success) {
                    console.log('✓ ログイン状態が有効です。チャット画面を表示します。');
                    await this.showChatView();
                    return;
                } else {
                    console.log('⚠️ ログイン状態が無効です。認証画面を表示します。');
                    // 無効なトークンをクリア
                    apiClient.removeToken();
                    localStorage.removeItem('currentUser');
                }
            } catch (error) {
                console.error('ログイン状態の確認に失敗:', error);
                console.error('Error details:', error.message, error.stack);
                // エラー時もトークンをクリア
                apiClient.removeToken();
                localStorage.removeItem('currentUser');
            }
        } else {
            console.log('ログイン情報が存在しません');
        }

        // ログインしていない場合は認証画面を表示
        console.log('認証画面を表示中...');
        if (typeof AuthUI !== 'undefined') {
            try {
                this.app = new AuthUI();
                this.app.showAuthScreen(); // 認証画面を実際に表示
                console.log('✓ 認証画面が正常に初期化されました');
                
                // デバッグ: 実際にHTMLが設定されているかチェック
                const appContainer = document.getElementById('app');
                if (appContainer) {
                    console.log('App container content length:', appContainer.innerHTML.length);
                    console.log('Contains auth-container:', appContainer.innerHTML.includes('auth-container'));
                    if (appContainer.innerHTML.length < 100) {
                        console.warn('App containerのコンテンツが短すぎます:', appContainer.innerHTML);
                    }
                }
            } catch (error) {
                console.error('AuthUI初期化エラー:', error);
                this.showError('認証画面の初期化に失敗しました: ' + error.message);
            }
        } else {
            console.error('AuthUIクラスが見つかりません');
            this.showError('認証システムが正常に読み込まれませんでした。ページを再読み込みしてください。');
        }
    }

    // トークンの有効性を確認
    async validateAuthToken(token) {
        try {
            console.log('トークン検証開始...');
            
            // ApiClientのトークンを最新の状態に更新
            apiClient.reloadToken();
            
            const result = await apiClient.verifyToken();
            
            if (result.success) {
                console.log('トークン検証成功:', result.user);
                return { success: true, user: result.user };
            } else {
                console.log('トークン検証失敗:', result.message);
                return { success: false, message: result.message };
            }
        } catch (error) {
            console.error('トークン検証エラー:', error);
            return { success: false, message: error.message };
        }
    }

    // ローディング画面を表示
    showLoading() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }

        // ローディング用のインラインスタイルを追加（フォールバック）
        if (!document.getElementById('loading-styles')) {
            const style = document.createElement('style');
            style.id = 'loading-styles';
            style.innerHTML = `
                .loading-screen {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                }

                .loading-content {
                    text-align: center;
                    color: white;
                }

                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(255,255,255,0.3);
                    border-top: 4px solid white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px auto;
                }

                .loading-text {
                    font-size: 16px;
                    font-weight: 500;
                }

                .loading-bar {
                    width: 200px;
                    height: 4px;
                    background: rgba(255,255,255,0.3);
                    border-radius: 2px;
                    margin: 10px auto;
                    overflow: hidden;
                }

                .loading-bar-progress {
                    height: 100%;
                    background: white;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ローディング画面を非表示
    hideLoading() {
        // 進捗表示をクリア
        this.clearLoadingProgress();
        
        const loadingStyles = document.getElementById('loading-styles');
        if (loadingStyles) {
            loadingStyles.remove();
        }
        
        // ローディング画面を非表示
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // app要素を表示する
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.style.display = 'block';
        }
        
        console.log('✓ ローディング画面を完全に非表示にしました');
    }

    // エラー画面を表示
    showError(message) {
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = `
            <div class="error-screen">
                <div class="error-icon">⚠️</div>
                <div class="error-title">読み込みエラー</div>
                <div class="error-message">${message}</div>
                <button onclick="location.reload()" class="btn" style="margin-top: 20px; padding: 10px 20px; background-color: #7289da; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ページを再読み込み
                </button>
            </div>
        `;
        
        // app要素を表示
        appContainer.style.display = 'block';
    }

    // チャット画面を表示
    async showChatView() {
        try {
            console.log('チャット画面を初期化中...');
            
            // NotificationManagerを初期化（まだ存在しない場合）
            if (!window.notificationManager) {
                window.notificationManager = new NotificationManager();
            }
            
            // Socket.io接続を初期化
            const token = localStorage.getItem('auth_token');
            if (token && window.socketManager) {
                try {
                    console.log('Socket.io接続を初期化中...');
                    await window.socketManager.connect(token);
                    window.socketManager.setupAllEvents();
                    console.log('✓ Socket.io接続が完了しました');
                } catch (error) {
                    console.error('Socket.io接続に失敗:', error);
                    // Socket.io接続に失敗してもチャット画面は表示
                }
            }
            
            const chatUI = new ChatUI();
            await chatUI.init();
            this.app = chatUI;
            console.log('✓ チャット画面が正常に初期化されました');
        } catch (error) {
            console.error('チャット画面の初期化に失敗:', error);
            this.showError('チャット画面の初期化に失敗しました: ' + error.message);
        }
    }

    // アプリケーションのインスタンスを取得
    getApp() {
        return this.app;
    }

    // ローディング進捗を更新
    updateLoadingProgress(current, total, text) {
        const loadingText = document.querySelector('.loading-text');
        const loadingBar = document.querySelector('.loading-bar');
        
        if (loadingText) {
            loadingText.textContent = text || `読み込み中... (${current}/${total})`;
        }
        
        if (loadingBar) {
            const percentage = (current / total) * 100;
            loadingBar.style.width = `${percentage}%`;
        }
        
        // デバッグログ
        console.log(`📊 Progress: ${current}/${total} - ${text}`);
    }

    // 読み込み進捗をクリア
    clearLoadingProgress() {
        const loadingText = document.querySelector('.loading-text');
        const loadingBar = document.querySelector('.loading-bar');
        
        if (loadingText) {
            loadingText.textContent = '';
        }
        
        if (loadingBar) {
            loadingBar.style.width = '0%';
        }
        
        console.log('📊 Loading progress cleared');
    }

    // auth.js読み込み失敗時のフォールバック認証
    createFallbackAuth() {
        console.log('フォールバック認証モジュールを作成中...');
        
        // 最小限のAuthManagerクラスを定義
        window.AuthManager = class FallbackAuthManager {
            constructor() {
                this.apiBase = '/api';
                this.currentUser = null;
                this.token = localStorage.getItem('auth_token');
                console.log('フォールバックAuthManager初期化完了');
            }

            async checkAuthStatus() {
                return false;
            }

            async login() {
                return { success: false, error: 'フォールバック認証：完全な認証機能を読み込めませんでした' };
            }

            async register() {
                return { success: false, error: 'フォールバック認証：完全な認証機能を読み込めませんでした' };
            }

            logout() {
                apiClient.removeToken();
                localStorage.removeItem('currentUser');
            }
        };

        // 最小限のAuthUIクラスを定義
        window.AuthUI = class FallbackAuthUI {
            constructor() {
                this.authManager = new window.AuthManager();
                this.init();
            }

            init() {
                this.render();
            }

            render() {
                const app = document.getElementById('app');
                app.innerHTML = `
                    <div style="text-align: center; padding: 50px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <h1 style="color: #e74c3c;">認証システムエラー</h1>
                        <p style="margin: 20px 0;">認証システムの読み込みに失敗しました。</p>
                        <p style="margin: 20px 0;">ページを再読み込みしてもう一度お試しください。</p>
                        <button onclick="location.reload()" style="padding: 12px 24px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                            再読み込み
                        </button>
                    </div>
                `;
            }
        };

        console.log('フォールバック認証モジュールを作成完了');
    }
}

// アプリケーションローダーのインスタンス作成と初期化
window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 アプリケーション開始...');
    
    const appLoader = new AppLoader();
    window.appLoader = appLoader;
    
    try {
        await appLoader.init();
    } catch (error) {
        console.error('致命的エラー:', error);
    }
});

// グローバルスコープに登録（他のスクリプトからアクセス可能）
window.app = {
    showChatView: async () => {
        if (window.appLoader) {
            await window.appLoader.showChatView();
        }
    }
};