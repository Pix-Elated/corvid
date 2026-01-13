import dotenv from 'dotenv';
import { Config } from '../types';

// Load environment variables from .env file
dotenv.config();

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    discordBotToken: getRequiredEnv('DISCORD_BOT_TOKEN'),
    guildId: getRequiredEnv('GUILD_ID'),
    sourceChannelId: getRequiredEnv('SOURCE_CHANNEL_ID'),
    munkBotId: getRequiredEnv('MUNK_BOT_ID'),
    port: parseInt(getOptionalEnv('PORT', '3000'), 10),
    timezone: getOptionalEnv('TZ', 'UTC'),
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
