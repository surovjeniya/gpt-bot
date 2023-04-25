import { Telegraf, session } from "telegraf";
import config from "config";
import { message } from "telegraf/filters";
import { ogg } from "./ogg.js";
import { openai } from "./openai.js";
import { code } from "telegraf/format";

const bot = new Telegraf(config.get("TELEGRAM_TOKEN"));
bot.use(session());

const INITIAL_SESSION = {
  messages: [],
};

bot.launch();

bot.command("start", async (ctx) => {
  ctx.session === INITIAL_SESSION;
  await ctx.reply(
    "Задай свой вопрос текстом или используй госовое сообщение..."
  );
});

bot.on(message("text"), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  const { text } = ctx.message;

  if (text.match("Сгенерируй")) {
    try {
      await ctx.reply(code("Идёт генерация изображения..."));
      const image = await openai.imageGeneration(text, String(ctx.from.id));
      await ctx.replyWithPhoto(image.path);
    } catch (e) {
      console.log("Error while image generating", e.message);
    }
  } else {
    try {
      ctx.session.messages.push({
        role: openai.roles.USER,
        content: String(text),
      });

      const response = await openai.chat(ctx.session.messages);
      const assistantMessageText = response.content;

      ctx.session.messages.push({
        role: openai.roles.ASSISTANT,
        content: assistantMessageText,
      });

      await ctx.reply(response.content);
    } catch (e) {
      console.log("Error while text message", e.message);
    }
  }
});

bot.on(message("voice"), async (ctx) => {
  console.log(ctx.session);
  ctx.session ??= INITIAL_SESSION;
  const { voice } = ctx.message;
  try {
    await ctx.reply(code("Ждем ответ от сервера..."));
    const voiceLink = await ctx.telegram.getFileLink(voice.file_id);
    const oggPath = await ogg.create(
      voiceLink.href,
      String(ctx.message.from.id)
    );
    const mp3Path = await ogg.toMp3(oggPath, ctx.message.from.id);

    const userMessageText = await openai.transcription(mp3Path);
    ctx.session.messages.push({
      role: openai.roles.USER,
      content: String(userMessageText),
    });

    await ctx.reply(code(`Ваш запрос: ${userMessageText}`));

    const response = await openai.chat(ctx.session.messages);
    const assistantMessageText = response.content;

    ctx.session.messages.push({
      role: openai.roles.ASSISTANT,
      content: String(assistantMessageText),
    });

    await ctx.reply(assistantMessageText);
  } catch (e) {
    console.log("Error while voice message", e.message);
  }
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
