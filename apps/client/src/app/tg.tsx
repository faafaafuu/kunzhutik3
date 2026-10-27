// Entry point of the Telegram WebApp (the bot's button opens /tg). Sign-in happens in the root layout.
import { Redirect } from "expo-router";

export default function TelegramEntry() {
  return <Redirect href="/" />;
}
