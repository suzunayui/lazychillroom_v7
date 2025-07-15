// 通知とUI補助機能クラス
class UIUtils {
    constructor(chatUI) {
        this.chatUI = chatUI;
    }

    // HTMLエスケープ（静的メソッド）
    static escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return '';
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 通知表示
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#43b581' : type === 'error' ? '#f04747' : '#7289da'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: 500;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // アニメーション
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // 自動削除
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // 画像モーダル表示
    showImageModal(imageElement) {
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('imageModalImage');
        const modalFilename = document.getElementById('imageModalFilename');
        const modalSize = document.getElementById('imageModalSize');
        
        if (!modal || !modalImage) return;
        
        // 画像情報を設定
        modalImage.src = imageElement.src;
        modalImage.alt = imageElement.alt;
        
        // ファイル名とサイズを設定
        const filename = imageElement.dataset.filename || 'image';
        const fileSize = parseInt(imageElement.dataset.fileSize) || 0;
        
        modalFilename.textContent = filename;
        modalSize.textContent = fileSize > 0 ? this.chatUI.fileUploadHandler.formatFileSize(fileSize) : '';
        
        // モーダル表示
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // イベントリスナーを一度だけ追加
        this.bindImageModalEvents();
    }

    // 画像モーダルを閉じる
    hideImageModal() {
        const modal = document.getElementById('imageModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // 画像モーダルのイベントバインド
    bindImageModalEvents() {
        const modal = document.getElementById('imageModal');
        const closeBtn = document.getElementById('imageModalClose');
        const overlay = modal?.querySelector('.image-modal-overlay');
        
        if (!modal || modal.dataset.eventsbound) return;
        
        // 閉じるボタン
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideImageModal();
            });
        }
        
        // オーバーレイクリック
        if (overlay) {
            overlay.addEventListener('click', () => {
                this.hideImageModal();
            });
        }
        
        // ESCキー
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                this.hideImageModal();
            }
        });
        
        // イベントが追加済みであることをマーク
        modal.dataset.eventsbound = 'true';
    }

    // ログアウト処理
    logout() {
        if (confirm('ログアウトしますか？')) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            window.location.reload();
        }
    }

    // アクティブ要素の設定
    setActiveServer(serverId) {
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const serverItem = document.querySelector(`[data-server="${serverId}"]`);
        if (serverItem) {
            serverItem.classList.add('active');
        }
    }

    setActiveChannel(channelId) {
        document.querySelectorAll('.channel-item, .dm-user-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const channelItem = document.querySelector(`[data-channel="${channelId}"]`);
        if (channelItem) {
            channelItem.classList.add('active');
        }
    }

    setActiveDM(dmId) {
        document.querySelectorAll('.channel-item, .dm-user-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const dmItem = document.querySelector(`[data-dm="${dmId}"]`);
        if (dmItem) {
            dmItem.classList.add('active');
        }
    }

    // メンバーリスト管理
    showMembersList() {
        const membersSidebar = document.getElementById('membersSidebar');
        if (membersSidebar) {
            membersSidebar.style.display = 'flex';
            membersSidebar.classList.add('show');
        }
    }

    hideMembersList() {
        const membersSidebar = document.getElementById('membersSidebar');
        if (membersSidebar) {
            membersSidebar.style.display = 'none';
            membersSidebar.classList.remove('show');
        }
    }

    updateMembersList(members) {
        const onlineMembers = document.getElementById('onlineMembers');
        const offlineMembers = document.getElementById('offlineMembers');
        const membersCount = document.getElementById('membersCount');
        
        if (!onlineMembers || !offlineMembers || !membersCount) return;

        const online = members.filter(member => member.status === 'online');
        const offline = members.filter(member => member.status === 'offline');

        onlineMembers.innerHTML = UIComponents.createMemberListHTML(online, 'online');
        offlineMembers.innerHTML = UIComponents.createMemberListHTML(offline, 'offline');

        const totalMembers = members.length;
        membersCount.textContent = `メンバー - ${totalMembers}`;

        const onlineSection = document.querySelector('.members-section:first-child .section-title');
        const offlineSection = document.querySelector('.members-section:last-child .section-title');
        
        if (onlineSection) {
            onlineSection.textContent = `オンライン - ${online.length}`;
        }
        if (offlineSection) {
            offlineSection.textContent = `オフライン - ${offline.length}`;
        }
    }

    // 一時的なメッセージ追加
    addTemporaryMessage(content) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageElement = UIComponents.createTemporaryMessage(this.chatUI.currentUser, content);
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// グローバルスコープに登録
window.UIUtils = UIUtils;
