export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        
        if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id;
          const text = payload.message.text.trim();
          
          let replyText = "I didn't understand that command. Use /help to see available commands.";
          
          if (text.startsWith("/start") || text.startsWith("/help")) {
            replyText = "Welcome to IR Inventory Mgmt Bot! 📦\n\nAvailable commands:\n/list - List current inventory\n/add <item> - Add an item\n/remove <item> - Remove an item";
          } else if (text.startsWith("/list")) {
            replyText = "Your inventory is currently empty. (Database integration pending)";
          } else if (text.startsWith("/add")) {
            const item = text.replace("/add", "").trim();
            if (item) {
              replyText = `Added "${item}" to inventory! (Mocked)`;
            } else {
              replyText = "Please specify an item to add. Example: /add Laptops";
            }
          } else if (text.startsWith("/remove")) {
            const item = text.replace("/remove", "").trim();
            if (item) {
              replyText = `Removed "${item}" from inventory! (Mocked)`;
            } else {
              replyText = "Please specify an item to remove. Example: /remove Laptops";
            }
          }
          
          await this.sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
        }
      } catch (err) {
        console.error("Error handling request", err);
      }
    }
    
    // Always return a 200 OK so Telegram doesn't retry the message endlessly
    return new Response("OK");
  },

  async sendMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  }
};
