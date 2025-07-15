const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Validation schemas
const guildSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  is_public: Joi.boolean().default(false)
});

// Get user's guilds
router.get('/', async (req, res) => {
  try {
    const guilds = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.icon_url,
        g.is_public,
        g.created_at,
        gm.role,
        gm.joined_at
      FROM guilds g
      JOIN guild_members gm ON g.id = gm.guild_id
      WHERE gm.user_id = ? AND gm.is_active = 1
      ORDER BY gm.joined_at ASC
    `, [req.user.id]);

    res.json({
      success: true,
      guilds
    });

  } catch (error) {
    console.error('Get guilds error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーリストの取得に失敗しました'
    });
  }
});

// Get user's personal server (マイサーバー)
router.get('/my-server', async (req, res) => {
  try {
    // Find user's personal server (where they are owner and it's their personal server)
    const personalServers = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.icon_url,
        g.is_public,
        g.created_at,
        gm.role,
        gm.joined_at
      FROM guilds g
      JOIN guild_members gm ON g.id = gm.guild_id
      WHERE gm.user_id = ? AND gm.role = 'owner' AND gm.is_active = 1
      AND g.name LIKE '%のマイサーバー'
      ORDER BY g.created_at ASC
      LIMIT 1
    `, [req.user.id]);

    if (personalServers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'マイサーバーが見つかりません'
      });
    }

    const personalServer = personalServers[0];

    // Get channels for personal server
    const channels = await query(`
      SELECT id, name, type, position, created_at
      FROM channels 
      WHERE guild_id = ? 
      ORDER BY position ASC, created_at ASC
    `, [personalServer.id]);

    res.json({
      success: true,
      server: {
        ...personalServer,
        channels,
        is_personal_server: true
      }
    });

  } catch (error) {
    console.error('Get personal server error:', error);
    res.status(500).json({
      success: false,
      message: 'マイサーバーの取得に失敗しました'
    });
  }
});

// Create guild details
router.get('/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is member of this guild
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このサーバーにアクセスする権限がありません'
      });
    }

    // Get guild info
    const guilds = await query(
      'SELECT id, name, description, icon_url, is_public, created_at FROM guilds WHERE id = ?',
      [guildId]
    );

    if (guilds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'サーバーが見つかりません'
      });
    }

    // Get channels
    const channels = await query(`
      SELECT id, name, type, position, created_at
      FROM channels 
      WHERE guild_id = ? 
      ORDER BY position ASC, created_at ASC
    `, [guildId]);

    // Get members
    const members = await query(`
      SELECT 
        u.id,
        u.username,
        u.nickname,
        u.avatar_url,
        gm.role,
        gm.joined_at
      FROM users u
      JOIN guild_members gm ON u.id = gm.user_id
      WHERE gm.guild_id = ? AND gm.is_active = 1
      ORDER BY gm.role DESC, u.nickname ASC
    `, [guildId]);

    res.json({
      success: true,
      guild: {
        ...guilds[0],
        channels,
        members,
        userRole: memberCheck[0].role
      }
    });

  } catch (error) {
    console.error('Get guild details error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバー情報の取得に失敗しました'
    });
  }
});

// Create new guild
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error, value } = guildSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { name, description, is_public } = value;

    // Create guild and add creator as owner in a transaction
    const result = await transaction(async (connection) => {
      // Create guild
      const [guildResult] = await connection.execute(
        'INSERT INTO guilds (name, description, is_public, owner_id, created_at) VALUES (?, ?, ?, ?, NOW())',
        [name, description || null, is_public, req.user.id]
      );

      const guildId = guildResult.insertId;

      // Add creator as owner member
      await connection.execute(
        'INSERT INTO guild_members (guild_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
        [guildId, req.user.id, 'owner']
      );

      // Create default general channel
      await connection.execute(
        'INSERT INTO channels (guild_id, name, type, position, created_at) VALUES (?, ?, ?, ?, NOW())',
        [guildId, 'general', 'text', 0]
      );

      return guildId;
    });

    // Get the created guild with channels
    const guild = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.icon_url,
        g.is_public,
        g.created_at
      FROM guilds g
      WHERE g.id = ?
    `, [result]);

    const channels = await query(
      'SELECT id, name, type, position, created_at FROM channels WHERE guild_id = ? ORDER BY position ASC',
      [result]
    );

    res.status(201).json({
      success: true,
      message: 'サーバーを作成しました',
      guild: {
        ...guild[0],
        channels,
        members: [{
          id: req.user.id,
          username: req.user.username,
          avatar_url: req.user.avatar_url,
          role: 'owner',
          joined_at: new Date()
        }],
        userRole: 'owner'
      }
    });

  } catch (error) {
    console.error('Create guild error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーの作成に失敗しました'
    });
  }
});

// Join guild by invite code
router.post('/join/:inviteCode', async (req, res) => {
  try {
    const { inviteCode } = req.params;

    // Find valid invite
    const invites = await query(`
      SELECT i.guild_id, g.name as guild_name
      FROM invites i
      JOIN guilds g ON i.guild_id = g.id
      WHERE i.code = ? AND (i.expires_at IS NULL OR i.expires_at > NOW()) AND i.is_active = 1
    `, [inviteCode]);

    if (invites.length === 0) {
      return res.status(404).json({
        success: false,
        message: '無効または期限切れの招待コードです'
      });
    }

    const invite = invites[0];

    // Check if user is already a member
    const existingMember = await query(
      'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
      [invite.guild_id, req.user.id]
    );

    if (existingMember.length > 0) {
      return res.status(409).json({
        success: false,
        message: '既にこのサーバーのメンバーです'
      });
    }

    // Add user to guild
    await query(
      'INSERT INTO guild_members (guild_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
      [invite.guild_id, req.user.id, 'member']
    );

    // Update invite usage
    await query(
      'UPDATE invites SET uses = uses + 1 WHERE code = ?',
      [inviteCode]
    );

    res.json({
      success: true,
      message: `${invite.guild_name}に参加しました`,
      guildId: invite.guild_id
    });

  } catch (error) {
    console.error('Join guild error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーへの参加に失敗しました'
    });
  }
});

// Leave guild
router.delete('/:guildId/leave', async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is member of this guild
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'このサーバーのメンバーではありません'
      });
    }

    // Check if user is the owner (owners cannot leave their own guild)
    if (memberCheck[0].role === 'owner') {
      return res.status(403).json({
        success: false,
        message: 'サーバーの所有者は離脱できません。サーバーを削除するか、所有権を譲渡してください'
      });
    }

    // Remove user from guild
    await query(
      'UPDATE guild_members SET is_active = 0, left_at = NOW() WHERE guild_id = ? AND user_id = ?',
      [guildId, req.user.id]
    );

    // Get guild name for response
    const guildInfo = await query(
      'SELECT name FROM guilds WHERE id = ?',
      [guildId]
    );

    res.json({
      success: true,
      message: `${guildInfo[0]?.name || 'サーバー'}から離脱しました`
    });

  } catch (error) {
    console.error('Leave guild error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーからの離脱に失敗しました'
    });
  }
});

// Get invites for a guild
router.get('/:guildId/invites', async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user has permission to manage invites
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin', 'moderator'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: '招待を管理する権限がありません'
      });
    }

    const invites = await query(`
      SELECT 
        i.id,
        i.code,
        i.max_uses,
        i.uses,
        i.max_age,
        i.temporary,
        i.created_at,
        i.expires_at,
        u.username as creator_username,
        u.nickname as creator_nickname
      FROM invites i
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.guild_id = ? AND (i.expires_at IS NULL OR i.expires_at > NOW())
      ORDER BY i.created_at DESC
    `, [guildId]);

    res.json({
      success: true,
      invites
    });

  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({
      success: false,
      message: '招待リストの取得に失敗しました'
    });
  }
});

// Create invite
router.post('/invites', async (req, res) => {
  try {
    const { guild_id, max_age, max_uses, temporary } = req.body;

    // Check if user has permission to create invites
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guild_id, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin', 'moderator'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: '招待を作成する権限がありません'
      });
    }

    // Generate unique invite code
    const code = uuidv4().substring(0, 8);

    // Calculate expiration date
    let expiresAt = null;
    if (max_age && max_age > 0) {
      const now = new Date();
      expiresAt = new Date(now.getTime() + (max_age * 1000));
    }

    const result = await query(
      'INSERT INTO invites (guild_id, code, created_by, max_uses, uses, max_age, temporary, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [guild_id, code, req.user.id, max_uses || 0, 0, max_age || 0, temporary || false, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: '招待を作成しました',
      invite: {
        id: result.insertId,
        code,
        max_uses: max_uses || 0,
        uses: 0,
        max_age: max_age || 0,
        temporary: temporary || false,
        expires_at: expiresAt,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({
      success: false,
      message: '招待の作成に失敗しました'
    });
  }
});

// Delete invite
router.delete('/invites', async (req, res) => {
  try {
    const { invite_id } = req.body;

    // Get invite details
    const invites = await query(
      'SELECT guild_id FROM invites WHERE id = ?',
      [invite_id]
    );

    if (invites.length === 0) {
      return res.status(404).json({
        success: false,
        message: '招待が見つかりません'
      });
    }

    const guildId = invites[0].guild_id;

    // Check if user has permission to delete invites
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin', 'moderator'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: '招待を削除する権限がありません'
      });
    }

    await query('DELETE FROM invites WHERE id = ?', [invite_id]);

    res.json({
      success: true,
      message: '招待を削除しました'
    });

  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({
      success: false,
      message: '招待の削除に失敗しました'
    });
  }
});

// Get roles for a guild
router.get('/:guildId/roles', async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is member of this guild
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このサーバーにアクセスする権限がありません'
      });
    }

    const roles = await query(`
      SELECT 
        id,
        name,
        color,
        permissions,
        mentionable,
        hoist,
        position,
        created_at
      FROM roles
      WHERE guild_id = ?
      ORDER BY position DESC, created_at ASC
    `, [guildId]);

    res.json({
      success: true,
      roles
    });

  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      message: 'ロールリストの取得に失敗しました'
    });
  }
});

// Create role
router.post('/roles', async (req, res) => {
  try {
    const { guild_id, name, color, permissions, mentionable, hoist, position } = req.body;

    // Check if user has permission to manage roles
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guild_id, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: 'ロールを管理する権限がありません'
      });
    }

    const result = await query(
      'INSERT INTO roles (guild_id, name, color, permissions, mentionable, hoist, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [guild_id, name, color || '#000000', permissions || 0, mentionable || false, hoist || false, position || 0]
    );

    res.status(201).json({
      success: true,
      message: 'ロールを作成しました',
      role: {
        id: result.insertId,
        name,
        color: color || '#000000',
        permissions: permissions || 0,
        mentionable: mentionable || false,
        hoist: hoist || false,
        position: position || 0,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      message: 'ロールの作成に失敗しました'
    });
  }
});

// Update role
router.put('/roles', async (req, res) => {
  try {
    const { role_id, name, color, permissions, mentionable, hoist, position } = req.body;

    // Get role details
    const roles = await query(
      'SELECT guild_id FROM roles WHERE id = ?',
      [role_id]
    );

    if (roles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ロールが見つかりません'
      });
    }

    const guildId = roles[0].guild_id;

    // Check if user has permission to manage roles
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: 'ロールを管理する権限がありません'
      });
    }

    await query(
      'UPDATE roles SET name = ?, color = ?, permissions = ?, mentionable = ?, hoist = ?, position = ? WHERE id = ?',
      [name, color, permissions, mentionable, hoist, position, role_id]
    );

    res.json({
      success: true,
      message: 'ロールを更新しました'
    });

  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'ロールの更新に失敗しました'
    });
  }
});

// Delete role
router.delete('/roles', async (req, res) => {
  try {
    const { role_id } = req.body;

    // Get role details
    const roles = await query(
      'SELECT guild_id FROM roles WHERE id = ?',
      [role_id]
    );

    if (roles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ロールが見つかりません'
      });
    }

    const guildId = roles[0].guild_id;

    // Check if user has permission to manage roles
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guildId, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin'].includes(memberCheck[0].role)) {
      return res.status(403).json({
        success: false,
        message: 'ロールを管理する権限がありません'
      });
    }

    await query('DELETE FROM roles WHERE id = ?', [role_id]);

    res.json({
      success: true,
      message: 'ロールを削除しました'
    });

  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      message: 'ロールの削除に失敗しました'
    });
  }
});

// Create new guild/server
router.post('/create', async (req, res) => {
  try {
    const { name, description, is_public } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'サーバー名は必須です'
      });
    }

    // Create guild
    const result = await query(
      'INSERT INTO guilds (name, description, owner_id, is_public, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name.trim(), description || '', req.user.id, is_public || false]
    );

    const guildId = result.insertId;

    // Add creator as owner
    await query(
      'INSERT INTO guild_members (guild_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
      [guildId, req.user.id, 'owner']
    );

    // Create default general channel
    await query(
      'INSERT INTO channels (guild_id, name, type, position, created_at) VALUES (?, ?, ?, ?, NOW())',
      [guildId, '一般', 'text', 0]
    );

    res.status(201).json({
      success: true,
      message: 'サーバーを作成しました',
      guild: {
        id: guildId,
        name: name.trim(),
        description: description || '',
        is_public: is_public || false,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Create guild error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーの作成に失敗しました'
    });
  }
});

const iconStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(process.env.UPLOAD_DIR || './uploads', 'server_icons');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `server_${req.body.guild_id || 'temp'}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const iconUpload = multer({
  storage: iconStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('サーバーアイコンは画像ファイルのみアップロード可能です'));
    }
  }
});

router.post('/upload-icon', iconUpload.single('icon'), async (req, res) => {
  try {
    const { guild_id } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ファイルがアップロードされていません'
      });
    }

    // Check if user has permission to manage server
    const memberCheck = await query(
      'SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ? AND is_active = 1',
      [guild_id, req.user.id]
    );

    if (memberCheck.length === 0 || !['owner', 'admin'].includes(memberCheck[0].role)) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(console.error);
      return res.status(403).json({
        success: false,
        message: 'サーバーを管理する権限がありません'
      });
    }

    const iconUrl = `/uploads/server_icons/${req.file.filename}`;

    // Update guild icon
    await query(
      'UPDATE guilds SET icon_url = ? WHERE id = ?',
      [iconUrl, guild_id]
    );

    res.json({
      success: true,
      message: 'サーバーアイコンを更新しました',
      icon_url: iconUrl
    });

  } catch (error) {
    console.error('Upload server icon error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    
    res.status(500).json({
      success: false,
      message: 'サーバーアイコンのアップロードに失敗しました'
    });
  }
});

module.exports = router;
