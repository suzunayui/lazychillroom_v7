// メッセージ関連の機能管理クラス
class MessageManager {
    constructor() {
        this.apiBase = 'api';
        this.messages = new Map(); // チャンネルIDをキーとしたメッセージ配列のマップ
        
        // ソケットイベントリスナーを設定
        this.setupSocketListeners();
        
        // 削除ボタンのイベントリスナーを設定
        this.setupDeleteButtonListeners();
    }

    async loadMessages(channelId, limit = 50, before = null) {
        try {
            let url = `${this.apiBase}/messages?channel_id=${channelId}&limit=${limit}`;
            if (before) {
                url += `&before=${before}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            
            if (data.success) {
                console.log('📨 Messages loaded:', data.messages);
                // アバター情報をデバッグ
                data.messages.forEach(msg => {
                    console.log(`📄 Message ${msg.id}: ${msg.username} - avatar: ${msg.avatar_url || 'none'}`);
                });
                
                this.messages.set(channelId, data.messages);
                return data.messages;
            } else {
                console.error('メッセージ読み込みエラー:', data.message);
                return [];
            }
        } catch (error) {
            console.error('メッセージ読み込みエラー:', error);
            return [];
        }
    }

    async sendMessage(channelId, content, type = 'text') {
        try {
            // Socket.ioリアルタイム通信を優先的に使用
            if (window.realtimeManager && window.realtimeManager.getConnectionStatus().isConnected) {
                console.log('Socket.io経由でメッセージを送信');
                window.realtimeManager.sendMessage(channelId, content, type);
                
                // Socket.io経由の場合、レスポンスは非同期で受信される
                // 一時的なローカルメッセージを作成
                const tempMessage = {
                    id: 'temp_' + Date.now(),
                    channel_id: channelId,
                    content: content,
                    type: type,
                    user_id: JSON.parse(localStorage.getItem('currentUser')).id,
                    username: JSON.parse(localStorage.getItem('currentUser')).username,
                    created_at: new Date().toISOString(),
                    is_temporary: true
                };
                
                return { success: true, message: tempMessage };
            } else {
                console.log('HTTP API経由でメッセージを送信（フォールバック）');
                // フォールバック: HTTP API経由
                return await this.sendMessageViaHttp(channelId, content, type);
            }
        } catch (error) {
            console.error('メッセージ送信エラー:', error);
            // エラー時もHTTP APIでリトライ
            return await this.sendMessageViaHttp(channelId, content, type);
        }
    }

    // HTTP API経由でのメッセージ送信（フォールバック）
    async sendMessageViaHttp(channelId, content, type = 'text') {
        try {
            const response = await apiClient.request('/messages', {
                method: 'POST',
                body: {
                    channel_id: channelId,
                    content: content
                    // type フィールドを削除（サーバー側でサポートされていない）
                }
            });
            
            if (response.success) {
                // ローカルメッセージリストに追加
                if (!this.messages.has(channelId)) {
                    this.messages.set(channelId, []);
                }
                this.messages.get(channelId).push(response.message);
                
                return { success: true, message: response.message };
            } else {
                return { success: false, error: response.message };
            }
        } catch (error) {
            console.error('HTTP メッセージ送信エラー:', error);
            return { success: false, error: 'ネットワークエラーが発生しました' };
        }
    }

    async uploadFile(file, channelId, content = '') {
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
                // ローカルメッセージリストに追加
                if (!this.messages.has(channelId)) {
                    this.messages.set(channelId, []);
                }
                this.messages.get(channelId).push(data.message);
                
                return { success: true, message: data.message, fileInfo: data.file };
            } else {
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error('ファイルアップロードエラー:', error);
            return { success: false, error: 'ファイルアップロードに失敗しました' };
        }
    }

    async deleteMessage(messageId) {
        console.log('🗑️ メッセージ削除開始:', messageId);
        
        // 削除確認ダイアログを表示
        let shouldDelete = false;
        
        if (window.notificationManager && typeof window.notificationManager.confirm === 'function') {
            // カスタム確認ダイアログを使用
            console.log('🗑️ カスタム確認ダイアログを使用');
            shouldDelete = await window.notificationManager.confirm('このメッセージを削除しますか？この操作は取り消せません。');
            console.log('🗑️ カスタムダイアログの結果:', shouldDelete);
        } else {
            // フォールバック: ブラウザの標準confirm
            console.log('🗑️ 標準confirmダイアログを使用');
            shouldDelete = confirm('このメッセージを削除しますか？この操作は取り消せません。');
            console.log('🗑️ 標準ダイアログの結果:', shouldDelete);
        }
        
        if (!shouldDelete) {
            console.log('🗑️ メッセージ削除がキャンセルされました');
            return { success: false, error: 'キャンセルされました' };
        }
        
        try {
            console.log('🗑️ API呼び出し開始:', `${this.apiBase}/messages/${messageId}`);
            
            // 直接fetch APIを使用してメッセージを削除
            const response = await fetch(`${this.apiBase}/messages/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            console.log('🗑️ レスポンス受信:', response.status);
            const data = await response.json();
            console.log('🗑️ レスポンスデータ:', data);
            
            if (data.success) {
                // ローカルメッセージリストから削除
                for (let [channelId, messages] of this.messages) {
                    const index = messages.findIndex(msg => msg.id == messageId);
                    if (index !== -1) {
                        messages.splice(index, 1);
                        break;
                    }
                }
                
                // DOMからメッセージ要素を削除
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
                
                // 成功通知を表示
                if (window.notificationManager) {
                    window.notificationManager.success('メッセージが削除されました');
                }
                
                return { success: true, message: data.message };
            } else {
                // エラー通知を表示
                if (window.notificationManager) {
                    window.notificationManager.error(data.message, '削除に失敗しました');
                } else {
                    window.notificationManager?.showNotification('削除に失敗しました: ' + data.message, 'error') 
                        || this.chatUI?.uiUtils?.showNotification('削除に失敗しました: ' + data.message, 'error');
                }
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error('🗑️ メッセージ削除エラー:', error);
            console.error('🗑️ エラースタック:', error.stack);
            
            // エラー通知を表示
            if (window.notificationManager) {
                window.notificationManager.error('ネットワークエラーが発生しました', '削除に失敗しました');
            } else {
                window.notificationManager?.showNotification('削除に失敗しました: ネットワークエラーが発生しました', 'error') 
                    || this.chatUI?.uiUtils?.showNotification('削除に失敗しました: ネットワークエラーが発生しました', 'error')
                    || alert('削除に失敗しました: ネットワークエラーが発生しました'); // 最終フォールバック
            }
            
            return { success: false, error: 'ネットワークエラーが発生しました' };
        }
    }

    renderMessage(message, currentChannel = null) {
        const timestamp = TimeUtils.formatTimestamp(message.created_at);
        
        // ファイル付きメッセージの判定
        const hasFile = message.file_info || message.file_url || message.file_id;
        
        // 画像判定の修正 - mime_typeを直接チェック
        let isImage = false;
        if (hasFile) {
            const mimeType = message.mime_type || (message.file_info && message.file_info.mime_type);
            isImage = mimeType && /^image\//.test(mimeType);
        }
        
        const isFile = hasFile && !isImage;
        
        const isUploaderChannel = currentChannel && (currentChannel.type === 'uploader_public' || currentChannel.type === 'uploader_private');
        
        // デバッグ情報（開発時のみ）
        if (isUploaderChannel && (isImage || isFile)) {
            console.log('Message render debug:', {
                messageId: message.id,
                hasFile,
                isImage,
                isFile,
                fileInfo: message.file_info,
                fileUrl: message.file_url,
                fileName: message.file_name,
                mimeType: message.mime_type,
                channelType: currentChannel?.type
            });
        }
        
        let contentHTML = '';
        let messageTypeIndicator = '';
        
        // アップローダーチャンネルでのメッセージタイプ表示
        if (isUploaderChannel) {
            if (isImage) {
                messageTypeIndicator = '<div class="message-type-indicator">画像ファイル</div>';
            } else if (isFile) {
                messageTypeIndicator = '<div class="message-type-indicator">ファイル</div>';
            } else {
                messageTypeIndicator = '<div class="message-type-indicator">メモ</div>';
            }
        }
        
        if (isImage) {
            const copyButtonHTML = isUploaderChannel && currentChannel.type === 'uploader_public' ? 
                `<button class="copy-url-btn" data-url="${message.file_url}" title="URLをコピー">📋 URLをコピー</button>` : '';
            
            // 画像URLの修正 - APIパスを直接パスに変換
            let imageUrl = message.file_url;
            console.log('Image URL Debug:', {
                originalUrl: imageUrl,
                fileName: message.file_name,
                mimeType: message.mime_type,
                isImage: isImage
            });
            
            // /api/files/xxx を実際のファイルパスに変換
            if (imageUrl && imageUrl.startsWith('/api/files/')) {
                // メッセージからファイル名を取得してuploadsパスを構築
                const fileName = message.file_name || 'unknown';
                imageUrl = `/uploads/files/${fileName}`;
                console.log('Converted to:', imageUrl);
            } else if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
                imageUrl = '/' + imageUrl;
            }
            
            contentHTML = `
                ${messageTypeIndicator}
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
                <div class="message-attachment">
                    <img src="${imageUrl}" 
                         alt="画像" 
                         class="message-image clickable-image"
                         data-filename="${message.file_name || 'image'}"
                         data-file-size="${message.file_size || 0}"
                         onerror="this.style.display='none'; this.nextElementSibling?.style.display='block';"
                         onload="console.log('Image loaded:', '${imageUrl}');"
                         loading="lazy">>
                    <div class="image-load-error" style="display: none; padding: 20px; background: #f04747; color: white; border-radius: 8px; text-align: center;">
                        <span>画像を読み込めませんでした</span><br>
                        <small>URL: ${imageUrl}</small>
                    </div>
                    ${copyButtonHTML}
                </div>
            `;
        } else if (isFile) {
            const copyButtonHTML = isUploaderChannel && currentChannel.type === 'uploader_public' ? 
                `<button class="copy-url-btn" data-url="${message.file_url}" title="URLをコピー">📋 URLをコピー</button>` : '';
            
            contentHTML = `
                ${messageTypeIndicator}
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
                <div class="message-attachment">
                    <a href="${message.file_url}" target="_blank" class="file-attachment">
                        📎 ${message.file_name} (${this.formatFileSize(message.file_size)})
                    </a>
                    ${copyButtonHTML}
                </div>
            `;
        } else {
            contentHTML = `${messageTypeIndicator}<div class="message-text">${this.formatMessageContent(message.content)}</div>`;
        }

        const messageClass = isUploaderChannel ? 
            `message uploader-channel-message ${isImage ? 'image-message' : isFile ? 'file-message' : 'text-message'}` :
            'message';

        // 現在のユーザーかどうかを確認
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const isOwnMessage = currentUser && currentUser.id && message.user_id == currentUser.id;
        
        // 削除ボタンを作成（自分のメッセージのみ）
        const deleteButton = isOwnMessage ? 
            `<button class="message-delete-btn" title="メッセージを削除" data-message-id="${message.id}">🗑️</button>` : '';

        // 編集済みマーカー
        const editedMark = message.created_at !== message.updated_at ? 
            '<span class="edited-mark" title="編集済み">(編集済み)</span>' : '';

        return `
            <div class="${messageClass}" 
                 data-message-id="${message.id}" 
                 data-channel-id="${message.channel_id}"
                 data-user-id="${message.user_id}"
                 data-is-own="${isOwnMessage}"
                 oncontextmenu="messageManager.showContextMenu(event, ${message.id}, ${message.channel_id}, ${isOwnMessage})">
                <div class="message-avatar" style="background-color: ${this.getAvatarColor(message.user_id)};">
                    ${this.getAvatarContent(message)}
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">${message.username}</span>
                        <span class="message-timestamp">${timestamp}</span>
                        ${editedMark}
                        ${deleteButton}
                    </div>
                    ${contentHTML}
                </div>
            </div>
        `;
    }

    // アバターの表示内容を取得
    getAvatarContent(message) {
        // デバッグ情報
        console.log('🔍 Message avatar debug:', {
            user_id: message.user_id,
            username: message.username,
            avatar_url: message.avatar_url,
            message_id: message.id
        });
        
        // 現在ログインしているユーザーの情報を取得
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        console.log('🔍 Current user:', currentUser);
        
        // まず、メッセージにアバターURL情報がある場合はそれを使用
        if (message.avatar_url) {
            console.log('✓ Using message avatar_url:', message.avatar_url);
            return `<img src="${message.avatar_url}?t=${Date.now()}" alt="${message.username}" class="avatar-img">`;
        }
        
        // メッセージにアバターがない場合で、自分のメッセージなら自分のアバターを使用
        if (currentUser && currentUser.id && 
            String(message.user_id) === String(currentUser.id) && 
            currentUser.avatar_url) {
            console.log('✓ Using current user avatar for own message (fallback)');
            return `<img src="${currentUser.avatar_url}?t=${Date.now()}" alt="${message.username}" class="avatar-img">`;
        }
        
        // デフォルトは文字のプレースホルダー
        console.log('⚠️ Using text placeholder for:', message.username);
        return message.username.charAt(0).toUpperCase();
    }

    formatMessageContent(content) {
        // contentがnullまたはundefinedの場合は空文字列を返す
        if (!content) {
            return '';
        }
        
        // URLをリンクに変換
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        content = content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // 改行を<br>に変換
        content = content.replace(/\n/g, '<br>');
        
        // メンション（@username）のハイライト
        const mentionRegex = /@(\w+)/g;
        content = content.replace(mentionRegex, '<span class="mention">@$1</span>');
        
        return content;
    }

    getAvatarColor(userId) {
        const colors = [
            '#7289da', '#43b581', '#faa61a', '#f04747', 
            '#9c84ef', '#f47fff', '#00d9ff', '#7289da'
        ];
        return colors[userId % colors.length];
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // メッセージ編集機能
    async editMessage(messageId, newContent) {
        try {
            const response = await fetch(`${this.apiBase}/messages/${messageId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ content: newContent })
            });

            const data = await response.json();
            if (data.success) {
                console.log('✅ メッセージ編集成功:', data.message);
                return data.message;
            } else {
                console.error('❌ メッセージ編集エラー:', data.message);
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('❌ メッセージ編集エラー:', error);
            throw error;
        }
    }

    // メッセージピン留め機能
    async pinMessage(channelId, messageId) {
        try {
            const response = await fetch(`${this.apiBase}/pins/${channelId}/${messageId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            if (data.success) {
                console.log('📌 メッセージピン留め成功:', data.pinned_message);
                return data.pinned_message;
            } else {
                console.error('❌ メッセージピン留めエラー:', data.message);
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('❌ メッセージピン留めエラー:', error);
            throw error;
        }
    }

    // メッセージピン留め解除機能
    async unpinMessage(channelId, messageId) {
        try {
            const response = await fetch(`${this.apiBase}/pins/${channelId}/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            if (data.success) {
                console.log('📌 メッセージピン留め解除成功');
                return true;
            } else {
                console.error('❌ メッセージピン留め解除エラー:', data.message);
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('❌ メッセージピン留め解除エラー:', error);
            throw error;
        }
    }

    // ピン留めメッセージ一覧取得
    async getPinnedMessages(channelId) {
        try {
            const response = await fetch(`${this.apiBase}/pins/${channelId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            const data = await response.json();
            if (data.success) {
                console.log('📌 ピン留めメッセージ取得成功:', data.pinned_messages);
                return data.pinned_messages;
            } else {
                console.error('❌ ピン留めメッセージ取得エラー:', data.message);
                return [];
            }
        } catch (error) {
            console.error('❌ ピン留めメッセージ取得エラー:', error);
            return [];
        }
    }

    addMessage(message, currentChannel = null) {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.insertAdjacentHTML('beforeend', this.renderMessage(message, currentChannel));
            this.scrollToBottom();
        }
    }

    clearMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    }

    renderMessages(messages, currentChannel = null) {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer && messages) {
            messagesContainer.innerHTML = messages.map(msg => this.renderMessage(msg, currentChannel)).join('');
            this.scrollToBottom();
        }
    }

    // メッセージコンテキストメニュー
    showContextMenu(event, messageId, channelId, isOwnMessage) {
        event.preventDefault();
        
        // 既存のコンテキストメニューを削除
        const existingMenu = document.querySelector('.message-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'message-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
        menu.style.zIndex = '10000';

        let menuHTML = `
            <div class="context-menu-item" onclick="messageManager.copyMessage(${messageId})">
                📋 メッセージをコピー
            </div>
            <div class="context-menu-item" onclick="messageManager.replyToMessage(${messageId})">
                💬 返信
            </div>
        `;

        // 管理者権限またはメッセージ作成者の場合のみ
        if (isOwnMessage) {
            menuHTML += `
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="messageManager.startEdit(${messageId})">
                    ✏️ 編集
                </div>
                <div class="context-menu-item" onclick="messageManager.deleteMessage(${messageId})">
                    🗑️ 削除
                </div>
            `;
        }

        // 管理者の場合はピン留め機能を追加
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        // 実際の権限を確認（最初のユーザー（ID=1）またはギルドオーナーの場合）
        const isAdmin = currentUser.id === 1 || isOwnMessage; // 暫定的な判定
        if (isAdmin) {
            menuHTML += `
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="messageManager.pinMessage(${channelId}, ${messageId})">
                    📌 ピン留め
                </div>
            `;
        }

        menu.innerHTML = menuHTML;
        document.body.appendChild(menu);

        // メニュー外をクリックしたら閉じる
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    // メッセージ編集開始
    startEdit(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const contentElement = messageElement.querySelector('.message-text');
        if (!contentElement) return;

        const currentContent = contentElement.textContent;
        
        // 編集フォームを作成
        const editForm = document.createElement('div');
        editForm.className = 'message-edit-form';
        editForm.innerHTML = `
            <textarea class="message-edit-input" placeholder="メッセージを編集...">${currentContent}</textarea>
            <div class="message-edit-actions">
                <button class="btn btn-sm btn-primary" onclick="messageManager.saveEdit(${messageId})">保存</button>
                <button class="btn btn-sm btn-secondary" onclick="messageManager.cancelEdit(${messageId})">キャンセル</button>
            </div>
        `;

        // 元のコンテンツを隠してフォームを表示
        contentElement.style.display = 'none';
        contentElement.parentNode.insertBefore(editForm, contentElement.nextSibling);

        // テキストエリアにフォーカス
        const textarea = editForm.querySelector('.message-edit-input');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // Enterキーで保存、Escapeキーでキャンセル
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.saveEdit(messageId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEdit(messageId);
            }
        });
    }

    // メッセージ編集保存
    async saveEdit(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const editForm = messageElement.querySelector('.message-edit-form');
        const textarea = editForm.querySelector('.message-edit-input');
        const newContent = textarea.value.trim();

        if (!newContent) {
            window.uiUtils?.showNotification('メッセージ内容を入力してください', 'error');
            return;
        }

        try {
            const updatedMessage = await this.editMessage(messageId, newContent);
            
            // UI更新は socket.io経由で受信される
            window.uiUtils?.showNotification('メッセージを編集しました', 'success');
            
        } catch (error) {
            console.error('メッセージ編集エラー:', error);
            window.uiUtils?.showNotification('メッセージの編集に失敗しました', 'error');
        }
    }

    // メッセージ編集キャンセル
    cancelEdit(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const contentElement = messageElement.querySelector('.message-text');
        const editForm = messageElement.querySelector('.message-edit-form');

        if (contentElement && editForm) {
            contentElement.style.display = '';
            editForm.remove();
        }
    }

    // メッセージコピー
    copyMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const contentElement = messageElement.querySelector('.message-text');
        if (!contentElement) return;

        const text = contentElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            window.uiUtils?.showNotification('メッセージをコピーしました', 'success');
        }).catch(() => {
            window.uiUtils?.showNotification('コピーに失敗しました', 'error');
        });
    }

    // メッセージ返信
    replyToMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const messageInput = document.getElementById('messageInput');
        if (!messageInput) return;

        // 返信情報を設定
        const username = messageElement.querySelector('.message-author').textContent;
        const replyIndicator = document.querySelector('.reply-indicator');
        
        if (replyIndicator) {
            replyIndicator.style.display = 'block';
            replyIndicator.innerHTML = `
                <span>💬 ${username} に返信中</span>
                <button onclick="messageManager.cancelReply()">✕</button>
            `;
        }

        // 返信データを保存
        messageInput.dataset.replyTo = messageId;
        messageInput.focus();
    }

    // 返信キャンセル
    cancelReply() {
        const messageInput = document.getElementById('messageInput');
        const replyIndicator = document.querySelector('.reply-indicator');
        
        if (messageInput) {
            delete messageInput.dataset.replyTo;
        }
        
        if (replyIndicator) {
            replyIndicator.style.display = 'none';
        }
    }

    // ソケットイベントリスナーを設定
    setupSocketListeners() {
        console.log('🔌 ソケットリスナー設定開始');
        if (window.socketManager) {
            console.log('🔌 SocketManagerが利用可能');
            // メッセージ削除イベントのリスナー
            window.socketManager.on('message_deleted', (data) => {
                console.log('ソケット経由でメッセージ削除を受信:', data);
                this.handleMessageDeleted(data);
            });
        } else {
            console.log('⚠️ SocketManagerが利用できません - 後で再試行します');
            // SocketManagerが後で利用可能になった場合のために遅延設定
            setTimeout(() => {
                if (window.socketManager && !this.socketListenersSetup) {
                    this.setupSocketListeners();
                    this.socketListenersSetup = true;
                }
            }, 1000);
        }
    }

    // メッセージ削除イベントの処理
    handleMessageDeleted(data) {
        const { messageId, channelId } = data;
        
        // ローカルメッセージリストから削除
        if (this.messages.has(channelId)) {
            const messages = this.messages.get(channelId);
            const index = messages.findIndex(msg => msg.id == messageId);
            if (index !== -1) {
                messages.splice(index, 1);
            }
        }
        
        // DOMからメッセージ要素を削除
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    // 削除ボタンのイベントリスナーを設定
    setupDeleteButtonListeners() {
        // 削除ボタンのクリックイベントを委譲で処理
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('message-delete-btn')) {
                console.log('🗑️ 削除ボタンがクリックされました');
                const messageId = event.target.getAttribute('data-message-id');
                console.log('🗑️ メッセージID:', messageId);
                console.log('🗑️ MessageManagerインスタンス:', this);
                
                if (messageId) {
                    // thisコンテキストを確実に保持
                    this.deleteMessage(parseInt(messageId)).catch(error => {
                        console.error('🗑️ 削除処理でエラー:', error);
                    });
                } else {
                    console.error('❌ メッセージIDが見つかりません');
                }
            }
        });
    }
}

// グローバルスコープに登録
window.MessageManager = MessageManager;
