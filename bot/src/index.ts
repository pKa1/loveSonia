import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
const WEBAPP_URL = process.env.WEBAPP_URL || "https://lovesonia.ru/tg";
const DONATE_URL = process.env.DONATE_URL || "";

const bot = new Bot(token);

function mainMenu() {
  const kb = new InlineKeyboard()
    .webApp("Открыть LoveSonia", WEBAPP_URL)
    .row()
    .text("📖 Инструкция", "help")
    .row()
    .url("❤️ Поддержать проект", DONATE_URL || "https://lovesonia.ru/");
  return kb;
}

bot.command("start", async (ctx) => {
  const first = ctx.from?.first_name ?? "";
  const greeting = [
    `Привет${first ? ", " + first : ""}!`,
    "Это LoveSonia — календарь и задачи для пары.",
    "Открой мини-приложение или посмотри короткую инструкцию.",
  ].join("\n");
  await ctx.reply(greeting, { reply_markup: mainMenu() });
});

bot.hears(/lovesonia/i, async (ctx) => {
  await ctx.reply("Запускаю приложение:", { reply_markup: mainMenu() });
});

bot.callbackQuery("help", async (ctx) => {
  const text = [
    "Как пользоваться:",
    "1) Нажмите ‘Открыть LoveSonia’ — авторизация проходит автоматически.",
    "2) В разделе ‘Пара’ задайте тихие часы — календарь подстроится.",
    "3) Добавляйте события и задачи, назначайте ‘я/ты/мы’.",
    "4) Чтобы вернуться в приложение — снова нажмите кнопку.",
  ].join("\n");
  await ctx.answerCallbackQuery();
  await ctx.reply(text, { reply_markup: mainMenu(), disable_web_page_preview: true });
});

bot.catch((err) => {
  console.error("[bot] error", err);
});

bot.start();
console.log("[bot] started in long-polling mode");


