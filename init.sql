-- LazyChillRoom Database Schema for Node.js version

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    nickname VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_username (username),
    INDEX idx_active (is_active),
    INDEX idx_last_activity (last_activity)
);

-- Guilds (Servers) table
CREATE TABLE IF NOT EXISTS guilds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500) DEFAULT NULL,
    owner_id INT NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_owner (owner_id),
    INDEX idx_public (is_public)
);

-- Guild members table
CREATE TABLE IF NOT EXISTS guild_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'member') DEFAULT 'member',
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_guild_user (guild_id, user_id),
    INDEX idx_guild (guild_id),
    INDEX idx_user (user_id),
    INDEX idx_active (is_active)
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NULL, -- DMチャンネルの場合はNULL
    name VARCHAR(100) NOT NULL,
    type ENUM('text', 'voice', 'dm', 'uploader_public', 'uploader_private', 'settings') DEFAULT 'text',
    position INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    INDEX idx_guild (guild_id),
    INDEX idx_type (type),
    INDEX idx_position (position)
);

-- DM participants table (for direct message channels)
CREATE TABLE IF NOT EXISTS dm_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_dm_participant (channel_id, user_id),
    INDEX idx_channel (channel_id),
    INDEX idx_user (user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content TEXT NOT NULL,
    channel_id INT NOT NULL,
    user_id INT NOT NULL,
    reply_to INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL,
    INDEX idx_channel (channel_id),
    INDEX idx_user (user_id),
    INDEX idx_created (created_at),
    INDEX idx_reply (reply_to)
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by INT NOT NULL,
    channel_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    INDEX idx_uploader (uploaded_by),
    INDEX idx_channel (channel_id),
    INDEX idx_created (created_at)
);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    guild_id INT NOT NULL,
    created_by INT NOT NULL,
    uses INT DEFAULT 0,
    max_uses INT DEFAULT NULL,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_code (code),
    INDEX idx_guild (guild_id),
    INDEX idx_creator (created_by),
    INDEX idx_active (is_active)
);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    friend_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_friendship (user_id, friend_id),
    INDEX idx_user (user_id),
    INDEX idx_friend (friend_id),
    INDEX idx_status (status)
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, nickname, password_hash) VALUES 
('admin', '管理者', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewTJwJj7XWyNOvju')
ON DUPLICATE KEY UPDATE username=username;

-- Create default guild
INSERT INTO guilds (name, description, owner_id, is_public) VALUES 
('LazyChillRoom 公式', 'LazyChillRoomの公式サーバーです', 1, TRUE)
ON DUPLICATE KEY UPDATE name=name;

-- Add admin to the guild
INSERT INTO guild_members (guild_id, user_id, role) VALUES 
(1, 1, 'owner')
ON DUPLICATE KEY UPDATE role=role;

-- Create default channels
INSERT INTO channels (guild_id, name, type, position) VALUES 
(1, '一般', 'text', 0),
(1, '雑談', 'text', 1),
(1, '技術', 'text', 2),
(1, '画像', 'text', 3)
ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position), type=VALUES(type);
