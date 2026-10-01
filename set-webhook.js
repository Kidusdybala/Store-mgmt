const TOKEN = "8837496349:AAHN1uejj6yeiqqTbiawtNxOrifkraZctdU";

// Replace this with your actual Cloudflare Worker URL after deployment
const WORKER_URL = "https://ir-inventory-mgmt-bot.<your-cloudflare-subdomain>.workers.dev";

async function setWebhook() {
  const url = `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(WORKER_URL)}`;
  const response = await fetch(url);
  const data = await response.json();
  console.log(data);
}

setWebhook();
