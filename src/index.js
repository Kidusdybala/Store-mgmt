export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        
        // Handle Callback Queries (when an inline button is pressed)
        if (payload.callback_query) {
          const callbackQueryId = payload.callback_query.id;
          const chatId = payload.callback_query.message.chat.id;
          const data = payload.callback_query.data;
          
          let replyText = "";
          
          if (data === "action_list") {
            replyText = "Your inventory is currently empty. (Database integration pending)";
          } else if (data === "action_add") {
            replyText = "To add an item, simply type:\n/add <item_name>\n\nExample: /add Laptops";
          } else if (data === "action_remove") {
            replyText = "To remove an item, simply type:\n/remove <item_name>\n\nExample: /remove Laptops";
          }
          
          // Send response message back to the user
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          
          // Acknowledge the callback query so the loading spinner stops on the button
          await answerCallbackQuery(env.SECRET_TELEGRAM_API_TOKEN, callbackQueryId);
        } 
        // Handle Text Messages
        else if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id;
          const text = payload.message.text.trim();
          
          if (text.startsWith("/start") || text.startsWith("/help")) {
            const replyText = "Welcome to IR Inventory Mgmt Bot!\n\nWhat would you like to do?";
            
            // Define our inline keyboard with buttons
            const keyboard = {
              inline_keyboard: [
                [{ text: "List Inventory", callback_data: "action_list" }],
                [
                  { text: "Add Item", callback_data: "action_add" },
                  { text: "Remove Item", callback_data: "action_remove" }
                ]
              ]
            };
            
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText, keyboard);
          } 
          else if (text.startsWith("/add")) {
            const item = text.replace("/add", "").trim();
            const replyText = item ? `Added "${item}" to inventory! (Mocked)` : "Please specify an item to add. Example: /add Laptops";
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          } 
          else if (text.startsWith("/remove")) {
            const item = text.replace("/remove", "").trim();
            const replyText = item ? `Removed "${item}" from inventory! (Mocked)` : "Please specify an item to remove. Example: /remove Laptops";
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          } 
          else {
             const replyText = "I didn't understand that command. Use /help to see available options.";
             await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          }
        }
      } catch (err) {
        console.error("Error handling request", err);
      }
    }
    
    // Always return a 200 OK so Telegram doesn't retry the message endlessly
    return new Response("OK");
  }
};

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function answerCallbackQuery(token, callbackQueryId) {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId
    })
  });
}
