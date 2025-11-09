# Crypto Trader CLI

🚀 A command-line trading assistant that brings AI-powered cryptocurrency market analysis to your terminal.

> 🧪 **Note: 
> This is a personal proof‑of‑concept (PoC) project for experimenting with AI‑assisted crypto analysis in the terminal.
   It’s not financial advice — please do your own research before making any trading decisions.**

## Features

- 🖥 Run directly in your command line interface (CLI)
- ⚙️ **Minimal configuration** – Only requires setting your **API key** and **system prompt**
- 📈 **Market data from OKX** – Get up‑to‑date price and analysis via OKX APIs
- Lightweight and easy to customize

## Quick Start

1. Clone this project
   ```bash
   git clone git@github.com:eatgrass/crypto-trader-cli.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env file with your API key
   vim .env
   ```

   🐋 Example: Using DeepSeek
   To run the project using DeepSeek, set your environment like this:

   ```bash
   OPEN_AI_API_KEY=YOUR_DEEPSEEK_API_KEY
   OPEN_AI_MODEL=deepseek-reasoner
   OPEN_AI_BASE_URL=https://api.deepseek.com
   ```

4. Run and start analyzing:
   ```bash
   npm run build
   npm run start
   ```

---

⚙️ Custom Your System Prompt 

You can create your own system prompt in the `prompts` directory.

