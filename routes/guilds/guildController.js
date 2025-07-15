const express = require('express');
const { query, transaction } = require('../../config/database');

// Basic guild operations
class GuildController {
  // Get user's guilds
  static async getUserGuilds(req, res) {
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
  }

  // Get user's personal server (マイサーバー)
  static async getPersonalServer(req, res) {
    try {
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
  }

  // Get guild details
  static async getGuildDetails(req, res) {
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
  }

  // Create new guild
  static async createGuild(req, res) {
    try {
      const { name, description, is_public } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'サーバー名は必須です'
        });
      }

      // Create guild and add creator as owner in a transaction
      const result = await transaction(async (connection) => {
        // Create guild
        const [guildResult] = await connection.execute(
          'INSERT INTO guilds (name, description, is_public, owner_id, created_at) VALUES (?, ?, ?, ?, NOW())',
          [name.trim(), description || null, is_public || false, req.user.id]
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
            nickname: req.user.nickname,
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
  }
}

module.exports = GuildController;
