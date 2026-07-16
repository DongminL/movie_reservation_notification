import net from 'node:net';
import TelegramBot from './telegram';

// Telegram Bot AggregateError 방지
net.setDefaultAutoSelectFamily(false);

const bot: TelegramBot = new TelegramBot();
bot.setupBot();
