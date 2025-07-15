const express = require('express');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  userId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(30).required().messages({
    'string.pattern.base': 'ユーザーIDは半角英数字・アンダーバー・ハイフンのみで入力してください',
    'string.min': 'ユーザーIDは3文字以上で入力してください',
    'string.max': 'ユーザーIDは30文字以内で入力してください'
  }),
  nickname: Joi.string().min(1).max(50).required().messages({
    'string.min': 'ニックネームを入力してください',
    'string.max': 'ニックネームは50文字以内で入力してください'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'パスワードは6文字以上で入力してください'
  })
});

const loginSchema = Joi.object({
  userId: Joi.string().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { userId, nickname, password } = value;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = ?',
      [userId]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'このユーザーIDは既に使用されています'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Use transaction to create user, personal server, and add to default guild
    const newUserId = await transaction(async (connection) => {
      // Create user
      const [userResult] = await connection.execute(
        'INSERT INTO users (username, nickname, password_hash, created_at) VALUES (?, ?, ?, NOW())',
        [userId, nickname, hashedPassword]
      );

      const userId_new = userResult.insertId;

      // Create personal server (マイサーバー)
      const [personalServerResult] = await connection.execute(
        'INSERT INTO guilds (name, description, owner_id, is_public, created_at) VALUES (?, ?, ?, ?, NOW())',
        [`${nickname}のマイサーバー`, '個人用サーバーです', userId_new, false]
      );

      const personalServerId = personalServerResult.insertId;

      // Add user as owner of personal server
      await connection.execute(
        'INSERT INTO guild_members (guild_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
        [personalServerId, userId_new, 'owner']
      );

      // Create default channels for personal server
      const channels = [
        { name: '公開', type: 'text', position: 0 },
        { name: '非公開', type: 'text', position: 1 },
        { name: '設定', type: 'text', position: 2 }
      ];

      for (const channel of channels) {
        await connection.execute(
          'INSERT INTO channels (guild_id, name, type, position, created_at) VALUES (?, ?, ?, ?, NOW())',
          [personalServerId, channel.name, channel.type, channel.position]
        );
      }

      // Add user to default guild (LazyChillRoom 公式)
      try {
        await connection.execute(
          'INSERT INTO guild_members (guild_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
          [1, userId_new, 'member']
        );
      } catch (guildError) {
        console.error('デフォルトギルドへの追加に失敗:', guildError);
        // デフォルトギルドが存在しない場合はスキップ
      }

      console.log(`新規ユーザー ${userId} (ID: ${userId_new}) とマイサーバー (ID: ${personalServerId}) を作成しました`);
      
      return userId_new;
    });

    // Generate token
    const token = generateToken(newUserId);

    // Get user data (without password)
    const userData = await query(
      'SELECT id, username, nickname, avatar_url, created_at FROM users WHERE id = ?',
      [newUserId]
    );

    res.status(201).json({
      success: true,
      message: 'ユーザー登録が完了しました',
      token,
      user: userData[0]
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { userId, password } = value;

    // Find user
    const users = await query(
      'SELECT id, username, nickname, password_hash, avatar_url, created_at FROM users WHERE username = ? AND is_active = 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '認証情報が正しくありません'
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '認証情報が正しくありません'
      });
    }

    // Update last login
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    // Remove password hash from user data
    delete user.password_hash;

    res.json({
      success: true,
      message: 'ログインしました',
      token,
      user
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '認証トークンが必要です'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await query(
      'SELECT id, username, nickname, avatar_url, created_at FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (!user || user.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    res.json({
      success: true,
      user: user[0]
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: '無効なトークンです'
    });
  }
});

module.exports = router;
