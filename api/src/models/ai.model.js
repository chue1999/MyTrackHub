import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

/** One AI chat conversation of one signed-in person (admin or CCare account). */
export const AiConversation = sequelize.define(
  'AiConversation',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    ownerKind: { type: DataTypes.STRING(10), allowNull: false }, // 'admin' | 'ccare'
    ownerId: { type: DataTypes.INTEGER, allowNull: false },
    ownerName: { type: DataTypes.STRING(60) },
    title: { type: DataTypes.STRING(120) },
    provider: { type: DataTypes.STRING(20) }, // last provider used
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'ai_conversations',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['owner_kind', 'owner_id', 'updated_at'] }],
  },
);

/** One message in a conversation (the question or the AI's answer). */
export const AiMessage = sequelize.define(
  'AiMessage',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.BIGINT, allowNull: false },
    role: { type: DataTypes.STRING(10), allowNull: false }, // 'user' | 'assistant'
    content: { type: DataTypes.TEXT, allowNull: false },
    provider: { type: DataTypes.STRING(20) },
    model: { type: DataTypes.STRING(60) },
    tokensIn: { type: DataTypes.INTEGER },
    tokensOut: { type: DataTypes.INTEGER },
    error: { type: DataTypes.STRING(500) },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'ai_messages', underscored: true, timestamps: false, indexes: [{ fields: ['conversation_id'] }] },
);

/**
 * A file or picture attached to a question. The bytes are kept in the database
 * (so the history and every provider can use it again); Word / Excel files are
 * turned into text in the browser before upload, so `kind` is image, pdf or text.
 */
export const AiFile = sequelize.define(
  'AiFile',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    ownerKind: { type: DataTypes.STRING(10), allowNull: false },
    ownerId: { type: DataTypes.INTEGER, allowNull: false },
    conversationId: { type: DataTypes.BIGINT },
    messageId: { type: DataTypes.BIGINT }, // null until the question is sent
    name: { type: DataTypes.STRING(200), allowNull: false },
    mime: { type: DataTypes.STRING(100), allowNull: false },
    kind: { type: DataTypes.STRING(10), allowNull: false }, // 'image' | 'pdf' | 'text'
    size: { type: DataTypes.INTEGER, allowNull: false },
    data: { type: DataTypes.BLOB('long'), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'ai_files',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['message_id'] }, { fields: ['owner_kind', 'owner_id', 'created_at'] }],
  },
);
